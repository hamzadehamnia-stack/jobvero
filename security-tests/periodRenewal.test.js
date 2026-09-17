// The month turns, and the account gets what it pays for. Once.
//
// Run it (no dev server, no OpenRouter spend):
//   node security-tests/periodRenewal.test.js
//
// Nothing in this project ever put credits back. An account was granted its
// allowance once, at signup, and never again — so the second month a paying
// customer could do nothing. This checks the machinery that fixes it:
//
//   · at the start of a period the balance is REPLACED by the plan's
//     allowance, never added to: an unused balance does not accumulate;
//   · granting twice for the same period is impossible, whatever races —
//     two crons, a replayed Stripe webhook, a hand-run repair;
//   · a paid plan whose payment is not current gets NOTHING, and keeps its
//     period, so the webhook can grant the moment the payment succeeds;
//   · the application quota and the free inbox month reset with the credits,
//     on the same date, because they are keyed by the same period.
//
// It talks to the database with the service role, which is what the cron and
// the future Stripe webhook use. Where the assertion has to be deterministic it
// calls grant_period_credits directly with an explicit key; renew_due_periods —
// the sweep — is exercised once, and by design that sweep renews EVERY account
// whose period has ended, not only this test's.
//
// Guarded: the number of checks that ran must equal EXPECTED_CHECKS.

'use strict';

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const ROOT            = path.resolve(__dirname, '..');
const EXPECTED_CHECKS = 18;

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

function loadEnv(file) {
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const iso  = (d) => new Date(d).toISOString();
const days = (n) => new Date(Date.now() + n * 86_400_000);

async function main() {
  const env   = loadEnv(path.join(ROOT, '.env.local'));
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profiles, error } = await admin
    .from('profiles').select('id').eq('is_test_account', true).order('created_at').limit(1);
  if (error) throw error;
  if (!profiles.length) throw new Error('no test account');
  const userId = profiles[0].id;

  console.log(`\nPeriod renewal — test account ${userId}`);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const setAccount = async (fields) => {
    const { error: e } = await admin.from('profiles').update(fields).eq('id', userId);
    if (e) throw e;
  };

  const account = async () => {
    const { data } = await admin
      .from('profiles')
      .select('subscription_plan, subscription_status, ai_credits_remaining, current_period_start, current_period_end')
      .eq('id', userId).single();
    return data;
  };

  const grants = async () => {
    const { data } = await admin
      .from('credit_grants').select('grant_key, plan, credits, period_start, period_end')
      .eq('user_id', userId);
    return data ?? [];
  };

  const grant = (key, start, end) =>
    admin.rpc('grant_period_credits', {
      p_user_id:      userId,
      p_grant_key:    key,
      p_period_start: iso(start),
      p_period_end:   iso(end),
    }).then(({ data, error: e }) => {
      if (e) throw e;
      return Array.isArray(data) ? data[0] : data;
    });

  // Section 3 classifies one email, which increments the counters every alias
  // shares for the day. What they were before the run, to put them back: a test
  // must not leave the day one email shorter for everyone else.
  const today = new Date().toISOString().slice(0, 10);
  const { data: globalRow } = await admin
    .from('inbox_classify_counters').select('count')
    .eq('day', today).eq('scope', 'global').eq('subject', 'global').maybeSingle();
  const globalBefore = globalRow?.count ?? 0;

  const wipe = async () => {
    await admin.from('credit_grants').delete().eq('user_id', userId);
    await admin.from('auto_apply_counters').delete().eq('user_id', userId);
    await admin.from('auto_apply_claims').delete().eq('user_id', userId);
    await admin.from('inbox_classify_counters').delete().eq('scope', 'month').eq('subject', userId);
  };

  try {
    // ── 1. A period that ends: the balance is replaced, not topped up ───────
    console.log('\n1. The period ends');
    await wipe();
    await setAccount({
      subscription_plan:    'pro',
      subscription_status:  'active',
      ai_credits_remaining: 55,          // 55 unused credits from last month
      current_period_start: iso(days(-31)),
      current_period_end:   iso(days(-1)),
    });

    const r1 = await grant('period:test-1', days(-1), days(29));
    const a1 = await account();
    console.log(`  granted=${r1.granted} reason=${r1.reason} credits=${r1.credits} · balance 55 → ${a1.ai_credits_remaining}`);
    check('1 the balance becomes the plan allowance', a1.ai_credits_remaining === 60, a1.ai_credits_remaining);
    check('1 it was REPLACED, not added — 55 unused credits did not carry over',
      a1.ai_credits_remaining !== 115 && r1.granted === true, { balance: a1.ai_credits_remaining, granted: r1.granted });
    check('1 the period moved with it',
      new Date(a1.current_period_end) > new Date(), { start: a1.current_period_start, end: a1.current_period_end });

    // ── 2. The same period granted twice ────────────────────────────────────
    //
    // Two crons, a replayed webhook, two instances at once: all of them land on
    // the same key, and only the first one through grants.
    console.log('\n2. Granted twice in the same period');
    await setAccount({ ai_credits_remaining: 12 });   // as if 48 had been spent
    const [again1, again2] = await Promise.all([
      grant('period:test-1', days(-1), days(29)),
      grant('period:test-1', days(-1), days(29)),
    ]);
    const a2 = await account();
    const g2 = await grants();
    console.log(`  reasons: ${again1.reason} / ${again2.reason} · balance ${a2.ai_credits_remaining} · ledger rows ${g2.length}`);
    check('2 neither of the two repeats granted anything',
      again1.granted === false && again2.granted === false, [again1, again2]);
    check('2 both say the period was already granted',
      again1.reason === 'already_granted' && again2.reason === 'already_granted', [again1.reason, again2.reason]);
    check('2 the balance was not touched', a2.ai_credits_remaining === 12, a2.ai_credits_remaining);
    check('2 one ledger row for the period, not three', g2.length === 1, g2);

    // ── 3. A free account whose month turns ─────────────────────────────────
    console.log('\n3. A Free account after its month');
    await wipe();
    await setAccount({
      subscription_plan:    'free',
      subscription_status:  null,
      ai_credits_remaining: 3,
      current_period_start: iso(days(-31)),
      current_period_end:   iso(days(-1)),
    });
    // Last month's inbox allowance, fully spent.
    await admin.from('inbox_classify_counters').upsert(
      { day: iso(days(-31)).slice(0, 10), scope: 'month', subject: userId, count: 15 },
      { onConflict: 'day,scope,subject' },
    );

    const r3 = await grant('period:test-3', days(-1), days(29));
    const a3 = await account();
    const { data: inboxClaim } = await admin.rpc('claim_inbox_classification', { p_user_id: userId, p_tier: 'free' });
    const claim3 = Array.isArray(inboxClaim) ? inboxClaim[0] : inboxClaim;
    console.log(`  credits 3 → ${a3.ai_credits_remaining} · inbox ${claim3?.month_used}/${claim3?.month_limit}`);
    check('3 a Free account gets its ten credits back', r3.granted === true && a3.ai_credits_remaining === 10, a3.ai_credits_remaining);
    check('3 the inbox month starts again: the email is classified, not refused',
      claim3?.allowed === true, claim3);
    check('3 and it counts as the first of fifteen, not the sixteenth',
      claim3?.month_used === 1 && claim3?.month_limit === 15, { used: claim3?.month_used, limit: claim3?.month_limit });

    // ── 4. A paid account whose payment failed ──────────────────────────────
    console.log('\n4. A payment that failed');
    await wipe();
    await setAccount({
      subscription_plan:    'pro',
      subscription_status:  'past_due',
      ai_credits_remaining: 4,
      current_period_start: iso(days(-31)),
      current_period_end:   iso(days(-1)),
    });

    const r4 = await grant('period:test-4', days(-1), days(29));
    const a4 = await account();
    const g4 = await grants();
    console.log(`  granted=${r4.granted} reason=${r4.reason} · credits ${a4.ai_credits_remaining} · period end ${a4.current_period_end}`);
    check('4 no credits are granted on a failed payment',
      r4.granted === false && r4.reason === 'payment_not_current', r4);
    check('4 the balance is left exactly as it was — not topped up, not reset to Free',
      a4.ai_credits_remaining === 4, a4.ai_credits_remaining);
    check('4 the period is left in the past, so a successful payment can still grant it',
      new Date(a4.current_period_end) < new Date(), a4.current_period_end);
    check('4 nothing was written to the grant ledger', g4.length === 0, g4);

    // ── 5. The quotas reset with the credits, on the same date ──────────────
    console.log('\n5. The application quota follows the same period');
    await wipe();
    await setAccount({
      subscription_plan:    'premium',
      subscription_status:  'active',
      ai_credits_remaining: 0,
      current_period_start: iso(days(-31)),
      current_period_end:   iso(days(-1)),
    });
    // Last period's applications, at the ceiling.
    await admin.from('auto_apply_counters').upsert(
      { period_start: iso(days(-31)).slice(0, 10), user_id: userId, count: 210 },
      { onConflict: 'period_start,user_id' },
    );

    await grant('period:test-5', days(-1), days(29));
    const a5 = await account();
    const { data: applyClaim } = await admin.rpc('claim_auto_apply', {
      p_user_id: userId, p_tier: 'premium', p_job_id: `renewal-test-${Date.now()}`,
    });
    const claim5 = Array.isArray(applyClaim) ? applyClaim[0] : applyClaim;
    const { data: rows5 } = await admin
      .from('auto_apply_counters').select('period_start, count').eq('user_id', userId);
    console.log(`  claim allowed=${claim5?.allowed} used=${claim5?.used}/${claim5?.quota} · counter rows ${JSON.stringify(rows5)}`);
    check('5 the new period starts the applications at one, not at last month\'s 210',
      claim5?.allowed === true && claim5?.used === 1, claim5);
    check('5 the counter is keyed on the period the credits were granted for',
      (rows5 ?? []).some((r) => r.period_start === String(a5.current_period_start).slice(0, 10)),
      { counters: rows5, period_start: a5.current_period_start });

    // ── 6. The sweep the cron runs ──────────────────────────────────────────
    //
    // renew_due_periods renews EVERY account whose period has ended — that is
    // its job. Only this account's row is asserted on.
    console.log('\n6. The nightly sweep');
    await wipe();
    await setAccount({
      subscription_plan:    'pro',
      subscription_status:  'active',
      ai_credits_remaining: 1,
      current_period_start: iso(days(-40)),
      current_period_end:   iso(days(-2)),
    });

    const { data: swept, error: sweepError } = await admin.rpc('renew_due_periods', { p_limit: 200 });
    if (sweepError) throw sweepError;
    const mine = (swept ?? []).find((r) => r.user_id === userId);
    const a6   = await account();
    console.log(`  swept ${(swept ?? []).length} account(s) · mine: ${JSON.stringify(mine)} · credits ${a6.ai_credits_remaining}`);
    check('6 the sweep renewed this account without being told which period',
      mine?.granted === true && a6.ai_credits_remaining === 60, { mine, credits: a6.ai_credits_remaining });
    check('6 and it set a period that ends in the future',
      new Date(a6.current_period_end) > new Date(), a6.current_period_end);
  } finally {
    await wipe();

    // The shared daily counters, back where the run found them.
    await admin.from('inbox_classify_counters').delete()
      .eq('day', today).eq('scope', 'alias').eq('subject', userId);
    await admin.from('inbox_classify_counters').upsert(
      { day: today, scope: 'global', subject: 'global', count: globalBefore },
      { onConflict: 'day,scope,subject' },
    );

    await admin.from('profiles').update({
      subscription_plan:    'pro',
      subscription_status:  'active',
      ai_credits_remaining: 50,
      current_period_start: null,
      current_period_end:   null,
    }).eq('id', userId);
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
  console.error('\nPERIOD RENEWAL TEST FAILED TO RUN:', err);
  process.exit(1);
});
