import { createHmac } from 'crypto';
import { timingSafeCompare } from '@/lib/timingSafe';

// ─── Authenticity of the inbound email webhook ────────────────────────────────
//
// Cloudflare Email Routing signs nothing: the caller is our own Worker
// (cloudflare-email-worker/), so the signature is ours to make. It signs
// `${timestamp}.${rawBody}` with INBOX_WEBHOOK_SECRET, HMAC-SHA256, and sends
//   X-Inbox-Timestamp: <unix seconds>
//   X-Inbox-Signature: v1=<hex>
// which binds the body to the secret — a captured request cannot be replayed an
// hour later, nor its body edited on the way.
//
// Transition, decided 2026-09-16: until the Worker is redeployed, a request
// carrying the shared secret of old is still accepted. Setting
// INBOX_REQUIRE_SIGNATURE=true closes that door, and only the signature passes.
//
// Pure on purpose: the clock and the headers come in as arguments.

const WINDOW_SECONDS = 300;

export type InboxAuthMethod = 'signature' | 'shared-secret';

export interface InboxAuthResult {
  ok:      boolean;
  /** How the request proved itself, for the log. */
  method:  InboxAuthMethod | null;
  /** Why it did not, for the log. Never sent to the caller. */
  reason:  string | null;
}

const refuse = (reason: string): InboxAuthResult => ({ ok: false, method: null, reason });

export function verifyInboxSignature(options: {
  signature:      string | null;
  timestamp:      string | null;
  body:           string;
  secret:         string;
  nowSeconds:     number;
  windowSeconds?: number;
}): InboxAuthResult {
  const { signature, timestamp, body, secret, nowSeconds } = options;
  const window = options.windowSeconds ?? WINDOW_SECONDS;

  if (!signature || !timestamp) return refuse('no signature');

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return refuse('timestamp is not a number');
  if (Math.abs(nowSeconds - sent) > window) return refuse('timestamp outside its window');

  const [version, hex] = signature.split('=');
  if (version !== 'v1' || !hex) return refuse('signature format');

  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  if (!timingSafeCompare(hex, expected)) return refuse('signature does not match');

  return { ok: true, method: 'signature', reason: null };
}

/**
 * Whether a request to the inbound webhook is ours, and how it proved it.
 * Called on the raw body, before it is parsed and before anything is read from
 * the database or sent to a model.
 */
export function authorizeInboxWebhook(options: {
  signature:         string | null;
  timestamp:         string | null;
  sharedSecret:      string | null;
  body:              string;
  secret:            string | undefined;
  requireSignature:  boolean;
  nowSeconds:        number;
  windowSeconds?:    number;
}): InboxAuthResult {
  // A deployment with no secret configured refuses everything rather than
  // accepting anything.
  if (!options.secret) return refuse('INBOX_WEBHOOK_SECRET is not set');

  const signed = verifyInboxSignature({
    signature:     options.signature,
    timestamp:     options.timestamp,
    body:          options.body,
    secret:        options.secret,
    nowSeconds:    options.nowSeconds,
    windowSeconds: options.windowSeconds,
  });
  if (signed.ok) return signed;

  // A request that brought a signature is judged on it alone: a bad signature
  // is never a reason to fall back on the shared secret.
  if (options.signature !== null || options.requireSignature) return signed;

  if (timingSafeCompare(options.sharedSecret, options.secret)) {
    return { ok: true, method: 'shared-secret', reason: null };
  }
  return refuse('no valid signature and no valid shared secret');
}
