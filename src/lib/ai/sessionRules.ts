// ─── AI session rules ─────────────────────────────────────────────────────────
//
// The decisions the session routes (chat, interview) take, kept pure so they
// are tested directly:
//   node security-tests/aiSessionRules.test.mjs
//
// Type imports only, which Node's type stripping erases entirely.

import type { AiRefusal } from './rules';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A session or interview id as a client sends it: a UUID, or null. */
export function readSessionId(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

/**
 * The answer when claim_ai_session_call refuses a call, or null when it allows
 * it. A refused call means the session is over — closed, expired, out of calls
 * or at its cost ceiling. Anything unexpected is a 500, never an allowed call.
 */
export function claimRefusal(row: { allowed?: unknown; reason?: unknown } | null | undefined): AiRefusal | null {
  if (row?.allowed === true) return null;

  switch (row?.reason) {
    case 'closed':
    case 'expired':
    case 'call_limit':
    case 'cost_limit':
      return { status: 409, body: { error: 'This session has ended', reason: `session_${row.reason}` } };
    default:
      return { status: 500, body: { error: 'Session call failed', reason: 'session_failed' } };
  }
}

export interface HistoryMessage {
  role:    'user' | 'assistant';
  content: string;
}

/**
 * A conversation as a client sends it: user and assistant messages only, none
 * empty, at most maxMessages, the last one the user's. Anything else in a
 * message — a model name, a system role — is dropped or refused, never used.
 */
export function readHistory(value: unknown, maxMessages: number): HistoryMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxMessages) return null;

  const messages: HistoryMessage[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const { role, content } = item as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') return null;
    if (typeof content !== 'string' || content.trim() === '') return null;
    messages.push({ role, content });
  }

  return messages[messages.length - 1].role === 'user' ? messages : null;
}

/**
 * The most recent messages that fit in a budget of characters, the oldest
 * dropped first; null when the last message alone does not fit. A long
 * conversation gives the model a shorter memory rather than refusing the user.
 */
export function fitHistory<T extends { content: string }>(messages: readonly T[], budget: number): T[] | null {
  let used  = 0;
  let first = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    const size = messages[i].content.length;
    if (used + size > budget) break;
    used += size;
    first = i;
  }

  return first < messages.length ? messages.slice(first) : null;
}


// ─── Interview ────────────────────────────────────────────────────────────────

export const INTERVIEW_QUESTIONS = 8;

const INTERVIEW_TYPES     = ['Mixed (recommended)', 'Behavioral', 'Technical', 'HR/Motivation'];
const INTERVIEW_LEVELS    = ['Junior', 'Mid-level', 'Senior'];
const INTERVIEW_LANGUAGES = ['en', 'fr', 'es', 'pt'];

export interface InterviewSettings {
  jobDescription: string | null;
  interviewType:  string;
  difficulty:     string;
  language:       string;
}

/** The settings a client sends to start an interview, or null when one of them is not recognised. */
export function readInterviewSettings(value: unknown): InterviewSettings | null {
  if (typeof value !== 'object' || value === null) return null;
  const { jobDescription, interviewType, difficulty, language } = value as Record<string, unknown>;

  if (typeof interviewType !== 'string' || !INTERVIEW_TYPES.includes(interviewType)) return null;
  if (typeof difficulty !== 'string' || !INTERVIEW_LEVELS.includes(difficulty)) return null;
  if (typeof language !== 'string' || !INTERVIEW_LANGUAGES.includes(language)) return null;
  if (jobDescription !== undefined && jobDescription !== null && typeof jobDescription !== 'string') return null;

  const job = typeof jobDescription === 'string' ? jobDescription.trim() : '';
  return { jobDescription: job === '' ? null : job, interviewType, difficulty, language };
}

export type InterviewTurn =
  | { kind: 'first_question' }
  | { kind: 'next_question'; question: number }
  | { kind: 'final_report' }
  | { kind: 'complete' };

/**
 * What the model is asked for, from the turns the session has completed —
 * counted on the server, never taken from the client: the first question, then
 * feedback and the next question after each answer, then the final report.
 */
export function interviewTurn(turnsCompleted: number, totalQuestions: number): InterviewTurn {
  if (!Number.isInteger(turnsCompleted) || turnsCompleted < 0) return { kind: 'complete' };
  if (turnsCompleted === 0) return { kind: 'first_question' };
  if (turnsCompleted < totalQuestions) return { kind: 'next_question', question: turnsCompleted + 1 };
  if (turnsCompleted === totalQuestions) return { kind: 'final_report' };
  return { kind: 'complete' };
}

export interface FinalReport {
  score:        number;
  strengths:    string[];
  improvements: string[];
  tips:         string[];
}

const REPORT_MARKER = 'FINAL_REPORT:';

/**
 * The report the model wrote after FINAL_REPORT:, or null when there is none
 * that holds together. The score is rounded and kept within 0–100.
 */
export function parseFinalReport(text: string): FinalReport | null {
  const at = text.lastIndexOf(REPORT_MARKER);
  if (at === -1) return null;

  const rest  = text.slice(at + REPORT_MARKER.length);
  const start = rest.indexOf('{');
  const end   = rest.lastIndexOf('}');
  if (start === -1 || end < start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rest.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const { score, strengths, improvements, tips } = parsed as Record<string, unknown>;
  const list = (value: unknown): string[] | null =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : null;

  const strengthList    = list(strengths);
  const improvementList = list(improvements);
  const tipList         = list(tips);
  if (typeof score !== 'number' || !Number.isFinite(score) || !strengthList || !improvementList || !tipList) return null;

  return {
    score:        Math.round(Math.min(100, Math.max(0, score))),
    strengths:    strengthList,
    improvements: improvementList,
    tips:         tipList,
  };
}


// ─── Catalogue limits ─────────────────────────────────────────────────────────

/** A string in an action's limits, at a path such as models.tts or tts_voices.en; null when absent. */
export function limitString(limits: Record<string, unknown>, ...path: string[]): string | null {
  let value: unknown = limits;
  for (const key of path) {
    if (typeof value !== 'object' || value === null) return null;
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === 'string' && value !== '' ? value : null;
}

/** A positive integer in an action's limits; null when absent or not one. */
export function limitInteger(limits: Record<string, unknown>, key: string): number | null {
  const value = limits[key];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}
