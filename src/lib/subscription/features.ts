// ─── Feature access configuration ─────────────────────────────────────────────
//
// One source of truth for what each subscription tier can do.
//
// credits: 0  → unlimited (no deduction from pool)
// credits: N  → N credits consumed per use from ai_credits_remaining
// limit:       → time-based cap tracked in feature_usage table
// access: false → completely blocked for this tier

export const FEATURES = {
  AI_ASSISTANT_CHAT: {
    free:    { access: true,  credits: 1 },
    pro:     { access: true,  credits: 1 },
    premium: { access: true,  credits: 0 },   // unlimited
  },
  CV_BUILDER_AI: {
    free:    { access: true,  credits: 2 },
    pro:     { access: true,  credits: 2 },
    premium: { access: true,  credits: 0 },
  },
  COVER_LETTER_AI: {
    free:    { access: true,  credits: 1 },
    pro:     { access: true,  credits: 1 },
    premium: { access: true,  credits: 0 },   // unlimited
  },
  AI_JOB_TRACKER_ADVICE: {
    free:    { access: false as const },
    pro:     { access: true,  credits: 2 },
    premium: { access: true,  credits: 0 },
  },
  MODIFY_DOCUMENT_AI: {
    free:    { access: true,  credits: 1 },
    pro:     { access: true,  credits: 1 },
    premium: { access: true,  credits: 0 },
  },
  AI_CV_AUTO_FIX: {
    free:    { access: false as const },
    pro:     { access: false as const },
    premium: { access: true,  credits: 0 },   // Premium-exclusive
  },
  ATS_SCORE: {
    free:    { access: true,  credits: 2 },
    pro:     { access: true,  credits: 2 },
    premium: { access: true,  credits: 0 },
  },
  INTERVIEW_AI: {
    free:    { access: true,  credits: 5 },
    pro:     { access: true,  credits: 5 },
    premium: { access: true,  credits: 0 },
  },
  AUTO_APPLY: {
    free:    { access: false as const },
    pro:     { access: false as const },
    premium: { access: true },                 // Premium-exclusive
  },
  APPLY_WITH_AI: {
    free:    { access: true,  credits: 1 },
    pro:     { access: true,  credits: 1 },
    premium: { access: true,  credits: 0 },
  },
} as const;

export type FeatureKey = keyof typeof FEATURES;

// Tiers stored in DB: 'trial' | 'pro' | 'premium'
// 'free' is computed: a 'trial' plan whose trial_ends_at has passed
export type Tier = 'trial' | 'free' | 'pro' | 'premium';
export type DbPlan = 'trial' | 'pro' | 'premium';

// The three keys that FEATURES actually has
export type FeatureTierKey = 'free' | 'pro' | 'premium';

// How much a feature costs per tier — convenience type for the UI
export const TIER_CREDITS_TOTAL = 10; // default starting pool

export const TIER_LABELS: Record<DbPlan | 'free', { name: string; price: string }> = {
  trial: { name: 'Trial',   price: 'Free for 7 days' },
  free:  { name: 'Free',    price: '$0'               },
  pro:   { name: 'Pro',     price: '$19.99/mo'         },
  premium: { name: 'Premium', price: '$29.99/mo'       },
};
