import { createHmac } from 'crypto';
import { timingSafeCompare } from '@/lib/timingSafe';

// ─── Authenticity of the inbound email webhook ────────────────────────────────
//
// Cloudflare Email Routing signs nothing: the caller is our own Worker
// (cloudflare-email-worker/), so the signature is ours to make. It signs
// `${timestamp}.${rawBody}` with INBOX_SIGNING_SECRET, HMAC-SHA256, and sends
//   X-Inbox-Timestamp: <unix seconds>
//   X-Inbox-Signature: v1=<hex>
// which binds the body to the secret — a captured request cannot be replayed an
// hour later, nor its body edited on the way.
//
// Two secrets, not one. INBOX_SIGNING_SECRET is the HMAC key; the older
// INBOX_WEBHOOK_SECRET is the bearer token of the transition, sent in
// X-Webhook-Secret. Signing with the bearer token would mean one leak costs
// both, and would make it impossible to rotate one without the other. Neither
// is ever NEXT_PUBLIC_.
//
// Transition, decided 2026-09-16: until the Worker is redeployed, a request
// carrying the shared secret alone is still accepted — and the route logs it
// every time, so the day that line stops appearing is the day the door can be
// closed with INBOX_REQUIRE_SIGNATURE=true.
//
// Pure on purpose: the clock, the headers and both secrets come in as arguments.

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
  /** INBOX_SIGNING_SECRET — the HMAC key. */
  signingSecret:     string | undefined;
  /** INBOX_WEBHOOK_SECRET — the bearer token of the transition. */
  webhookSecret:     string | undefined;
  requireSignature:  boolean;
  nowSeconds:        number;
  windowSeconds?:    number;
}): InboxAuthResult {
  // A deployment with no secret at all refuses everything rather than
  // accepting anything.
  if (!options.signingSecret && !options.webhookSecret) return refuse('no inbox secret is configured');

  if (options.signingSecret) {
    const signed = verifyInboxSignature({
      signature:     options.signature,
      timestamp:     options.timestamp,
      body:          options.body,
      secret:        options.signingSecret,
      nowSeconds:    options.nowSeconds,
      windowSeconds: options.windowSeconds,
    });
    if (signed.ok) return signed;

    // A request that brought a signature is judged on it alone: a bad signature
    // is never a reason to fall back on the shared secret.
    if (options.signature !== null || options.requireSignature) return signed;
  } else if (options.requireSignature) {
    return refuse('signatures are required but INBOX_SIGNING_SECRET is not set');
  } else if (options.signature !== null) {
    return refuse('a signature was sent but INBOX_SIGNING_SECRET is not set');
  }

  if (timingSafeCompare(options.sharedSecret, options.webhookSecret)) {
    return { ok: true, method: 'shared-secret', reason: null };
  }
  return refuse('no valid signature and no valid shared secret');
}
