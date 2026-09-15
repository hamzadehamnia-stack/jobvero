import { NextResponse } from 'next/server';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { authorizeAiRequest } from '@/lib/ai/authorize';
import { loadInterviewSession, type InterviewSession } from '@/lib/ai/interviewSession';
import { recordAiCall } from '@/lib/ai/ledger';
import { UpstreamError } from '@/lib/ai/openrouterMetered';
import { transcribeMetered } from '@/lib/ai/openrouterSpeech';
import { ACTION_UNAVAILABLE, UNAVAILABLE, answer } from '@/lib/ai/refusal';
import { claimRefusal, limitString, readSessionId } from '@/lib/ai/sessionRules';

export const runtime     = 'nodejs';
export const maxDuration = 60;

const TAG = '[ai/interview_session/stt]';

// A spoken answer runs to limits.max_audio_seconds (120 s): about 1 MB of the
// browser's Opus at its usual bitrates. 2 MB leaves room without letting a long
// recording through; the session's cost ceiling bounds the rest.
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

type Row = Record<string, unknown>;
const firstRow = (data: unknown): Row | null =>
  ((Array.isArray(data) ? data[0] : data) as Row | undefined) ?? null;

// ─── POST /api/speech-to-text ─────────────────────────────────────────────────
//
// Transcribes one spoken answer of an interview: a speech-to-text call of the
// interview's session (limits.stt_calls), with no credit of its own. The model
// is pinned in the catalogue (limits.models.stt); its cost comes back in the
// response and goes on the session's ledger row.

export async function POST(req: Request) {
  const authorized = await authorizeAiRequest(req, {
    feature:   'INTERVIEW_AI',
    action:    'interview_session',
    rateLimit: RATE_LIMITS.SPEECH_TO_TEXT,
    tag:       TAG,
  });
  if (authorized instanceof Response) return authorized;
  const { user, supabase, admin, catalogue } = authorized;

  const form        = await req.formData().catch(() => null);
  const audio       = form?.get('audio');
  const interviewId = readSessionId(form?.get('interviewId'));
  if (!(audio instanceof Blob) || audio.size === 0 || !interviewId) {
    return answer({ status: 400, body: { error: 'A recording and an interview are required', reason: 'invalid_request' } });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return answer({ status: 413, body: { error: 'Recording too long', reason: 'input_too_large' } });
  }

  const model = limitString(catalogue.limits, 'models', 'stt');
  if (!model) {
    console.error(`${TAG} limits.models.stt is missing`);
    return answer(ACTION_UNAVAILABLE);
  }

  let interview: InterviewSession | null;
  try {
    interview = await loadInterviewSession(admin, user.id, interviewId);
  } catch (err) {
    console.error(`${TAG} ${String(err)}`);
    return answer(UNAVAILABLE);
  }
  if (!interview) return answer({ status: 404, body: { error: 'Interview not found', reason: 'not_found' } });

  const { data, error } = await supabase.rpc('claim_ai_session_call', {
    p_session_id: interview.charge.sessionId,
    p_kind:       'stt',
  });
  if (error) {
    console.error(`${TAG} claim failed for ${interview.charge.sessionId}:`, error.message);
    return answer({ status: 500, body: { error: 'Session call failed', reason: 'session_failed' } });
  }
  const refusal = claimRefusal(firstRow(data));
  if (refusal) return answer(refusal);

  const usageId = interview.charge.usageId;
  try {
    const result = await transcribeMetered({
      model,
      audio,
      filename:  audio instanceof File && audio.name ? audio.name : 'answer.webm',
      language:  interview.language,
      timeoutMs: 45_000,
    });
    await recordAiCall(admin, { tag: TAG, usageId, kind: 'stt', model, usage: result.usage, generationId: result.generationId, failure: null });
    return NextResponse.json({ transcript: result.text.trim() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const upstream = err instanceof UpstreamError ? err : new UpstreamError(String(err), null, null);
    console.error(`${TAG} transcription failed:`, upstream.message);
    await recordAiCall(admin, { tag: TAG, usageId, kind: 'stt', model, usage: null, generationId: upstream.generationId, failure: upstream.message });
    return answer({ status: 502, body: { error: 'Transcription temporarily unavailable', reason: 'ai_unavailable' } });
  }
}
