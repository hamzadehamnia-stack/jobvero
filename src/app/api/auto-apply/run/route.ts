import { NextResponse } from 'next/server';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { authorizeAiRequest } from '@/lib/ai/authorize';
import { UNAVAILABLE, answer } from '@/lib/ai/refusal';
import { refusalForAutoApplyQuota } from '@/lib/ai/rules';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  claimApplication,
  measureApplication,
  releaseApplication,
  runAutoApplyForUser,
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

// The measurement seam: runs the paid steps of a real application against a job
// given in the body, and stops before the send. It exists because the cost of an
// automatic application was the last estimated line of the economics — nobody
// had ever run one end to end. Same allowlist as above: dead code in production.
function measurementRequest(req: Request): boolean {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== 'development' && nodeEnv !== 'test') return false;
  return (req.headers.get('x-auto-apply-test') ?? '') === 'measure-one';
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
    // The catalogue row an application's steps are held to. Zero credits: what
    // it spends is its monthly quota, claimed in the database.
    action:    'system_auto_apply',
    rateLimit: RATE_LIMITS.AI_ACTION,
    tag:       TAG,
  });
  if (authorized instanceof Response) return authorized;
  const { user, supabase, tier } = authorized;

  if (measurementRequest(req)) {
    const admin = createAdminClient();
    const body  = await req.json().catch(() => null) as {
      job?: { id?: string; title?: string; company?: string; description?: string; url?: string };
      candidateName?: string;
      cv?: Record<string, unknown>;
    } | null;

    const job = body?.job;
    if (!job?.id || !job.title || !job.company || !job.description) {
      return NextResponse.json({ error: 'a job with id, title, company and description is required' }, { status: 400 });
    }

    // The signed-in account's own latest CV, so the measurement runs on real
    // input rather than a toy one.
    const { data: cv } = await supabase
      .from('cvs').select('form_data').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    const cvContent = (body?.cv ?? cv?.form_data ?? null) as Record<string, unknown> | null;
    if (!cvContent) return NextResponse.json({ error: 'no CV to measure with' }, { status: 400 });

    const measured = await measureApplication({
      admin,
      userId:        user.id,
      candidateName: body?.candidateName ?? 'the applicant',
      cvContent,
      cvText:        JSON.stringify(cvContent).slice(0, 3000),
      job: {
        id:          String(job.id),
        title:       String(job.title),
        company:     String(job.company),
        description: String(job.description),
        url:         job.url ? String(job.url) : undefined,
      },
    });

    return NextResponse.json(measured);
  }

  const seam = testApplication(req);
  if (seam) {
    const admin = createAdminClient();
    const claim = await claimApplication(admin, user.id, tier, seam.jobId);

    if ('refused' in claim) {
      if (claim.refused === 'error') return answer(UNAVAILABLE);
      if (claim.refused === 'already_applied') {
        return answer({ status: 409, body: { error: 'This job was already applied to', reason: 'already_applied' } });
      }
      return answer(refusalForAutoApplyQuota({ tier, used: claim.used, quota: claim.quota }));
    }

    if (seam.fail) {
      // The unit goes back, and so does the offer; what the attempt cost stays.
      await releaseApplication(admin, user.id, seam.jobId);
      return NextResponse.json({ charged: false, released: true, usageId: claim.usageId, used: claim.used, quota: claim.quota });
    }

    return NextResponse.json({ charged: true, usageId: claim.usageId, used: claim.used, quota: claim.quota });
  }

  try {
    const result = await runAutoApplyForUser(user.id, supabase);
    return NextResponse.json(result);
  } catch (err) {
    console.error(TAG, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
