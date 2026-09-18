import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeOrigin, stripeClient } from '@/lib/stripe';

// ─── POST /api/stripe/portal ──────────────────────────────────────────────────
//
// Opens Stripe's own billing portal for the signed-in account: change card,
// change plan, cancel. Everything the customer does there comes back as a
// webhook, so the portal and this application never disagree about what was
// bought — and nobody has to handle a card change by hand.
//
// The customer id comes from the account's own row, never from the request.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TAG = '[stripe/portal]';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error(`${TAG} profile unreadable:`, profileError.message);
    return NextResponse.json({ error: 'Could not read your account' }, { status: 503 });
  }

  // No customer means nothing was ever bought: there is no billing to manage,
  // and sending them to an empty portal would be a dead end.
  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No subscription to manage yet', reason: 'no_customer' },
      { status: 404 },
    );
  }

  try {
    const stripe  = stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer:   profile.stripe_customer_id as string,
      return_url: `${safeOrigin(request)}/en/dashboard`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error(`${TAG} ${String(err)}`);
    return NextResponse.json({ error: 'The billing portal is unavailable' }, { status: 503 });
  }
}
