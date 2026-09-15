import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { RATE_LIMITS, type RouteRateLimit } from '@/lib/rateLimitConfig';
import type { FeatureKey } from '@/lib/entitlements';
import type { ORMessage } from '@/lib/openrouter';
import { authorizeAiRequest } from './authorize';
import { recordAiCall } from './ledger';
import { callOpenRouterMetered, UpstreamError, type MeteredCompletion } from './openrouterMetered';
import { AiRefusalError, answer } from './refusal';
import type { StreamUsage } from './sse';
import {
  countInputChars,
  mayCallModel,
  readFailureInjection,
  readIdempotencyKey,
  refusalForReserveError,
  reservationOutcome,
  type AiRefusal,
  type ReservationOutcome,
} from './rules';

export { isAiRefusal } from './refusal';

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
//   1-5. authorizeAiRequest: auth 401, admin switches 503, entitlements 403,
//        per-user rate limit 429, catalogue row 503
//   6. idempotency key                 400 when malformed
//   then the handler runs, and ai.complete():
//   7. call count                      500 past config.maxCalls (default 1)
//   8. input size                      413, before anything is charged
//   9. reserve_ai_credits              402 no credits, 409 in progress / already processed
//  10. OpenRouter, with the model and max_tokens pinned from the catalogue
//                                      502 on failure, and the charge refunded
//  11. the call's cost: from the response, or pending for the ai-ledger cron
//
// Settlement is decided when the handler returns: a 2xx answer settles the
// charge, anything else refunds it — the user pays for what they received. A
// refusal raised inside ai.complete wins over whatever the handler returns, so
// a route's own try/catch cannot turn a 402 into a 500. A route that catches
// errors lets refusals through with isAiRefusal(): they are answers, not errors,
// and must not fill the error logs.
//
// A request action is priced for one upstream call. A second call — a retry
// loop added by mistake — would cost money for nothing and go unnoticed, so it
// is refused unless the route declares maxCalls. The refusal is a 500: it is a
// bug in the route, never something the client did.
//
// Outside production, the X-AI-Test-Failure header makes the request fail after
// the route has used the model (security-tests/aiBillingE2E.test.js), so the
// refund paths are exercised on real routes (readFailureInjection); and
// X-AI-Test-Switch-Off forces admin switches off (readSwitchOverride).
//
// A dynamic route's context — { params } — reaches the handler as its third
// argument.
//
// Not for sessions (chat, interview: see sessionStream), auto_apply (charged by
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

const DEFAULT_TIMEOUT_MS = 60_000;

export function withAiAction<Context = unknown>(
  config:  AiActionOptions,
  handler: (req: Request, ai: AiActionContext, context: Context) => Promise<Response>,
): (req: Request, context: Context) => Promise<Response> {
  const tag      = `[ai/${config.action}]`;
  const maxCalls = config.maxCalls ?? 1;

  // A misdeclared route fails when its module loads, not quietly at request time.
  if (!Number.isInteger(maxCalls) || maxCalls < 1) {
    throw new Error(`${tag} maxCalls must be a positive integer, got ${String(config.maxCalls)}`);
  }

  return async (req: Request, context: Context): Promise<Response> => {
    // ── 1-5. Auth, admin switches, entitlements, rate limit, catalogue ────────
    const authorized = await authorizeAiRequest(req, {
      feature:   config.feature,
      action:    config.action,
      rateLimit: config.rateLimit ?? RATE_LIMITS.AI_ACTION,
      tag,
    });
    if (authorized instanceof Response) return authorized;
    const { user, supabase, admin, tier, cheapestTierForFeature, catalogue } = authorized;

    const action: ActionConfig = { action: config.action, ...catalogue };

    // ── 6. Idempotency key: the client's, or a fresh one per request ──────────
    const idempotencyKey = readIdempotencyKey(req.headers.get('idempotency-key'), () => crypto.randomUUID());
    if (!idempotencyKey) {
      return answer({ status: 400, body: { error: 'Invalid Idempotency-Key header', reason: 'invalid_request' } });
    }

    // Test-only, and null in production: see readFailureInjection.
    const injection = readFailureInjection(req.headers.get('x-ai-test-failure'), process.env.NODE_ENV);

    // ── The charge ────────────────────────────────────────────────────────────
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

    const recordCall = async (
      usage:        StreamUsage | null,
      generationId: string | null,
      failure:      string | null,
    ): Promise<void> => {
      const usageId = state.usageId;
      if (!usageId) return;
      await recordAiCall(admin, { tag, usageId, kind: 'model', model: action.model, usage, generationId, failure });
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
      response = await handler(req, ai, context);

      // Outside production only: fail after the route has used the model, through
      // the same code a real failure takes.
      if (injection && state.usageId) {
        if (injection === 'handler-throws') {
          throw new Error('injected failure: the handler threw after the model call');
        }
        response = NextResponse.json({ error: 'injected failure: error response after the model call' }, { status: 500 });
      }
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
