import type { Tier, FeatureTierKey } from './features';

// ─── Tier helpers (read-only) ─────────────────────────────────────────────────
//
// What is left of the old subscription module: two pure functions that read a
// plan and a trial date and say which tier applies. Nothing here charges
// anything.
//
// The charging that used to live in this file — canUseFeature, consumeFeature,
// and the withFeatureCheck wrapper above them — is gone. It debited
// profiles.ai_credits_remaining through decrement_ai_credits and wrote a row in
// feature_usage, and nothing in ai_usage: those credits left the customer's
// balance and never reached ai_margin_weekly. A ledger with two doors, one of
// which records nothing, is not a ledger. Every charge now goes through
// reserve_ai_credits and its ledger row, and security-tests/creditGateway.test.js
// fails if a second door ever appears.
//
// Feature access for the server lives in src/lib/entitlements.ts, which reads
// subscription_status as well as the plan. These two helpers remain for the
// screens that only need the tier label.

export function getEffectiveTier(plan: string | null, trialEndsAt: string | null): Tier {
  const normalised = plan ?? 'trial';

  if (normalised === 'trial') {
    if (!trialEndsAt || new Date(trialEndsAt) < new Date()) {
      return 'free';   // trial has expired → downgrade to free
    }
    return 'trial';    // active trial → same feature set as pro
  }

  return normalised as Tier;
}

/** Maps effective tier → FEATURES tier key (trial uses pro's gates). */
export function toFeatureTierKey(tier: Tier): FeatureTierKey {
  if (tier === 'trial') return 'pro';
  if (tier === 'free')  return 'free';
  return tier as FeatureTierKey;
}
