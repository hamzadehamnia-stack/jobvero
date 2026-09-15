import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { authorizeAiRequest } from '@/lib/ai/authorize';
import { loadInterviewSession, type InterviewSession } from '@/lib/ai/interviewSession';
import { ACTION_UNAVAILABLE, UNAVAILABLE, answer, isAiRefusal } from '@/lib/ai/refusal';
import {
  INTERVIEW_QUESTIONS,
  claimRefusal,
  fitHistory,
  interviewTurn,
  limitInteger,
  parseFinalReport,
  readHistory,
  readSessionId,
  type HistoryMessage,
  type InterviewTurn,
} from '@/lib/ai/sessionRules';
import { streamSessionTurn } from '@/lib/ai/sessionStream';

export const runtime     = 'nodejs';
export const maxDuration = 90;

const TAG          = '[ai/interview_session]';
const MAX_MESSAGES = 40;

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese',
};

function cvToText(content: Record<string, unknown>): string {
  const parts: string[] = [];

  const pi = content.personalInfo as Record<string, string> | undefined;
  if (pi?.fullName) {
    const lines = [`Name: ${pi.fullName}`];
    if (pi.email)     lines.push(`Email: ${pi.email}`);
    if (pi.phone)     lines.push(`Phone: ${pi.phone}`);
    if (pi.location)  lines.push(`Location: ${pi.location}`);
    if (pi.linkedin)  lines.push(`LinkedIn: ${pi.linkedin}`);
    if (pi.portfolio) lines.push(`Portfolio: ${pi.portfolio}`);
    parts.push(lines.join('\n'));
  }

  const we = content.workExperience as Array<Record<string, unknown>> | undefined;
  if (we?.length) {
    const lines = we.map(e => {
      const period = e.current ? `${e.startDate} – Present` : `${e.startDate} – ${e.endDate}`;
      return `- ${e.position} at ${e.company} (${period})\n  ${e.description ?? ''}`;
    });
    parts.push(`Work Experience:\n${lines.join('\n')}`);
  }

  const edu = content.education as Array<Record<string, unknown>> | undefined;
  if (edu?.length) {
    const lines = edu.map(e => {
      const period = e.current ? `${e.startDate} – Present` : `${e.startDate} – ${e.endDate}`;
      return `- ${e.degree} in ${e.field} at ${e.school} (${period})${e.gpa ? `, GPA: ${e.gpa}` : ''}`;
    });
    parts.push(`Education:\n${lines.join('\n')}`);
  }

  const skills = content.skills as string[] | undefined;
  if (skills?.length) parts.push(`Skills: ${skills.join(', ')}`);

  const cats = content.skillCategories as Array<{ name: string; items: string[] }> | undefined;
  if (cats?.length) {
    const catLines = cats.filter(c => c.items?.length).map(c => `- ${c.name}: ${c.items.join(', ')}`);
    if (catLines.length) parts.push(`Skill Categories:\n${catLines.join('\n')}`);
  }

  return parts.join('\n\n');
}

function formatRules(turn: InterviewTurn): string {
  if (turn.kind === 'first_question') {
    return `Ask the first interview question directly. No preamble, no greeting, no introduction — just the question itself.`;
  }
  if (turn.kind === 'next_question') {
    return `After reviewing the candidate's answer, respond EXACTLY in this format — do not deviate:

FEEDBACK: [2-3 sentences: acknowledge what was good, then suggest one specific improvement]

QUESTION: [Question ${turn.question} of ${INTERVIEW_QUESTIONS} — your next interview question]`;
  }
  // Said outright: the model cannot tell the last answer from the conversation,
  // and without it, asked "one question at a time", it asks another.
  return `The candidate has just answered the last question: the interview is over. Do NOT ask another question.
After reviewing the candidate's final answer, respond EXACTLY in this format — do not deviate:

FEEDBACK: [2-3 sentences of feedback on the last answer]

FINAL_REPORT:
{"score": <integer 0-100>, "strengths": ["<point>", "<point>", "<point>"], "improvements": ["<area>", "<area>", "<area>"], "tips": ["<tip>", "<tip>", "<tip>"]}

The JSON must be valid and on a single line after FINAL_REPORT:.`;
}

type Row = Record<string, unknown>;
const firstRow = (data: unknown): Row | null =>
  ((Array.isArray(data) ? data[0] : data) as Row | undefined) ?? null;

// ─── POST /api/interview-coach ────────────────────────────────────────────────
//
// One turn of an interview opened by /api/interview-coach/start, streamed. The
// turn is the server's: the first question, feedback and the next question
// after each answer, the final report after the eighth — counted by the
// session, whatever the client sends. The job description, type, level and
// language are the ones stored when the interview started. The final report is
// saved here when its stream completes, and the session ends; a report that
// does not parse is not saved, and that turn can be asked again.

export async function POST(req: Request) {
  const authorized = await authorizeAiRequest(req, {
    feature:   'INTERVIEW_AI',
    action:    'interview_session',
    rateLimit: RATE_LIMITS.INTERVIEW_COACH,
    tag:       TAG,
  });
  if (authorized instanceof Response) return authorized;
  const { user, supabase, admin, catalogue } = authorized;

  const body = (await req.json().catch(() => null)) as { interviewId?: unknown; messages?: unknown; cvId?: unknown } | null;
  const interviewId = readSessionId(body?.interviewId);
  if (!interviewId) {
    return answer({ status: 400, body: { error: 'Invalid interview', reason: 'invalid_request' } });
  }

  const maxAnswer = limitInteger(catalogue.limits, 'max_answer_chars');
  const maxCv     = limitInteger(catalogue.limits, 'max_cv_chars');
  const maxJob    = limitInteger(catalogue.limits, 'max_job_description_chars');
  if (maxAnswer === null || maxCv === null || maxJob === null) {
    console.error(`${TAG} an interview_session ceiling is missing from limits`);
    return answer(ACTION_UNAVAILABLE);
  }

  let loaded: InterviewSession | null;
  try {
    loaded = await loadInterviewSession(admin, user.id, interviewId);
  } catch (err) {
    console.error(`${TAG} ${String(err)}`);
    return answer(UNAVAILABLE);
  }
  if (!loaded) return answer({ status: 404, body: { error: 'Interview not found', reason: 'not_found' } });
  const interview = loaded;

  const turn = interviewTurn(interview.turnsCompleted, INTERVIEW_QUESTIONS);
  if (turn.kind === 'complete') {
    return answer({ status: 409, body: { error: 'This interview is complete', reason: 'interview_complete' } });
  }

  let conversation: HistoryMessage[];
  if (turn.kind === 'first_question') {
    conversation = [{ role: 'user', content: 'Please begin the interview.' }];
  } else {
    const history = readHistory(body?.messages, MAX_MESSAGES);
    if (!history) {
      return answer({ status: 400, body: { error: 'Invalid conversation', reason: 'invalid_request' } });
    }
    if (history.some((message) => message.role === 'user' && message.content.length > maxAnswer)) {
      return answer({ status: 413, body: { error: `An answer can be at most ${maxAnswer} characters`, reason: 'input_too_large' } });
    }
    conversation = history;
  }

  let cvContent = '';
  const cvId = readSessionId(body?.cvId);
  if (cvId) {
    const { data: cv } = await supabase
      .from('cvs')
      .select('form_data')
      .eq('id', cvId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (cv?.form_data) cvContent = cvToText(cv.form_data as Record<string, unknown>).slice(0, maxCv);
  }

  const lang           = LANGUAGE_NAMES[interview.language] ?? 'English';
  const jobDescription = (interview.jobDescription ?? '').slice(0, maxJob);

  const systemPrompt = `You are a professional recruiter conducting a realistic job interview.
${cvContent ? `Candidate CV:\n${cvContent}` : ''}
${jobDescription ? `Job offer they are applying for:\n${jobDescription}` : ''}
Your role: Ask questions specifically tailored to their CV and the job offer. Reference their actual experience, skills, and background. Focus on gaps between their CV and the job requirements. Ask about specific projects or technologies mentioned in their CV. Be a realistic but encouraging recruiter. Ask one question at a time. After each answer give brief constructive feedback (2-3 sentences). This is a ${interview.interviewType} interview for a ${interview.difficulty}-level position.

RESPONSE FORMAT RULES:
${formatRules(turn)}

Conduct the interview entirely in ${lang}. Be specific, constructive, and professional.`;

  const messages = fitHistory(conversation, catalogue.maxInputChars - systemPrompt.length);
  if (!messages) {
    return answer({ status: 413, body: { error: 'Input too large', reason: 'input_too_large' } });
  }

  // Claimed last: a request refused above has used none of the session's calls.
  const { data, error } = await supabase.rpc('claim_ai_session_call', {
    p_session_id: interview.charge.sessionId,
    p_kind:       'model',
  });
  if (error) {
    console.error(`${TAG} claim failed for ${interview.charge.sessionId}:`, error.message);
    return answer({ status: 500, body: { error: 'Session call failed', reason: 'session_failed' } });
  }
  const refusal = claimRefusal(firstRow(data));
  if (refusal) return answer(refusal);

  const saveReport = async (text: string): Promise<boolean> => {
    const report = parseFinalReport(text);
    if (!report) {
      console.error(`${TAG} interview ${interview.id}: no valid final report in the answer`);
      return false;
    }
    const { error: saveError } = await admin
      .from('interview_sessions')
      .update({ score: report.score, feedback_json: report })
      .eq('id', interview.id);
    if (saveError) {
      console.error(`${TAG} interview ${interview.id}: report not saved:`, saveError.message);
      return false;
    }
    return true;
  };

  let stream: ReadableStream<Uint8Array>;
  try {
    stream = await streamSessionTurn({
      admin,
      tag:          TAG,
      charge:       interview.charge,
      model:        catalogue.model,
      maxTokens:    catalogue.maxTokens,
      messages:     [{ role: 'system', content: systemPrompt }, ...messages],
      clientSignal: req.signal,
      onComplete:   turn.kind === 'final_report' ? saveReport : undefined,
      endReason:    turn.kind === 'final_report' ? 'completed' : undefined,
    });
  } catch (err) {
    if (isAiRefusal(err)) return answer(err.refusal);
    throw err;
  }

  return new Response(stream, {
    headers: {
      'Content-Type':           'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control':          'no-store',
    },
  });
}
