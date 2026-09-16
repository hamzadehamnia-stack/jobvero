'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FEATURES, type FeatureKey, type Tier } from '@/lib/subscription/features';
import { toFeatureTierKey } from '@/lib/subscription/access';

// ─── Types ────────────────────────────────────────────────────────────────────

// What GET /api/me/entitlement answers. The server resolves the tier and reads
// the allowance from admin_settings, which the browser cannot read itself.
interface Entitlement {
  tier:             Tier;
  blocked:          boolean;
  creditsRemaining: number;
  creditsTotal:     number | null;
  creditsResetAt:   string | null;
  trialEndsAt:      string | null;
}

export interface SubscriptionState {
  /** Raw plan stored in DB: 'trial' | 'pro' | 'premium' */
  plan: 'trial' | 'pro' | 'premium';
  /**
   * Computed tier after checking trial expiry and subscription status:
   * - 'trial'   → active trial (pro-level access)
   * - 'free'    → trial expired (restricted access)
   * - 'starter' | 'pro' | 'premium' → paid
   */
  effectiveTier: Tier;
  trialEndsAt:     Date | null;
  /** Days left in trial — 0 if expired, -1 if on a paid plan */
  trialDaysLeft:   number;
  creditsRemaining: number;
  /** The tier's monthly allowance. null when it is not configured. */
  creditsTotal:     number | null;
  creditsResetAt:  Date | null;
  isLoading: boolean;
  /**
   * Client-side quick check. NOT authoritative — the server still validates.
   * Use this to show or hide UI, never to enforce access.
   */
  canUse: (feature: FeatureKey) => boolean;
  /** Re-fetch from the server */
  refresh: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSubscription(): SubscriptionState {
  const supabase    = useMemo(() => createClient(), []);
  const [state,     setState]     = useState<Entitlement | null>(null);
  const [plan,      setPlan]      = useState<'trial' | 'pro' | 'premium'>('trial');
  const [isLoading, setIsLoading] = useState(true);
  const [userId,    setUserId]    = useState<string | null>(null);

  const channelRef    = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const inProgressRef = useRef(false); // prevents concurrent duplicate fetches
  const mountedRef    = useRef(true);  // guards setState calls after unmount

  const fetchEntitlement = useCallback(async () => {
    if (inProgressRef.current) return;
    inProgressRef.current = true;
    if (mountedRef.current) setIsLoading(true);

    try {
      // getSession() reads the local cache instead of making a network request —
      // avoids the IndexedDB lock conflicts concurrent getUser() calls cause.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || !mountedRef.current) return;
      setUserId(session.user.id);

      const res = await fetch('/api/me/entitlement', { cache: 'no-store' });
      if (!res.ok) return;
      const entitlement = (await res.json()) as Entitlement;
      if (!mountedRef.current) return;

      setState(entitlement);
      // The raw plan, for screens that label it. A trial resolves to 'trial'.
      setPlan(
        entitlement.tier === 'pro' || entitlement.tier === 'premium'
          ? entitlement.tier
          : 'trial',
      );
    } finally {
      inProgressRef.current = false;
      if (mountedRef.current) setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    mountedRef.current = true;
    fetchEntitlement();
    return () => { mountedRef.current = false; };
  }, [fetchEntitlement]);

  // ── Realtime: re-fetch whenever the profiles row changes ────────────────
  useEffect(() => {
    if (!userId) return;

    const channelName = `credit-gauge-${userId}`;
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);

    if (!existing) {
      channelRef.current = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
          () => { fetchEntitlement(); },
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
  }, [userId, supabase, fetchEntitlement]);

  // ── Derived values ──────────────────────────────────────────────────────

  const effectiveTier: Tier = state?.tier ?? 'free';
  const trialEndsAt = state?.trialEndsAt ? new Date(state.trialEndsAt) : null;

  const trialDaysLeft = (() => {
    if (effectiveTier !== 'trial') return -1;
    if (!trialEndsAt) return 0;
    const diff = trialEndsAt.getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  const creditsRemaining = state?.creditsRemaining ?? 0;
  const creditsResetAt   = state?.creditsResetAt ? new Date(state.creditsResetAt) : null;

  // ── canUse (client-side quick gate) ────────────────────────────────────

  const canUse = useCallback(
    (feature: FeatureKey): boolean => {
      const config = FEATURES[feature][toFeatureTierKey(effectiveTier as never)];
      if (!config?.access) return false;

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
    creditsTotal: state?.creditsTotal ?? null,
    creditsResetAt,
    isLoading,
    canUse,
    refresh: fetchEntitlement,
  };
}
