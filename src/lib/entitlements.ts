// ─── Entitlements ─────────────────────────────────────────────────────────────
//
// One module decides what an account may do. Every AI route and every gated
// page goes through it; nothing else reads subscription_plan to grant access.
//
// It answers two questions, and keeps them apart on purpose:
//
//   1. FEATURE ACCESS — may this account use this feature at all? Decided by
//      tier. A trial account gets Pro's features, through toFeatureTierKey.
//
//   2. CREDITS — how many does the account hold, and how many does its tier
//      grant? The balance is the ai_credits_remaining column and nothing else.
//      The allowance is read per tier from admin_settings, and a trial's
//      allowance is trial_credits — never Pro's quota. Nothing in section 2
//      goes through toFeatureTierKey or FEATURES, and the test checks it.
//
// What an action costs is not here. public.ai_action_costs is the only price
// list, and reserve_ai_credits applies it in the database.
//
// No imports and no I/O, so the rules are tested directly against this file:
//   node security-tests/entitlements.test.mjs


// ─── Types ────────────────────────────────────────────────────────────────────

export type PaidTier = 'starter' | 'pro' | 'premium';

/** The tier an account resolves to. */
export type Tier = 'free' | 'trial' | PaidTier;

/** The columns of FEATURES. There is no 'trial' column: a trial reads Pro's. */
export type FeatureTierKey = 'free' | PaidTier;

/** The profiles columns this module reads. */
export interface EntitlementProfile {
  subscription_plan:    string | null;
  subscription_status:  string | null;
  trial_ends_at:        string | null;
  ai_credits_remaining: number | null;
  is_blocked:           boolean | null;
}

export type Resolution =
  | { blocked: true }
  | { blocked: false; tier: Tier };


// ═══ 1. Feature access ════════════════════════════════════════════════════════

const PAID_TIERS: readonly PaidTier[] = ['starter', 'pro', 'premium'];

// Stripe statuses that carry paid access. 'trialing' counts although the app
// runs its own trial outside Stripe, so a trial started on the Stripe side can
// never lock out a customer who has subscribed. Every other status — past_due,
// unpaid, incomplete, incomplete_expired, canceled, paused — and a null status
// are not paid access.
const PAID_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing']);

function isPaidTier(plan: string | null): plan is PaidTier {
  return plan !== null && (PAID_TIERS as readonly string[]).includes(plan);
}

/**
 * Resolves the tier that governs feature access, in this order:
 *
 *   1. is_blocked                  → blocked, whatever the plan
 *   2. paid status AND paid plan   → that plan. Both are required: a paid plan
 *                                    with a null status is what a plan set by
 *                                    hand looks like, and past_due is not paid
 *   3. trial still running         → 'trial'
 *   4. anything else               → 'free'
 *
 * No profile row resolves to free, never to unrestricted access.
 */
export function resolveTier(profile: EntitlementProfile | null, now: Date = new Date()): Resolution {
  if (!profile) return { blocked: false, tier: 'free' };

  if (profile.is_blocked === true) return { blocked: true };

  const plan   = profile.subscription_plan;
  const status = profile.subscription_status;
  if (status !== null && PAID_STATUSES.has(status) && isPaidTier(plan)) {
    return { blocked: false, tier: plan };
  }

  // An unparseable date is NaN, and NaN > now is false: no trial.
  if (profile.trial_ends_at !== null && new Date(profile.trial_ends_at).getTime() > now.getTime()) {
    return { blocked: false, tier: 'trial' };
  }

  return { blocked: false, tier: 'free' };
}

/** A trial account uses Pro's features. Its credits are another matter: section 2. */
export function toFeatureTierKey(tier: Tier): FeatureTierKey {
  return tier === 'trial' ? 'pro' : tier;
}

// Decision D2: Starter unlocks every AI feature except the interview and
// auto-apply; Pro adds the interview; Premium adds auto-apply. Free unlocks
// none: an account whose trial has ended keeps what is left of its credits but
// cannot spend them until it subscribes.
//
// No costs here, and no "credits: 0 = unlimited": prices live in
// ai_action_costs, and every tier's credits are finite.
//
// `satisfies` makes all four tier columns mandatory on every row, so a missing
// entry is a compile error — not FEATURES[feature]['starter'] === undefined and
// a 500, which is how the previous table failed on a Starter account.
//
// Routes by feature (wired in steps 2d and 2e):
//   AI_ASSISTANT_CHAT   chat
//   CV_BUILDER_AI       generate-cv, describe-cv, translate-cv, parse-cv
//   MODIFY_DOCUMENT_AI  modify-document, modify-cv-data, rewrite-bullet
//   COVER_LETTER_AI     generate-cover-letter, letter-templates/[id]/adapt
//   ATS_SCORE           ats-score, cv-match-score
//   APPLY_WITH_AI       jobs/apply
//   INTERVIEW_AI        interview-coach, speech-to-text, text-to-speech
//   AUTO_APPLY          auto-apply/run and the auto-apply cron
export const FEATURES = {
  AI_ASSISTANT_CHAT:  { free: false, starter: true,  pro: true,  premium: true },
  CV_BUILDER_AI:      { free: false, starter: true,  pro: true,  premium: true },
  MODIFY_DOCUMENT_AI: { free: false, starter: true,  pro: true,  premium: true },
  COVER_LETTER_AI:    { free: false, starter: true,  pro: true,  premium: true },
  ATS_SCORE:          { free: false, starter: true,  pro: true,  premium: true },
  APPLY_WITH_AI:      { free: false, starter: true,  pro: true,  premium: true },
  INTERVIEW_AI:       { free: false, starter: false, pro: true,  premium: true },
  AUTO_APPLY:         { free: false, starter: false, pro: false, premium: true },
} as const satisfies Record<string, Record<FeatureTierKey, boolean>>;

export type FeatureKey = keyof typeof FEATURES;

export type FeatureDecision =
  | { allowed: true;  tier: Tier }
  | { allowed: false; reason: 'blocked' }
  | { allowed: false; reason: 'feature_locked'; tier: Tier; upgradeTo: PaidTier | null };

/**
 * Feature access only. It does not look at credits: the balance is enforced by
 * reserve_ai_credits in the database, at the price in ai_action_costs.
 */
export function checkFeatureAccess(resolution: Resolution, feature: FeatureKey): FeatureDecision {
  if (resolution.blocked) return { allowed: false, reason: 'blocked' };

  const { tier } = resolution;
  if (FEATURES[feature][toFeatureTierKey(tier)]) return { allowed: true, tier };

  return {
    allowed:   false,
    reason:    'feature_locked',
    tier,
    upgradeTo: PAID_TIERS.find((paid) => FEATURES[feature][paid]) ?? null,
  };
}


// ═══ 2. Credits ═══════════════════════════════════════════════════════════════
//
// Read apart from feature access. Nothing below calls toFeatureTierKey or reads
// FEATURES: a trial account has Pro's features and the trial's credits.

/** The admin_settings.limits keys this section reads. Values are unvalidated JSON. */
export interface CreditLimits {
  trial_credits?:           unknown;
  free_credits_monthly?:    unknown;
  starter_credits_monthly?: unknown;
  pro_credits_monthly?:     unknown;
  premium_credits_monthly?: unknown;
}

// The floor the profiles_apply_trial_grant trigger uses when trial_credits is
// missing or invalid. Kept identical, so the allowance shown to a trial account
// is the number the database actually granted.
export const TRIAL_CREDITS_FALLBACK = 10;

/** The balance: the ai_credits_remaining column, never derived from the tier. */
export function creditBalance(profile: EntitlementProfile | null): number {
  const balance = profile?.ai_credits_remaining;
  return typeof balance === 'number' && Number.isFinite(balance) && balance > 0 ? Math.floor(balance) : 0;
}

/**
 * The credits a tier grants: the trial grant, or a paid tier's monthly quota.
 *
 * null means "not configured": a paid tier with no valid quota in
 * admin_settings. It never means unlimited — a caller allocating credits must
 * treat null as a configuration error, not as a free pass.
 */
export function creditAllowance(tier: Tier, limits: CreditLimits | null | undefined): number | null {
  switch (tier) {
    case 'trial':   return readCount(limits?.trial_credits) ?? TRIAL_CREDITS_FALLBACK;
    case 'starter': return readCount(limits?.starter_credits_monthly);
    case 'pro':     return readCount(limits?.pro_credits_monthly);
    case 'premium': return readCount(limits?.premium_credits_monthly);
    case 'free':    return readCount(limits?.free_credits_monthly) ?? 0;
  }
}

// The trigger's acceptance rule, `^[0-9]{1,6}$` on the JSON value as text, so a
// value the database would reject is rejected here too: no negatives, no
// fractions, no exponents, nothing above 999999.
function readCount(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value)
             : typeof value === 'string' ? value
             : null;
  return text !== null && /^[0-9]{1,6}$/.test(text) ? Number(text) : null;
}
