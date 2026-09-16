// One credit per application sent — and never two for one.
//
// Run it (no OpenRouter spend, no email sent):
//   1. npm run dev                                      the dev server, port 3000
//   2. node security-tests/autoApplyCredits.test.js [base url]
//
// An auto-apply run searches Adzuna, hunts for a recruiter's address and sends
// a real email to a real person. A test must not do that. So this drives the
// credit path of a real application through the real route, with a seam the
// route honours only outside production (X-Auto-Apply-Test) — the same
// discipline as X-AI-Test-Failure elsewhere: no extra endpoint to forget, dead
// code in a production build.
//
// What it checks is what the money depends on: the reservation, the settlement,
// the refund, the idempotency key, and the lock underneath — two applications
// racing for the last credit, as two real parallel HTTP requests.
//
// Guarded: the number of checks that ran must equal EXPECTED_CHECKS.

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { createClient }       = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');

const ROOT            = path.resolve(__dirname, '..');
const BASE            = process.argv[2] || 'http://localhost:3000';
const EXPECTED_CHECKS = 12;

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
      const res = await fetch(`${BASE}/api/auto-apply/run`, { signal: AbortSignal.timeout(60_000) });
      if (res.status === 405 || res.status === 401) return;
      last = `HTTP ${res.status}`;
    } catch (err) {
      last = String(err);
    }
    await delay(2_000);
  }
  throw new Error(`no dev server at ${BASE} (${last}). Start it first: npm run dev`);
}

async function main() {
  const env = loadEnv(path.join(ROOT, '.env.local'));
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await ensureServer();

  // ── The test account, on a plan that has auto-apply ───────────────────────
  const { data: profiles, error } = await admin
    .from('profiles').select('id').eq('is_test_account', true).order('created_at').limit(1);
  if (error) throw error;
  if (!profiles.length) throw new Error('no test account');
  const userId = profiles[0].id;

  const { data: userRow } = await admin.auth.admin.getUserById(userId);
  const password = crypto.randomBytes(24).toString('base64url');
  const { error: pwError } = await admin.auth.admin.updateUserById(userId, { password });
  if (pwError) throw pwError;

  const setCredits = async (credits) => {
    const { error: e } = await admin.from('profiles').update({
      ai_credits_remaining: credits,
      subscription_plan:    'premium',
      subscription_status:  'active',
      is_blocked:           false,
    }).eq('id', userId);
    if (e) throw e;
  };

  const balance = async () => {
    const { data } = await admin.from('profiles').select('ai_credits_remaining').eq('id', userId).single();
    return data.ai_credits_remaining;
  };

  const usageRows = async (prefix) => {
    const { data } = await admin
      .from('ai_usage')
      .select('id, action, status, credits_charged, cost_usd, idempotency_key')
      .eq('user_id', userId)
      .like('idempotency_key', `auto-apply:${prefix}%`);
    return data ?? [];
  };

  const jar = new Map();
  const ssr = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => { for (const { name, value } of list) { if (value) jar.set(name, value); else jar.delete(name); } },
    },
  });
  const { error: signInError } = await ssr.auth.signInWithPassword({ email: userRow.user.email, password });
  if (signInError) throw signInError;
  const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');

  const runId = String(Date.now());
  const apply = (jobId, { outcome } = {}) => fetch(`${BASE}/api/auto-apply/run`, {
    method:  'POST',
    headers: {
      Cookie: cookie,
      'X-Auto-Apply-Test': `charge-one:${runId}-${jobId}`,
      ...(outcome ? { 'X-Auto-Apply-Test-Outcome': outcome } : {}),
    },
    signal: AbortSignal.timeout(60_000),
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));

  console.log(`\nAuto-apply credits — test account ${userId}, run ${runId}`);

  try {
    // ── 1. An application costs exactly one credit ──────────────────────────
    await setCredits(5);
    const before1 = await balance();
    const r1 = await apply('a');
    const after1 = await balance();
    const rows1  = await usageRows(`${runId}-a`);
    console.log(`\n1. one application\n  HTTP ${r1.status} · credits ${before1} → ${after1} · ledger ${rows1.map((r) => `${r.action} ${r.status} ${r.credits_charged}`).join(', ') || 'none'}`);
    check('1 the application is charged one credit', r1.status === 200 && after1 === before1 - 1, { status: r1.status, credits: [before1, after1] });
    check('1 its ledger row is auto_apply, settled, for one credit',
      rows1.length === 1 && rows1[0].action === 'auto_apply' && rows1[0].status === 'settled' && rows1[0].credits_charged === 1, rows1);

    // ── 2. The same job again: charged once, whatever the retries ───────────
    const before2 = await balance();
    const r2 = await apply('a');
    const after2 = await balance();
    console.log(`\n2. the same job again\n  HTTP ${r2.status} · credits ${before2} → ${after2}`);
    check('2 the second attempt is refused as a duplicate', r2.status === 409, r2);
    check('2 and debits nothing', after2 === before2, [before2, after2]);

    // ── 3. A failure before sending: refunded, cost kept ────────────────────
    const before3 = await balance();
    const r3 = await apply('b', { outcome: 'fail' });
    const after3 = await balance();
    const rows3  = await usageRows(`${runId}-b`);
    console.log(`\n3. an application that fails before sending\n  HTTP ${r3.status} · credits ${before3} → ${after3} · ledger ${rows3.map((r) => `${r.action} ${r.status}`).join(', ') || 'none'}`);
    check('3 the user is not charged', after3 === before3, [before3, after3]);
    check('3 the row is refunded, and stays on the books as absorbed cost',
      rows3.length === 1 && rows3[0].status === 'refunded' && rows3[0].credits_charged === 1, rows3);

    // ── 4. Two applications racing for the last credit ──────────────────────
    // The real test of the lock in ai_reserve_internal: two HTTP requests, in
    // parallel, one credit. A test that called the function twice in a row
    // would prove nothing.
    await setCredits(1);
    const before4 = await balance();
    const [raceA, raceB] = await Promise.all([apply('race-1'), apply('race-2')]);
    const after4  = await balance();
    const statuses = [raceA.status, raceB.status].sort();
    const rowsRace = [...await usageRows(`${runId}-race-1`), ...await usageRows(`${runId}-race-2`)];
    console.log(`\n4. two applications, one credit\n  HTTP ${raceA.status} and ${raceB.status} · credits ${before4} → ${after4} · ledger ${rowsRace.map((r) => `${r.status} ${r.credits_charged}`).join(', ') || 'none'}`);
    check('4 exactly one application went through', statuses[0] === 200 && statuses[1] === 402, statuses);
    check('4 the refused one says no_credits',
      [raceA, raceB].some((r) => r.status === 402 && r.json?.reason === 'no_credits'), [raceA.json, raceB.json]);
    check('4 exactly one credit was taken, and the balance never went below zero',
      after4 === 0 && before4 === 1, [before4, after4]);
    check('4 one settled row, no second charge', rowsRace.filter((r) => r.status === 'settled').length === 1, rowsRace);

    // ── 5. No credits left at all ───────────────────────────────────────────
    const before5 = await balance();
    const r5 = await apply('c');
    const after5 = await balance();
    console.log(`\n5. an application with an empty balance\n  HTTP ${r5.status} · credits ${before5} → ${after5}`);
    check('5 answers 402 no_credits', r5.status === 402 && r5.json?.reason === 'no_credits', r5);
    check('5 and the balance stays at zero, never negative', after5 === 0, after5);
  } finally {
    const { data: rows } = await admin
      .from('ai_usage').select('id').eq('user_id', userId).like('idempotency_key', `auto-apply:${runId}-%`);
    if ((rows ?? []).length) {
      const { error: cleanupError } = await admin.from('ai_usage').delete().in('id', rows.map((r) => r.id));
      if (cleanupError) console.log(`cleanup: usage rows not deleted: ${cleanupError.message}`);
    }
  }

  const ran = passed + failed;
  if (ran !== EXPECTED_CHECKS) {
    failed++;
    console.log(`  FAIL  REPORT expected ${EXPECTED_CHECKS} checks, ran ${ran}`);
  }
  console.log(failed ? `\n${failed} FAILED, ${passed} ok` : `\nall ${passed} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\nAUTO-APPLY CREDIT TEST FAILED TO RUN:', err);
  process.exit(1);
});
