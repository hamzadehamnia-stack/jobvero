'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  FEATURES,
  TIER_CREDITS_TOTAL,
  type FeatureKey,
  type Tier,
} from '@/lib/subscription/features';
import { getEffectiveTier, toFeatureTierKey } from '@/lib/subscription/access';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileRow {
  subscription_plan:    string | null;
  trial_ends_at:        string | null;
  ai_credits_remaining: number | null;
  ai_credits_reset_at:  string | null;
}

export interface SubscriptionState {
  /** Raw plan stored in DB: 'trial' | 'pro' | 'premium' */
  plan: 'trial' | 'pro' | 'premium';
  /**
   * Computed tier after checking trial expiry:
   * - 'trial'   → active trial (pro-level access)
   * - 'free'    → trial expired (restricted access)
   * - 'pro'     → paid pro
   * - 'premium' → paid premium
   */
  effectiveTier: Tier;
  trialEndsAt:     Date | null;
  /** Days left in trial — 0 if expired, -1 if on paid plan */
  trialDaysLeft:   number;
  creditsRemaining: number;
  creditsTotal:     number;
  creditsResetAt:  Date | null;
  isLoading: boolean;
  /**
   * Client-side quick check. NOT authoritative — server still validates.
   * Use this to show/hide UI elements, not to enforce access.
   */
  canUse: (feature: FeatureKey) => boolean;
  /** Re-fetch subscription data from Supabase */
  refresh: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSubscription(): SubscriptionState {
  const supabase    = useMemo(() => createClient(), []);
  const [profile,   setProfile]   = useState<ProfileRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userId,    setUserId]    = useState<string | null>(null);

  const channelRef    = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const inProgressRef = useRef(false); // prevents concurrent duplicate fetches
  const mountedRef    = useRef(true);  // guards setState calls after unmount

  const fetchProfile = useCallback(async () => {
    if (inProgressRef.current) return;
    inProgressRef.current = true;
    if (mountedRef.current) setIsLoading(true);

    try {
      // getSession() reads from local storage cache instead of making a network
      // request — avoids IndexedDB lock conflicts caused by concurrent getUser() calls.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || !mountedRef.current) return;

      const uid = session.user.id;
      if (mountedRef.current) setUserId(uid);

      const { data } = await supabase
        .from('profiles')
        .select('subscription_plan, trial_ends_at, ai_credits_remaining, ai_credits_reset_at')
        .eq('id', uid)
        .single();

      if (mountedRef.current) setProfile(data ?? null);
    } finally {
      inProgressRef.current = false;
      if (mountedRef.current) setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    mountedRef.current = true;
    fetchProfile();
    return () => { mountedRef.current = false; };
  }, [fetchProfile]);

  // ── Realtime: re-fetch whenever the profiles row changes ────────────────
  useEffect(() => {
    if (!userId) return;

    const channelName = `credit-gauge-${userId}`;

    // Only create a new channel if one with this name doesn't already exist
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (!existing) {
      channelRef.current = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event:  'UPDATE',
            schema: 'public',
            table:  'profiles',
            filter: `id=eq.${userId}`,
          },
          () => { fetchProfile(); },
        )
        .subscribe();
    } else {
      channelRef.current = existing;
    }

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, supabase, fetchProfile]);

  // ── Derived values ──────────────────────────────────────────────────────

  const plan = (profile?.subscription_plan ?? 'trial') as 'trial' | 'pro' | 'premium';
  const effectiveTier = getEffectiveTier(plan, profile?.trial_ends_at ?? null);

  const trialEndsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const trialDaysLeft = (() => {
    if (plan !== 'trial') return -1;
    if (!trialEndsAt) return 0;
    const diff = trialEndsAt.getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  const creditsRemaining = profile?.ai_credits_remaining ?? 0;
  const creditsResetAt   = profile?.ai_credits_reset_at ? new Date(profile.ai_credits_reset_at) : null;

  // ── canUse (client-side quick gate) ────────────────────────────────────

  const canUse = useCallback(
    (feature: FeatureKey): boolean => {
      const featureTierKey = toFeatureTierKey(effectiveTier);
      const config = FEATURES[feature][featureTierKey];

      if (!config.access) return false;

      // Check credits
      if ('credits' in config && typeof config.credits === 'number' && config.credits > 0) {
        return creditsRemaining >= config.credits;
      }

      return true;
    },
    [effectiveTier, creditsRemaining],
  );

  return {
    plan,
    effectiveTier,
    trialEndsAt,
    trialDaysLeft,
    creditsRemaining,
    creditsTotal: TIER_CREDITS_TOTAL,
    creditsResetAt,
    isLoading,
    canUse,
    refresh: fetchProfile,
  };
}
