import type Stripe from 'stripe';

// ─── What a Stripe subscription actually says, in one place ──────────────────
//
// WHY THIS MODULE EXISTS
//
// A customer cancelled Jobvero Pro in the billing portal on 2026-09-22. Stripe
// recorded it correctly. The application did not notice, and went on telling
// them their subscription was running — because the webhook read one field,
// `cancel_at_period_end`, and in API version 2026-04-22.dahlia a cancellation
// booked from the portal does not set it. Stripe expresses it as:
//
//     cancel_at            = 2026-10-22 10:06:00Z   (when it stops)
//     canceled_at          = 2026-09-22 12:46:52Z   (when they asked)
//     cancel_at_period_end = false                  ← still false
//
// The same version also moved the billing period off the subscription object.
// `'current_period_end' in subscription` is now **false**: the period lives on
// the subscription ITEM, at items.data[0].current_period_start / _end. The old
// read returned undefined and silently stopped refreshing the term.
//
// Two fields moved, and two separate behaviours broke, because four field reads
// were scattered through a switch statement. So: every question about a
// subscription's period, its status and its cancellation is answered here, and
// security-tests/stripeFields.test.js fails the build if those fields are read
// anywhere else under src/.
//
// READING DEFENSIVELY IS DELIBERATE. Both shapes are accepted — the item-level
// period and the legacy top-level one, `cancel_at` and `cancel_at_period_end` —
// because a webhook endpoint receives whatever version created the event, and
// an old event replayed from the dashboard must still be understood.

export interface SubscriptionState {
  /** Stripe's own status: active, past_due, canceled, incomplete, … */
  status: string;
  /** Start of the term being billed, ISO 8601, or null if Stripe sent none. */
  periodStart: string | null;
  /** End of that term, ISO 8601. This is the date the credits refill. */
  periodEnd: string | null;
  /**
   * Whether an end has been booked. True for BOTH spellings: a `cancel_at`
   * timestamp (current) or `cancel_at_period_end: true` (legacy).
   */
  cancellationScheduled: boolean;
  /**
   * When it stops: `cancel_at` when Stripe gave one, otherwise the end of the
   * period. Null when nothing is booked.
   */
  cancellationEffectiveAt: string | null;
}

/** Unix seconds → ISO, or null for anything that is not a usable timestamp. */
function iso(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? new Date(value * 1000).toISOString()
    : null;
}

/**
 * The one reader. Give it a subscription object from any API version and it
 * answers the three questions the application actually asks.
 *
 * The cast is intentional: the SDK's types describe one version, and this code
 * has to survive the one the event was created under.
 */
export function readSubscriptionState(subscription: Stripe.Subscription): SubscriptionState {
  const raw = subscription as unknown as {
    status?:               string;
    cancel_at?:            number | null;
    cancel_at_period_end?: boolean | null;
    current_period_start?: number | null;
    current_period_end?:   number | null;
    items?: {
      data?: Array<{
        current_period_start?: number | null;
        current_period_end?:   number | null;
      }>;
    };
  };

  const item = raw.items?.data?.[0];

  // The item first — that is where the period lives now. The top-level fields
  // are the fallback for events created under an older version.
  const periodStart = iso(item?.current_period_start) ?? iso(raw.current_period_start);
  const periodEnd   = iso(item?.current_period_end)   ?? iso(raw.current_period_end);

  const cancelAt = iso(raw.cancel_at);

  // Either spelling means the same thing to a customer: it ends.
  const cancellationScheduled = cancelAt !== null || raw.cancel_at_period_end === true;

  // An explicit cancel_at wins: when Stripe names the date, that is the date.
  // Without one, a cancel_at_period_end subscription stops at the period end.
  const cancellationEffectiveAt = cancellationScheduled ? (cancelAt ?? periodEnd) : null;

  return {
    status: raw.status ?? 'unknown',
    periodStart,
    periodEnd,
    cancellationScheduled,
    cancellationEffectiveAt,
  };
}
