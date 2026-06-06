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
    await consumeFeature(user.id, feature, supabase, access.creditsRequired);

    // ── Run original handler ─────────────────────────────────────────────
    return handler(req);
  };
}
