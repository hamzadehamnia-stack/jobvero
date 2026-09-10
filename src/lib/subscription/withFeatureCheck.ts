import { createClient } from '@/lib/supabase/server';
import { canUseFeature, consumeFeature } from './access';
import type { FeatureKey } from './features';

// ─── Types ────────────────────────────────────────────────────────────────────

// Compatible with Next.js App Router route handler signature
type RouteHandler = (req: Request) => Promise<Response>;

// ─── withFeatureCheck ────────────────────────────────────────────────────────
//
// Usage:
//   export const POST = withFeatureCheck('CV_BUILDER_AI', async (req) => {
//     // your existing handler logic
//   });
//
// What it does:
//   1. Authenticates the request (401 if no session)
//   2. Checks feature access for the user's subscription tier (403 if denied)
//   3. Atomically consumes credits / records usage BEFORE calling the handler
//   4. Calls the original handler

export function withFeatureCheck(feature: FeatureKey, handler: RouteHandler): RouteHandler {
  return async (req: Request): Promise<Response> => {
    const supabase = await createClient();

    // ── Auth ──────────────────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Feature access ───────────────────────────────────────────────────
    const access = await canUseFeature(user.id, feature, supabase);

    if (!access.allowed) {
      // A blocked account is not a paywall — do not offer an upgrade path.
      if (access.reason === 'blocked') {
        return Response.json({ error: 'Account blocked', reason: 'blocked' }, { status: 403 });
      }

      return Response.json(
        {
          error:     'Feature locked',
          reason:    access.reason,
          upgradeTo: 'upgradeTo' in access ? access.upgradeTo : undefined,
        },
        { status: 403 },
      );
    }

    // ── Consume credits / record usage (before handler to prevent farming) ─
    //
    // The result is now acted on. This call used to be fire-and-forget, which
    // meant the handler ran whether or not the charge succeeded — and since the
    // RPC did not exist, it never succeeded. Denying on failure is the only
    // safe reading: a paywall that serves the request when it could not collect
    // is not a paywall.
    const charged = await consumeFeature(user.id, feature, access.creditsRequired);
    if (!charged) {
      return Response.json(
        { error: 'Feature locked', reason: 'no_credits', upgradeTo: 'pro' },
        { status: 403 },
      );
    }

    // ── Run original handler ─────────────────────────────────────────────
    return handler(req);
  };
}
