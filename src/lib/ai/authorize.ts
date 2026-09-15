import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRateLimit, rateLimitKey, tooManyRequests } from '@/lib/rateLimit';
import type { RouteRateLimit } from '@/lib/rateLimitConfig';
import { FEATURES, checkFeatureAccess, resolveTier, type FeatureKey, type PaidTier, type Tier } from '@/lib/entitlements';
import { ACTION_UNAVAILABLE, UNAVAILABLE, answer } from './refusal';
import { readSwitchOverride, refusalForFeature, switchRefusal, withSwitchesOff, type AdminSwitches } from './rules';
import { loadAdminSwitches } from './switches';

// ─── authorizeAiRequest ───────────────────────────────────────────────────────
//
// What every AI request goes through before anything can be charged. Shared by
// withAiAction (one charge per request) and the session routes (chat,
// interview), so a check added here reaches all of them:
//   1. auth                    401
//   2. admin switches          503 ai_disabled / feature_disabled
//   3. entitlements            403 blocked / trial_expired / tier_locked
//   4. per-user rate limit     429 (brief §10.9)
//   5. catalogue row           503 when missing or disabled
// Returns the resolved request, or the Response that refuses it.

const PROFILE_COLUMNS = 'subscription_plan, subscription_status, trial_ends_at, ai_credits_remaining, is_blocked';
const PAID_TIERS      = ['starter', 'pro', 'premium'] as const;

/** An action's row in ai_action_costs: the model and ceilings a route is held to. */
export interface CatalogueEntry {
  model:         string;
  maxTokens:     number;
  maxInputChars: number;
  limits:        Record<string, unknown>;
}

export interface AuthorizedAiRequest {
  user:                   User;
  supabase:               SupabaseClient;
  admin:                  SupabaseClient;
  tier:                   Tier;
  /** The plan to offer when a trial runs out of credits. */
  cheapestTierForFeature: PaidTier | null;
  catalogue:              CatalogueEntry;
}

export async function authorizeAiRequest(
  req: Request,
  options: { feature: FeatureKey; action: string; rateLimit: RouteRateLimit; tag: string },
): Promise<AuthorizedAiRequest | Response> {
  const { feature, action, rateLimit, tag } = options;
  const supabase = await createClient();

  // ── 1. Auth ─────────────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return answer({ status: 401, body: { error: 'Unauthorized', reason: 'unauthorized' } });

  const admin = createAdminClient();

  // ── 2. Admin switches: ai_enabled, then the feature's own toggle ───────────
  // A switch that cannot be read is not assumed on. Outside production a test
  // can force switches off (see readSwitchOverride).
  let switches: AdminSwitches | null;
  try {
    switches = await loadAdminSwitches(admin);
  } catch (err) {
    console.error(`${tag} ${String(err)}`);
    return answer(UNAVAILABLE);
  }
  switches = withSwitchesOff(switches, readSwitchOverride(req.headers.get('x-ai-test-switch-off'), process.env.NODE_ENV));

  const switchedOff = switchRefusal(switches, feature);
  if (switchedOff) return answer(switchedOff);

  // ── 3. Entitlements ─────────────────────────────────────────────────────────
  // A profile that cannot be read is an outage, not a free account: telling a
  // paying user their trial has ended would be false.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error(`${tag} profile read failed:`, profileError.message);
    return answer(UNAVAILABLE);
  }

  const decision = checkFeatureAccess(resolveTier(profile), feature);
  if (!decision.allowed) return answer(refusalForFeature(decision) ?? UNAVAILABLE);

  // ── 4. Per-user rate limit, before anything is reserved ─────────────────────
  const rate = await enforceRateLimit(rateLimitKey(rateLimit.name, user.id, req), rateLimit.windows);
  if (!rate.allowed) return tooManyRequests(rate.retryAfter);

  // ── 5. Catalogue row: model and ceilings ────────────────────────────────────
  const { data: row, error: rowError } = await supabase
    .from('ai_action_costs')
    .select('model, max_tokens, max_input_chars, enabled, limits')
    .eq('action', action)
    .maybeSingle();

  if (rowError || !row) {
    console.error(`${tag} catalogue row unavailable:`, rowError?.message ?? 'missing');
    return answer(ACTION_UNAVAILABLE);
  }
  if (!row.enabled) return answer(ACTION_UNAVAILABLE);

  return {
    user,
    supabase,
    admin,
    tier:                   decision.tier,
    cheapestTierForFeature: PAID_TIERS.find((paid) => FEATURES[feature][paid]) ?? null,
    catalogue: {
      model:         row.model,
      maxTokens:     row.max_tokens,
      maxInputChars: row.max_input_chars,
      limits:        row.limits ?? {},
    },
  };
}
