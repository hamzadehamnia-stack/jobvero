// Regression test for src/lib/entitlements.ts — the one place access is decided.
//
// Run it:  node security-tests/entitlements.test.mjs
//
// Imports the real module instead of a mirrored copy: Node 24 strips the
// TypeScript types natively, and entitlements.ts is pure — no imports, no path
// aliases, erasable syntax only. If it ever gains an '@/…' import this test
// stops loading, which is the right way to find out.
//
// The model it holds to is Docs/jobvero-plans-reference.md, frozen 2026-09-17:
// three plans, no trial, no Starter, and two counters that never touch —
// credits for writing and analysing, a separate monthly quota for automatic
// applications.
//
// Guarded like the SQL tests: the number of checks that ran must equal
// EXPECTED_CHECKS, so a check lost in a refactor fails the run.

import { isDeepStrictEqual } from 'node:util';
import {
  FEATURES,
  autoApplyGuard,
  autoApplyQuota,
  checkFeatureAccess,
  creditAllowance,
  creditBalance,
  featureMap,
  inboxMonthlyQuota,
  resolveTier,
} from '../src/lib/entitlements.ts';

const EXPECTED_CHECKS = 44;

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

function profile(overrides = {}) {
  return {
    subscription_plan:    null,
    subscription_status:  null,
    ai_credits_remaining: 0,
    is_blocked:           false,
    ...overrides,
  };
}

const tierOf = (p) => resolveTier(p);
const is = (tier) => ({ blocked: false, tier });


// ─── 1. resolveTier ───────────────────────────────────────────────────────────

console.log('\n1. resolveTier');

check('no profile row → free', tierOf(null), is('free'));
check('blocked beats an active premium subscription',
  tierOf(profile({ is_blocked: true, subscription_plan: 'premium', subscription_status: 'active' })),
  { blocked: true });
check('premium + active → premium',
  tierOf(profile({ subscription_plan: 'premium', subscription_status: 'active' })), is('premium'));
check('pro + trialing → pro (kept in case Stripe ever sends it)',
  tierOf(profile({ subscription_plan: 'pro', subscription_status: 'trialing' })), is('pro'));
check('pro + past_due → free',
  tierOf(profile({ subscription_plan: 'pro', subscription_status: 'past_due' })), is('free'));
check('pro + canceled → free',
  tierOf(profile({ subscription_plan: 'pro', subscription_status: 'canceled' })), is('free'));
check('premium with a null status → free (a plan set by hand is not a sale)',
  tierOf(profile({ subscription_plan: 'premium', subscription_status: null })), is('free'));
check('an unknown plan → free',
  tierOf(profile({ subscription_plan: 'enterprise', subscription_status: 'active' })), is('free'));
check('the retired "trial" plan → free, not a lockout',
  tierOf(profile({ subscription_plan: 'trial', subscription_status: 'active' })), is('free'));
check('the retired "starter" plan → free',
  tierOf(profile({ subscription_plan: 'starter', subscription_status: 'active' })), is('free'));
check('free + active → free',
  tierOf(profile({ subscription_plan: 'free', subscription_status: 'active' })), is('free'));

for (const status of ['incomplete', 'incomplete_expired', 'unpaid', 'paused']) {
  check(`pro + ${status} → free`,
    tierOf(profile({ subscription_plan: 'pro', subscription_status: status })), is('free'));
}


// ─── 2. Feature access ────────────────────────────────────────────────────────

console.log('\n2. Feature access');

const TIER_COLUMNS = ['free', 'pro', 'premium'];

check('every feature has a boolean for free, pro and premium, and nothing else',
  Object.values(FEATURES).every((row) =>
    Object.keys(row).length === 3 && TIER_COLUMNS.every((t) => typeof row[t] === 'boolean')),
  true);

check('no row carries a retired tier',
  Object.values(FEATURES).some((row) => 'starter' in row || 'trial' in row), false);

const unlocked = (tier) => Object.keys(FEATURES).filter((f) => FEATURES[f][tier]).sort();

// Reference §2: Free writes and analyses; it does not get the secretary that
// writes replies, the coach, the matches or auto-apply.
const FREE_SET = ['AI_ASSISTANT_CHAT', 'APPLY_WITH_AI', 'ATS_SCORE', 'COVER_LETTER_AI', 'CV_BUILDER_AI', 'MODIFY_DOCUMENT_AI'];
const PAID_SET = [...FREE_SET, 'AI_JOB_MATCHES', 'AUTO_APPLY', 'INBOX_AI_DRAFT', 'INTERVIEW_AI'].sort();

check('free unlocks the six it pays for with its ten credits', unlocked('free'), FREE_SET);
check('pro unlocks everything', unlocked('pro'), PAID_SET);
check('premium unlocks everything', unlocked('premium'), PAID_SET);

check('free may use the CV builder',
  checkFeatureAccess(is('free'), 'CV_BUILDER_AI'), { allowed: true, tier: 'free' });
check('free: the interview is locked, upgrade to pro',
  checkFeatureAccess(is('free'), 'INTERVIEW_AI'),
  { allowed: false, reason: 'feature_locked', tier: 'free', upgradeTo: 'pro' });
check('free: auto-apply is locked, upgrade to pro',
  checkFeatureAccess(is('free'), 'AUTO_APPLY'),
  { allowed: false, reason: 'feature_locked', tier: 'free', upgradeTo: 'pro' });
check('free: AI matches are locked, upgrade to pro',
  checkFeatureAccess(is('free'), 'AI_JOB_MATCHES'),
  { allowed: false, reason: 'feature_locked', tier: 'free', upgradeTo: 'pro' });
check('free: the written reply is locked — it sorts the mail, it does not answer it',
  checkFeatureAccess(is('free'), 'INBOX_AI_DRAFT'),
  { allowed: false, reason: 'feature_locked', tier: 'free', upgradeTo: 'pro' });
check('blocked: refused for every feature, with no upgrade path',
  Object.keys(FEATURES).every((f) => isDeepStrictEqual(checkFeatureAccess({ blocked: true }, f), { allowed: false, reason: 'blocked' })),
  true);

check('featureMap says exactly what the table says',
  featureMap('free'),
  Object.fromEntries(Object.keys(FEATURES).map((f) => [f, FEATURES[f].free])));


// ─── 3. Credits ───────────────────────────────────────────────────────────────

console.log('\n3. Credits');

const LIMITS = {
  free_credits_monthly:          10,
  pro_credits_monthly:           60,
  premium_credits_monthly:       150,
  auto_apply_monthly:            { free: 0, pro: 100, premium: 210 },
  auto_apply_monthly_guard:      250,
  inbox_classify_free_per_month: 15,
};

check('the balance is the column', creditBalance(profile({ ai_credits_remaining: 7 })), 7);
check('a null or negative balance, or no profile, reads 0',
  [creditBalance(profile({ ai_credits_remaining: null })), creditBalance(profile({ ai_credits_remaining: -3 })), creditBalance(null)],
  [0, 0, 0]);
check('the monthly allowances are 10 / 60 / 150',
  TIER_COLUMNS.map((t) => creditAllowance(t, LIMITS)), [10, 60, 150]);
check('premium is a finite number, never unlimited',
  Number.isFinite(creditAllowance('premium', LIMITS)), true);
check('a missing quota is null (not configured), not unlimited',
  TIER_COLUMNS.map((t) => creditAllowance(t, {})), [null, null, null]);
check('a broken value is null, never a guess',
  ['abc', -3, 10.5, 1e21, null, undefined].map((v) => creditAllowance('pro', { pro_credits_monthly: v })),
  [null, null, null, null, null, null]);
check('the credit functions never reach the feature table',
  [creditAllowance, creditBalance].some((fn) => /FEATURES/.test(fn.toString())), false);


// ─── 4. Auto-apply, counted on its own ────────────────────────────────────────

console.log('\n4. Auto-apply');

check('the monthly quotas are 0 / 100 / 210',
  TIER_COLUMNS.map((t) => autoApplyQuota(t, LIMITS)), [0, 100, 210]);
check('free is a configured zero, which is not the same as unconfigured',
  [autoApplyQuota('free', LIMITS), autoApplyQuota('free', {})], [0, null]);
check('a missing table is null, never unlimited',
  TIER_COLUMNS.map((t) => autoApplyQuota(t, { auto_apply_monthly: null })), [null, null, null]);
check('a broken quota is null',
  autoApplyQuota('pro', { auto_apply_monthly: { pro: 'lots' } }), null);
check('the guard is 250', autoApplyGuard(LIMITS), 250);
check('the guard sits above every plan quota, so the plan always speaks first',
  TIER_COLUMNS.every((t) => autoApplyQuota(t, LIMITS) < autoApplyGuard(LIMITS)), true);
check('the auto-apply quota is not the credit allowance',
  autoApplyQuota('premium', LIMITS) !== creditAllowance('premium', LIMITS), true);


// ─── 5. Inbox ─────────────────────────────────────────────────────────────────

console.log('\n5. Inbox');

check('free has 15 classified emails a month', inboxMonthlyQuota('free', LIMITS), 15);
check('paid plans have no monthly ceiling, only the daily alias cap',
  [inboxMonthlyQuota('pro', LIMITS), inboxMonthlyQuota('premium', LIMITS)], ['unlimited', 'unlimited']);
check('an unconfigured free quota is null, so the caller refuses rather than assumes',
  inboxMonthlyQuota('free', {}), null);


// ─── Report ───────────────────────────────────────────────────────────────────

const ran = passed + failed;
if (ran !== EXPECTED_CHECKS) {
  failed++;
  console.log(`  FAIL  REPORT expected ${EXPECTED_CHECKS} checks, ran ${ran}`);
}

console.log(failed ? `\n${failed} FAILED, ${passed} ok` : `\nall ${passed} checks passed`);
process.exit(failed ? 1 : 0);
