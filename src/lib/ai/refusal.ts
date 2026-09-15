import { NextResponse } from 'next/server';
import type { AiRefusal } from './rules';

export const UNAVAILABLE:        AiRefusal = { status: 503, body: { error: 'Temporarily unavailable', reason: 'unavailable' } };
export const ACTION_UNAVAILABLE: AiRefusal = { status: 503, body: { error: 'This AI action is unavailable', reason: 'action_unavailable' } };

/** A refusal raised while an AI request is served (402, 409, 413, 502…): an answer, not an error. */
export class AiRefusalError extends Error {
  readonly refusal: AiRefusal;

  constructor(refusal: AiRefusal) {
    super(refusal.body.reason);
    this.name    = 'AiRefusalError';
    this.refusal = refusal;
  }
}

/**
 * True for a refusal raised by ai.complete or a session call. A route's catch
 * rethrows it instead of logging it: the wrapper sends the answer, and a
 * refusal is not an error.
 */
export function isAiRefusal(err: unknown): err is AiRefusalError {
  return err instanceof AiRefusalError;
}

export function answer(refusal: AiRefusal): Response {
  return NextResponse.json(refusal.body, {
    status:  refusal.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
