// End-to-end test of the AI billing chain, as a client sees it:
// route → withAiAction → admin switches → reserve_ai_credits → OpenRouter →
// cost ledger → settle or refund.
//
// Run it (a few cents of real OpenRouter usage per run):
//   1. npm run dev                                     the dev server, port 3000
//   2. node security-tests/aiBillingE2E.test.js [base url]
//
// The only test of the whole chain: the SQL tests exercise the functions, the
// node tests the pure rules, this one the routes. It runs against the
// production database — there is no other — as the dedicated test account
// (profiles.is_test_account), reset to a 30-credit trial before each run. If no
// test account exists (they are deleted before launch), it creates one. The
// letter template, cover letters and interview rows it creates are deleted at
// the end.
//
// Failures after the model call are injected with the X-AI-Test-Failure header,
// and admin switches forced off with X-AI-Test-Switch-Off. withAiAction honours
// both only when NODE_ENV is development or test, so the test never turns a
// feature off for real users — and against a production build those cases
// fail.
//
// Guarded: every expectation is one check, the number that ran must equal
// EXPECTED_CHECKS, and the balance must move by exactly EXPECTED_DELTA from the
// first call to the last — per-case checks can all pass while a credit leaks.

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { createClient }       = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');

const ROOT            = path.resolve(__dirname, '..');
const BASE            = process.argv[2] || 'http://localhost:3000';
const EXPECTED_CHECKS = 100;
// rewrite-bullet 1 + ats-score 1 + generate-cv 2 + jobs/apply 1 + letter adapt 1 + parse-cv 1
// + three chat sessions, one credit each + one interview, 7 credits
const EXPECTED_DELTA  = -17;
const TEST_NAME       = '[TEST] AI billing E2E';

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[m[1]] = value;
  }
  return env;
}

async function ensureServer() {
  const deadline = Date.now() + 90_000;
  let last = 'no answer';
  while (Date.now() < deadline) {
    try {
      // A POST-only route answering 405 means the server is up and compiles routes.
      const res = await fetch(`${BASE}/api/rewrite-bullet`, { signal: AbortSignal.timeout(60_000) });
      if (res.status === 405) return;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = String(err);
    }
    await delay(2_000);
  }
  throw new Error(`no dev server at ${BASE} (${last}). Start it first: npm run dev`);
}

// The dedicated test account, reset to a known state: an active trial with 30
// credits, no subscription, not blocked. A fresh password each run.
async function prepareTestAccount(admin) {
  const { data: rows, error } = await admin
    .from('profiles').select('id').eq('is_test_account', true).order('created_at').limit(2);
  if (error) throw error;
  if (rows.length > 1) throw new Error('more than one profile has is_test_account = true: keep one');

  let userId;
  let email;
  if (rows.length === 1) {
    userId = rows[0].id;
    const { data, error: getError } = await admin.auth.admin.getUserById(userId);
    if (getError) throw getError;
    email = data.user.email;
  } else {
    email = `ai-billing-e2e-${Date.now()}@example.com`;
    const { data, error: createError } = await admin.auth.admin.createUser({
      email,
      password:      crypto.randomBytes(24).toString('base64url'),
      email_confirm: true,
      user_metadata: { full_name: TEST_NAME },
    });
    if (createError) throw createError;
    userId = data.user.id;
    const { error: insertError } = await admin
      .from('profiles').insert({ id: userId, full_name: TEST_NAME, is_test_account: true });
    if (insertError) throw insertError;
  }

  const password = crypto.randomBytes(24).toString('base64url');
  const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password });
  if (passwordError) throw passwordError;

  const { error: resetError } = await admin.from('profiles').update({
    full_name:            TEST_NAME,
    ai_credits_remaining: 30,
    trial_ends_at:        new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
    subscription_plan:    null,
    subscription_status:  null,
    is_blocked:           false,
  }).eq('id', userId);
  if (resetError) throw resetError;

  return { userId, email, password };
}

// Signs in through @supabase/ssr, so the cookies are exactly what the app reads.
async function signIn(env, account) {
  const jar = new Map();
  const ssr = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { error } = await ssr.auth.signInWithPassword({ email: account.email, password: account.password });
  if (error) throw error;
  await delay(200);
  if (jar.size === 0) throw new Error('sign-in produced no auth cookie');
  return { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), client: ssr };
}

// A PDF of `pages` pages built by hand: Helvetica text, page 1 carrying a short
// CV. Small on purpose, about 1 KB: the pdf.js inside pdf-parse misreads Node
// Buffers, and a file like this one failed until parse-cv handed it a plain
// Uint8Array copy.
function testPdf(pages) {
  const CV_LINES = [
    'Alex Morgan',
    'Software Engineer - Austin, TX - alex.morgan@example.com - +1 555 0100',
    'EXPERIENCE',
    'Acme Corp - Software Engineer - 2021-03 to present',
    'Built internal tools in TypeScript and React; cut deployment time by 40%.',
    'EDUCATION',
    'University of Texas - BS Computer Science - 2016 to 2020',
    'SKILLS',
    'TypeScript, React, Node.js, PostgreSQL',
  ];
  const escape = (text) => text.replace(/[\\()]/g, (c) => `\\${c}`);

  const objects = [null, null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  for (let page = 0; page < pages; page++) {
    const lines  = page === 0 ? CV_LINES : [`Page ${page + 1}`];
    const stream = ['BT', '/F1 11 Tf', '14 TL', '50 780 Td', ...lines.map((line) => `(${escape(line)}) Tj T*`), 'ET'].join('\n');
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    const contentRef = objects.length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentRef} 0 R >>`);
    kids.push(objects.length);
  }
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${pages} >>`;

  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = Buffer.byteLength(out, 'latin1');
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    + offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
    + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const TEMPLATE_LETTER = [
  'Madame, Monsieur,',
  '',
  "Développeur backend depuis cinq ans, je souhaite rejoindre votre équipe. J'ai conçu des API utilisées par des milliers de clients et réduit de moitié les temps de réponse de notre plateforme.",
  '',
  "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.",
].join('\n');

async function main() {
  const env = loadEnv(path.join(ROOT, '.env.local'));
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!env[name]) throw new Error(`${name} is missing from .env.local`);
  }

  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await ensureServer();

  const account = await prepareTestAccount(admin);
  const { cookie, client: userClient } = await signIn(env, account);
  const runId   = String(Date.now());
  const prefix  = `e2e-${runId}-`;
  const key     = (label) => `${prefix}${label}`;
  const cleanup = { templates: [], letters: [], interviews: [] };

  console.log(`\nAI billing E2E — test account ${account.userId}, run ${runId}`);

  // Only this run's ledger rows: they carry this run's idempotency-key prefix.
  async function snapshot() {
    const { data: profile, error: profileError } = await admin
      .from('profiles').select('ai_credits_remaining').eq('id', account.userId).single();
    if (profileError) throw profileError;

    const { data: usage, error: usageError } = await admin
      .from('ai_usage')
      .select('id, idempotency_key, action, status, credits_charged, cost_usd, error')
      .eq('user_id', account.userId)
      .like('idempotency_key', `${prefix}%`);
    if (usageError) throw usageError;

    let calls = [];
    if (usage.length) {
      const { data, error } = await admin
        .from('ai_usage_calls')
        .select('usage_id, kind, cost_status, cost_usd, generation_id, prompt_tokens, completion_tokens')
        .in('usage_id', usage.map((u) => u.id));
      if (error) throw error;
      calls = data;
    }
    return { credits: profile.ai_credits_remaining, usage, calls };
  }

  async function run(name, route, { json, form }, idempotencyKey, headers = {}) {
    const before  = await snapshot();
    const started = Date.now();
    const res = await fetch(`${BASE}${route}`, {
      method:  'POST',
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        Cookie: cookie,
        'Idempotency-Key': idempotencyKey,
        ...headers,
      },
      body:   json !== undefined ? JSON.stringify(json) : form,
      signal: AbortSignal.timeout(330_000),
    });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    const after = await snapshot();
    const row   = after.usage.find((u) => u.idempotency_key === idempotencyKey) ?? null;
    const calls = row ? after.calls.filter((c) => c.usage_id === row.id) : [];

    const cost = calls[0] ? `${calls[0].cost_status} $${calls[0].cost_usd ?? '—'}` : 'no call';
    console.log(`\n${name}\n  HTTP ${res.status} in ${((Date.now() - started) / 1000).toFixed(1)} s · credits ${before.credits} → ${after.credits} · ledger ${row ? `${row.action} ${row.status}, ${row.credits_charged} credit(s)` : 'no row'} · call ${cost}`);
    return { status: res.status, json: body, before, after, row, calls };
  }

  // A call is logged when it has a real cost, or is pending with a generation id
  // for the ai-ledger cron to complete.
  const costLogged = (calls) => calls.length === 1 && (
    (calls[0].cost_status === 'final' && Number(calls[0].cost_usd) > 0)
    || (calls[0].cost_status === 'pending' && Boolean(calls[0].generation_id))
  );
  const nothingCharged = (r) => r.after.credits === r.before.credits && r.row === null && r.after.usage.length === r.before.usage.length;
  const settledFor = (r, action, credits) => r.row?.action === action && r.row?.status === 'settled' && r.row?.credits_charged === credits;

  const bullet = {
    bullet: 'Managed the migration of our billing system', jobTitle: 'Software Engineer',
    company: 'Acme Corp', targetCountry: 'USA', language: 'en',
  };
  const ats = {
    cvText: 'Software engineer, 4 years. TypeScript, React, Node.js, PostgreSQL. Built internal tools and cut deployment time by 40%.',
    jobDescription: 'Senior Frontend Engineer. React, TypeScript, GraphQL, Jest, CI/CD. 5+ years of experience.',
  };
  const cv = {
    personalInfo: { fullName: 'Alex Morgan', email: 'alex.morgan@example.com', phone: '+1 555 0100', location: 'Austin, TX', linkedin: '', portfolio: '' },
    workExperience: [{ id: 'w1', company: 'Acme Corp', position: 'Software Engineer', startDate: '2021-03', endDate: '', current: true,
      description: 'Built internal tools in TypeScript and React; cut deployment time by 40%.' }],
    education: [{ id: 'e1', school: 'University of Texas', degree: 'BS', field: 'Computer Science', startDate: '2016-09', endDate: '2020-06' }],
    skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
    skillCategories: [],
    preferences: { language: 'en', targetCountry: 'USA', domain: 'Software Engineering', style: 'Professional',
      colorPalette: 'blue-pro', layout: '1-column', fontStyle: 'sans-serif', spacing: 'standard' },
  };
  const application = {
    jobId: `e2e-job-${runId}`, jobTitle: 'Développeur backend', company: 'Acme Corp', location: 'Paris',
    salary: null, jobDescription: 'Poste backend Node.js et PostgreSQL, équipe de six personnes.', jobUrl: null,
  };
  const adaptBody = { jobTitle: 'Développeur Node.js', companyName: 'Globex', companyCity: 'Lyon', description: 'API Node.js, PostgreSQL, AWS.' };
  const pdfForm = (pages) => {
    const form = new FormData();
    form.append('file', new Blob([testPdf(pages)], { type: 'application/pdf' }), 'cv.pdf');
    return form;
  };

  try {
    // ── 1. rewrite-bullet: quick_write, 1 credit ────────────────────────────
    const r1 = await run('1. rewrite-bullet (quick_write, 1 credit)', '/api/rewrite-bullet', { json: bullet }, key('rewrite'));
    check('1 answers 200', r1.status === 200, r1.json);
    check('1 debits exactly 1 credit', r1.after.credits === r1.before.credits - 1, [r1.before.credits, r1.after.credits]);
    check('1 ledger row settled for 1 credit', settledFor(r1, 'quick_write', 1), r1.row);
    check('1 call cost logged', costLogged(r1.calls), r1.calls);

    // ── 2. The same key again: nothing charged, nothing called ───────────────
    const r2 = await run('2. rewrite-bullet replayed with the same key', '/api/rewrite-bullet', { json: bullet }, key('rewrite'));
    check('2 answers 409 already_processed', r2.status === 409 && r2.json?.reason === 'already_processed', r2.json);
    check('2 debits nothing', r2.after.credits === r2.before.credits, [r2.before.credits, r2.after.credits]);
    check('2 adds no ledger row', r2.after.usage.length === r2.before.usage.length, [r2.before.usage.length, r2.after.usage.length]);

    // ── 3. ats-score: match_score, 1 credit ─────────────────────────────────
    const r3 = await run('3. ats-score (match_score, 1 credit)', '/api/ats-score', { json: ats }, key('ats'));
    check('3 answers 200', r3.status === 200, r3.json);
    check('3 debits exactly 1 credit', r3.after.credits === r3.before.credits - 1, [r3.before.credits, r3.after.credits]);
    check('3 ledger row settled for 1 credit', settledFor(r3, 'match_score', 1), r3.row);
    check('3 call cost logged', costLogged(r3.calls), r3.calls);

    // ── 4. generate-cv: cv_generation, 2 credits ────────────────────────────
    const r4 = await run('4. generate-cv (cv_generation, 2 credits)', '/api/generate-cv', { json: cv }, key('generate-cv'));
    check('4 answers 200', r4.status === 200, r4.json && { error: r4.json.error, reason: r4.json.reason });
    check('4 debits exactly 2 credits', r4.after.credits === r4.before.credits - 2, [r4.before.credits, r4.after.credits]);
    check('4 ledger row settled for 2 credits', settledFor(r4, 'cv_generation', 2), r4.row);
    check('4 call cost logged', costLogged(r4.calls), r4.calls);

    // ── 5. The handler throws after the model call ──────────────────────────
    const r5 = await run('5. rewrite-bullet, handler throws after the model call', '/api/rewrite-bullet', { json: bullet },
      key('fail-throws'), { 'X-AI-Test-Failure': 'handler-throws' });
    check('5 answers 500 internal_error', r5.status === 500 && r5.json?.reason === 'internal_error', r5.json);
    check('5 leaves the balance unchanged', r5.after.credits === r5.before.credits, [r5.before.credits, r5.after.credits]);
    check('5 ledger row refunded, with the failure recorded',
      r5.row?.status === 'refunded' && /injected failure/.test(r5.row?.error ?? ''), r5.row);
    check('5 call cost still logged', costLogged(r5.calls), r5.calls);

    // ── 6. The handler answers an error after the model call ────────────────
    const r6 = await run('6. ats-score, error response after the model call', '/api/ats-score', { json: ats },
      key('fail-response'), { 'X-AI-Test-Failure': 'error-response' });
    check('6 answers 500', r6.status === 500, r6.json);
    check('6 leaves the balance unchanged', r6.after.credits === r6.before.credits, [r6.before.credits, r6.after.credits]);
    check('6 ledger row refunded', r6.row?.status === 'refunded', r6.row);
    check('6 call cost still logged', costLogged(r6.calls), r6.calls);

    // ── 7. jobs/apply: application, 1 credit — the letter is saved ──────────
    const letterIds = async () => new Set(((await admin.from('cover_letters').select('id').eq('user_id', account.userId)).data ?? []).map((l) => l.id));
    const lettersBefore = await letterIds();
    const r7 = await run('7. jobs/apply (application, 1 credit)', '/api/jobs/apply', { json: application }, key('apply'));
    const letterHtml = r7.json?.coverLetterHtml ?? '';
    const { data: lettersAfter } = await admin.from('cover_letters').select('id, content, language').eq('user_id', account.userId);
    const newLetters = (lettersAfter ?? []).filter((l) => !lettersBefore.has(l.id));
    cleanup.letters.push(...newLetters.map((l) => l.id));
    check('7 answers 200 with the letter and no "saved" flag',
      r7.status === 200 && letterHtml.length > 0 && !('saved' in (r7.json ?? {})), r7.json && Object.keys(r7.json));
    check('7 debits exactly 1 credit', r7.after.credits === r7.before.credits - 1, [r7.before.credits, r7.after.credits]);
    check('7 ledger row settled for 1 credit', settledFor(r7, 'application', 1), r7.row);
    check('7 call cost logged', costLogged(r7.calls), r7.calls);
    check('7 the letter is saved as returned, signed with the profile name',
      newLetters.length === 1 && newLetters[0].content === letterHtml && letterHtml.includes('AI billing E2E'),
      newLetters.map((l) => ({ sameContent: l.content === letterHtml, language: l.language, hasName: letterHtml.includes('AI billing E2E') })));

    // ── 8. Letter template adaptation: letter_adapt, 1 credit ───────────────
    const { data: template, error: templateError } = await admin
      .from('letter_templates')
      .insert({ user_id: account.userId, name: `E2E template ${runId}`, category: 'e2e', content: TEMPLATE_LETTER })
      .select('id')
      .single();
    if (templateError) throw templateError;
    cleanup.templates.push(template.id);

    const r8 = await run('8. letter template adapt (letter_adapt, 1 credit)', `/api/letter-templates/${template.id}/adapt`, { json: adaptBody }, key('adapt'));
    const { data: usedTemplate } = await admin.from('letter_templates').select('use_count').eq('id', template.id).single();
    check('8 answers 200 with the adapted letter', r8.status === 200 && typeof r8.json?.text === 'string' && r8.json.text.length > 0, r8.json);
    check('8 debits exactly 1 credit', r8.after.credits === r8.before.credits - 1, [r8.before.credits, r8.after.credits]);
    check('8 ledger row settled for 1 credit', settledFor(r8, 'letter_adapt', 1), r8.row);
    check('8 call cost logged', costLogged(r8.calls), r8.calls);
    check('8 the template use count went up by one', usedTemplate?.use_count === 1, usedTemplate);

    // ── 9. A template that is not the user's: a free 404 ────────────────────
    const r9 = await run("9. letter template adapt, a template that is not the user's", `/api/letter-templates/${crypto.randomUUID()}/adapt`, { json: adaptBody }, key('adapt-404'));
    check('9 answers 404', r9.status === 404, r9.json);
    check('9 charges nothing and leaves no ledger row', nothingCharged(r9), { before: r9.before.credits, after: r9.after.credits, row: r9.row });

    // ── 10. parse-cv, a one-page PDF: cv_import, 1 credit ───────────────────
    const r10 = await run('10. parse-cv, one-page PDF (cv_import, 1 credit)', '/api/parse-cv', { form: pdfForm(1) }, key('parse'));
    check('10 answers 200 with the parsed CV',
      r10.status === 200 && typeof r10.json?.data?.personalInfo?.fullName === 'string' && r10.json.data.personalInfo.fullName.length > 0,
      r10.json && (r10.json.error ?? r10.json.data?.personalInfo));
    check('10 debits exactly 1 credit', r10.after.credits === r10.before.credits - 1, [r10.before.credits, r10.after.credits]);
    check('10 ledger row settled for 1 credit', settledFor(r10, 'cv_import', 1), r10.row);
    check('10 call cost logged', costLogged(r10.calls), r10.calls);

    // ── 11. parse-cv, a six-page PDF: refused before any charge ─────────────
    const r11 = await run('11. parse-cv, six-page PDF', '/api/parse-cv', { form: pdfForm(6) }, key('parse-6-pages'));
    check('11 answers 413 too_many_pages', r11.status === 413 && r11.json?.reason === 'too_many_pages', r11.json);
    check('11 charges nothing and leaves no ledger row', nothingCharged(r11), { before: r11.before.credits, after: r11.after.credits, row: r11.row });

    // ── 12. The AI kill switch off ──────────────────────────────────────────
    const r12 = await run('12. rewrite-bullet with the AI kill switch off', '/api/rewrite-bullet', { json: bullet },
      key('switch-ai'), { 'X-AI-Test-Switch-Off': 'ai_enabled' });
    check('12 answers 503 ai_disabled', r12.status === 503 && r12.json?.reason === 'ai_disabled', r12.json);
    check('12 charges nothing and leaves no ledger row', nothingCharged(r12), { before: r12.before.credits, after: r12.after.credits, row: r12.row });

    // ── 13. One feature's admin toggle off ──────────────────────────────────
    const r13 = await run('13. ats-score with its admin toggle off', '/api/ats-score', { json: ats },
      key('switch-ats'), { 'X-AI-Test-Switch-Off': 'ats_score' });
    check('13 answers 503 feature_disabled', r13.status === 503 && r13.json?.reason === 'feature_disabled', r13.json);
    check('13 charges nothing and leaves no ledger row', nothingCharged(r13), { before: r13.before.credits, after: r13.after.credits, row: r13.row });

    // ── 14. full-description: nothing invented when the offer page cannot be read
    const r14 = await run('14. full-description, an offer page that cannot be read', '/api/jobs/full-description',
      { json: { jobId: `e2e-unreadable-${runId}`, redirectUrl: 'https://127.0.0.1/job-offer' } }, key('full-description'));
    check('14 answers 200 with no description, rather than an invented one',
      r14.status === 200 && r14.json?.description === null && r14.json?.source === null, r14.json);
    check('14 charges nothing and leaves no ledger row', nothingCharged(r14), { before: r14.before.credits, after: r14.after.credits, row: r14.row });

    // ── Chat: charged by conversation, one credit per session of 20 messages ─
    const runChat = async (name, { messages, sessionId = null }, idempotencyKey, { headers = {}, leaveAfterFirstChunk = false } = {}) => {
      const before  = await snapshot();
      const started = Date.now();
      const leave   = new AbortController();
      const res = await fetch(`${BASE}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, 'Idempotency-Key': idempotencyKey, ...headers },
        body:    JSON.stringify({ messages, sessionId }),
        signal:  leave.signal,
      });
      let text = '';
      let json = null;
      if (res.ok && res.body) {
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
            if (leaveAfterFirstChunk && text.length > 0) {
              leave.abort();
              break;
            }
          }
        } catch (err) {
          if (err.name !== 'AbortError') throw err;
        }
        // The server records the call once it sees the client leave.
        if (leaveAfterFirstChunk) await delay(4_000);
      } else {
        json = await res.json().catch(() => null);
      }
      const after   = await snapshot();
      const session = res.headers.get('x-ai-session-id');
      const { data: sessionRow } = session
        ? await admin.from('ai_sessions').select('id, usage_id').eq('id', session).maybeSingle()
        : { data: null };
      const row = sessionRow
        ? after.usage.find((u) => u.id === sessionRow.usage_id) ?? null
        : after.usage.find((u) => u.idempotency_key === idempotencyKey) ?? null;
      const calls = row ? after.calls.filter((c) => c.usage_id === row.id) : [];
      const used  = res.headers.get('x-ai-session-messages-used');
      const limit = res.headers.get('x-ai-session-messages-limit');
      console.log(`\n${name}\n  HTTP ${res.status} in ${((Date.now() - started) / 1000).toFixed(1)} s · credits ${before.credits} → ${after.credits} · session ${session ?? '—'} (${used ?? '?'}/${limit ?? '?'}) · ledger ${row ? `${row.action} ${row.status}, ${row.credits_charged} credit(s), ${calls.length} call(s)` : 'no row'}`);
      return { status: res.status, json, text, sessionId: session, used, limit, before, after, row, calls };
    };

    const firstQuestion = [{ role: 'user', content: 'Give me one tip to make a CV stand out, in one sentence.' }];

    // ── 15. The first message opens a session: 1 credit ─────────────────────
    const r15 = await runChat('15. chat, first message (opens a session, 1 credit)', { messages: firstQuestion }, key('chat-first'));
    check('15 answers 200 with a streamed answer and a session id',
      r15.status === 200 && r15.text.length > 0 && Boolean(r15.sessionId), { status: r15.status, json: r15.json });
    check('15 debits exactly 1 credit', r15.after.credits === r15.before.credits - 1, [r15.before.credits, r15.after.credits]);
    check('15 ledger row settled for 1 credit', settledFor(r15, 'chat', 1), r15.row);
    check('15 the message counts 1 of 20, and its cost is logged',
      r15.used === '1' && r15.limit === '20' && costLogged(r15.calls), { used: r15.used, limit: r15.limit, calls: r15.calls });

    // ── 16. The next message in that session: no charge ─────────────────────
    const r16 = await runChat('16. chat, second message in the same session', {
      messages:  [...firstQuestion, { role: 'assistant', content: r15.text }, { role: 'user', content: 'And a second tip, in one sentence?' }],
      sessionId: r15.sessionId,
    }, key('chat-second'));
    check('16 answers 200 in the same session', r16.status === 200 && r16.sessionId === r15.sessionId, { status: r16.status, session: r16.sessionId });
    check('16 debits nothing and adds no ledger row',
      r16.after.credits === r16.before.credits && r16.after.usage.length === r16.before.usage.length, [r16.before.credits, r16.after.credits]);
    check('16 the session counts 2 messages, both calls logged on its one ledger row',
      r16.used === '2' && r16.calls.length === 2, { used: r16.used, calls: r16.calls.length });

    // ── 17. A session out of messages: the next message opens another ───────
    const { error: exhaustError } = await admin.from('ai_sessions').update({ model_calls: 20 }).eq('id', r15.sessionId);
    if (exhaustError) throw exhaustError;
    const r17 = await runChat('17. chat, a session out of messages (the next one opens, 1 credit)',
      { messages: firstQuestion, sessionId: r15.sessionId }, key('chat-exhausted'));
    const { data: exhausted } = await admin.from('ai_sessions').select('ended_at, end_reason').eq('id', r15.sessionId).single();
    check('17 answers 200 in a new session',
      r17.status === 200 && Boolean(r17.sessionId) && r17.sessionId !== r15.sessionId, { status: r17.status, session: r17.sessionId });
    check('17 debits exactly 1 credit', r17.after.credits === r17.before.credits - 1, [r17.before.credits, r17.after.credits]);
    check('17 the spent session is closed for its call limit', Boolean(exhausted?.ended_at) && exhausted?.end_reason === 'call_limit', exhausted);

    // ── 18. The client leaves after the first chunk: settled, not refunded ──
    const r18 = await runChat('18. chat, the client leaves after the first chunk', {
      messages: [{ role: 'user', content: 'Write a detailed 300-word guide to preparing for a behavioural interview.' }],
    }, key('chat-leave'), { leaveAfterFirstChunk: true });
    check('18 debits exactly 1 credit, and the charge stays settled',
      r18.after.credits === r18.before.credits - 1 && r18.row?.status === 'settled', { credits: [r18.before.credits, r18.after.credits], row: r18.row });
    check('18 the abandoned call is still in the ledger', r18.calls.length === 1, r18.calls);

    // ── 19. A message over the model's input: refused before any charge ─────
    const r19 = await runChat('19. chat, a message longer than the model takes',
      { messages: [{ role: 'user', content: 'x'.repeat(30_000) }] }, key('chat-too-long'));
    check('19 answers 413 input_too_large', r19.status === 413 && r19.json?.reason === 'input_too_large', r19.json);
    check('19 charges nothing and leaves no ledger row', nothingCharged(r19), { before: r19.before.credits, after: r19.after.credits, row: r19.row });

    // ── 20. The chat's admin toggle off ─────────────────────────────────────
    const r20 = await runChat('20. chat with its admin toggle off', { messages: firstQuestion }, key('chat-switch'),
      { headers: { 'X-AI-Test-Switch-Off': 'assistant_chat' } });
    check('20 answers 503 feature_disabled', r20.status === 503 && r20.json?.reason === 'feature_disabled', r20.json);
    check('20 charges nothing and leaves no ledger row', nothingCharged(r20), { before: r20.before.credits, after: r20.after.credits, row: r20.row });

    // ── 21. The job description cache: out of reach of a signed-in user ─────
    console.log('\n21. job_descriptions_cache, as a signed-in user');
    const probeJob   = `e2e-cache-probe-${runId}`;
    const cacheRead  = await userClient.from('job_descriptions_cache').select('job_id').limit(1);
    const cacheWrite = await userClient.from('job_descriptions_cache').insert({ job_id: probeJob, description: 'x'.repeat(500), source: 'scrape' });
    const { data: probeRows } = await admin.from('job_descriptions_cache').select('job_id').eq('job_id', probeJob);
    check('21 a signed-in user cannot read the cache', Boolean(cacheRead.error), cacheRead.data);
    check('21 nor write to it', Boolean(cacheWrite.error) && (probeRows ?? []).length === 0, { error: cacheWrite.error?.message, rows: probeRows });

    // ── Interview: one session of 7 credits per interview ───────────────────
    // Its questions, transcriptions and spoken questions are all calls of that
    // session, logged on its one ledger row, none charged on its own.
    const INTERVIEW_CREDITS = 7;
    const interviewSettings = {
      jobDescription: 'Backend engineer: Node.js APIs, PostgreSQL, on-call rotation.',
      interviewType:  'Behavioral',
      difficulty:     'Mid-level',
      language:       'en',
    };

    // The interview, its session and its ledger row, as the database has them.
    async function interviewState(interviewId) {
      const { data: interview } = interviewId
        ? await admin.from('interview_sessions')
            .select('id, user_id, language, score, feedback_json, ai_session_id').eq('id', interviewId).maybeSingle()
        : { data: null };
      const { data: session } = interview?.ai_session_id
        ? await admin.from('ai_sessions')
            .select('id, usage_id, model_calls, stt_calls, tts_calls, turns_completed, report_attempts, ended_at, end_reason').eq('id', interview.ai_session_id).maybeSingle()
        : { data: null };
      const snap  = await snapshot();
      const row   = session ? snap.usage.find((u) => u.id === session.usage_id) ?? null : null;
      const calls = row ? snap.calls.filter((c) => c.usage_id === row.id) : [];
      return { interview, session, row, calls, credits: snap.credits, usageRows: snap.usage.length };
    }

    const send = async (route, { json, form, headers = {} }) => {
      const started = Date.now();
      const res = await fetch(`${BASE}${route}`, {
        method:  'POST',
        headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), Cookie: cookie, ...headers },
        body:    json !== undefined ? JSON.stringify(json) : form,
        signal:  AbortSignal.timeout(180_000),
      });
      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch { /* a streamed turn */ }
      return { status: res.status, json: body, text, seconds: ((Date.now() - started) / 1000).toFixed(1) };
    };

    const describe = (name, r, before, after) => {
      const s = after.session;
      console.log(`\n${name}\n  HTTP ${r.status} in ${r.seconds} s · credits ${before.credits} → ${after.credits} · session ${s
        ? `model ${s.model_calls}, stt ${s.stt_calls}, tts ${s.tts_calls}, turns ${s.turns_completed}${s.ended_at ? `, ended ${s.end_reason}` : ''}`
        : '—'} · ledger ${after.row ? `${after.row.status}, ${after.row.credits_charged} credit(s), ${after.calls.length} call(s)` : 'no row'}`);
    };
    const callsOf = (state, kind) => state.calls.filter((c) => c.kind === kind);

    // ── 22. Starting an interview: the server reserves 7 credits ────────────
    const before22 = await interviewState(null);
    const r22 = await send('/api/interview-coach/start', { json: interviewSettings, headers: { 'Idempotency-Key': key('interview-start') } });
    const interviewId = typeof r22.json?.interviewId === 'string' ? r22.json.interviewId : null;
    if (interviewId) cleanup.interviews.push(interviewId);
    const after22 = await interviewState(interviewId);
    describe(`22. interview start (interview_session, reserves ${INTERVIEW_CREDITS} credits)`, r22, before22, after22);
    check('22 answers 201 with an interview id', r22.status === 201 && Boolean(interviewId), r22.json);
    check(`22 reserves exactly ${INTERVIEW_CREDITS} credits`,
      after22.credits === before22.credits - INTERVIEW_CREDITS && after22.row?.action === 'interview_session' && after22.row?.status === 'reserved',
      { credits: [before22.credits, after22.credits], row: after22.row });
    check('22 the server created the interview row, with its settings, linked to a fresh session',
      after22.interview?.user_id === account.userId && after22.interview?.language === 'en' && after22.session?.turns_completed === 0 && after22.session?.model_calls === 0,
      { interview: after22.interview, session: after22.session });
    if (!interviewId || !after22.session) throw new Error('no interview was started: the interview cases cannot go on');

    // ── 23. The first question: the session settles ─────────────────────────
    const r23 = await send('/api/interview-coach', { json: { interviewId, messages: [] } });
    await delay(2_000);
    const after23 = await interviewState(interviewId);
    describe('23. interview, the first question (settles the session)', r23, after22, after23);
    check('23 answers 200 with a streamed question', r23.status === 200 && r23.text.trim().length > 0 && !r23.text.includes('FINAL_REPORT'), r23.json ?? r23.text.slice(0, 200));
    check(`23 the session settles for ${INTERVIEW_CREDITS} credits, nothing more debited`,
      after23.credits === after22.credits && after23.row?.status === 'settled' && after23.row?.credits_charged === INTERVIEW_CREDITS,
      { credits: [after22.credits, after23.credits], row: after23.row });
    check('23 one model call claimed and its cost logged, one turn completed',
      after23.session?.model_calls === 1 && after23.session?.turns_completed === 1 && costLogged(callsOf(after23, 'model')),
      { session: after23.session, calls: after23.calls });

    // ── 24. An answer: feedback and the next question, no charge ────────────
    const history = [
      { role: 'assistant', content: r23.text.trim() },
      { role: 'user', content: 'At Acme I led the migration of our billing service to PostgreSQL. I planned it in three phases, wrote the rollback scripts, and we switched over without downtime.' },
    ];
    const r24 = await send('/api/interview-coach', { json: { interviewId, messages: history } });
    await delay(2_000);
    const after24 = await interviewState(interviewId);
    describe('24. interview, an answer (feedback and the next question)', r24, after23, after24);
    check('24 answers 200 with feedback and the next question', r24.status === 200 && /FEEDBACK:/.test(r24.text) && /QUESTION:/.test(r24.text), r24.json ?? r24.text.slice(0, 300));
    check('24 debits nothing and adds no ledger row', after24.credits === after23.credits && after24.usageRows === after23.usageRows, [after23.credits, after24.credits]);
    check('24 two model calls on the one ledger row, two turns completed',
      after24.session?.model_calls === 2 && after24.session?.turns_completed === 2 && callsOf(after24, 'model').length === 2,
      { session: after24.session, calls: after24.calls.length });
    history.push({ role: 'assistant', content: r24.text.trim() });

    // ── 25. A spoken question: text-to-speech, a call of the session ────────
    const SPOKEN = 'Tell me about a project you are proud of.';
    const r25 = await send('/api/text-to-speech', { json: { text: SPOKEN, interviewId } });
    const after25 = await interviewState(interviewId);
    const mp3 = typeof r25.json?.audio === 'string' ? Buffer.from(r25.json.audio, 'base64') : Buffer.alloc(0);
    describe('25. interview, a spoken question (text-to-speech)', r25, after24, after25);
    check('25 answers 200 with MP3 audio', r25.status === 200 && r25.json?.mimeType === 'audio/mpeg' && mp3.length > 1_000,
      { status: r25.status, mimeType: r25.json?.mimeType, bytes: mp3.length, error: r25.json?.error });
    check('25 debits nothing; one tts call claimed and logged on the interview row',
      after25.credits === after24.credits && after25.session?.tts_calls === 1 && costLogged(callsOf(after25, 'tts')),
      { credits: [after24.credits, after25.credits], session: after25.session, tts: callsOf(after25, 'tts') });

    // ── 26. A spoken answer: speech-to-text of the audio from 25 ────────────
    const audioForm = new FormData();
    audioForm.append('audio', new Blob([mp3], { type: 'audio/mpeg' }), 'answer.mp3');
    audioForm.append('interviewId', interviewId);
    const r26 = await send('/api/speech-to-text', { form: audioForm });
    const after26 = await interviewState(interviewId);
    describe('26. interview, a spoken answer (speech-to-text)', r26, after25, after26);
    check('26 answers 200 with the words spoken in 25',
      r26.status === 200 && /project/i.test(r26.json?.transcript ?? '') && /proud/i.test(r26.json?.transcript ?? ''), r26.json);
    check('26 debits nothing; one stt call claimed and its cost logged',
      after26.credits === after25.credits && after26.session?.stt_calls === 1 && costLogged(callsOf(after26, 'stt')),
      { credits: [after25.credits, after26.credits], session: after26.session, stt: callsOf(after26, 'stt') });

    // ── 27. An answer over limits.max_answer_chars (2,000): refused first ───
    const r27 = await send('/api/interview-coach', { json: { interviewId, messages: [...history, { role: 'user', content: 'x'.repeat(2_001) }] } });
    const after27 = await interviewState(interviewId);
    describe('27. interview, an answer longer than 2,000 characters', r27, after26, after27);
    check('27 answers 413 input_too_large', r27.status === 413 && r27.json?.reason === 'input_too_large', r27.json);
    check('27 claims no call and charges nothing',
      after27.session?.model_calls === after26.session?.model_calls && after27.credits === after26.credits && after27.calls.length === after26.calls.length,
      { session: after27.session, credits: [after26.credits, after27.credits] });

    // ── 28. The answer to the last question: the report, saved by the server
    // Questions 3 to 7 are skipped by moving the session's turn counter, and the
    // conversation sent says the same: it ends on question 8. Told "Question 2
    // of 8" by its own last message, the model asks question 3 instead.
    const { error: skipError } = await admin.from('ai_sessions').update({ turns_completed: 8 }).eq('id', after22.session.id);
    if (skipError) throw skipError;
    const reportHistory = [...history,
      { role: 'user', content: 'I once owned a queue that backed up overnight; I added an alert on its depth and a dashboard, and it never went unnoticed again.' },
      { role: 'assistant', content: 'FEEDBACK: A concrete example with a clear outcome.\n\nQUESTION: Question 8 of 8 — How would you make sure whoever is on call can act quickly on an incident in a service they did not build?' },
      { role: 'user', content: 'I would set up alerts on error rates and write a runbook, so that whoever is on call can act within minutes.' }];
    const r28 = await send('/api/interview-coach', { json: { interviewId, messages: reportHistory } });
    await delay(3_000);
    const after28 = await interviewState(interviewId);
    const report  = after28.interview?.feedback_json;
    describe('28. interview, the answer to the last question (final report)', r28, after27, after28);
    check('28 answers 200 with the final report', r28.status === 200 && r28.text.includes('FINAL_REPORT'), r28.json ?? r28.text.slice(-300));
    check('28 the server saved the report: a score within 0-100 and its three lists',
      Number.isInteger(after28.interview?.score) && after28.interview.score >= 0 && after28.interview.score <= 100
        && report?.score === after28.interview.score && [report?.strengths, report?.improvements, report?.tips].every(Array.isArray),
      { score: after28.interview?.score, report });
    check('28 the session ended as completed, its last turn counted, nothing debited',
      Boolean(after28.session?.ended_at) && after28.session?.end_reason === 'completed' && after28.session?.turns_completed === 9 && after28.credits === after27.credits,
      { session: after28.session, credits: [after27.credits, after28.credits] });

    // ── 29. After the report: no more turns, no more speech ─────────────────
    const r29 = await send('/api/interview-coach', { json: { interviewId, messages: [{ role: 'user', content: 'One more question?' }] } });
    const r29Speech = await send('/api/text-to-speech', { json: { text: SPOKEN, interviewId } });
    const after29 = await interviewState(interviewId);
    describe('29. interview, a turn and a spoken question after the report', r29, after28, after29);
    check('29 a turn answers 409 interview_complete', r29.status === 409 && r29.json?.reason === 'interview_complete', r29.json);
    check('29 speech answers 409 session_closed, and no call was made',
      r29Speech.status === 409 && r29Speech.json?.reason === 'session_closed' && after29.calls.length === after28.calls.length,
      { status: r29Speech.status, reason: r29Speech.json?.reason, calls: [after28.calls.length, after29.calls.length] });

    // ── 30. An interview id that is not one of the user's ───────────────────
    const unknownInterview = crypto.randomUUID();
    const r30 = [
      await send('/api/interview-coach', { json: { interviewId: unknownInterview, messages: [] } }),
      await send('/api/text-to-speech', { json: { text: SPOKEN, interviewId: unknownInterview } }),
    ];
    console.log(`\n30. interview routes, an interview id that is not the user's\n  HTTP ${r30.map((r) => r.status).join(', ')}`);
    check("30 the turn and speech routes answer 404 not_found", r30.every((r) => r.status === 404 && r.json?.reason === 'not_found'), r30.map((r) => r.json));

    // ── 31. The interview's admin toggle off ────────────────────────────────
    const before31 = await interviewState(null);
    const r31 = await send('/api/interview-coach/start', { json: interviewSettings,
      headers: { 'Idempotency-Key': key('interview-switch'), 'X-AI-Test-Switch-Off': 'interview_coach' } });
    const after31 = await interviewState(null);
    describe('31. interview start with its admin toggle off', r31, before31, after31);
    check('31 answers 503 feature_disabled', r31.status === 503 && r31.json?.reason === 'feature_disabled', r31.json);
    check('31 charges nothing and leaves no ledger row', after31.credits === before31.credits && after31.usageRows === before31.usageRows,
      { credits: [before31.credits, after31.credits], rows: [before31.usageRows, after31.usageRows] });

    // ── The report an interview owes ────────────────────────────────────────
    // The interview above is put back on its report turn rather than paying for
    // a second one; everything the server counts is left as it stands.
    const reopenForReport = async (attempts) => {
      const { error } = await admin.from('ai_sessions')
        .update({ ended_at: null, end_reason: null, turns_completed: 8, report_attempts: attempts })
        .eq('id', after22.session.id);
      if (error) throw error;
      const { error: clearError } = await admin.from('interview_sessions')
        .update({ score: null, feedback_json: null }).eq('id', interviewId);
      if (clearError) throw clearError;
    };

    // The retries' own ledger rows: zero credits, real cost, cost_system_usd.
    const retryLedger = async () => {
      const { data: rows, error } = await admin.from('ai_usage')
        .select('id, action, credits_charged, status, cost_usd')
        .eq('user_id', account.userId)
        .eq('action', 'system_interview_report_retry')
        .gte('created_at', new Date(Number(runId)).toISOString());
      if (error) throw error;
      const { data: calls } = (rows ?? []).length
        ? await admin.from('ai_usage_calls').select('usage_id, kind, cost_status, cost_usd, generation_id').in('usage_id', rows.map((r) => r.id))
        : { data: [] };
      return { rows: rows ?? [], calls: calls ?? [] };
    };

    // ── 32. A report that cannot be read: the interview stays open ──────────
    await reopenForReport(0);
    const before32 = await interviewState(interviewId);
    const r32 = await send('/api/interview-coach', { json: { interviewId, messages: reportHistory },
      headers: { 'X-AI-Test-Failure': 'report-unreadable' } });
    await delay(3_000);
    const after32 = await interviewState(interviewId);
    describe('32. interview, a report that cannot be read', r32, before32, after32);
    check('32 answers 200 and saves no report',
      r32.status === 200 && after32.interview?.score === null && after32.interview?.feedback_json === null,
      { status: r32.status, score: after32.interview?.score });
    check('32 the session stays open on its report turn, one attempt spent',
      after32.session?.ended_at === null && after32.session?.turns_completed === 8 && after32.session?.report_attempts === 1,
      after32.session);
    check('32 debits nothing and adds no ledger row',
      after32.credits === before32.credits && after32.usageRows === before32.usageRows, [before32.credits, after32.credits]);

    // ── 33. Asking for it again: the report arrives, charged to nobody ──────
    const r33 = await send('/api/interview-coach', { json: { interviewId, messages: reportHistory } });
    await delay(3_000);
    const after33 = await interviewState(interviewId);
    const retries  = await retryLedger();
    describe('33. interview, the report asked for again', r33, after32, after33);
    check('33 answers 200 with the report, saved by the server',
      r33.status === 200 && r33.text.includes('FINAL_REPORT') && Number.isInteger(after33.interview?.score),
      { status: r33.status, score: after33.interview?.score });
    check('33 the retry debits nothing, counts as a second attempt, and ends the session',
      after33.credits === after32.credits && after33.session?.report_attempts === 2 && after33.session?.end_reason === 'completed',
      { credits: [after32.credits, after33.credits], session: after33.session });
    check('33 its cost is on its own zero-credit system row, not on the interview',
      retries.rows.length === 1 && retries.rows[0].credits_charged === 0 && retries.rows[0].status === 'settled'
        && costLogged(retries.calls) && after33.calls.length === after32.calls.length,
      { rows: retries.rows, calls: retries.calls });

    // ── 34. Out of report attempts: refused, and left for a human ───────────
    await reopenForReport(4);
    const before34 = await interviewState(interviewId);
    const r34 = await send('/api/interview-coach', { json: { interviewId, messages: reportHistory } });
    const after34 = await interviewState(interviewId);
    describe('34. interview, a fifth report attempt', r34, before34, after34);
    check('34 answers 409 report_unavailable, and says so plainly',
      r34.status === 409 && r34.json?.reason === 'report_unavailable' && /notified/i.test(r34.json?.error ?? ''), r34.json);
    check('34 claims no model call and charges nothing',
      after34.session?.model_calls === before34.session?.model_calls && after34.credits === before34.credits,
      { calls: [before34.session?.model_calls, after34.session?.model_calls], credits: [before34.credits, after34.credits] });
    check('34 closes the session as report_failed',
      Boolean(after34.session?.ended_at) && after34.session?.end_reason === 'report_failed', after34.session);

    // ── End-to-end arithmetic ───────────────────────────────────────────────
    const final          = await snapshot();
    const settledCredits = final.usage.filter((u) => u.status === 'settled').reduce((sum, u) => sum + u.credits_charged, 0);
    const refundedRows   = final.usage.filter((u) => u.status === 'refunded').length;
    const openRows       = final.usage.filter((u) => u.status === 'reserved').length;

    console.log(`\nArithmetic: balance ${r1.before.credits} before the first call, ${final.credits} after the last`);
    check(`the balance moved by exactly ${EXPECTED_DELTA} from the first call to the last`,
      final.credits - r1.before.credits === EXPECTED_DELTA, final.credits - r1.before.credits);
    check(`the ledger agrees: ${-EXPECTED_DELTA} credits settled, 2 actions refunded`,
      settledCredits === -EXPECTED_DELTA && refundedRows === 2, { settledCredits, refundedRows });
    check('no reservation of this run is left open', openRows === 0, openRows);

    const totalCost = final.calls.reduce((sum, c) => sum + Number(c.cost_usd ?? 0), 0);
    console.log(`\nOpenRouter cost of this run: $${totalCost.toFixed(6)}`);
  } finally {
    if (cleanup.letters.length) {
      const { error } = await admin.from('cover_letters').delete().in('id', cleanup.letters);
      if (error) console.log(`cleanup: cover letters not deleted: ${error.message}`);
    }
    if (cleanup.templates.length) {
      const { error } = await admin.from('letter_templates').delete().in('id', cleanup.templates);
      if (error) console.log(`cleanup: letter templates not deleted: ${error.message}`);
    }
    if (cleanup.interviews.length) {
      const { error } = await admin.from('interview_sessions').delete().in('id', cleanup.interviews);
      if (error) console.log(`cleanup: interview rows not deleted: ${error.message}`);
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const ran = passed + failed;
  if (ran !== EXPECTED_CHECKS) {
    failed++;
    console.log(`  FAIL  REPORT expected ${EXPECTED_CHECKS} checks, ran ${ran}`);
  }
  console.log(failed ? `\n${failed} FAILED, ${passed} ok` : `\nall ${passed} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\nE2E RUN FAILED:', err);
  process.exit(1);
});
