import type { RateLimitWindow } from '@/lib/rateLimit';

// ─── Rate limit budgets ───────────────────────────────────────────────────────
//
// One source of truth for every throttled route, so the numbers can be reviewed
// and tuned in one place instead of being scattered across handlers.
//
// Two windows per route on purpose. The hourly ceiling stops a burst; the daily
// ceiling is what actually bounds spend, because an hourly limit alone
// multiplies by 24. Worked example for the interview coach: 100/hour is 2400
// calls/day, roughly 68 sessions, on the order of $60/day — about $1800/month
// from a single account. The daily cap cuts that by an order of magnitude.
//
// The limits are sized from the real call pattern, not guessed.
// InterviewCoachClient calls three of these routes once per conversational
// turn: speech-to-text to transcribe the answer, interview-coach for the reply,
// text-to-speech to speak it. A long session runs 30-40 turns, so anything
// tighter than a few hundred per day would cut a user off mid-interview.

export interface RouteRateLimit {
  /** Prefix for the bucket key; keep stable, changing it resets live counters. */
  name:    string;
  windows: RateLimitWindow[];
}

const HOUR = 3600;
const DAY  = 86400;

export const RATE_LIMITS = {
  // Claude vision over an upload of up to 5 MB. Uploading a CV is occasional;
  // 30/day still covers a user iterating hard on a document.
  PARSE_CV: {
    name: 'parse-cv',
    windows: [{ seconds: HOUR, max: 15 }, { seconds: DAY, max: 30 }],
  },

  // One call per conversational turn. 200/day is about five full sessions.
  INTERVIEW_COACH: {
    name: 'interview-coach',
    windows: [{ seconds: HOUR, max: 100 }, { seconds: DAY, max: 200 }],
  },

  // One call per turn, plus retries when a recording fails, so sized slightly
  // above the coach itself rather than equal to it.
  SPEECH_TO_TEXT: {
    name: 'speech-to-text',
    windows: [{ seconds: HOUR, max: 150 }, { seconds: DAY, max: 250 }],
  },

  // One call per turn while spoken replies are enabled. Capped independently of
  // the coach because it can be driven on its own, without a session.
  TEXT_TO_SPEECH: {
    name: 'text-to-speech',
    windows: [{ seconds: HOUR, max: 150 }, { seconds: DAY, max: 250 }],
  },

  // Each ticket sends two emails (admin + acknowledgement) from our domain, so
  // abuse here costs sender reputation, not just compute.
  SUPPORT: {
    name: 'support',
    windows: [{ seconds: HOUR, max: 5 }, { seconds: DAY, max: 10 }],
  },

  // Public and unauthenticated, keyed by hashed IP. Signing up once is the
  // normal case; the allowance is for genuine retries after a typo.
  WAITLIST: {
    name: 'waitlist',
    windows: [{ seconds: HOUR, max: 5 }, { seconds: DAY, max: 10 }],
  },

  // Every charged AI action behind withAiAction, one bucket per user across all
  // of them (brief §10.9). The hour is what bounds an account: 60. The minute
  // only smooths bursts, and is 10 rather than the brief's 5 — someone polishing
  // a CV fires bullet rewrites back to back, and would hit 5 in thirty seconds
  // on an action that costs half a cent. Credits bound the spend; keyed by user
  // id, one account behind a NAT never affects another.
  AI_ACTION: {
    name: 'ai-action',
    windows: [{ seconds: 60, max: 10 }, { seconds: HOUR, max: 60 }],
  },

  // The assistant chat, per message. AI_ACTION's numbers in a bucket of its own:
  // chatting must not use up the CV and letter actions' allowance, nor the
  // reverse. Credits bound the spend — one per conversation of 20 messages.
  AI_CHAT: {
    name: 'ai-chat',
    windows: [{ seconds: 60, max: 10 }, { seconds: HOUR, max: 60 }],
  },
} as const satisfies Record<string, RouteRateLimit>;

export type RateLimitKey = keyof typeof RATE_LIMITS;
