// End-to-end test of the AI billing chain, as a client sees it:
// route → withAiAction → reserve_ai_credits → OpenRouter → cost ledger → settle
// or refund.
//
// Run it (a few cents of real OpenRouter usage per run):
//   1. npm run dev                                     the dev server, port 3000
//   2. node security-tests/aiBillingE2E.test.js [base url]
//
// The only test of the whole chain: the SQL tests exercise the functions, the
// node tests the pure rules, this one the routes. It runs against the
// production database — there is no other — as the dedicated test account
// (profiles.is_test_account), reset to a 10-credit trial before each run. If no
// test account exists (they are deleted before launch), it creates one.
//
// Failures after the model call are injected with the X-AI-Test-Failure header,
// which withAiAction honours only when NODE_ENV is development or test: against
// a production build the two failure cases come back 200, and fail here.
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
const EXPECTED_CHECKS = 26;
const EXPECTED_DELTA  = -4;   // rewrite-bullet 1 + ats-score 1 + generate-cv 2

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
      user_metadata: { full_name: '[TEST] AI billing E2E' },
    });
    if (createError) throw createError;
    userId = data.user.id;
    const { error: insertError } = await admin
      .from('profiles').insert({ id: userId, full_name: '[TEST] AI billing E2E', is_test_account: true });
    if (insertError) throw insertError;
  }

  const password = crypto.randomBytes(24).toString('base64url');
  const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password });
  if (passwordError) throw passwordError;

  const { error: resetError } = await admin.from('profiles').update({
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

  async function run(name, route, body, idempotencyKey, headers = {}) {
    const before  = await snapshot();
    const started = Date.now();
    const res = await fetch(`${BASE}${route}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'Idempotency-Key': idempotencyKey, ...headers },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(330_000),
    });
    const text  = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    const after = await snapshot();
    const row   = after.usage.find((u) => u.idempotency_key === idempotencyKey) ?? null;
    const calls = row ? after.calls.filter((c) => c.usage_id === row.id) : [];

    const cost = calls[0] ? `${calls[0].cost_status} $${calls[0].cost_usd ?? '—'}` : 'no call';
    console.log(`\n${name}\n  HTTP ${res.status} in ${((Date.now() - started) / 1000).toFixed(1)} s · credits ${before.credits} → ${after.credits} · ledger ${row ? `${row.status}, ${row.credits_charged} credit(s)` : 'no row'} · call ${cost}`);
    return { status: res.status, json, before, after, row, calls };
  }

  // A call is logged when it has a real cost, or is pending with a generation id
  // for the ai-ledger cron to complete.
  const costLogged = (calls) => calls.length === 1 && (
    (calls[0].cost_status === 'final' && Number(calls[0].cost_usd) > 0)
    || (calls[0].cost_status === 'pending' && Boolean(calls[0].generation_id))
  );

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

  // ── 1. rewrite-bullet: quick_write, 1 credit ──────────────────────────────
  const r1 = await run('1. rewrite-bullet (quick_write, 1 credit)', '/api/rewrite-bullet', bullet, key('rewrite'));
  check('1 answers 200', r1.status === 200, r1.json);
  check('1 debits exactly 1 credit', r1.after.credits === r1.before.credits - 1, [r1.before.credits, r1.after.credits]);
  check('1 ledger row settled for 1 credit', r1.row?.status === 'settled' && r1.row?.credits_charged === 1, r1.row);
  check('1 call cost logged', costLogged(r1.calls), r1.calls);

  // ── 2. The same key again: nothing charged, nothing called ─────────────────
  const r2 = await run('2. rewrite-bullet replayed with the same key', '/api/rewrite-bullet', bullet, key('rewrite'));
  check('2 answers 409 already_processed', r2.status === 409 && r2.json?.reason === 'already_processed', r2.json);
  check('2 debits nothing', r2.after.credits === r2.before.credits, [r2.before.credits, r2.after.credits]);
  check('2 adds no ledger row', r2.after.usage.length === r2.before.usage.length, [r2.before.usage.length, r2.after.usage.length]);

  // ── 3. ats-score: match_score, 1 credit ───────────────────────────────────
  const r3 = await run('3. ats-score (match_score, 1 credit)', '/api/ats-score', ats, key('ats'));
  check('3 answers 200', r3.status === 200, r3.json);
  check('3 debits exactly 1 credit', r3.after.credits === r3.before.credits - 1, [r3.before.credits, r3.after.credits]);
  check('3 ledger row settled for 1 credit', r3.row?.status === 'settled' && r3.row?.credits_charged === 1, r3.row);
  check('3 call cost logged', costLogged(r3.calls), r3.calls);

  // ── 4. generate-cv: cv_generation, 2 credits ──────────────────────────────
  const r4 = await run('4. generate-cv (cv_generation, 2 credits)', '/api/generate-cv', cv, key('generate-cv'));
  check('4 answers 200', r4.status === 200, r4.json && { error: r4.json.error, reason: r4.json.reason });
  check('4 debits exactly 2 credits', r4.after.credits === r4.before.credits - 2, [r4.before.credits, r4.after.credits]);
  check('4 ledger row settled for 2 credits', r4.row?.status === 'settled' && r4.row?.credits_charged === 2, r4.row);
  check('4 call cost logged', costLogged(r4.calls), r4.calls);

  // ── 5. The handler throws after the model call ────────────────────────────
  const r5 = await run('5. rewrite-bullet, handler throws after the model call', '/api/rewrite-bullet', bullet,
    key('fail-throws'), { 'X-AI-Test-Failure': 'handler-throws' });
  check('5 answers 500 internal_error', r5.status === 500 && r5.json?.reason === 'internal_error', r5.json);
  check('5 leaves the balance unchanged', r5.after.credits === r5.before.credits, [r5.before.credits, r5.after.credits]);
  check('5 ledger row refunded, with the failure recorded',
    r5.row?.status === 'refunded' && /injected failure/.test(r5.row?.error ?? ''), r5.row);
  check('5 call cost still logged', costLogged(r5.calls), r5.calls);

  // ── 6. The handler answers an error after the model call ──────────────────
  const r6 = await run('6. ats-score, error response after the model call', '/api/ats-score', ats,
    key('fail-response'), { 'X-AI-Test-Failure': 'error-response' });
  check('6 answers 500', r6.status === 500, r6.json);
  check('6 leaves the balance unchanged', r6.after.credits === r6.before.credits, [r6.before.credits, r6.after.credits]);
  check('6 ledger row refunded', r6.row?.status === 'refunded', r6.row);
  check('6 call cost still logged', costLogged(r6.calls), r6.calls);

  // ── End-to-end arithmetic ─────────────────────────────────────────────────
  const final          = await snapshot();
  const settledCredits = final.usage.filter((u) => u.status === 'settled').reduce((sum, u) => sum + u.credits_charged, 0);
  const refundedRows   = final.usage.filter((u) => u.status === 'refunded').length;
  const openRows       = final.usage.filter((u) => u.status === 'reserved').length;

  console.log(`\nArithmetic: balance ${r1.before.credits} before the first call, ${r6.after.credits} after the last`);
  check(`the balance moved by exactly ${EXPECTED_DELTA} from the first call to the last`,
    r6.after.credits - r1.before.credits === EXPECTED_DELTA, r6.after.credits - r1.before.credits);
  check(`the ledger agrees: ${-EXPECTED_DELTA} credits settled, 2 actions refunded`,
    settledCredits === -EXPECTED_DELTA && refundedRows === 2, { settledCredits, refundedRows });
  check('no reservation of this run is left open', openRows === 0, openRows);

  // ── Report ────────────────────────────────────────────────────────────────
  const ran = passed + failed;
  if (ran !== EXPECTED_CHECKS) {
    failed++;
    console.log(`  FAIL  REPORT expected ${EXPECTED_CHECKS} checks, ran ${ran}`);
  }
  const totalCost = final.calls.reduce((sum, c) => sum + Number(c.cost_usd ?? 0), 0);
  console.log(`\nOpenRouter cost of this run: $${totalCost.toFixed(6)}`);
  console.log(failed ? `\n${failed} FAILED, ${passed} ok` : `\nall ${passed} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\nE2E RUN FAILED:', err);
  process.exit(1);
});
