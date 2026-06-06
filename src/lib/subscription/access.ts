import type { SupabaseClient } from '@supabase/supabase-js';
import { FEATURES, type FeatureKey, type Tier, type FeatureTierKey } from './features';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccessResult =
  | { allowed: true;  creditsRequired: number }
  | { allowed: false; reason: 'trial_expired' | 'tier_locked' | 'no_credits' | 'limit_reached'; upgradeTo?: 'pro' | 'premium' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Maps effective tier → FEATURES tier key (trial uses pro's gates)
export function toFeatureTierKey(tier: Tier): FeatureTierKey {
  if (tier === 'trial') return 'pro';
  if (tier === 'free')  return 'free';
  return tier as FeatureTierKey;
}

// ─── canUseFeature ────────────────────────────────────────────────────────────

export async function canUseFeature(
  userId: string,
  feature: FeatureKey,
  supabase: SupabaseClient,
): Promise<AccessResult> {

  // 1. Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_plan, trial_ends_at, ai_credits_remaining')
    .eq('id', userId)
    .single();

  // No profile row yet → treat as active trial with full credits
  if (!profile) {
    return { allowed: true, creditsRequired: 0 };
  }

  // 2. Effective tier
  const effectiveTier  = getEffectiveTier(profile.subscription_plan, profile.trial_ends_at);
  const featureTierKey = toFeatureTierKey(effectiveTier);
  const featureConfig  = FEATURES[feature];
  const tierConfig     = featureConfig[featureTierKey];

  // 3. Access gate
  if (!tierConfig.access) {
    // Find the cheapest tier that grants access
    const proGrants     = (featureConfig.pro     as { access: boolean }).access;
    const upgradeTo: 'pro' | 'premium' = proGrants ? 'pro' : 'premium';

    return {
      allowed:   false,
      reason:    effectiveTier === 'free' ? 'trial_expired' : 'tier_locked',
      upgradeTo,
    };
  }

  // 4. Credit check (credits > 0 means it costs something)
  const creditsRequired =
    'credits' in tierConfig && typeof tierConfig.credits === 'number'
      ? tierConfig.credits
      : 0;

  if (creditsRequired > 0) {
    const remaining = profile.ai_credits_remaining ?? 0;
    if (remaining < creditsRequired) {
      return { allowed: false, reason: 'no_credits', upgradeTo: 'pro' };
    }
  }

  // 5. Time-based usage limit (e.g. cover letters: 1/week on free)
  if ('limit' in tierConfig && tierConfig.limit !== null && tierConfig.limit !== undefined) {
    const { count, period } = tierConfig.limit as { count: number; period: 'week' | 'month' };
    const sinceMs = period === 'week'
      ? 7  * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - sinceMs).toISOString();

    const { count: used } = await supabase
      .from('feature_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id',    userId)
      .eq('feature_key', feature)
      .gte('used_at',   since);

    if ((used ?? 0) >= count) {
      return {
        allowed:   false,
        reason:    'limit_reached',
        upgradeTo: featureTierKey === 'free' ? 'pro' : 'premium',
      };
    }
  }

  return { allowed: true, creditsRequired };
}

// ─── consumeFeature ───────────────────────────────────────────────────────────

export async function consumeFeature(
  userId: string,
  feature: FeatureKey,
  supabase: SupabaseClient,
  creditsRequired: number,
): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  // Deduct credits via atomic RPC (prevents race conditions)
  if (creditsRequired > 0) {
    tasks.push(
      supabase.rpc('decrement_ai_credits', {
        p_user_id: userId,
        p_amount:  creditsRequired,
      }).then(() => undefined) as Promise<unknown>,
    );
  }

  // Track usage for features with time-based limits
  const featureConfig = FEATURES[feature];
  const hasTimeLimit  = Object.values(featureConfig).some(
    (c) => 'limit' in c && c.limit !== null && c.limit !== undefined,
  );
  if (hasTimeLimit) {
    tasks.push(
      supabase
        .from('feature_usage')
        .insert({ user_id: userId, feature_key: feature })
        .then(() => undefined) as Promise<unknown>,
    );
  }

  await Promise.all(tasks);
}
