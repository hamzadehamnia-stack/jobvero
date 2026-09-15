import { NextResponse } from 'next/server';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { authorizeAiRequest } from '@/lib/ai/authorize';
import { ACTION_UNAVAILABLE, answer } from '@/lib/ai/refusal';
import { readIdempotencyKey, refusalForReserveError, reservationOutcome, type ReservationOutcome } from '@/lib/ai/rules';
import { limitInteger, readInterviewSettings } from '@/lib/ai/sessionRules';

export const runtime = 'nodejs';

const TAG = '[ai/interview_session]';

type Row = Record<string, unknown>;
const firstRow = (data: unknown): Row | null =>
  ((Array.isArray(data) ? data[0] : data) as Row | undefined) ?? null;

// ─── POST /api/interview-coach/start ──────────────────────────────────────────
//
// Opens an interview. start_ai_session reserves the session's credits (7), and
// the server — not the client — creates the interview row, linked to that
// session. The credits settle when the first question starts to stream, and go
// back if it never does. From then on the interview's questions,
// transcriptions and spoken questions are all calls of this one session,
// within its ceilings (limits.model_calls, stt_calls, tts_calls, max_cost_usd).

export async function POST(req: Request) {
  const authorized = await authorizeAiRequest(req, {
    feature:   'INTERVIEW_AI',
    action:    'interview_session',
    rateLimit: RATE_LIMITS.INTERVIEW_COACH,
    tag:       TAG,
  });
  if (authorized instanceof Response) return authorized;
  const { user, supabase, admin, tier, cheapestTierForFeature, catalogue } = authorized;

  const settings = readInterviewSettings(await req.json().catch(() => null));
  if (!settings) {
    return answer({ status: 400, body: { error: 'Invalid interview settings', reason: 'invalid_request' } });
  }

  const maxJobDescription = limitInteger(catalogue.limits, 'max_job_description_chars');
  if (maxJobDescription === null) {
    console.error(`${TAG} limits.max_job_description_chars is missing or invalid`);
    return answer(ACTION_UNAVAILABLE);
  }

  const idempotencyKey = readIdempotencyKey(req.headers.get('idempotency-key'), () => crypto.randomUUID());
  if (!idempotencyKey) {
    return answer({ status: 400, body: { error: 'Invalid Idempotency-Key header', reason: 'invalid_request' } });
  }

  const { data, error } = await supabase.rpc('start_ai_session', {
    p_action:          'interview_session',
    p_idempotency_key: idempotencyKey,
  });
  if (error) return answer(refusalForReserveError(error.code, { tier, cheapestTierForFeature }));

  const started = firstRow(data) ?? {};
  let outcome: ReservationOutcome;
  try {
    outcome = reservationOutcome(started);
  } catch (err) {
    console.error(`${TAG} ${String(err)}`);
    return answer({ status: 500, body: { error: 'Reservation failed', reason: 'reservation_failed' } });
  }
  if (outcome === 'in_progress') {
    return answer({ status: 409, body: { error: 'This request is already being processed', reason: 'in_progress' } });
  }
  if (outcome === 'already_processed') {
    return answer({ status: 409, body: { error: 'This request was already processed', reason: 'already_processed' } });
  }

  const usageId = String(started.usage_id);

  // A long job description is cut to the catalogue's ceiling, not refused.
  const { data: interview, error: insertError } = await admin
    .from('interview_sessions')
    .insert({
      user_id:         user.id,
      job_description: settings.jobDescription?.slice(0, maxJobDescription) ?? null,
      interview_type:  settings.interviewType,
      difficulty:      settings.difficulty,
      language:        settings.language,
      ai_session_id:   String(started.session_id),
    })
    .select('id')
    .single();

  if (insertError || !interview) {
    console.error(`${TAG} interview row not created:`, insertError?.message ?? 'no row');
    const { error: refundError } = await admin.rpc('refund_ai_usage', { p_usage_id: usageId, p_error: 'interview row not created' });
    if (refundError) console.error(`${TAG} refund failed for ${usageId}:`, refundError.message);
    return answer({ status: 500, body: { error: 'Could not start the interview', reason: 'internal_error' } });
  }

  return NextResponse.json({ interviewId: interview.id }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
