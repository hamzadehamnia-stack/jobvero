import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { FEATURES, type FeatureKey, type Tier, type FeatureTierKey } from './features';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccessResult =
  | { allowed: true;  creditsRequired: number }
  | { allowed: false; reason: 'blocked' | 'trial_expired' | 'tier_locked' | 'no_credits' | 'limit_reached'; upgradeTo?: 'pro' | 'premium' };

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
    .select('subscription_plan, trial_ends_at, ai_credits_remaining, is_blocked')
    .eq('id', userId)
    .single();

  // No profile row → evaluate as the free tier, not as unrestricted access.
  //
  // This used to `return { allowed: true, creditsRequired: 0 }`, i.e. every
  // feature unlocked and no credits deducted, for anyone whose profile row was
  // missing or simply unreadable. That is fail-open on the paywall: the row is
  // read through the caller's RLS-scoped client, so anything that makes it come
  // back empty -- a row deleted, a provisioning step that never ran, an RLS
  // change -- silently granted Premium-exclusive features for free and forever.
  //
  // Falling through with null fields resolves to tier 'free' via
  // getEffectiveTier(null, null), which is the correct reading of an account we
  // have no subscription record for. Free-tier features keep working, so a
  // not-yet-provisioned user is not locked out.
  const effectiveProfile = profile ?? {
    subscription_plan:    null,
    trial_ends_at:        null,
    ai_credits_remaining: 0,
    is_blocked:           false,
  };

  // 2. Blocked accounts. Until now this flag was only enforced in middleware.ts,
  // whose matcher excludes /api — so a banned user kept full API access and the
  // ban was cosmetic. Checked here, before any tier or credit logic, so no
  // feature path can skip it.
  if (effectiveProfile.is_blocked === true) {
    return { allowed: false, reason: 'blocked' };
  }

  // 3. Effective tier
  const effectiveTier  = getEffectiveTier(effectiveProfile.subscription_plan, effectiveProfile.trial_ends_at);
  const featureTierKey = toFeatureTierKey(effectiveTier);
  const featureConfig  = FEATURES[feature];
  const tierConfig     = featureConfig[featureTierKey];

  // 4. Access gate
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

  // 5. Credit check (credits > 0 means it costs something)
  const creditsRequired =
    'credits' in tierConfig && typeof tierConfig.credits === 'number'
      ? tierConfig.credits
      : 0;

  if (creditsRequired > 0) {
    const remaining = effectiveProfile.ai_credits_remaining ?? 0;
    if (remaining < creditsRequired) {
      return { allowed: false, reason: 'no_credits', upgradeTo: 'pro' };
    }
  }

  // 6. Time-based usage limit (e.g. cover letters: 1/week on free)
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

/**
 * Charge the user for one use of a feature and record it.
 *
 * Returns false when the charge did not happen — insufficient balance, a
 * missing profile, or the RPC failing. The caller must not run the handler on
 * false; a paywall that proceeds when it could not collect is not a paywall.
 *
 * Three things changed here after the audit found this path was inert:
 *
 * 1. It uses the service-role client, not the caller's. decrement_ai_credits
 *    grants EXECUTE to service_role alone, precisely so the browser cannot
 *    reach it — an RLS-scoped client is refused.
 * 2. It is called for every use, including credits: 0 on premium tiers. The
 *    old code only fired when creditsRequired > 0, and gated the feature_usage
 *    write on a `limit` key that no entry in FEATURES actually has, so the
 *    audit trail was never written at all.
 * 3. Failures are returned instead of discarded. The original
 *    `.then(() => undefined)` swallowed the PGRST202 raised by the missing
 *    function every single time, which is why nobody noticed for months.
 */
export async function consumeFeature(
  userId: string,
  feature: FeatureKey,
  creditsRequired: number,
): Promise<boolean> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc('decrement_ai_credits', {
      p_user_id: userId,
      p_feature: feature,
      p_amount:  creditsRequired,
    });

    if (error) {
      console.error(`[consumeFeature] ${feature}: RPC failed —`, error.message);
      return false;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.consumed !== 'boolean') {
      console.error(`[consumeFeature] ${feature}: unexpected payload`, data);
      return false;
    }

    if (!row.consumed) {
      // canUseFeature already checked the balance, so reaching here means it
      // moved in between — two concurrent requests for the last credit, or an
      // admin adjustment. The row lock inside the function decides the winner.
      console.warn(`[consumeFeature] ${feature}: refused, remaining=${row.remaining}`);
    }

    return row.consumed;
  } catch (err) {
    console.error(`[consumeFeature] ${feature}: unavailable —`, err);
    return false;
  }
}
