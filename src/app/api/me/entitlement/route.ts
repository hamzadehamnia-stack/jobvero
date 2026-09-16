import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  creditAllowance,
  creditBalance,
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
    .select('subscription_plan, subscription_status, trial_ends_at, ai_credits_remaining, ai_credits_reset_at, is_blocked')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[me/entitlement] profile unreadable:', error.message);
    return NextResponse.json({ error: 'Could not read your account' }, { status: 503 });
  }

  const resolution = resolveTier((profile ?? null) as EntitlementProfile | null);
  const tier       = resolution.blocked ? 'free' : resolution.tier;

  // admin_settings is service-role only: this is why the answer comes from a
  // route rather than from the browser reading the table itself.
  let limits: CreditLimits | null = null;
  try {
    const admin = createAdminClient();
    const { data: settings } = await admin
      .from('admin_settings').select('value').eq('key', 'global').maybeSingle();
    limits = ((settings?.value as { limits?: CreditLimits } | null)?.limits) ?? null;
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
    creditsResetAt:   (profile?.ai_credits_reset_at as string | null) ?? null,
    trialEndsAt:      (profile?.trial_ends_at as string | null) ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
