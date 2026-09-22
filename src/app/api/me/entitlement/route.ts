import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  autoApplyQuota,
  creditAllowance,
  creditBalance,
  featureMap,
  inboxMonthlyQuota,
  resolveTier,
  type CreditLimits,
  type EntitlementProfile,
} from '@/lib/entitlements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── GET /api/me/entitlement ──────────────────────────────────────────────────
//
// What the signed-in account is entitled to, as the server understands it: the
// tier, the balance, and the allowance that tier grants.
//
// The gauge used to show `creditsRemaining / 10` for everyone, because the
// number 10 was a constant in the browser bundle. It is right for a trial and
// wrong for every paying customer — a Premium account with 90 credits left of
// 111 was drawn as 900% full. The real allowance lives in admin_settings, which
// no client may read (its policy is service-role only), so it has to be handed
// down from here, by the same module the billing uses.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('subscription_plan, subscription_status, ai_credits_remaining, current_period_start, current_period_end, scheduled_plan, cancel_at_period_end, stripe_subscription_id, email_alias, is_blocked')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[me/entitlement] profile unreadable:', error.message);
    return NextResponse.json({ error: 'Could not read your account' }, { status: 503 });
  }

  const resolution = resolveTier((profile ?? null) as EntitlementProfile | null);
  const tier       = resolution.blocked ? 'free' : resolution.tier;

  // admin_settings and auto_apply_counters are service-role only: this is why
  // the answer comes from a route rather than from the browser reading them.
  let limits: CreditLimits | null = null;
  let autoApplyUsed = 0;
  let inboxUsed = 0;
  try {
    const admin = createAdminClient();
    const { data: settings } = await admin
      .from('admin_settings').select('value').eq('key', 'global').maybeSingle();
    limits = ((settings?.value as { limits?: CreditLimits } | null)?.limits) ?? null;

    // The key both counters are stored under is the period on the profile —
    // claim_auto_apply and claim_inbox_classification each read
    // coalesce(current_period_start, …)::date from that same row. This route
    // takes the value rather than recomputing it: a date computed here would
    // come from a clock running six seconds ahead of the database's, and on
    // the day a period turns over those six seconds are a different key and a
    // counter that reads zero while the real one is full.
    const periodKey = (profile?.current_period_start as string | null)?.slice(0, 10) ?? null;

    if (periodKey) {
      const { data: counter } = await admin
        .from('auto_apply_counters').select('count')
        .eq('user_id', user.id).eq('period_start', periodKey).maybeSingle();
      autoApplyUsed = typeof counter?.count === 'number' ? counter.count : 0;

      // The inbox month is keyed on the same period, scope 'month'.
      const { data: inboxCounter } = await admin
        .from('inbox_classify_counters').select('count')
        .eq('scope', 'month').eq('subject', user.id).eq('day', periodKey).maybeSingle();
      inboxUsed = typeof inboxCounter?.count === 'number' ? inboxCounter.count : 0;
    }
  } catch (err) {
    console.error('[me/entitlement] admin settings unreadable:', err);
  }

  return NextResponse.json({
    tier,
    blocked:          resolution.blocked,
    creditsRemaining: creditBalance((profile ?? null) as EntitlementProfile | null),
    // null means "not configured" — never "unlimited". The gauge shows the
    // balance alone rather than inventing a denominator.
    creditsTotal:     creditAllowance(tier, limits),
    // The end of the billing period in force: one date for the credits, the
    // application quota and the inbox month. ai_credits_reset_at was a second
    // answer to the same question, written by nothing and read only here.
    creditsResetAt:   (profile?.current_period_end as string | null) ?? null,
    // What this plan unlocks, decided by the one table. The browser holds no
    // copy of it: it draws what this says.
    features:         featureMap(tier),
    // Automatic applications: their own counter, never the credit balance.
    autoApply: {
      used:  autoApplyUsed,
      quota: autoApplyQuota(tier, limits),
    },
    // The inbox month, for the Free plan's counter. 'unlimited' on a paid plan
    // means no MONTHLY ceiling — the 25-a-day alias cap still applies.
    inbox: {
      used:  inboxUsed,
      quota: inboxMonthlyQuota(tier, limits),
    },
    // What the screens need to tell the truth about a subscription's state:
    // a payment Stripe is retrying, and a downgrade or cancellation already
    // booked for the end of the period.
    subscriptionStatus: (profile?.subscription_status as string | null) ?? null,
    scheduledPlan:      (profile?.scheduled_plan as string | null) ?? null,
    cancelAtPeriodEnd:  Boolean(profile?.cancel_at_period_end),
    hasSubscription:    Boolean(profile?.stripe_subscription_id),
    // The address that makes the Free plan worth having.
    emailAlias:         (profile?.email_alias as string | null) ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
