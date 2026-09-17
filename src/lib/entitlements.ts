// ─── Entitlements ─────────────────────────────────────────────────────────────
//
// One module decides what an account may do. Every AI route, every gated page
// and the browser — through GET /api/me/entitlement — read this and nothing
// else. There is no second copy: security-tests/accessSingleSource.test.js
// fails if one appears.
//
// There used to be two tables. src/lib/subscription/features.ts granted a Free
// account the assistant, the CV builder and cover letters; this file refused
// all three. The server won every argument, so the client offered what the
// server denied — and a Starter account, reading a column that table never had,
// was shown nothing at all. Both files are gone; this one remains.
//
// It answers three questions, and keeps them apart on purpose:
//
//   1. FEATURE ACCESS — may this account use this feature at all? Decided by
//      tier, in FEATURES, and nowhere else.
//
//   2. CREDITS — the balance is the ai_credits_remaining column; the allowance
//      is the tier's monthly quota, read from admin_settings.
//
//   3. AUTO-APPLY — its own monthly quota, counted separately. An application
//      spends no credit, and a credit buys no application: the two counters
//      never eat each other (reference §3).
//
// What an action costs is not here. public.ai_action_costs is the only price
// list, and reserve_ai_credits applies it in the database.
//
// Plans, quotas and prices: Docs/jobvero-plans-reference.md, frozen 2026-09-17.
// There is no time-limited trial and no Starter tier. Free is permanent.
//
// No imports and no I/O, so the rules are tested directly against this file:
//   node security-tests/entitlements.test.mjs


// ─── Types ────────────────────────────────────────────────────────────────────

export type PaidTier = 'pro' | 'premium';

/** The tier an account resolves to. Free is a plan, not an expired state. */
export type Tier = 'free' | PaidTier;

/** The profiles columns this module reads. */
export interface EntitlementProfile {
  subscription_plan:    string | null;
  subscription_status:  string | null;
  ai_credits_remaining: number | null;
  is_blocked:           boolean | null;
}

export type Resolution =
  | { blocked: true }
  | { blocked: false; tier: Tier };


// ═══ 1. Feature access ════════════════════════════════════════════════════════

const PAID_TIERS: readonly PaidTier[] = ['pro', 'premium'];

// Stripe statuses that carry paid access. 'trialing' is kept although Jobvero
// no longer runs a trial: if a Stripe-side trial is ever configured, a paying
// customer must not be locked out by a status this app did not expect. Every
// other status — past_due, unpaid, incomplete, incomplete_expired, canceled,
// paused — and a null status are not paid access.
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
 *   3. anything else               → 'free'
 *
 * No profile row resolves to free, never to unrestricted access. An account
 * still carrying the retired 'trial' or 'starter' plan is not a paid tier, so
 * it lands on free — which is now a permanent plan with its own credits, not a
 * lockout.
 */
export function resolveTier(profile: EntitlementProfile | null, _now?: Date): Resolution {
  if (!profile) return { blocked: false, tier: 'free' };

  if (profile.is_blocked === true) return { blocked: true };

  const plan   = profile.subscription_plan;
  const status = profile.subscription_status;
  if (status !== null && PAID_STATUSES.has(status) && isPaidTier(plan)) {
    return { blocked: false, tier: plan };
  }

  return { blocked: false, tier: 'free' };
}

// What each plan unlocks — Docs/jobvero-plans-reference.md §2.
//
// Free is the product's hook, not a crippled demo: it writes CVs, cover letters
// and ATS scores on its 10 monthly credits, and it gets a @getjobvero.com alias
// whose mail is sorted 15 times a month. What it does not get is the secretary
// writing the replies, the interview coach, the AI matches, or auto-apply.
//
// `satisfies` makes all three tier columns mandatory on every row, so a missing
// entry is a compile error rather than an undefined that reads as "denied" and
// hides a feature from a paying customer.
export const FEATURES = {
  AI_ASSISTANT_CHAT:  { free: true,  pro: true, premium: true },
  CV_BUILDER_AI:      { free: true,  pro: true, premium: true },
  MODIFY_DOCUMENT_AI: { free: true,  pro: true, premium: true },
  COVER_LETTER_AI:    { free: true,  pro: true, premium: true },
  ATS_SCORE:          { free: true,  pro: true, premium: true },
  APPLY_WITH_AI:      { free: true,  pro: true, premium: true },
  AI_JOB_MATCHES:     { free: false, pro: true, premium: true },
  INTERVIEW_AI:       { free: false, pro: true, premium: true },
  INBOX_AI_DRAFT:     { free: false, pro: true, premium: true },
  AUTO_APPLY:         { free: false, pro: true, premium: true },
} as const satisfies Record<string, Record<Tier, boolean>>;

export type FeatureKey = keyof typeof FEATURES;

export type FeatureDecision =
  | { allowed: true;  tier: Tier }
  | { allowed: false; reason: 'blocked' }
  | { allowed: false; reason: 'feature_locked'; tier: Tier; upgradeTo: PaidTier | null };

/**
 * Feature access only. It does not look at credits: the balance is enforced by
 * reserve_ai_credits in the database, at the price in ai_action_costs. Nor does
 * it look at the auto-apply quota: that is section 3, counted under lock.
 */
export function checkFeatureAccess(resolution: Resolution, feature: FeatureKey): FeatureDecision {
  if (resolution.blocked) return { allowed: false, reason: 'blocked' };

  const { tier } = resolution;
  if (FEATURES[feature][tier]) return { allowed: true, tier };

  return {
    allowed:   false,
    reason:    'feature_locked',
    tier,
    upgradeTo: PAID_TIERS.find((paid) => FEATURES[feature][paid]) ?? null,
  };
}

/** What every feature costs this tier in access terms, for the browser to draw. */
export function featureMap(tier: Tier): Record<FeatureKey, boolean> {
  const out = {} as Record<FeatureKey, boolean>;
  for (const key of Object.keys(FEATURES) as FeatureKey[]) out[key] = FEATURES[key][tier];
  return out;
}


// ═══ 2. Credits ═══════════════════════════════════════════════════════════════
//
// Read apart from feature access, and apart from auto-apply.

/** The admin_settings.limits keys this module reads. Values are unvalidated JSON. */
export interface CreditLimits {
  free_credits_monthly?:          unknown;
  pro_credits_monthly?:           unknown;
  premium_credits_monthly?:       unknown;
  auto_apply_monthly?:            unknown;
  auto_apply_monthly_guard?:      unknown;
  inbox_classify_free_per_month?: unknown;
}

/** The balance: the ai_credits_remaining column, never derived from the tier. */
export function creditBalance(profile: EntitlementProfile | null): number {
  const balance = profile?.ai_credits_remaining;
  return typeof balance === 'number' && Number.isFinite(balance) && balance > 0 ? Math.floor(balance) : 0;
}

/**
 * The credits a tier grants each month.
 *
 * null means "not configured": a tier with no valid quota in admin_settings. It
 * never means unlimited — a caller allocating credits must treat null as a
 * configuration error, not as a free pass.
 */
export function creditAllowance(tier: Tier, limits: CreditLimits | null | undefined): number | null {
  switch (tier) {
    case 'pro':     return readCount(limits?.pro_credits_monthly);
    case 'premium': return readCount(limits?.premium_credits_monthly);
    case 'free':    return readCount(limits?.free_credits_monthly);
  }
}


// ═══ 3. Auto-apply, counted on its own ════════════════════════════════════════
//
// An automatic application spends no AI credit. It spends one unit of its own
// monthly quota, claimed under lock in the database (claim_auto_apply), so two
// applications racing for the last unit cannot both take it.
//
// The guard is a second, higher ceiling per user: a runaway loop is stopped
// even if a plan quota is ever misconfigured. It must stay above every plan's
// quota, or it would be the guard — not the plan — that refuses first, and the
// message would name the wrong reason.

/**
 * The applications a tier may send each month, from
 * admin_settings.limits.auto_apply_monthly.
 *
 * null means "not configured", never "unlimited". Free is 0, which is a
 * configured refusal and not the same thing.
 */
export function autoApplyQuota(tier: Tier, limits: CreditLimits | null | undefined): number | null {
  const table = limits?.auto_apply_monthly;
  if (typeof table !== 'object' || table === null) return null;
  return readCount((table as Record<string, unknown>)[tier]);
}

/** The runaway guard, the same for every tier. null when it is not configured. */
export function autoApplyGuard(limits: CreditLimits | null | undefined): number | null {
  return readCount(limits?.auto_apply_monthly_guard);
}


// ═══ 4. Inbox ═════════════════════════════════════════════════════════════════

/**
 * How many emails a tier has classified each month.
 *
 * 'unlimited' is a paid plan: it has no monthly ceiling, only the 25-a-day cap
 * every alias carries. A number is a real ceiling. null is "not configured",
 * and a caller must refuse rather than assume.
 */
export function inboxMonthlyQuota(tier: Tier, limits: CreditLimits | null | undefined): number | 'unlimited' | null {
  if (tier !== 'free') return 'unlimited';
  return readCount(limits?.inbox_classify_free_per_month);
}


// ─── Reading a configured number ──────────────────────────────────────────────

// The database's own acceptance rule, `^[0-9]{1,6}$` on the JSON value as text,
// so a value the database would reject is rejected here too: no negatives, no
// fractions, no exponents, nothing above 999999.
function readCount(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value)
             : typeof value === 'string' ? value
             : null;
  return text !== null && /^[0-9]{1,6}$/.test(text) ? Number(text) : null;
}
