// Changing plan, and the month a card expires.
//
// Run it (no dev server, no OpenRouter spend):
//   node security-tests/planChanges.test.js
//
// The rules under test, agreed 2026-09-17:
//
//   · REPLACEMENT, NEVER ADDITION — an upgrade sets the balance to the new
//     plan's allowance. Adding the difference would punish the customer who
//     had already spent theirs.
//   · UP IMMEDIATELY, DOWN AT THE TERM — nothing paid for is ever taken back
//     before the period it paid for ends.
//   · ONE GRANT PER PLAN PER PERIOD — Free → Pro → Premium in one month is two
//     grants, a real customer climbing. Premium → Pro → Premium is one, and the
//     round trip earns nothing.
//   · While Stripe retries a failed payment the customer keeps everything and
//     receives nothing new. Only when Stripe gives up do they fall to Free.
//
// EVERY ACCOUNT HERE IS DISPOSABLE. A previous suite ran the renewal sweep over
// the whole database and granted credits to the owner's real accounts. Each
// test creates its own auth user, and the last check photographs every account
// that existed before the run and proves not one field of theirs moved.
//
// Guarded: the number of checks that ran must equal EXPECTED_CHECKS.

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const ROOT            = path.resolve(__dirname, '..');
const EXPECTED_CHECKS = 25;

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
const one  = (data) => (Array.isArray(data) ? data[0] : data);

async function main() {
  const env   = loadEnv(path.join(ROOT, '.env.local'));
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('\nPlan changes — every account created and destroyed by this run');

  // ── What the database looked like before anything was created ─────────────
  const BILLING_COLUMNS =
    'id, subscription_plan, subscription_status, ai_credits_remaining, ' +
    'current_period_start, current_period_end, scheduled_plan, cancel_at_period_end';

  const { data: before, error: beforeError } = await admin
    .from('profiles').select(BILLING_COLUMNS).order('id');
  if (beforeError) throw beforeError;
  const untouched = JSON.stringify(before);

  const today = new Date().toISOString().slice(0, 10);
  const { data: globalRow } = await admin
    .from('inbox_classify_counters').select('count')
    .eq('day', today).eq('scope', 'global').eq('subject', 'global').maybeSingle();
  const globalBefore = globalRow?.count ?? 0;

  const disposables = [];

  // ── Helpers ───────────────────────────────────────────────────────────────

  const make = async (plan, fields = {}) => {
    const email = `e9b-${crypto.randomUUID()}@invalid.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password:      crypto.randomBytes(24).toString('base64url'),
    });
    if (error) throw error;
    const id = data.user.id;
    disposables.push(id);

    const { error: insertError } = await admin
      .from('profiles').insert({ id, full_name: 'e9b disposable', is_test_account: true });
    if (insertError) throw insertError;

    const { error: updateError } = await admin.from('profiles').update({
      subscription_plan:    plan,
      subscription_status:  plan === 'free' ? null : 'active',
      current_period_start: iso(days(-10)),
      current_period_end:   iso(days(20)),
      ...fields,
    }).eq('id', id);
    if (updateError) throw updateError;

    return id;
  };

  const account = async (id) => {
    const { data } = await admin.from('profiles').select(BILLING_COLUMNS).eq('id', id).single();
    return data;
  };

  const grantsOf = async (id) => {
    const { data } = await admin
      .from('credit_grants').select('grant_key, plan, credits').eq('user_id', id).order('grant_key');
    return data ?? [];
  };

  const changePlan = (id, plan) =>
    admin.rpc('apply_plan_change', { p_user_id: id, p_new_plan: plan })
      .then(({ data, error }) => { if (error) throw error; return one(data); });

  const sweep = (id) =>
    admin.rpc('renew_due_periods', { p_limit: 50, p_user_ids: [id] })
      .then(({ data, error }) => { if (error) throw error; return one(data); });

  const expire = (id) =>
    admin.from('profiles')
      .update({ current_period_start: iso(days(-40)), current_period_end: iso(days(-1)) })
      .eq('id', id);

  const applyQuota = (id, tier) =>
    admin.rpc('claim_auto_apply', { p_user_id: id, p_tier: tier, p_job_id: `plan-test-${crypto.randomUUID()}` })
      .then(({ data, error }) => { if (error) throw error; return one(data); });

  try {
    // ── 1. Free → Pro in the middle of a month ──────────────────────────────
    console.log('\n1. Free → Pro');
    const u1 = await make('free', { ai_credits_remaining: 4 });
    const r1 = await changePlan(u1, 'pro');
    const a1 = await account(u1);
    const q1 = await applyQuota(u1, 'pro');
    console.log(`  ${r1.outcome}/${r1.reason} · credits 4 → ${a1.ai_credits_remaining} · quota ${q1.used}/${q1.quota}`);
    check('1 the balance becomes Pro\'s sixty', a1.ai_credits_remaining === 60, a1.ai_credits_remaining);
    check('1 the period restarts on the day they start paying',
      String(a1.current_period_start).slice(0, 10) === today, a1.current_period_start);
    check('1 the application quota opens at once, at a hundred', q1.allowed === true && q1.quota === 100, q1);

    // ── 2. Pro → Premium with twenty credits left ───────────────────────────
    console.log('\n2. Pro → Premium');
    const u2 = await make('pro', { ai_credits_remaining: 20 });
    const before2 = await account(u2);
    const r2 = await changePlan(u2, 'premium');
    const a2 = await account(u2);
    console.log(`  ${r2.outcome} · credits 20 → ${a2.ai_credits_remaining}`);
    check('2 the balance is REPLACED by 150, not topped up to 110',
      a2.ai_credits_remaining === 150, a2.ai_credits_remaining);
    check('2 the period is kept: the month already paid for does not restart',
      a2.current_period_end === before2.current_period_end,
      { before: before2.current_period_end, after: a2.current_period_end });

    // ── 3. Premium → Pro → Premium inside one period ────────────────────────
    console.log('\n3. Premium → Pro → Premium');
    const u3 = await make('premium', { ai_credits_remaining: 150 });
    const down3 = await changePlan(u3, 'pro');
    const mid3  = await account(u3);
    const up3   = await changePlan(u3, 'premium');
    const a3    = await account(u3);
    const g3    = await grantsOf(u3);
    console.log(`  down: ${down3.outcome}/${down3.reason} · back: ${up3.outcome}/${up3.reason} · grants ${g3.length}`);
    check('3 the downgrade is written down, not applied',
      down3.outcome === 'scheduled' && mid3.subscription_plan === 'premium' && mid3.scheduled_plan === 'pro', mid3);
    check('3 nothing was taken from the balance they paid for', mid3.ai_credits_remaining === 150, mid3.ai_credits_remaining);
    check('3 coming back cancels the schedule', a3.scheduled_plan === null && a3.subscription_plan === 'premium', a3);
    check('3 the round trip granted nothing: no change grant at all', g3.length === 0, g3);

    // ── 4. Free → Pro → Premium inside one period ───────────────────────────
    console.log('\n4. Free → Pro → Premium');
    const u4 = await make('free', { ai_credits_remaining: 10 });
    await changePlan(u4, 'pro');
    await changePlan(u4, 'premium');
    const a4 = await account(u4);
    const g4 = await grantsOf(u4);
    console.log(`  credits ${a4.ai_credits_remaining} · grants ${JSON.stringify(g4.map((g) => g.grant_key))}`);
    check('4 a real customer climbing is granted twice, on two keys',
      g4.length === 2 && g4.some((g) => g.grant_key.endsWith(':pro')) && g4.some((g) => g.grant_key.endsWith(':premium')), g4);
    check('4 and lands on Premium\'s allowance', a4.ai_credits_remaining === 150, a4.ai_credits_remaining);

    // ── 5. Premium → Pro: kept until the term, then Pro ─────────────────────
    console.log('\n5. Premium → Pro, at the term');
    const u5 = await make('premium', { ai_credits_remaining: 150 });
    await changePlan(u5, 'pro');
    const mid5 = await account(u5);
    await expire(u5);
    await sweep(u5);
    const a5 = await account(u5);
    console.log(`  before term: ${mid5.subscription_plan}/${mid5.ai_credits_remaining} · after: ${a5.subscription_plan}/${a5.ai_credits_remaining}`);
    check('5 until the term they keep Premium and its 150',
      mid5.subscription_plan === 'premium' && mid5.ai_credits_remaining === 150, mid5);
    check('5 at the term the plan becomes Pro', a5.subscription_plan === 'pro' && a5.scheduled_plan === null, a5);
    check('5 and the allowance with it', a5.ai_credits_remaining === 60, a5.ai_credits_remaining);

    // ── 6. Cancelling ───────────────────────────────────────────────────────
    console.log('\n6. Cancelling');
    const u6 = await make('pro', { ai_credits_remaining: 45 });
    const c6 = await changePlan(u6, 'free');
    const mid6 = await account(u6);
    await expire(u6);
    await sweep(u6);
    const a6 = await account(u6);
    const q6 = await applyQuota(u6, 'free');
    const { data: inbox6 } = await admin.rpc('claim_inbox_classification', { p_user_id: u6, p_tier: 'free' });
    const i6 = one(inbox6);
    console.log(`  ${c6.outcome} · before term ${mid6.subscription_plan}/${mid6.ai_credits_remaining} · after ${a6.subscription_plan}/${a6.ai_credits_remaining}`);
    check('6 the cancellation is scheduled and flagged, nothing taken back',
      c6.outcome === 'scheduled' && mid6.cancel_at_period_end === true
        && mid6.subscription_plan === 'pro' && mid6.ai_credits_remaining === 45, mid6);
    check('6 at the term they are Free, with Free\'s ten credits',
      a6.subscription_plan === 'free' && a6.ai_credits_remaining === 10, a6);
    check('6 the application quota is closed', q6.allowed === false && q6.quota === 0, q6);
    check('6 and the inbox is back to fifteen a month', i6?.month_limit === 15, i6);

    // ── 7. A payment Stripe is still retrying ───────────────────────────────
    console.log('\n7. past_due');
    const u7 = await make('pro', { ai_credits_remaining: 17, subscription_status: 'past_due' });
    await expire(u7);
    const s7 = await sweep(u7);
    const a7 = await account(u7);
    console.log(`  granted=${s7.granted} reason=${s7.reason} · plan ${a7.subscription_plan} · credits ${a7.ai_credits_remaining}`);
    check('7 no new credits while Stripe retries',
      s7.granted === false && s7.reason === 'payment_retrying', s7);
    check('7 the balance is untouched: they finish the month with what they have',
      a7.ai_credits_remaining === 17, a7.ai_credits_remaining);
    check('7 and they keep their plan — access is not cut the day a card expires',
      a7.subscription_plan === 'pro' && a7.subscription_status === 'past_due', a7);

    // ── 8. Stripe gives up ──────────────────────────────────────────────────
    console.log('\n8. Stripe gives up');
    const u8 = await make('premium', { ai_credits_remaining: 120, subscription_status: 'canceled' });
    await expire(u8);
    const s8 = await sweep(u8);
    const a8 = await account(u8);
    console.log(`  granted=${s8.granted} reason=${s8.reason} · plan ${a8.subscription_plan} · credits ${a8.ai_credits_remaining}`);
    check('8 the account falls to Free', s8.reason === 'downgraded_to_free' && a8.subscription_plan === 'free', { s8, a8 });
    check('8 with Free\'s allowance, not Premium\'s leftovers', a8.ai_credits_remaining === 10, a8.ai_credits_remaining);
    check('8 and no paid status left behind', a8.subscription_status === null, a8.subscription_status);
  } finally {
    for (const id of disposables) {
      await admin.from('profiles').delete().eq('id', id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.log(`cleanup: user ${id} not deleted: ${error.message}`);
    }

    await admin.from('inbox_classify_counters').upsert(
      { day: today, scope: 'global', subject: 'global', count: globalBefore },
      { onConflict: 'day,scope,subject' },
    );
  }

  // ── 9. Not one real account was touched ───────────────────────────────────
  console.log('\n9. The accounts that were already there');
  const { data: after, error: afterError } = await admin
    .from('profiles').select(BILLING_COLUMNS).order('id');
  if (afterError) throw afterError;
  check('9 every pre-existing account is byte-for-byte as it was',
    JSON.stringify(after) === untouched,
    { before: JSON.parse(untouched).length, after: (after ?? []).length });

  const ran = passed + failed;
  if (ran !== EXPECTED_CHECKS) {
    failed++;
    console.log(`  FAIL  REPORT expected ${EXPECTED_CHECKS} checks, ran ${ran}`);
  }
  console.log(failed ? `\n${failed} FAILED, ${passed} ok` : `\nall ${passed} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('\nPLAN CHANGE TEST FAILED TO RUN:', err);
  process.exit(1);
});
