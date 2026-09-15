import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRateLimit, rateLimitKey, tooManyRequests } from '@/lib/rateLimit';
import { RATE_LIMITS, type RouteRateLimit } from '@/lib/rateLimitConfig';
import { FEATURES, checkFeatureAccess, resolveTier, type FeatureKey, type PaidTier } from '@/lib/entitlements';
import type { ORMessage } from '@/lib/openrouter';
import { callOpenRouterMetered, UpstreamError, type MeteredCompletion } from './openrouterMetered';
import type { StreamUsage } from './sse';
import {
  countInputChars,
  mayCallModel,
  readIdempotencyKey,
  refusalForFeature,
  refusalForReserveError,
  reservationOutcome,
  type AiRefusal,
  type ReservationOutcome,
} from './rules';

// ─── withAiAction ─────────────────────────────────────────────────────────────
//
// Replaces withFeatureCheck for every AI action that one request charges once.
//
//   export const POST = withAiAction(
//     { feature: 'COVER_LETTER_AI', action: 'quick_write' },
//     async (req, ai) => {
//       const body = await req.json();              // validate first: nothing is charged yet
//       const text = await ai.complete(messages);   // reserves, calls, records the cost
//       return NextResponse.json({ html: text });   // 2xx settles; anything else refunds
//     },
//   );
//
// In order:
//   1. auth                            401
//   2. entitlements                    403 blocked / trial_expired / tier_locked
//   3. per-user rate limit             429 (brief §10.9)
//   4. catalogue row                   503 when missing or disabled
//   5. idempotency key                 400 when malformed
//   then the handler runs, and ai.complete():
//   6. call count                      500 past config.maxCalls (default 1)
//   7. input size                      413, before anything is charged
//   8. reserve_ai_credits              402 no credits, 409 in progress / already processed
//   9. OpenRouter, with the model and max_tokens pinned from the catalogue
//                                      502 on failure, and the charge refunded
//  10. the call's cost: from the response, or pending for the ai-ledger cron
//
// Settlement is decided when the handler returns: a 2xx answer settles the
// charge, anything else refunds it — the user pays for what they received. A
// refusal raised inside ai.complete wins over whatever the handler returns, so
// a route's own try/catch cannot turn a 402 into a 500.
//
// A request action is priced for one upstream call. A second call — a retry
// loop added by mistake — would cost money for nothing and go unnoticed, so it
// is refused unless the route declares maxCalls. The refusal is a 500: it is a
// bug in the route, never something the client did.
//
// Not for sessions (interview_session, chat: step 2e), auto_apply (charged by
// the cron) or system_ actions (never charged). RequestAction excludes them.

export type RequestAction =
  | 'cv_generation'
  | 'cv_transform'
  | 'cv_import'
  | 'application'
  | 'letter_adapt'
  | 'quick_write'
  | 'match_score';

export interface ActionConfig {
  action:        RequestAction;
  model:         string;
  maxTokens:     number;
  maxInputChars: number;
  limits:        Record<string, unknown>;
}

export interface AiActionOptions {
  feature:    FeatureKey;
  action:     RequestAction;
  rateLimit?: RouteRateLimit;
  /** Upstream calls one request may make. 1 unless the route says otherwise, here. */
  maxCalls?:  number;
}

export interface AiActionContext {
  user:     User;
  supabase: SupabaseClient;
  action:   ActionConfig;
  /**
   * One model call charged to this request. The model and max_tokens come from
   * ai_action_costs, never from the caller. Throws on a refusal or an upstream
   * failure; the wrapper turns that into the HTTP answer.
   */
  complete(messages: ORMessage[], options?: { timeoutMs?: number }): Promise<string>;
}

const PROFILE_COLUMNS    = 'subscription_plan, subscription_status, trial_ends_at, ai_credits_remaining, is_blocked';
const PAID_TIERS         = ['starter', 'pro', 'premium'] as const;
const DEFAULT_TIMEOUT_MS = 60_000;

const UNAVAILABLE:        AiRefusal = { status: 503, body: { error: 'Temporarily unavailable', reason: 'unavailable' } };
const ACTION_UNAVAILABLE: AiRefusal = { status: 503, body: { error: 'This AI action is unavailable', reason: 'action_unavailable' } };

class AiRefusalError extends Error {
  readonly refusal: AiRefusal;

  constructor(refusal: AiRefusal) {
    super(refusal.body.reason);
    this.name    = 'AiRefusalError';
    this.refusal = refusal;
  }
}

function answer(refusal: AiRefusal): Response {
  return NextResponse.json(refusal.body, {
    status:  refusal.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function withAiAction(
  config:  AiActionOptions,
  handler: (req: Request, ai: AiActionContext) => Promise<Response>,
): (req: Request) => Promise<Response> {
  const tag      = `[ai/${config.action}]`;
  const maxCalls = config.maxCalls ?? 1;

  // A misdeclared route fails when its module loads, not quietly at request time.
  if (!Number.isInteger(maxCalls) || maxCalls < 1) {
    throw new Error(`${tag} maxCalls must be a positive integer, got ${String(config.maxCalls)}`);
  }

  const cheapestTierForFeature: PaidTier | null =
    PAID_TIERS.find((paid) => FEATURES[config.feature][paid]) ?? null;

  return async (req: Request): Promise<Response> => {
    const supabase = await createClient();

    // ── 1. Auth ───────────────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return answer({ status: 401, body: { error: 'Unauthorized', reason: 'unauthorized' } });

    // ── 2. Entitlements ───────────────────────────────────────────────────────
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

    const decision = checkFeatureAccess(resolveTier(profile), config.feature);
    if (!decision.allowed) return answer(refusalForFeature(decision) ?? UNAVAILABLE);
    const { tier } = decision;

    // ── 3. Per-user rate limit, before anything is reserved ───────────────────
    const limit = config.rateLimit ?? RATE_LIMITS.AI_ACTION;
    const rate  = await enforceRateLimit(rateLimitKey(limit.name, user.id, req), limit.windows);
    if (!rate.allowed) return tooManyRequests(rate.retryAfter);

    // ── 4. Catalogue row: model and ceilings ──────────────────────────────────
    const { data: row, error: rowError } = await supabase
      .from('ai_action_costs')
      .select('model, max_tokens, max_input_chars, enabled, limits')
      .eq('action', config.action)
      .maybeSingle();

    if (rowError || !row) {
      console.error(`${tag} catalogue row unavailable:`, rowError?.message ?? 'missing');
      return answer(ACTION_UNAVAILABLE);
    }
    if (!row.enabled) return answer(ACTION_UNAVAILABLE);

    const action: ActionConfig = {
      action:        config.action,
      model:         row.model,
      maxTokens:     row.max_tokens,
      maxInputChars: row.max_input_chars,
      limits:        row.limits ?? {},
    };

    // ── 5. Idempotency key: the client's, or a fresh one per request ──────────
    const idempotencyKey = readIdempotencyKey(req.headers.get('idempotency-key'), () => crypto.randomUUID());
    if (!idempotencyKey) {
      return answer({ status: 400, body: { error: 'Invalid Idempotency-Key header', reason: 'invalid_request' } });
    }

    // ── The charge ────────────────────────────────────────────────────────────
    const admin = createAdminClient();
    const state: { usageId: string | null; refusal: AiRefusal | null; calls: number } = {
      usageId: null,
      refusal: null,
      calls:   0,
    };

    const refuse = (refusal: AiRefusal): AiRefusalError => {
      state.refusal = refusal;
      return new AiRefusalError(refusal);
    };

    const reserve = async (): Promise<void> => {
      const { data, error } = await supabase.rpc('reserve_ai_credits', {
        p_action:          config.action,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw refuse(refusalForReserveError(error.code, { tier, cheapestTierForFeature }));

      const reservation = (Array.isArray(data) ? data[0] : data) ?? {};

      let outcome: ReservationOutcome;
      try {
        outcome = reservationOutcome(reservation);
      } catch (err) {
        console.error(`${tag} ${String(err)}`);
        throw refuse({ status: 500, body: { error: 'Reservation failed', reason: 'reservation_failed' } });
      }

      if (outcome === 'in_progress') {
        throw refuse({ status: 409, body: { error: 'This request is already being processed', reason: 'in_progress' } });
      }
      if (outcome === 'already_processed') {
        throw refuse({ status: 409, body: { error: 'This request was already processed', reason: 'already_processed' } });
      }

      state.usageId = reservation.usage_id;
    };

    const refund = async (reason: string): Promise<void> => {
      const usageId = state.usageId;
      if (!usageId) return;
      const { error } = await admin.rpc('refund_ai_usage', { p_usage_id: usageId, p_error: reason.slice(0, 500) });
      if (error) console.error(`${tag} refund failed for ${usageId}:`, error.message);
    };

    const settle = async (): Promise<void> => {
      const usageId = state.usageId;
      if (!usageId) return;
      const { error } = await admin.rpc('settle_ai_usage', { p_usage_id: usageId });
      // Left reserved, the charge is refunded by the stale-reservation cron and
      // the user keeps the result for free. Rare, and loud.
      if (error) console.error(`${tag} settle failed for ${usageId}:`, error.message);
    };

    // The cost of one call: from the response when it carries one; otherwise
    // pending for the ai-ledger cron when there is a generation id to look up.
    const recordCall = async (
      usage:        StreamUsage | null,
      generationId: string | null,
      failure:      string | null,
    ): Promise<void> => {
      const usageId = state.usageId;
      if (!usageId) return;

      const common  = { p_usage_id: usageId, p_kind: 'model', p_model: action.model };
      const costUsd = usage?.costUsd ?? null;

      const { error } =
        usage && costUsd !== null
          ? await admin.rpc('record_ai_call', {
              ...common,
              p_prompt_tokens:     usage.promptTokens,
              p_completion_tokens: usage.completionTokens,
              p_cost_usd:          costUsd,
              p_error:             failure,
            })
          : generationId
            ? await admin.rpc('record_ai_call_pending', { ...common, p_generation_id: generationId, p_error: failure })
            : await admin.rpc('record_ai_call', { ...common, p_error: failure ?? 'no cost and no generation id in the response' });

      if (error) console.error(`${tag} cost logging failed for ${usageId}:`, error.message);
    };

    const ai: AiActionContext = {
      user,
      supabase,
      action,

      async complete(messages, options) {
        // A refused request makes no further call.
        if (state.refusal) throw new AiRefusalError(state.refusal);

        if (!mayCallModel(state.calls, maxCalls)) {
          console.error(`${tag} upstream call #${state.calls + 1} refused: the route declares maxCalls = ${maxCalls}`);
          throw refuse({ status: 500, body: { error: 'Internal server error', reason: 'call_limit_exceeded' } });
        }

        if (countInputChars(messages) > action.maxInputChars) {
          throw refuse({ status: 413, body: { error: 'Input too large', reason: 'input_too_large' } });
        }

        if (!state.usageId) await reserve();

        // Counted before the call, so a failed attempt counts too.
        state.calls++;

        let result: MeteredCompletion;
        try {
          result = await callOpenRouterMetered({
            model:     action.model,
            messages,
            maxTokens: action.maxTokens,
            timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          });
        } catch (err) {
          const upstream = err instanceof UpstreamError ? err : new UpstreamError(String(err), null, null);
          console.error(`${tag} upstream failed:`, upstream.message);
          await recordCall(null, upstream.generationId, upstream.message);
          await refund(upstream.message);
          throw refuse({ status: 502, body: { error: 'AI temporarily unavailable', reason: 'ai_unavailable' } });
        }

        await recordCall(result.usage, result.generationId, null);
        return result.text;
      },
    };

    // ── Run the route, then settle or refund ──────────────────────────────────
    let response: Response;
    try {
      response = await handler(req, ai);
    } catch (err) {
      if (!(err instanceof AiRefusalError)) console.error(`${tag} handler failed:`, err);
      await refund(err instanceof Error ? err.message : String(err));
      return answer(state.refusal ?? { status: 500, body: { error: 'Internal server error', reason: 'internal_error' } });
    }

    const refusal = state.refusal;
    if (refusal) {
      // The route caught the refusal and answered on its own. The refusal is the
      // truth: a generic catch in the route must not turn a 402 into a 500.
      await refund(`refused: ${refusal.body.reason}`);
      return answer(refusal);
    }

    if (response.ok) await settle();
    else await refund(`handler answered ${response.status}`);

    return response;
  };
}
