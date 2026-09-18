import type Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { priceIdForPlan, stripeClient, type PaidPlan } from '@/lib/stripe';

// ─── POST /api/webhooks/stripe ────────────────────────────────────────────────
//
// Where the money becomes credits. The order of the first three steps is the
// whole security of this route:
//
//   1. the SIGNATURE, against the raw body, before anything is parsed;
//   2. the EVENT ID, inserted into stripe_events, which refuses a replay;
//   3. only then, the database work.
//
// Stripe redelivers events — on a timeout, on a 500, and by hand from the
// dashboard. An invoice that granted credits twice would be a customer paying
// once for two months, so idempotency is not a nicety here: the insert is the
// gate, and a duplicate id never reaches the granting code.
//
// runtime = 'nodejs' and the raw text body: the signature is computed over the
// exact bytes Stripe sent, and any parsing or re-encoding before the check
// breaks it.
//
// Unknown events are logged and acknowledged. Answering 400 to an event type we
// do not handle would make Stripe retry it for days.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TAG = '[stripe/webhook]';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The plan a subscription is on, decided by the price id it carries and the
 * price ids this server configured. Never by anything the client could set:
 * metadata on a subscription can be written through the API, a price id in our
 * own environment cannot.
 */
function planFromSubscription(subscription: Stripe.Subscription): PaidPlan | null {
  const priceId = subscription.items?.data?.[0]?.price?.id;
  if (!priceId) return null;

  for (const plan of ['pro', 'premium'] as PaidPlan[]) {
    try {
      if (priceIdForPlan(plan) === priceId) return plan;
    } catch {
      // That plan has no price configured; it simply cannot be the match.
    }
  }
  return null;
}

/** The account a Stripe customer belongs to. */
async function userIdForCustomer(
  admin: ReturnType<typeof createAdminClient>,
  customerId: string | null | undefined,
  metadataUserId?: string | null,
): Promise<string | null> {
  if (metadataUserId) return metadataUserId;
  if (!customerId) return null;

  const { data } = await admin
    .from('profiles').select('id').eq('stripe_customer_id', customerId).maybeSingle();

  return (data?.id as string | undefined) ?? null;
}

const seconds = (value: unknown): string | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;

/**
 * The period an invoice paid for.
 *
 * Stripe moved the subscription and period fields around between API versions —
 * on some they sit on the invoice, on others under a line item or a parent
 * object. Reading defensively is not laziness: a version bump that silently
 * returned undefined dates would grant a period starting at 1970.
 */
function invoicePeriod(invoice: Stripe.Invoice): { start: string; end: string } | null {
  const line  = invoice.lines?.data?.[0] as unknown as { period?: { start?: number; end?: number } } | undefined;
  const raw   = invoice as unknown as { period_start?: number; period_end?: number };

  const start = seconds(line?.period?.start) ?? seconds(raw.period_start);
  const end   = seconds(line?.period?.end)   ?? seconds(raw.period_end);

  if (!start || !end || new Date(end) <= new Date(start)) return null;
  return { start, end };
}

/** The subscription id an invoice belongs to, across API shapes. */
function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const raw = invoice as unknown as {
    subscription?: string | { id?: string };
    parent?: { subscription_details?: { subscription?: string | { id?: string } } };
  };

  const candidate = raw.subscription ?? raw.parent?.subscription_details?.subscription;
  if (typeof candidate === 'string') return candidate;
  if (candidate && typeof candidate === 'object' && typeof candidate.id === 'string') return candidate.id;
  return null;
}

// ─── The route ────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error(`${TAG} STRIPE_WEBHOOK_SECRET is not configured`);
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    console.warn(`${TAG} refused: no signature header`);
    return NextResponse.json({ error: 'missing signature' }, { status: 400 });
  }

  // The raw bytes, untouched. Nothing below this line runs until the signature
  // over them checks out.
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    console.warn(`${TAG} refused: bad signature — ${String(err).slice(0, 200)}`);
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  const admin = createAdminClient();

  // The replay gate. A plain INSERT, and the primary key on stripe_events does
  // the work: the second delivery of an event raises 23505 and stops here,
  // before anything can be granted twice.
  //
  // Not an upsert with ignoreDuplicates: that reports what happened through a
  // row count whose meaning depends on the client, and a gate that opens when
  // a count comes back null is not a gate. A unique violation is unambiguous.
  const { error: seenError } = await admin
    .from('stripe_events')
    .insert({ id: event.id, type: event.type });

  if (seenError) {
    if (seenError.code === '23505') {
      console.log(`${TAG} ${event.type} ${event.id} already handled — ignored`);
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Unable to record it, so unable to tell a replay from a first delivery.
    // Acting would risk granting twice; 500 asks Stripe to send it again.
    console.error(`${TAG} event ledger unwritable for ${event.id}:`, seenError.message);
    return NextResponse.json({ error: 'could not record event' }, { status: 500 });
  }

  try {
    switch (event.type) {
      // ── The payment went through: bind the Stripe customer to the account ──
      case 'checkout.session.completed': {
        const session  = event.data.object as Stripe.Checkout.Session;
        const userId   = session.metadata?.supabase_user_id ?? session.client_reference_id ?? null;
        const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
        const subId    = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;

        if (!userId) {
          console.error(`${TAG} checkout.session.completed ${session.id} carries no account id`);
          break;
        }

        const { error } = await admin.from('profiles').update({
          stripe_customer_id:     customer,
          stripe_subscription_id: subId,
        }).eq('id', userId);

        if (error) console.error(`${TAG} could not bind customer for ${userId}:`, error.message);
        else console.log(`${TAG} customer ${customer} bound to ${userId}`);
        break;
      }

      // ── The month is paid: this is what grants the credits ─────────────────
      case 'invoice.paid': {
        const invoice  = event.data.object as Stripe.Invoice;
        const customer = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;
        const userId   = await userIdForCustomer(admin, customer);

        if (!userId) {
          console.error(`${TAG} invoice ${invoice.id} belongs to no known account (customer ${customer})`);
          break;
        }

        const period = invoicePeriod(invoice);
        if (!period) {
          console.error(`${TAG} invoice ${invoice.id} carries no usable period`);
          break;
        }

        // The invoice id is the grant key: Stripe can send this event as often
        // as it likes, and credit_grants will accept it once.
        const { data, error } = await admin.rpc('grant_period_credits', {
          p_user_id:      userId,
          p_grant_key:    `stripe:${invoice.id}`,
          p_period_start: period.start,
          p_period_end:   period.end,
        });

        if (error) console.error(`${TAG} grant failed for ${userId}:`, error.message);
        else {
          const row = Array.isArray(data) ? data[0] : data;
          console.log(`${TAG} invoice ${invoice.id} → ${userId}: granted=${row?.granted} reason=${row?.reason} credits=${row?.credits}`);
        }

        const subId = subscriptionIdOf(invoice);
        if (subId) {
          await admin.from('profiles').update({
            stripe_subscription_id: subId,
            subscription_status:    'active',
            current_period_end:     period.end,
          }).eq('id', userId);
        }
        break;
      }

      // ── The subscription changed: plan, status, or a cancellation booked ───
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer     = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? null;
        const userId       = await userIdForCustomer(admin, customer, subscription.metadata?.supabase_user_id);

        if (!userId) {
          console.error(`${TAG} subscription ${subscription.id} belongs to no known account`);
          break;
        }

        const plan = planFromSubscription(subscription);
        const raw  = subscription as unknown as { current_period_end?: number };

        // Stripe is the source of truth for the status and the term.
        const { error: stateError } = await admin.from('profiles').update({
          stripe_subscription_id: subscription.id,
          subscription_status:    subscription.status,
          cancel_at_period_end:   subscription.cancel_at_period_end ?? false,
          ...(seconds(raw.current_period_end) ? { current_period_end: seconds(raw.current_period_end) } : {}),
        }).eq('id', userId);
        if (stateError) console.error(`${TAG} state not written for ${userId}:`, stateError.message);

        // A cancellation booked in the portal is a downgrade to Free at the
        // term — the same path a downgrade takes, so nothing is taken back
        // before the month they paid for ends.
        if (subscription.cancel_at_period_end) {
          const { error } = await admin.rpc('apply_plan_change', { p_user_id: userId, p_new_plan: 'free' });
          if (error) console.error(`${TAG} cancellation not scheduled for ${userId}:`, error.message);
          else console.log(`${TAG} ${userId}: cancellation scheduled at the term`);
          break;
        }

        if (plan) {
          const { data, error } = await admin.rpc('apply_plan_change', { p_user_id: userId, p_new_plan: plan });
          if (error) console.error(`${TAG} plan change failed for ${userId}:`, error.message);
          else {
            const row = Array.isArray(data) ? data[0] : data;
            console.log(`${TAG} ${userId} → ${plan}: ${row?.outcome} (${row?.reason}), credits=${row?.credits}`);
          }
        } else {
          console.warn(`${TAG} subscription ${subscription.id} is on a price this server does not sell`);
        }
        break;
      }

      // ── Stripe ended it: the term has arrived ──────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer     = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? null;
        const userId       = await userIdForCustomer(admin, customer, subscription.metadata?.supabase_user_id);

        if (!userId) {
          console.error(`${TAG} deleted subscription ${subscription.id} belongs to no known account`);
          break;
        }

        // The account becomes Free and its period is marked over. The credits
        // are granted by renew_due_periods — the one path that grants a period,
        // already proven — rather than a second one written here.
        const { error: stateError } = await admin.from('profiles').update({
          subscription_plan:      'free',
          subscription_status:    null,
          scheduled_plan:         null,
          cancel_at_period_end:   false,
          stripe_subscription_id: null,
          current_period_end:     new Date().toISOString(),
        }).eq('id', userId);
        if (stateError) console.error(`${TAG} downgrade not written for ${userId}:`, stateError.message);

        const { data, error } = await admin.rpc('renew_due_periods', { p_limit: 1, p_user_ids: [userId] });
        if (error) console.error(`${TAG} free period not granted for ${userId}:`, error.message);
        else {
          const row = Array.isArray(data) ? data[0] : data;
          console.log(`${TAG} ${userId} back to Free: granted=${row?.granted} credits=${row?.credits}`);
        }
        break;
      }

      // ── The card was refused: Stripe starts retrying ───────────────────────
      case 'invoice.payment_failed': {
        const invoice  = event.data.object as Stripe.Invoice;
        const customer = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null;
        const userId   = await userIdForCustomer(admin, customer);

        if (!userId) {
          console.error(`${TAG} failed invoice ${invoice.id} belongs to no known account`);
          break;
        }

        // past_due keeps the access and grants nothing: the customer finishes
        // the month with what they have while Stripe retries.
        const { error } = await admin.from('profiles')
          .update({ subscription_status: 'past_due' }).eq('id', userId);

        if (error) console.error(`${TAG} past_due not written for ${userId}:`, error.message);
        else console.log(`${TAG} ${userId} is past_due — access kept, no new credits`);
        break;
      }

      default:
        console.log(`${TAG} ${event.type} ${event.id} — not handled, acknowledged`);
    }
  } catch (err) {
    // The event is already recorded, so Stripe's retry will be refused as a
    // duplicate. Answering 500 here would buy retries that cannot help; the
    // failure is logged loudly instead.
    console.error(`${TAG} handling ${event.type} ${event.id} failed: ${String(err)}`);
  }

  return NextResponse.json({ received: true });
}
