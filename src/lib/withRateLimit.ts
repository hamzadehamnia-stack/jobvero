import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { enforceRateLimit, rateLimitKey, tooManyRequests } from '@/lib/rateLimit';
import type { RouteRateLimit } from '@/lib/rateLimitConfig';

// ─── withRateLimit ────────────────────────────────────────────────────────────
//
// Route wrapper for authenticated endpoints, shaped like withFeatureCheck so
// there is one idiom in this codebase rather than two.
//
//   export const POST = withRateLimit(RATE_LIMITS.PARSE_CV, async (req, { user }) => { … });
//
// It authenticates, then throttles, then hands the handler the session it
// already resolved. Passing `user` and `supabase` through is what keeps this
// free: the wrapped routes drop their own getUser() call, so adding the limiter
// costs no extra round trip to Supabase.
//
// Order matters. Auth runs first, and throttling second, for two reasons: the
// bucket is keyed by user id, which does not exist before authentication; and
// an unauthenticated caller should not be able to spend a real user's budget by
// guessing at it. An anonymous flood is not left unguarded by this ordering —
// it costs one getUser() and gets a 401, never reaching the model call that
// makes these routes worth protecting.

export interface AuthedContext {
  user:     User;
  supabase: SupabaseClient;
}

type AuthedHandler = (req: Request, ctx: AuthedContext) => Promise<Response>;

export function withRateLimit(
  config: RouteRateLimit,
  handler: AuthedHandler,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decision = await enforceRateLimit(
      rateLimitKey(config.name, user.id, req),
      config.windows,
    );

    if (!decision.allowed) {
      return tooManyRequests(decision.retryAfter);
    }

    return handler(req, { user, supabase });
  };
}
