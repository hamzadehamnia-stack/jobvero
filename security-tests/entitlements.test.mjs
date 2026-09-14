// Regression test for src/lib/entitlements.ts.
//
// Run it:  node security-tests/entitlements.test.mjs
//
// Imports the real module instead of a mirrored copy: Node 24 strips the
// TypeScript types natively, and entitlements.ts is pure — no imports, no path
// aliases, erasable syntax only. If it ever gains an '@/…' import this test
// stops loading, which is the right way to find out.
//
// Guarded like the SQL tests: the number of checks that ran must equal
// EXPECTED_CHECKS, so a check lost in a refactor fails the run.

import { isDeepStrictEqual } from 'node:util';
import {
  FEATURES,
  TRIAL_CREDITS_FALLBACK,
  checkFeatureAccess,
  creditAllowance,
  creditBalance,
  resolveTier,
  toFeatureTierKey,
} from '../src/lib/entitlements.ts';

const EXPECTED_CHECKS = 45;

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  if (isDeepStrictEqual(actual, expected)) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`);
  }
}

const NOW    = new Date('2026-09-13T12:00:00Z');
const FUTURE = '2026-09-15T12:00:00Z';
const PAST   = '2026-09-10T12:00:00Z';

function profile(overrides = {}) {
  return {
    subscription_plan:    null,
    subscription_status:  null,
    trial_ends_at:        null,
    ai_credits_remaining: 0,
    is_blocked:           false,
    ...overrides,
  };
}

const tierOf = (p) => resolveTier(p, NOW);
const is = (tier) => ({ blocked: false, tier });


// ─── 1. resolveTier ───────────────────────────────────────────────────────────

console.log('\n1. resolveTier');

check('no profile row → free', tierOf(null), is('free'));
check('blocked beats an active premium subscription',
  tierOf(profile({ is_blocked: true, subscription_plan: 'premium', subscription_status: 'active' })),
  { blocked: true });
check('premium + active → premium',
  tierOf(profile({ subscription_plan: 'premium', subscription_status: 'active' })), is('premium'));
check('starter + active → starter (the tier that used to crash)',
  tierOf(profile({ subscription_plan: 'starter', subscription_status: 'active' })), is('starter'));
check('pro + trialing → pro',
  tierOf(profile({ subscription_plan: 'pro', subscription_status: 'trialing' })), is('pro'));
check('pro + past_due, no trial → free',
  tierOf(profile({ subscription_plan: 'pro', subscription_status: 'past_due' })), is('free'));
check('pro + past_due while the trial runs → trial, not pro',
  tierOf(profile({ subscription_plan: 'pro', subscription_status: 'past_due', trial_ends_at: FUTURE })), is('trial'));
check('pro + canceled → free (getEffectiveTier kept it pro)',
  tierOf(profile({ subscription_plan: 'pro', subscription_status: 'canceled' })), is('free'));
check('premium with a null status → free (why the owner row needed D1)',
  tierOf(profile({ subscription_plan: 'premium', subscription_status: null })), is('free'));

for (const status of ['incomplete', 'incomplete_expired', 'unpaid', 'paused']) {
  check(`pro + ${status} → free`,
    tierOf(profile({ subscription_plan: 'pro', subscription_status: status })), is('free'));
}

check('active status with plan "trial" is not paid → trial while it runs',
  tierOf(profile({ subscription_plan: 'trial', subscription_status: 'active', trial_ends_at: FUTURE })), is('trial'));
check('active status with plan "free" → free',
  tierOf(profile({ subscription_plan: 'free', subscription_status: 'active' })), is('free'));
check('active status with an unknown plan → free',
  tierOf(profile({ subscription_plan: 'enterprise', subscription_status: 'active' })), is('free'));
check('no plan, trial running → trial',
  tierOf(profile({ trial_ends_at: FUTURE })), is('trial'));
check('no plan, trial ended → free',
  tierOf(profile({ trial_ends_at: PAST })), is('free'));
check('unparseable trial_ends_at → free',
  tierOf(profile({ trial_ends_at: 'not-a-date' })), is('free'));


// ─── 2. Feature access ────────────────────────────────────────────────────────

console.log('\n2. Feature access');

const TIER_COLUMNS = ['free', 'starter', 'pro', 'premium'];

check('a trial uses Pro features', toFeatureTierKey('trial'), 'pro');
check('free and paid tiers map to themselves', TIER_COLUMNS.map(toFeatureTierKey), TIER_COLUMNS);

check('every feature has a boolean for free, starter, pro and premium, and nothing else',
  Object.values(FEATURES).every((row) =>
    Object.keys(row).length === 4 && TIER_COLUMNS.every((t) => typeof row[t] === 'boolean')),
  true);

const unlocked = (tier) => Object.keys(FEATURES).filter((f) => FEATURES[f][tier]).sort();
const STARTER_SET = ['AI_ASSISTANT_CHAT', 'APPLY_WITH_AI', 'ATS_SCORE', 'COVER_LETTER_AI', 'CV_BUILDER_AI', 'MODIFY_DOCUMENT_AI'];

check('free unlocks no AI feature', unlocked('free'), []);
check('starter: everything except the interview and auto-apply', unlocked('starter'), STARTER_SET);
check('pro adds the AI interview', unlocked('pro'), [...STARTER_SET, 'INTERVIEW_AI'].sort());
check('premium adds auto-apply', unlocked('premium'), [...STARTER_SET, 'INTERVIEW_AI', 'AUTO_APPLY'].sort());

check('starter can use the CV builder',
  checkFeatureAccess(is('starter'), 'CV_BUILDER_AI'), { allowed: true, tier: 'starter' });
check('starter: interview locked, upgrade to pro',
  checkFeatureAccess(is('starter'), 'INTERVIEW_AI'),
  { allowed: false, reason: 'feature_locked', tier: 'starter', upgradeTo: 'pro' });
check('starter: auto-apply locked, upgrade to premium',
  checkFeatureAccess(is('starter'), 'AUTO_APPLY'),
  { allowed: false, reason: 'feature_locked', tier: 'starter', upgradeTo: 'premium' });
check('trial: interview allowed',
  checkFeatureAccess(is('trial'), 'INTERVIEW_AI'), { allowed: true, tier: 'trial' });
check('trial: auto-apply locked, upgrade to premium',
  checkFeatureAccess(is('trial'), 'AUTO_APPLY'),
  { allowed: false, reason: 'feature_locked', tier: 'trial', upgradeTo: 'premium' });
check('free: chat locked, upgrade to starter',
  checkFeatureAccess(is('free'), 'AI_ASSISTANT_CHAT'),
  { allowed: false, reason: 'feature_locked', tier: 'free', upgradeTo: 'starter' });
check('blocked: refused for every feature, with no upgrade path',
  Object.keys(FEATURES).every((f) => isDeepStrictEqual(checkFeatureAccess({ blocked: true }, f), { allowed: false, reason: 'blocked' })),
  true);


// ─── 3. Credits, read apart from feature access ───────────────────────────────

console.log('\n3. Credits');

const LIMITS = {
  trial_credits:           10,
  starter_credits_monthly: 29,
  pro_credits_monthly:     57,
  premium_credits_monthly: 111,
  free_credits_monthly:    null,
};

check('the balance is the column', creditBalance(profile({ ai_credits_remaining: 7 })), 7);
check('a null or negative balance, or no profile, reads 0',
  [creditBalance(profile({ ai_credits_remaining: null })), creditBalance(profile({ ai_credits_remaining: -3 })), creditBalance(null)],
  [0, 0, 0]);

const trial = tierOf(profile({ trial_ends_at: FUTURE, ai_credits_remaining: 10 }));
check('one trial account, two readings: Pro features, trial credits',
  {
    featureColumn:    toFeatureTierKey(trial.tier),
    interviewAllowed: checkFeatureAccess(trial, 'INTERVIEW_AI').allowed,
    allowance:        creditAllowance(trial.tier, LIMITS),
  },
  { featureColumn: 'pro', interviewAllowed: true, allowance: 10 });
check('the trial allowance is not the Pro quota',
  creditAllowance('trial', LIMITS) !== creditAllowance('pro', LIMITS), true);
check('paid allowances come from admin_settings',
  ['starter', 'pro', 'premium'].map((t) => creditAllowance(t, LIMITS)), [29, 57, 111]);
check('premium is a finite number, never unlimited',
  Number.isFinite(creditAllowance('premium', LIMITS)), true);
check('a missing paid quota is null (not configured), not unlimited',
  creditAllowance('premium', {}), null);
check('free with no configured quota → 0', creditAllowance('free', LIMITS), 0);
check('a broken trial_credits falls back to 10, like the trigger',
  [undefined, null, 'abc', -3, 10.5, 1e21].map((v) => creditAllowance('trial', { trial_credits: v })),
  [10, 10, 10, 10, 10, 10]);
check('trial_credits stored as a digit string is read, like the trigger',
  creditAllowance('trial', { trial_credits: '12' }), 12);
check('the fallback matches the trigger', TRIAL_CREDITS_FALLBACK, 10);
check('the credit functions never reach the feature mapping',
  [creditAllowance, creditBalance].some((fn) => /toFeatureTierKey|FEATURES/.test(fn.toString())), false);


// ─── Report ───────────────────────────────────────────────────────────────────

const ran = passed + failed;
if (ran !== EXPECTED_CHECKS) {
  failed++;
  console.log(`  FAIL  REPORT expected ${EXPECTED_CHECKS} checks, ran ${ran}`);
}

console.log(failed ? `\n${failed} FAILED, ${passed} ok` : `\nall ${passed} checks passed`);
process.exit(failed ? 1 : 0);
