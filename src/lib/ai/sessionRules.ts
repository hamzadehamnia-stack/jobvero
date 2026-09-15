// ─── AI session rules ─────────────────────────────────────────────────────────
//
// The decisions the session routes (chat, interview) take, kept pure so they
// are tested directly:
//   node security-tests/aiSessionRules.test.mjs
//
// Type imports only, which Node's type stripping erases entirely.

import type { AiRefusal } from './rules';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A session id as a client sends it: a UUID, or null. */
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
