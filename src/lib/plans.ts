// ─── What each plan costs and gives, for the screens that show it ────────────
//
// One source. The price used to live in five places for two numbers — four
// locale files and the upgrade window — so a price change meant finding all
// five, and the day one was missed the customer saw two different amounts for
// the same plan. The locale files keep the words; the numbers come from here.
//
// WHAT THIS IS NOT: it does not enforce anything. The quotas that are actually
// applied live in admin_settings and are read by src/lib/entitlements.ts, which
// is the single source for what an account may do — changeable without a
// deploy. These figures are what the marketing pages DISPLAY, and a public page
// cannot read admin_settings (its policy is service-role only).
//
// That makes this a copy, and a copy can drift. security-tests/planPrices.test.js
// compares the two and fails if they disagree, so the drift cannot be silent.
//
// Prices: Docs/jobvero-plans-reference.md §1, frozen 2026-09-17. USD, monthly.

export type PlanId = 'free' | 'pro' | 'premium';

export interface PlanFigures {
  id:          PlanId;
  /** Monthly price in whole US dollars. Free is 0 and shows as "Free". */
  priceUsd:    number;
  /** AI credits a month. Writing and analysis. */
  credits:     number;
  /** Automatic applications a month. A separate counter — never added to the credits. */
  autoApply:   number;
  /** Emails sorted a month. null means no monthly ceiling (the 25-a-day alias cap still applies). */
  inboxMonth:  number | null;
  /** Whether the AI writes reply drafts for this plan. */
  aiDrafts:    boolean;
}

export const PLANS: Record<PlanId, PlanFigures> = {
  free: {
    id: 'free', priceUsd: 0, credits: 10, autoApply: 0, inboxMonth: 15, aiDrafts: false,
  },
  pro: {
    id: 'pro', priceUsd: 39, credits: 60, autoApply: 100, inboxMonth: null, aiDrafts: true,
  },
  premium: {
    id: 'premium', priceUsd: 69, credits: 150, autoApply: 210, inboxMonth: null, aiDrafts: true,
  },
};

/** The order the plans are shown in, cheapest first. */
export const PLAN_ORDER: readonly PlanId[] = ['free', 'pro', 'premium'];

/** The two plans that can be bought. */
export const PAID_PLAN_IDS: readonly PlanId[] = ['pro', 'premium'];

/** "$39" — or the word for free, which the caller supplies translated. */
export function formatPrice(plan: PlanFigures, freeLabel: string): string {
  return plan.priceUsd === 0 ? freeLabel : `$${plan.priceUsd}`;
}

// ─── What the same thing costs elsewhere ──────────────────────────────────────
//
// Docs/jobvero-plans-reference.md §10. Shown on the pricing page to answer the
// only question a 69 $ plan raises: compared with what?
//
// Stated as a comparison of FUNCTIONS, with published list prices and nothing
// else. No claim about anybody's quality, and no product named as a competitor
// to be disparaged — the point is what a buyer would have to assemble, and that
// none of it includes the inbox.
export interface AlternativeTool {
  /** What it is bought for, not who sells it. */
  purpose:  string;
  priceUsd: number;
}

export const PREMIUM_EQUIVALENT: readonly AlternativeTool[] = [
  { purpose: 'cv_tracking',    priceUsd: 29 },
  { purpose: 'auto_apply',     priceUsd: 99 },
  { purpose: 'interview_prep', priceUsd: 90 },
];

export const PREMIUM_EQUIVALENT_TOTAL = PREMIUM_EQUIVALENT
  .reduce((sum, tool) => sum + tool.priceUsd, 0);   // 218
