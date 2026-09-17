'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Zap, Crown, ChevronUp, RefreshCw } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';

// ─── Labels ───────────────────────────────────────────────────────────────────

const LABELS = {
  en: {
    aiCredits:   'AI Credits',
    remaining:   'remaining',
    resetOn:     'Resets on',
    daysLeft:    'days left in trial',
    trialExpired:'Trial expired',
    upgrade:     'Upgrade Plan',
    tier:        { trial: 'Trial', free: 'Free', pro: 'Pro', premium: 'Premium' },
  },
  fr: {
    aiCredits:   'Crédits IA',
    remaining:   'restants',
    resetOn:     'Recharge le',
    daysLeft:    'jours d\'essai restants',
    trialExpired:'Essai expiré',
    upgrade:     'Améliorer le plan',
    tier:        { trial: 'Essai', free: 'Gratuit', pro: 'Pro', premium: 'Premium' },
  },
  es: {
    aiCredits:   'Créditos IA',
    remaining:   'restantes',
    resetOn:     'Se reinicia el',
    daysLeft:    'días de prueba restantes',
    trialExpired:'Prueba expirada',
    upgrade:     'Mejorar plan',
    tier:        { trial: 'Prueba', free: 'Gratis', pro: 'Pro', premium: 'Premium' },
  },
  pt: {
    aiCredits:   'Créditos IA',
    remaining:   'restantes',
    resetOn:     'Recarrega em',
    daysLeft:    'dias de teste restantes',
    trialExpired:'Teste expirado',
    upgrade:     'Melhorar plano',
    tier:        { trial: 'Teste', free: 'Grátis', pro: 'Pro', premium: 'Premium' },
  },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(date: Date, locale: string): string {
  return date.toLocaleDateString(
    locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-PT' : 'en-US',
    { month: 'short', day: 'numeric' },
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreditGauge() {
  const pathname  = usePathname();
  const router    = useRouter();
  const rawLocale = pathname?.split('/')[1] ?? 'en';
  const locale    = (['en', 'fr', 'es', 'pt'] as const).includes(rawLocale as 'en')
    ? rawLocale as keyof typeof LABELS
    : 'en';

  const { effectiveTier, creditsRemaining, creditsTotal, creditsResetAt, isLoading } =
    useSubscription();
  const l = LABELS[locale];

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (isLoading) {
    return (
      <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl
        bg-gray-100 dark:bg-gray-800 animate-pulse w-36 h-9" />
    );
  }

  // No tier is unlimited: Premium has 111 credits a month like the others have
  // theirs. `creditsTotal` is null only when the allowance is not configured —
  // and then the gauge shows the balance alone rather than inventing a
  // denominator or drawing a bar against a number nobody set.
  const hasTotal = typeof creditsTotal === 'number' && creditsTotal > 0;
  const pct      = hasTotal ? Math.min(100, Math.round((creditsRemaining / creditsTotal) * 100)) : 0;
  const isLow    = hasTotal && pct <= 30;
  const isMid    = hasTotal && pct > 30 && pct <= 60;

  const barColor = isLow ? 'bg-red-400' : isMid ? 'bg-amber-400' : 'bg-violet-500';
  const zapColor = isLow ? 'text-red-400' : 'text-violet-500';

  const tierLabel = l.tier[effectiveTier] ?? l.tier.free;

  return (
    <div ref={ref} className="relative hidden sm:block">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl
          bg-gray-50 dark:bg-gray-800/80 border
          ${open
            ? 'border-violet-400 dark:border-violet-600'
            : 'border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700'
          }
          transition-colors duration-150 group`}
      >
        <Zap size={13} className={`flex-shrink-0 ${zapColor}`} />

        <div className="flex flex-col gap-0.5 min-w-[80px]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400 dark:text-gray-500 leading-none">
              {l.aiCredits}
            </span>
            <span className={`text-[10px] font-semibold leading-none ${isLow ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
              {hasTotal ? `${creditsRemaining}/${creditsTotal}` : creditsRemaining}
            </span>
          </div>
          {hasTotal && (
            <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden w-full">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>

        <ChevronUp
          size={11}
          className={`text-gray-400 transition-transform duration-200 ${open ? '' : 'rotate-180'}`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 z-50
          bg-white dark:bg-gray-900
          border border-gray-200 dark:border-gray-700
          rounded-2xl shadow-xl shadow-gray-200/60 dark:shadow-black/40
          overflow-hidden">

          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <Zap size={14} className={zapColor} />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {l.aiCredits}
                </span>
              </div>
              {/* Tier badge */}
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide
                ${effectiveTier === 'premium'
                  ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                  : effectiveTier === 'pro'
                  ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}>
                {tierLabel}
              </span>
            </div>

            {/* Big credit count */}
            <div className="flex items-baseline gap-1 mt-2">
              <span className={`text-2xl font-bold ${isLow ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
                {creditsRemaining}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {hasTotal ? `/ ${creditsTotal} ${l.remaining}` : l.remaining}
              </span>
            </div>

            {/* Progress bar — only against an allowance somebody actually set */}
            {hasTotal && (
              <div className="mt-2.5 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>

          {/* Footer info */}
          <div className="px-4 py-3 space-y-1.5">
            {/* No trial line: Free is a permanent plan with its own credits,
                not a countdown to a lockout. */}

            {/* Reset date */}
            {creditsResetAt && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                <RefreshCw size={11} />
                <span>{l.resetOn} {fmtDate(creditsResetAt, locale)}</span>
              </div>
            )}

            {/* Upgrade button */}
            {effectiveTier !== 'premium' && (
              <button
                onClick={() => { setOpen(false); router.push(`/${rawLocale}/pricing`); }}
                className="mt-2 w-full flex items-center justify-center gap-1.5
                  bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold
                  py-2 rounded-xl transition-colors duration-150"
              >
                <Crown size={12} />
                {l.upgrade}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
