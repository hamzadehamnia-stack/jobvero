// ─── AI action rules ──────────────────────────────────────────────────────────
//
// The decisions withAiAction takes, kept pure so they are tested directly:
//   node security-tests/aiActionRules.test.mjs
//
// Type imports only, which Node's type stripping erases entirely.

import type { FeatureDecision, FeatureKey, PaidTier, Tier } from '../entitlements';

export interface AiRefusal {
  status: number;
  body: {
    error:      string;
    reason:     string;
    upgradeTo?: PaidTier | null;
  };
}

export type ReservationOutcome = 'charged' | 'in_progress' | 'already_processed';

/**
 * Reads what reserve_ai_credits returned. The model may be called only on
 * 'charged': a settled key was already served, and an in-flight duplicate
 * would pay one charge for two calls. Anything else is a bug, and throws
 * rather than letting the model run.
 */
export function reservationOutcome(row: { usage_status?: unknown; charged_now?: unknown }): ReservationOutcome {
  if (row.charged_now === true  && row.usage_status === 'reserved') return 'charged';
  if (row.charged_now === false && row.usage_status === 'reserved') return 'in_progress';
  if (row.charged_now === false && row.usage_status === 'settled')  return 'already_processed';
  throw new Error(`unexpected reservation row: ${JSON.stringify(row)}`);
}

/**
 * The answer to a feature the account cannot use, or null when it can.
 *
 * A free account is told its trial has ended — never "no credits". It may still
 * hold credits, and a reason that contradicts what the user sees reads as a bug.
 */
export function refusalForFeature(decision: FeatureDecision): AiRefusal | null {
  if (decision.allowed) return null;

  if (decision.reason === 'blocked') {
    return { status: 403, body: { error: 'Account blocked', reason: 'blocked' } };
  }

  return {
    status: 403,
    body: {
      error:     'Feature locked',
      reason:    decision.tier === 'free' ? 'trial_expired' : 'tier_locked',
      upgradeTo: decision.upgradeTo,
    },
  };
}

const NEXT_PAID_TIER: Record<PaidTier, PaidTier | null> = { starter: 'pro', pro: 'premium', premium: null };

/** Maps a JVxxx refusal from reserve_ai_credits to its HTTP answer. */
export function refusalForReserveError(
  code: string | null | undefined,
  context: { tier: Tier; cheapestTierForFeature: PaidTier | null },
): AiRefusal {
  switch (code) {
    case 'JV001':
      return { status: 401, body: { error: 'Unauthorized', reason: 'unauthorized' } };
    case 'JV002':
    case 'JV003':
      return { status: 503, body: { error: 'This AI action is unavailable', reason: 'action_unavailable' } };
    case 'JV004':
      return { status: 402, body: { error: 'Insufficient credits', reason: 'no_credits', upgradeTo: upgradeForCredits(context) } };
    case 'JV005':
      return { status: 403, body: { error: 'Account blocked', reason: 'blocked' } };
    case 'JV010':
      return { status: 400, body: { error: 'Invalid request', reason: 'invalid_request' } };
    default:
      return { status: 500, body: { error: 'Reservation failed', reason: 'reservation_failed' } };
  }
}

// Out of credits on a paid plan: the next plan up. On a trial: the cheapest
// plan that has the feature. Free never gets here — it is refused on the
// feature, before any reservation.
function upgradeForCredits(context: { tier: Tier; cheapestTierForFeature: PaidTier | null }): PaidTier | null {
  const { tier } = context;
  if (tier === 'starter' || tier === 'pro' || tier === 'premium') return NEXT_PAID_TIER[tier];
  return context.cheapestTierForFeature;
}

/**
 * Whether a request may make another upstream call. A request action is priced
 * for one call: a second — a retry loop added by mistake one day — would be paid
 * for nothing, silently. So the default is 1, and a route that genuinely needs
 * more declares maxCalls in its withAiAction config. An invalid maxCalls allows
 * nothing.
 */
export function mayCallModel(callsMade: number, maxCalls: number): boolean {
  if (!Number.isInteger(maxCalls) || maxCalls < 1) return false;
  return callsMade < maxCalls;
}

/**
 * Characters of text a request sends to the model, checked against the
 * action's max_input_chars before anything is charged. Non-text parts — a PDF
 * or an image passed as a document block — are not counted; the route bounds
 * them itself (cv_import caps the PDF page count).
 */
export function countInputChars(messages: ReadonlyArray<{ content: string | unknown[] }>): number {
  let total = 0;
  for (const message of messages) {
    if (typeof message.content === 'string') {
      total += message.content.length;
      continue;
    }
    for (const part of message.content) {
      if (typeof part !== 'object' || part === null) continue;
      const { type, text } = part as { type?: unknown; text?: unknown };
      if (type === 'text' && typeof text === 'string') total += text.length;
    }
  }
  return total;
}

// Visible ASCII, no spaces, at most 200 characters: the limit reserve_ai_credits
// enforces on the key.
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,200}$/;

/** The client's Idempotency-Key header, a fresh key when there is none, or null when it is malformed. */
export function readIdempotencyKey(header: string | null, generate: () => string): string | null {
  if (header === null || header === '') return generate();
  return IDEMPOTENCY_KEY.test(header) ? header : null;
}

export type FailureInjection = 'handler-throws' | 'error-response' | 'report-unreadable';

/**
 * The failure a test asks for with the X-AI-Test-Failure header, or null.
 *
 * Honoured only when NODE_ENV is 'development' or 'test' — an allowlist, so an
 * unset NODE_ENV honours nothing. Every Vercel deployment, preview included,
 * runs with NODE_ENV = 'production', and Next inlines the value at build time:
 * in a production bundle the branch that uses this is dead code.
 */
export function readFailureInjection(header: string | null, nodeEnv: string | undefined): FailureInjection | null {
  if (nodeEnv !== 'development' && nodeEnv !== 'test') return null;
  return header === 'handler-throws' || header === 'error-response' || header === 'report-unreadable' ? header : null;
}

// ─── Admin switches ───────────────────────────────────────────────────────────

/** The switches stored in admin_settings.global. A switch that was never set is on. */
export interface AdminSwitches {
  ai_enabled?: unknown;
  features?:   Record<string, unknown> | null;
}

/**
 * The admin toggle that turns each AI feature off: exactly one per feature, and
 * ai_enabled above all of them. A toggle the code does not read would be worse
 * than none — it would look like it works.
 */
export const FEATURE_SWITCH: Record<FeatureKey, string> = {
  AI_ASSISTANT_CHAT:  'assistant_chat',
  CV_BUILDER_AI:      'cv_builder',
  MODIFY_DOCUMENT_AI: 'modify_document',
  COVER_LETTER_AI:    'cover_letter',
  ATS_SCORE:          'ats_score',
  APPLY_WITH_AI:      'apply_with_ai',
  INTERVIEW_AI:       'interview_coach',
  AUTO_APPLY:         'auto_apply',
};

/** Whether an admin toggle is off. Only an explicit false turns it off. */
export function toggleOff(switches: AdminSwitches | null, key: string): boolean {
  return switches?.features?.[key] === false;
}

/** 503 when the AI kill switch or the feature's own toggle is off, else null. */
export function switchRefusal(switches: AdminSwitches | null, feature: FeatureKey): AiRefusal | null {
  if (switches?.ai_enabled === false) {
    return { status: 503, body: { error: 'AI features are temporarily disabled', reason: 'ai_disabled' } };
  }
  if (toggleOff(switches, FEATURE_SWITCH[feature])) {
    return { status: 503, body: { error: 'This feature is temporarily disabled', reason: 'feature_disabled' } };
  }
  return null;
}

/**
 * The switches a test forces off with the X-AI-Test-Switch-Off header: a
 * comma-separated list of ai_enabled and toggle keys. Same allowlist as
 * readFailureInjection — honoured only when NODE_ENV is development or test, so
 * a test can check the switches without turning a feature off for every user.
 */
export function readSwitchOverride(header: string | null, nodeEnv: string | undefined): string[] {
  if (nodeEnv !== 'development' && nodeEnv !== 'test') return [];
  if (!header) return [];
  return header.split(',').map((key) => key.trim()).filter((key) => /^[a-z_]{1,40}$/.test(key));
}

/** The switches, with the given keys forced off. */
export function withSwitchesOff(switches: AdminSwitches | null, keys: readonly string[]): AdminSwitches | null {
  if (keys.length === 0) return switches;
  const features: Record<string, unknown> = { ...(switches?.features ?? {}) };
  let aiEnabled = switches?.ai_enabled;
  for (const key of keys) {
    if (key === 'ai_enabled') aiEnabled = false;
    else features[key] = false;
  }
  return { ...switches, ai_enabled: aiEnabled, features };
}
