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
// (profiles.is_test_account), reset to a 10-credit trial before each run. If no
// test account exists (they are deleted before launch), it creates one. The
// letter template and cover letters it creates are deleted at the end.
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
const EXPECTED_CHECKS = 50;
// rewrite-bullet 1 + ats-score 1 + generate-cv 2 + jobs/apply 1 + letter adapt 1 + parse-cv 1
const EXPECTED_DELTA  = -7;
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

// The dedicated test account, reset to a known state: an active trial with 10
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
    ai_credits_remaining: 10,
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
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
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
  const cookie  = await signIn(env, account);
  const runId   = String(Date.now());
  const prefix  = `e2e-${runId}-`;
  const key     = (label) => `${prefix}${label}`;
  const cleanup = { templates: [], letters: [] };

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
        .select('usage_id, cost_status, cost_usd, generation_id, prompt_tokens, completion_tokens')
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
