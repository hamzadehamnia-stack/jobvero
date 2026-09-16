import { NextResponse } from 'next/server';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { authorizeAiRequest } from '@/lib/ai/authorize';
import { answer } from '@/lib/ai/refusal';
import { refusalForReserveError } from '@/lib/ai/rules';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  refundApplication,
  reserveApplication,
  runAutoApplyForUser,
  settleApplication,
} from '@/lib/auto-apply/runForUser';

export const runtime     = 'nodejs';
export const maxDuration = 300;

const TAG = '[auto-apply/run]';

// ─── The test seam ────────────────────────────────────────────────────────────
//
// A real run searches Adzuna, hunts for a recruiter's address and emails a real
// person. No test may do that, and the credit path is what needs testing. So
// this header drives one application's charge — reserve, then settle or refund
// — and nothing else.
//
// Honoured only when NODE_ENV is development or test, an allowlist, so an unset
// NODE_ENV honours nothing. Vercel builds with NODE_ENV=production and Next
// inlines it: in a production bundle this branch is dead code.
function testApplication(req: Request): { jobId: string; fail: boolean } | null {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== 'development' && nodeEnv !== 'test') return null;

  const match = (req.headers.get('x-auto-apply-test') ?? '').match(/^charge-one:([A-Za-z0-9_-]{1,64})$/);
  if (!match) return null;

  return { jobId: match[1], fail: req.headers.get('x-auto-apply-test-outcome') === 'fail' };
}

// ─── POST /api/auto-apply/run ─────────────────────────────────────────────────
//
// Runs one auto-apply batch for the signed-in user.
//
// The request itself is free: what costs is each application actually sent, one
// credit, reserved and settled inside the engine. That is why this goes through
// authorizeAiRequest — auth, the admin switches, the entitlement, the rate
// limit — rather than the old withFeatureCheck, which charged the account once
// per request through the module being retired. Two charging systems on one
// route would have billed the same user twice for the same work.

export async function POST(req: Request) {
  const authorized = await authorizeAiRequest(req, {
    feature:   'AUTO_APPLY',
    action:    'auto_apply',
    rateLimit: RATE_LIMITS.AI_ACTION,
    tag:       TAG,
  });
  if (authorized instanceof Response) return authorized;
  const { user, supabase, tier, cheapestTierForFeature } = authorized;

  const seam = testApplication(req);
  if (seam) {
    const admin       = createAdminClient();
    const reservation = await reserveApplication(admin, user.id, seam.jobId);

    if ('refusedCode' in reservation) {
      if (reservation.alreadyHandled) {
        return answer({ status: 409, body: { error: 'This job was already applied to', reason: 'already_processed' } });
      }
      return answer(refusalForReserveError(reservation.refusedCode, { tier, cheapestTierForFeature }));
    }

    if (seam.fail) {
      await refundApplication(admin, reservation, 'injected failure before sending');
      return NextResponse.json({ charged: false, refunded: true, usageId: reservation.usageId });
    }

    await settleApplication(admin, reservation);
    return NextResponse.json({ charged: true, usageId: reservation.usageId });
  }

  try {
    const result = await runAutoApplyForUser(user.id, supabase);
    return NextResponse.json(result);
  } catch (err) {
    console.error(TAG, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
