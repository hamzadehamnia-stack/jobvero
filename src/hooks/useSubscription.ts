'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { FeatureKey, Tier } from '@/lib/entitlements';

// ─── Types ────────────────────────────────────────────────────────────────────

// What GET /api/me/entitlement answers.
//
// The browser holds no copy of the feature table. It used to: this hook
// imported FEATURES from a second table that granted a Free account the
// assistant while the server refused it, and indexed a 'starter' column that
// table never had — which hid every feature from a paying Starter customer.
// The server decides; this asks. A type import carries no decision, so `Tier`
// and `FeatureKey` come from the source and stay in step with it.
interface Entitlement {
  tier:             Tier;
  blocked:          boolean;
  creditsRemaining: number;
  creditsTotal:     number | null;
  creditsResetAt:   string | null;
  /** What this tier unlocks, as the server reads its own table. */
  features:         Record<FeatureKey, boolean>;
  /** Automatic applications: spent this month, and the plan's monthly quota. */
  autoApply:        { used: number; quota: number | null };
}

export interface SubscriptionState {
  /** The plan, as stored: 'free' | 'pro' | 'premium'. Free is permanent. */
  plan: Tier;
  /** Same thing, kept under its old name for the screens that read it. */
  effectiveTier: Tier;
  creditsRemaining: number;
  /** The tier's monthly allowance. null when it is not configured. */
  creditsTotal:     number | null;
  creditsResetAt:  Date | null;
  /** Automatic applications used this month, and the quota. */
  autoApplyUsed:   number;
  autoApplyQuota:  number | null;
  isLoading: boolean;
  /**
   * Whether the plan includes a feature, as the server says. NOT a substitute
   * for the server's own check: use it to show or hide, never to allow.
   * Credits are not part of this answer — what an action costs lives in
   * ai_action_costs and is enforced when it is charged.
   */
  canUse: (feature: FeatureKey) => boolean;
  /** Re-fetch from the server */
  refresh: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSubscription(): SubscriptionState {
  const supabase    = useMemo(() => createClient(), []);
  const [state,     setState]     = useState<Entitlement | null>(null);
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
  const creditsRemaining    = state?.creditsRemaining ?? 0;
  const creditsResetAt      = state?.creditsResetAt ? new Date(state.creditsResetAt) : null;
  const features            = state?.features ?? null;

  const canUse = useCallback(
    (feature: FeatureKey): boolean => features?.[feature] === true,
    [features],
  );

  return {
    plan: effectiveTier,
    effectiveTier,
    creditsRemaining,
    creditsTotal:   state?.creditsTotal ?? null,
    creditsResetAt,
    autoApplyUsed:  state?.autoApply?.used  ?? 0,
    autoApplyQuota: state?.autoApply?.quota ?? null,
    isLoading,
    canUse,
    refresh: fetchEntitlement,
  };
}
