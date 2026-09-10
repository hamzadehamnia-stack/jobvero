import { createHash, createHmac } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

// ─── Rate limiting ────────────────────────────────────────────────────────────
//
// Counters live in api_rate_limits and are moved by the check_rate_limit RPC
// (see 20260910_api_rate_limits.sql), which does the window reset and the
// increment in one atomic statement. Everything here is key derivation, the
// call, and the failure policy.

export interface RateLimitWindow {
  /** Window length in seconds. */
  seconds: number;
  /** Maximum hits allowed inside one window. */
  max: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Seconds until the caller may retry. Only meaningful when denied. */
  retryAfter: number;
}

// ─── IP handling ──────────────────────────────────────────────────────────────

// Vercel sets x-forwarded-for on every inbound request and rewrites it, so the
// left-most entry is the real client for requests that reach us through the
// platform edge. It is still caller-supplied data in principle: a spoofed value
// can only ever split an attacker's own bucket into several, never merge into
// or evict someone else's, because the value is hashed into the key rather than
// trusted for identity.
function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || null;
}

const IP_SALT = process.env.RATE_LIMIT_IP_SALT;

let saltWarningLogged = false;

function warnOnceAboutSalt(): void {
  if (saltWarningLogged) return;
  saltWarningLogged = true;
  console.warn(
    '[rateLimit] RATE_LIMIT_IP_SALT is not set. IP-keyed buckets fall back to an ' +
    'unsalted SHA-256, which is reversible for IPv4 by exhaustive search — the ' +
    'whole address space is only ~4 billion hashes. Rate limiting still works, ' +
    'but stored hashes should not be treated as anonymised until the variable ' +
    'is configured.',
  );
}

// IP addresses are personal data, and this table is queried by operators, so the
// raw address is never written. HMAC with a dedicated secret when one exists.
//
// The salt is deliberately NOT allowed to fall back to another secret such as
// the service-role key: sharing one secret across two purposes means neither
// can be rotated without breaking the other.
function hashIp(ip: string): string {
  if (IP_SALT) return createHmac('sha256', IP_SALT).update(ip).digest('hex').slice(0, 32);
  warnOnceAboutSalt();
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

// ─── Key derivation ───────────────────────────────────────────────────────────
//
// A signed-in caller is keyed by user id, so rotating IP addresses does not
// reset the budget. Anonymous callers fall back to the hashed IP. The route
// name is part of the key so one route's budget never drains another's.

export function rateLimitKey(routeName: string, userId: string | null, req: Request): string | null {
  if (userId) return `${routeName}:u:${userId}`;

  const ip = clientIp(req);
  if (!ip) return null;   // no identity to key on — see enforceRateLimit
  return `${routeName}:ip:${hashIp(ip)}`;
}

// ─── Enforcement ──────────────────────────────────────────────────────────────

/**
 * Count one hit and report the decision.
 *
 * Fails open. A rate limiter is a cost control, not an authentication control:
 * if Supabase is unreachable the correct behaviour is to serve the request and
 * shout in the logs, not to take the whole site down. The residual risk is that
 * an attacker who can break the database bypasses the limits — but the same
 * outage already denies every route that reads a profile, so there is little
 * left to protect at that point.
 *
 * Note this is the opposite policy to the credits check in
 * lib/subscription/access.ts, which fails CLOSED: a database it cannot read
 * resolves to the free tier with zero credits, and every free-tier feature
 * costs at least one credit. Paid features therefore stay shut during an
 * outage; only the unmetered routes this limiter guards stay open.
 */
export async function enforceRateLimit(
  key: string | null,
  windows: RateLimitWindow[],
): Promise<RateLimitDecision> {
  if (!key) {
    // No user session and no usable IP header. Rather than invent a shared
    // bucket that every such caller would collide in, let the request through —
    // the route's own auth check is the gate that matters.
    console.warn('[rateLimit] no identity available for request; skipping');
    return { allowed: true, retryAfter: 0 };
  }

  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key:    key,
      p_limits: windows.map((w) => ({ w: w.seconds, n: w.max })),
    });

    if (error) {
      console.error('[rateLimit] check_rate_limit failed, allowing request:', error.message);
      return { allowed: true, retryAfter: 0 };
    }

    // The function returns a single row; supabase-js surfaces it as an array.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.allowed !== 'boolean') {
      console.error('[rateLimit] unexpected check_rate_limit payload, allowing request');
      return { allowed: true, retryAfter: 0 };
    }

    return {
      allowed:    row.allowed,
      retryAfter: Number(row.retry_after) || 1,
    };
  } catch (err) {
    console.error('[rateLimit] unavailable, allowing request:', err);
    return { allowed: true, retryAfter: 0 };
  }
}

/** 429 with the headers a well-behaved client needs to back off. */
export function tooManyRequests(retryAfter: number): Response {
  return Response.json(
    {
      error:      'Too many requests',
      reason:     'rate_limited',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, Math.ceil(retryAfter))),
        // Do not let a 429 be cached and replayed to other callers.
        'Cache-Control': 'no-store',
      },
    },
  );
}
