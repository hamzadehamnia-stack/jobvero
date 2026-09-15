import { NextResponse } from 'next/server';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { authorizeAiRequest } from '@/lib/ai/authorize';
import { loadInterviewSession, type InterviewSession } from '@/lib/ai/interviewSession';
import { recordAiCall } from '@/lib/ai/ledger';
import { UpstreamError } from '@/lib/ai/openrouterMetered';
import { synthesizeMetered } from '@/lib/ai/openrouterSpeech';
import { ACTION_UNAVAILABLE, UNAVAILABLE, answer } from '@/lib/ai/refusal';
import { claimRefusal, limitInteger, limitString, readSessionId } from '@/lib/ai/sessionRules';

export const runtime     = 'nodejs';
export const maxDuration = 60;

const TAG = '[ai/interview_session/tts]';

type Row = Record<string, unknown>;
const firstRow = (data: unknown): Row | null =>
  ((Array.isArray(data) ? data[0] : data) as Row | undefined) ?? null;

// ─── POST /api/text-to-speech ─────────────────────────────────────────────────
//
// Speaks one recruiter message of an interview: a text-to-speech call of the
// interview's session (limits.tts_calls), with no credit of its own. The model
// and the voice for each language are pinned in the catalogue (limits.models.tts,
// limits.tts_voices). A language without a voice is answered before anything is
// claimed, and the interview carries on in text. The call's cost is recovered
// from its generation id by the ai-ledger cron.

export async function POST(req: Request) {
  const authorized = await authorizeAiRequest(req, {
    feature:   'INTERVIEW_AI',
    action:    'interview_session',
    rateLimit: RATE_LIMITS.TEXT_TO_SPEECH,
    tag:       TAG,
  });
  if (authorized instanceof Response) return authorized;
  const { user, supabase, admin, catalogue } = authorized;

  const body        = (await req.json().catch(() => null)) as { text?: unknown; interviewId?: unknown } | null;
  const text        = typeof body?.text === 'string' ? body.text.trim() : '';
  const interviewId = readSessionId(body?.interviewId);
  if (!text || !interviewId) {
    return answer({ status: 400, body: { error: 'A text and an interview are required', reason: 'invalid_request' } });
  }

  const maxChars = limitInteger(catalogue.limits, 'max_tts_chars');
  const model    = limitString(catalogue.limits, 'models', 'tts');
  if (maxChars === null || !model) {
    console.error(`${TAG} limits.max_tts_chars or limits.models.tts is missing`);
    return answer(ACTION_UNAVAILABLE);
  }
  if (text.length > maxChars) {
    return answer({ status: 413, body: { error: 'Text too long to speak', reason: 'input_too_large' } });
  }

  let interview: InterviewSession | null;
  try {
    interview = await loadInterviewSession(admin, user.id, interviewId);
  } catch (err) {
    console.error(`${TAG} ${String(err)}`);
    return answer(UNAVAILABLE);
  }
  if (!interview) return answer({ status: 404, body: { error: 'Interview not found', reason: 'not_found' } });

  const voice = limitString(catalogue.limits, 'tts_voices', interview.language);
  if (!voice) {
    return answer({ status: 422, body: { error: 'No voice for this interview language', reason: 'voice_unavailable' } });
  }

  const { data, error } = await supabase.rpc('claim_ai_session_call', {
    p_session_id: interview.charge.sessionId,
    p_kind:       'tts',
  });
  if (error) {
    console.error(`${TAG} claim failed for ${interview.charge.sessionId}:`, error.message);
    return answer({ status: 500, body: { error: 'Session call failed', reason: 'session_failed' } });
  }
  const refusal = claimRefusal(firstRow(data));
  if (refusal) return answer(refusal);

  const usageId = interview.charge.usageId;
  try {
    const speech = await synthesizeMetered({ model, voice, input: text, timeoutMs: 45_000 });
    await recordAiCall(admin, { tag: TAG, usageId, kind: 'tts', model, usage: null, generationId: speech.generationId, failure: null });
    return NextResponse.json(
      { audio: speech.audio.toString('base64'), mimeType: speech.mimeType },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const upstream = err instanceof UpstreamError ? err : new UpstreamError(String(err), null, null);
    console.error(`${TAG} speech failed:`, upstream.message);
    await recordAiCall(admin, { tag: TAG, usageId, kind: 'tts', model, usage: null, generationId: upstream.generationId, failure: upstream.message });
    return answer({ status: 502, body: { error: 'Speech temporarily unavailable', reason: 'ai_unavailable' } });
  }
}
