import { JOBVERO_SYSTEM_PROMPT } from '@/lib/prompts/assistant';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { authorizeAiRequest } from '@/lib/ai/authorize';
import { answer, isAiRefusal } from '@/lib/ai/refusal';
import { readIdempotencyKey, refusalForReserveError, reservationOutcome, type ReservationOutcome } from '@/lib/ai/rules';
import { claimRefusal, fitHistory, readHistory, readSessionId } from '@/lib/ai/sessionRules';
import { streamSessionTurn, type SessionCharge } from '@/lib/ai/sessionStream';
import type { CVFormData, WorkExperience, Education } from '@/components/cv-builder/types';

export const runtime     = 'nodejs';
export const maxDuration = 120;

const TAG          = '[ai/chat]';
const MAX_MESSAGES = 40;

// ─── CV → readable text ───────────────────────────────────────────────────────

function formatCvContext(data: CVFormData): string {
  const lines: string[] = ['=== USER CV ===', ''];

  const p = data.personalInfo;
  lines.push('PERSONAL INFO');
  if (p.fullName)   lines.push(`Name:     ${p.fullName}`);
  if (p.email)      lines.push(`Email:    ${p.email}`);
  if (p.phone)      lines.push(`Phone:    ${p.phone}`);
  if (p.location)   lines.push(`Location: ${p.location}`);
  if (p.linkedin)   lines.push(`LinkedIn: ${p.linkedin}`);
  if (p.portfolio)  lines.push(`Portfolio: ${p.portfolio}`);
  lines.push('');

  if (data.workExperience?.length) {
    lines.push('WORK EXPERIENCE');
    data.workExperience.forEach((w: WorkExperience, i: number) => {
      const period = w.current ? `${w.startDate} – Present` : `${w.startDate} – ${w.endDate}`;
      lines.push(`[${i + 1}] ${w.position} @ ${w.company} (${period})`);
      if (w.description) lines.push(`    ${w.description.trim()}`);
    });
    lines.push('');
  }

  if (data.education?.length) {
    lines.push('EDUCATION');
    data.education.forEach((e: Education, i: number) => {
      lines.push(`[${i + 1}] ${e.degree} in ${e.field} — ${e.school} (${e.startDate} – ${e.endDate})`);
    });
    lines.push('');
  }

  if (data.skills?.length) {
    lines.push('SKILLS');
    lines.push(data.skills.join(', '));
    lines.push('');
  }

  const pref = data.preferences;
  if (pref) {
    lines.push('PREFERENCES');
    if (pref.targetCountry) lines.push(`Target country: ${pref.targetCountry}`);
    if (pref.language)      lines.push(`CV language:    ${pref.language}`);
    if (pref.style)         lines.push(`CV style:       ${pref.style}`);
  }

  return lines.join('\n');
}

// ─── Route ────────────────────────────────────────────────────────────────────
//
// The assistant is charged by conversation: one credit opens a chat session of
// limits.model_calls messages (20). The client names the session it is in, and
// while that session has messages left each message uses one. A session that
// has ended — out of messages, expired, or refunded — makes the next message
// open a new one: the next credit. The session travels in X-AI-Session-Id, with
// the messages used and allowed.
//
// Nothing is stored: the client sends the conversation, and only its most
// recent messages that fit max_input_chars reach the model.

type Row = Record<string, unknown>;
const firstRow = (data: unknown): Row | null =>
  ((Array.isArray(data) ? data[0] : data) as Row | undefined) ?? null;

export async function POST(req: Request) {
  const authorized = await authorizeAiRequest(req, {
    feature:   'AI_ASSISTANT_CHAT',
    action:    'chat',
    rateLimit: RATE_LIMITS.AI_CHAT,
    tag:       TAG,
  });
  if (authorized instanceof Response) return authorized;
  const { user, supabase, admin, tier, cheapestTierForFeature, catalogue } = authorized;

  const body     = (await req.json().catch(() => null)) as { messages?: unknown; sessionId?: unknown } | null;
  const messages = readHistory(body?.messages, MAX_MESSAGES);
  if (!messages) {
    return answer({ status: 400, body: { error: 'Invalid conversation', reason: 'invalid_request' } });
  }

  const idempotencyKey = readIdempotencyKey(req.headers.get('idempotency-key'), () => crypto.randomUUID());
  if (!idempotencyKey) {
    return answer({ status: 400, body: { error: 'Invalid Idempotency-Key header', reason: 'invalid_request' } });
  }

  // The user's most recent CV, as context.
  const { data: cvRow } = await supabase
    .from('cvs')
    .select('form_data')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let cvContext: string | null = null;
  if (cvRow?.form_data) {
    try { cvContext = formatCvContext(cvRow.form_data as CVFormData); } catch { /* skip */ }
  }

  const systemContent = cvContext
    ? `${JOBVERO_SYSTEM_PROMPT}\n\nHere is the current user's CV. Reference it when they ask about their CV, experience, or job applications. If they ask generic questions, don't force-mention the CV.\n\n${cvContext}`
    : JOBVERO_SYSTEM_PROMPT;

  // Checked before anything is charged.
  const history = fitHistory(messages, catalogue.maxInputChars - systemContent.length);
  if (!history) {
    return answer({ status: 413, body: { error: 'Message too long', reason: 'input_too_large' } });
  }

  // ── The session: the client's while it has messages left, else a new one ──
  let charge: SessionCharge | null = null;
  let claim:  Row | null = null;

  const requested = readSessionId(body?.sessionId);
  if (requested) {
    // Only the user's own chat session: an interview session must not pay for chat.
    const { data: session } = await admin
      .from('ai_sessions')
      .select('id, usage_id')
      .eq('id', requested)
      .eq('user_id', user.id)
      .eq('action', 'chat')
      .maybeSingle();

    if (session) {
      const { data, error } = await supabase.rpc('claim_ai_session_call', { p_session_id: session.id, p_kind: 'model' });
      if (error) {
        console.error(`${TAG} claim failed for ${session.id}:`, error.message);
        return answer({ status: 500, body: { error: 'Session call failed', reason: 'session_failed' } });
      }
      const row = firstRow(data);
      if (claimRefusal(row) === null) {
        const { data: usage } = await admin.from('ai_usage').select('status').eq('id', session.usage_id).maybeSingle();
        charge = { usageId: session.usage_id, sessionId: session.id, reserved: usage?.status === 'reserved' };
        claim  = row;
      }
      // Otherwise that session has ended, and this message opens the next one.
    }
  }

  if (!charge) {
    const { data, error } = await supabase.rpc('start_ai_session', { p_action: 'chat', p_idempotency_key: idempotencyKey });
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

    const sessionId = String(started.session_id);
    const usageId   = String(started.usage_id);

    const { data: claimed, error: claimError } = await supabase.rpc('claim_ai_session_call', { p_session_id: sessionId, p_kind: 'model' });
    const row = firstRow(claimed);
    if (claimError || claimRefusal(row) !== null) {
      // A session just opened that refuses its first message is misconfigured
      // (limits.model_calls): the credit goes back.
      console.error(`${TAG} new session ${sessionId} refused its first message:`, claimError?.message ?? JSON.stringify(row));
      const { error: refundError } = await admin.rpc('refund_ai_usage', { p_usage_id: usageId, p_error: 'new session refused its first message' });
      if (refundError) console.error(`${TAG} refund failed for ${usageId}:`, refundError.message);
      return answer({ status: 503, body: { error: 'This AI action is unavailable', reason: 'action_unavailable' } });
    }

    charge = { usageId, sessionId, reserved: true };
    claim  = row;
  }

  let stream: ReadableStream<Uint8Array>;
  try {
    stream = await streamSessionTurn({
      admin,
      tag:          TAG,
      charge,
      model:        catalogue.model,
      maxTokens:    catalogue.maxTokens,
      messages:     [{ role: 'system', content: systemContent }, ...history],
      clientSignal: req.signal,
    });
  } catch (err) {
    if (isAiRefusal(err)) return answer(err.refusal);
    throw err;
  }

  return new Response(stream, {
    headers: {
      'Content-Type':                'text/plain; charset=utf-8',
      'X-Content-Type-Options':      'nosniff',
      'Cache-Control':               'no-store',
      'X-AI-Session-Id':             charge.sessionId,
      'X-AI-Session-Messages-Used':  String(claim?.calls_used ?? ''),
      'X-AI-Session-Messages-Limit': String(claim?.calls_limit ?? ''),
    },
  });
}
