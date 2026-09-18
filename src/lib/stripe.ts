import Stripe from 'stripe';

// ─── The Stripe client, and the only place a plan becomes a price ─────────────
//
// Server-only. Nothing here may be imported by a client component: the secret
// key and the price mapping both live on this side of the wire.
//
// THE RULE THAT MATTERS: the browser sends a plan NAME — 'pro' or 'premium' —
// and never a price, an amount or a Stripe id. If the client could name the
// price, anyone could buy Premium for fifty cents by sending their own id.
// priceIdForPlan is the only translation, and it accepts nothing else.

export type PaidPlan = 'pro' | 'premium';

const PRICE_ENV: Record<PaidPlan, string> = {
  pro:     'STRIPE_PRICE_PRO',
  premium: 'STRIPE_PRICE_PREMIUM',
};

/**
 * The Stripe client.
 *
 * It refuses a live key unless STRIPE_ALLOW_LIVE is explicitly 'true'. Going
 * live is a decision someone takes on purpose, not something that happens
 * because a key was pasted into the wrong file — and every object this code
 * creates while the guard is on is a test object, which costs nobody anything.
 */
let client: Stripe | null = null;

export function stripeClient(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');

  if (key.startsWith('sk_live_') && process.env.STRIPE_ALLOW_LIVE !== 'true') {
    throw new Error(
      'refusing a live Stripe key: set STRIPE_ALLOW_LIVE=true to work against real money',
    );
  }

  // No apiVersion pinned here on purpose: the SDK major version already pins
  // one, and naming a different string is how a library and an account drift
  // apart silently.
  client = new Stripe(key);
  return client;
}

/**
 * The price a plan sells at. Server-side only, and the only mapping there is.
 *
 * Throws rather than returning null: a checkout that cannot name its price must
 * not fall through to a default, and a missing configuration is an outage to
 * fix, not a sale to make at the wrong amount.
 */
export function priceIdForPlan(plan: PaidPlan): string {
  const variable = PRICE_ENV[plan];
  if (!variable) throw new Error(`unknown plan: ${String(plan)}`);

  const priceId = process.env[variable];
  if (!priceId) throw new Error(`${variable} is not configured`);

  return priceId;
}

/** Whether a value sent by a client is one of the two plans that can be bought. */
export function isPaidPlan(value: unknown): value is PaidPlan {
  return value === 'pro' || value === 'premium';
}

/**
 * Where Stripe sends the customer back to.
 *
 * Taken from the request's own origin, checked against a list: an Origin header
 * is attacker-controlled, and a success URL built from it unchecked is an open
 * redirect with a payment attached. No environment variable for this — there is
 * none in this project yet, and inventing one silently is how a deployment ends
 * up redirecting to localhost.
 */
const ALLOWED_ORIGINS = [
  'https://getjobvero.com',
  'https://www.getjobvero.com',
  'http://localhost:3000',
  'http://localhost:3001',
];

export function safeOrigin(request: Request): string {
  const origin = request.headers.get('origin') ?? '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;

  // Not a recognised origin: fall back to the production site rather than
  // honouring whatever was sent.
  return ALLOWED_ORIGINS[0];
}
