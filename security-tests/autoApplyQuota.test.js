// An automatic application spends its own quota. Never a credit, never twice.
//
// Run it (no OpenRouter spend, no email sent):
//   1. npm run dev                                    the dev server, port 3000
//   2. node security-tests/autoApplyQuota.test.js [base url]
//
// This replaces autoApplyCredits.test.js. Reference §3: an application spends
// one unit of a monthly quota — 0 for Free, 100 for Pro, 210 for Premium — and
// the AI credit balance is not touched. One credit per application meant a
// Premium customer's 210 applications ate 210 of their 150 credits, so the
// quota was arithmetically impossible to reach.
//
// A real run searches Adzuna, hunts for a recruiter's address and emails a real
// person. A test must not do that, so it drives the quota path of a real
// application through the real route, with the seam the route honours only
// outside production (X-Auto-Apply-Test).
//
// What it checks is what the plan promises:
//   · Free is refused on the feature, not on a quota
//   · Pro is refused at 101, Premium at 211 — by the PLAN, never the guard
//   · two parallel applications cannot both take the last unit
//   · a failure gives the unit back and keeps the cost
//   · the credit balance never moves
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
const EXPECTED_CHECKS = 17;

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

  // ── The test account ──────────────────────────────────────────────────────
  const { data: profiles, error } = await admin
    .from('profiles').select('id').eq('is_test_account', true).order('created_at').limit(1);
  if (error) throw error;
  if (!profiles.length) throw new Error('no test account');
  const userId = profiles[0].id;

  const { data: userRow } = await admin.auth.admin.getUserById(userId);
  const password = crypto.randomBytes(24).toString('base64url');
  const { error: pwError } = await admin.auth.admin.updateUserById(userId, { password });
  if (pwError) throw pwError;

  // The month the counter uses, exactly as claim_auto_apply computes it.
  const now   = new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);

  // The plan, and only the plan. This used to reset ai_credits_remaining to 50
  // as well, three times during the run — so the last check, the one that
  // proves an application never touches the credit balance, was comparing a
  // number its own helper had overwritten.
  const setPlan = async (plan) => {
    const { error: e } = await admin.from('profiles').update({
      subscription_plan:   plan,
      subscription_status: plan === 'free' ? null : 'active',
      is_blocked:          false,
    }).eq('id', userId);
    if (e) throw e;
  };

  const setCounter = async (count) => {
    const { error: e } = await admin
      .from('auto_apply_counters')
      .upsert({ month, user_id: userId, count }, { onConflict: 'month,user_id' });
    if (e) throw e;
  };

  const counter = async () => {
    const { data } = await admin
      .from('auto_apply_counters').select('count')
      .eq('user_id', userId).eq('month', month).maybeSingle();
    return data?.count ?? 0;
  };

  const credits = async () => {
    const { data } = await admin.from('profiles').select('ai_credits_remaining').eq('id', userId).single();
    return data.ai_credits_remaining;
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

  const usageRows = async () => {
    const { data } = await admin
      .from('ai_usage')
      .select('id, action, status, credits_charged')
      .eq('user_id', userId)
      .eq('action', 'system_auto_apply')
      .gte('created_at', new Date(Date.now() - 10 * 60_000).toISOString());
    return data ?? [];
  };

  console.log(`\nAuto-apply quota — test account ${userId}, month ${month}, run ${runId}`);

  // Seeded once here, and never written again by this test: whatever the
  // balance is at the end, nothing in the auto-apply path put it there.
  const { error: seedError } = await admin.from('profiles')
    .update({ ai_credits_remaining: 50 }).eq('id', userId);
  if (seedError) throw seedError;
  const creditsAtStart = await credits();

  try {
    // ── 1. Free: refused on the feature, before any quota ───────────────────
    await setPlan('free');
    await setCounter(0);
    const free = await apply('free-1');
    console.log(`\n1. a Free account\n  HTTP ${free.status} · reason ${free.json?.reason} · counter ${await counter()}`);
    check('1 Free is refused', free.status === 403, free);
    check('1 and told the plan does not include it — not that a quota ran out',
      free.json?.reason === 'tier_locked', free.json);
    check('1 nothing was counted against it', (await counter()) === 0, await counter());

    // ── 2. Pro: the 100th passes, the 101st does not ────────────────────────
    await setPlan('pro');
    await setCounter(99);
    const pro100 = await apply('pro-100');
    const after100 = await counter();
    const pro101 = await apply('pro-101');
    const after101 = await counter();
    console.log(`\n2. Pro at its limit\n  100th: HTTP ${pro100.status} · counter ${after100}\n  101st: HTTP ${pro101.status} · reason ${pro101.json?.reason} · counter ${after101}`);
    check('2 the 100th application goes through', pro100.status === 200 && after100 === 100, { status: pro100.status, after100 });
    check('2 the 101st is refused', pro101.status === 403, pro101);
    check('2 the reason is the quota, not credits — 402 would send them to buy what they have',
      pro101.json?.reason === 'auto_apply_quota', pro101.json);
    check('2 the message names the plan quota (100), never the guard (250)',
      typeof pro101.json?.error === 'string' && pro101.json.error.includes('100') && !pro101.json.error.includes('250'),
      pro101.json?.error);
    check('2 the counter never went above the quota', after101 === 100, after101);

    // ── 3. Premium: the 210th passes, the 211th does not ────────────────────
    await setPlan('premium');
    await setCounter(209);
    const prem210 = await apply('prem-210');
    const prem211 = await apply('prem-211');
    const after211 = await counter();
    console.log(`\n3. Premium at its limit\n  210th: HTTP ${prem210.status}\n  211th: HTTP ${prem211.status} · reason ${prem211.json?.reason} · counter ${after211}`);
    check('3 the 210th goes through', prem210.status === 200, prem210);
    check('3 the 211th is refused on the plan quota', prem211.status === 403 && prem211.json?.reason === 'auto_apply_quota', prem211.json);
    check('3 the guard at 250 was never reached — the plan spoke first',
      after211 === 210 && typeof prem211.json?.error === 'string' && prem211.json.error.includes('210'),
      { after211, error: prem211.json?.error });

    // ── 4. Two applications racing for the last unit ────────────────────────
    // Two real parallel HTTP requests. Calling the function twice in a row
    // would prove nothing about the lock.
    await setCounter(209);
    const [raceA, raceB] = await Promise.all([apply('race-1'), apply('race-2')]);
    const afterRace = await counter();
    const statuses  = [raceA.status, raceB.status].sort();
    console.log(`\n4. two applications, one unit left\n  HTTP ${raceA.status} and ${raceB.status} · counter ${afterRace}`);
    check('4 exactly one went through', statuses[0] === 200 && statuses[1] === 403, statuses);
    check('4 the refused one names the quota',
      [raceA, raceB].some((r) => r.status === 403 && r.json?.reason === 'auto_apply_quota'), [raceA.json, raceB.json]);
    check('4 the counter landed exactly on the quota, never above', afterRace === 210, afterRace);

    // ── 5. A failure on the way out ─────────────────────────────────────────
    await setCounter(5);
    const before  = await counter();
    const failRun = await apply('fail-1', { outcome: 'fail' });
    const after   = await counter();
    const rows    = await usageRows();
    console.log(`\n5. an application that fails before sending\n  HTTP ${failRun.status} · counter ${before} → ${after} · system rows ${rows.length}`);
    check('5 the quota unit is given back', after === before, [before, after]);
    check('5 what it cost stays on a zero-credit system row',
      rows.length > 0 && rows.every((r) => r.credits_charged === 0 && r.action === 'system_auto_apply'), rows.slice(0, 3));

    // ── 6. Credits were never involved ──────────────────────────────────────
    const creditsAtEnd = await credits();
    console.log(`\n6. credits ${creditsAtStart} → ${creditsAtEnd}`);
    check('6 not one credit was spent on any of it', creditsAtEnd === creditsAtStart, [creditsAtStart, creditsAtEnd]);
  } finally {
    // Leave nothing behind: the counter row and the system usage rows this run
    // created.
    await admin.from('auto_apply_counters').delete().eq('user_id', userId).eq('month', month);
    const { data: rows } = await admin
      .from('ai_usage').select('id').eq('user_id', userId).eq('action', 'system_auto_apply')
      .gte('created_at', new Date(Date.now() - 10 * 60_000).toISOString());
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
  console.error('\nAUTO-APPLY QUOTA TEST FAILED TO RUN:', err);
  process.exit(1);
});
