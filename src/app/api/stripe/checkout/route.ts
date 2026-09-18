import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPaidPlan, priceIdForPlan, safeOrigin, stripeClient } from '@/lib/stripe';

// ─── POST /api/stripe/checkout ────────────────────────────────────────────────
//
// Opens a Stripe Checkout session for the signed-in account.
//
// What the browser sends is a plan NAME. It does not send a price, an amount or
// a Stripe id, and nothing it sends is used to decide what is charged: the
// price comes from priceIdForPlan on this side. A route that accepted a price
// id from the client would sell Premium for whatever the client named.
//
// The identity comes from the session. There is no user id in the body to
// forge, and the Supabase id travels in the session's metadata so the webhook
// knows whose payment it is reading.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TAG = '[stripe/checkout]';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { plan?: unknown } | null;
  const plan = body?.plan;

  // Anything else in the body — a price id, an amount, a coupon — is read by
  // nothing. Only the plan name is looked at, and only these two are plans.
  if (!isPaidPlan(plan)) {
    return NextResponse.json(
      { error: 'Choose a plan: pro or premium', reason: 'invalid_plan' },
      { status: 400 },
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_customer_id, stripe_subscription_id, subscription_plan, subscription_status, full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error(`${TAG} profile unreadable:`, profileError.message);
    return NextResponse.json({ error: 'Could not read your account' }, { status: 503 });
  }

  // A second subscription would bill the same person twice for the same thing.
  // Changing plan is the portal's job, and Stripe prorates it properly there.
  const status = profile?.subscription_status ?? null;
  if (profile?.stripe_subscription_id && (status === 'active' || status === 'trialing' || status === 'past_due')) {
    return NextResponse.json(
      {
        error:  'You already have a subscription. Use the billing portal to change or cancel it.',
        reason: 'already_subscribed',
        portal: '/api/stripe/portal',
      },
      { status: 409 },
    );
  }

  try {
    const stripe = stripeClient();
    const origin = safeOrigin(request);

    // One Stripe customer per account, reused. Creating a second would split the
    // same person's payment history in two.
    let customerId = profile?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    user.email ?? undefined,
        name:     (profile?.full_name as string | null) ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      // Written with the service role: the client cannot write its own Stripe
      // columns, which is the point of the lockdown on profiles.
      const admin = createAdminClient();
      const { error: saveError } = await admin
        .from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
      if (saveError) console.error(`${TAG} customer id not saved:`, saveError.message);
    }

    const session = await stripe.checkout.sessions.create({
      mode:                 'subscription',
      customer:             customerId,
      line_items:           [{ price: priceIdForPlan(plan), quantity: 1 }],
      success_url:          `${origin}/en/dashboard?checkout=success`,
      cancel_url:           `${origin}/en/pricing?checkout=cancelled`,
      client_reference_id:  user.id,
      metadata:             { supabase_user_id: user.id, jobvero_plan: plan },
      // Carried onto the subscription itself, so every later event — an
      // invoice, an update, a cancellation — can be traced back to the account
      // without a lookup.
      subscription_data:    { metadata: { supabase_user_id: user.id, jobvero_plan: plan } },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      console.error(`${TAG} Stripe returned a session with no URL`);
      return NextResponse.json({ error: 'Checkout is unavailable' }, { status: 503 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error(`${TAG} ${String(err)}`);
    return NextResponse.json({ error: 'Checkout is unavailable' }, { status: 503 });
  }
}
