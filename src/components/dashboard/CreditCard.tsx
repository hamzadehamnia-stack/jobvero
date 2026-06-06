'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Zap } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';

// ─── Labels ───────────────────────────────────────────────────────────────────

const LABELS = {
  en: {
    title:       'AI Credits',
    unlimited:   'Unlimited',
    resetOn:     'Resets',
    daysLeft:    'd trial left',
    trialExpired:'Trial expired',
    tier:        { trial: 'Trial', free: 'Free', pro: 'Pro', premium: 'Premium' },
  },
  fr: {
    title:       'Crédits IA',
    unlimited:   'Illimité',
    resetOn:     'Recharge',
    daysLeft:    'j d\'essai',
    trialExpired:'Essai expiré',
    tier:        { trial: 'Essai', free: 'Gratuit', pro: 'Pro', premium: 'Premium' },
  },
  es: {
    title:       'Créditos IA',
    unlimited:   'Ilimitado',
    resetOn:     'Reinicia',
    daysLeft:    'd prueba',
    trialExpired:'Prueba expirada',
    tier:        { trial: 'Prueba', free: 'Gratis', pro: 'Pro', premium: 'Premium' },
  },
  pt: {
    title:       'Créditos IA',
    unlimited:   'Ilimitado',
    resetOn:     'Recarrega',
    daysLeft:    'd teste',
    trialExpired:'Teste expirado',
    tier:        { trial: 'Teste', free: 'Grátis', pro: 'Pro', premium: 'Premium' },
  },
} as const;

function fmtDate(date: Date, locale: string): string {
  return date.toLocaleDateString(
    locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-PT' : 'en-US',
    { month: 'short', day: 'numeric' },
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreditCard() {
  const pathname  = usePathname();
  const router    = useRouter();
  const rawLocale = pathname?.split('/')[1] ?? 'en';
  const locale    = (['en', 'fr', 'es', 'pt'] as const).includes(rawLocale as 'en')
    ? rawLocale as keyof typeof LABELS
    : 'en';

  const {
    effectiveTier,
    creditsRemaining,
    creditsTotal,
    trialDaysLeft,
    creditsResetAt,
    isLoading,
  } = useSubscription();
  const l = LABELS[locale];

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200
        dark:border-gray-800 p-5 shadow-sm animate-pulse h-[118px]" />
    );
  }

  const isUnlimited = effectiveTier === 'premium';
  const pct         = isUnlimited ? 100 : Math.round((creditsRemaining / creditsTotal) * 100);
  const isLow       = !isUnlimited && pct <= 30;
  const isMid       = !isUnlimited && pct > 30 && pct <= 60;
  const tierLabel   = l.tier[effectiveTier] ?? l.tier.free;

  const barColor = isUnlimited ? 'bg-amber-400'
    : isLow  ? 'bg-red-400'
    : isMid  ? 'bg-amber-400'
    :           'bg-violet-500';

  const iconBg    = isUnlimited ? 'bg-amber-50 dark:bg-amber-950/40'
    : isLow  ? 'bg-red-50 dark:bg-red-950/40'
    :           'bg-violet-50 dark:bg-violet-950/40';

  const iconColor = isUnlimited ? 'text-amber-500'
    : isLow  ? 'text-red-400'
    :           'text-violet-500';

  const tierBadgeColor = {
    premium: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
    pro:     'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400',
    trial:   'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400',
    free:    'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  }[effectiveTier] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400';

  // Tiny footer text: "7d trial left" | "Resets May 14" | "Trial expired"
  const footerText = (() => {
    if (effectiveTier === 'free') return l.trialExpired;
    if (effectiveTier === 'trial' && trialDaysLeft >= 0)
      return `${trialDaysLeft}${l.daysLeft}`;
    if (creditsResetAt && !isUnlimited)
      return `${l.resetOn} ${fmtDate(creditsResetAt, locale)}`;
    return null;
  })();

  return (
    <button
      onClick={() => router.push(`/${rawLocale}/pricing`)}
      className="w-full text-left bg-white dark:bg-gray-900 rounded-2xl border
        border-gray-200 dark:border-gray-800 p-5 shadow-sm
        hover:shadow-md hover:border-violet-300 dark:hover:border-violet-700
        transition-all duration-200 cursor-pointer"
    >
      {/* Top row: label + badge (left)  |  icon (right) */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium leading-tight truncate">
            {l.title}
          </span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0 ${tierBadgeColor}`}>
            {tierLabel}
          </span>
        </div>
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <Zap size={16} className={iconColor} />
        </div>
      </div>

      {/* Big number */}
      {isUnlimited ? (
        <p className="text-2xl sm:text-3xl font-bold text-amber-500 mb-2">{l.unlimited}</p>
      ) : (
        <div className="flex items-baseline gap-1 mb-2">
          <p className={`text-2xl sm:text-3xl font-bold ${isLow ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
            {creditsRemaining}
          </p>
          <span className="text-sm text-gray-400 dark:text-gray-500">/{creditsTotal}</span>
        </div>
      )}

      {/* Thin progress bar */}
      {!isUnlimited && (
        <div className="h-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mb-1">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Footer text */}
      <p className={`text-xs mt-1 ${
        effectiveTier === 'free' || isLow
          ? 'text-red-400 dark:text-red-500'
          : 'text-gray-400 dark:text-gray-500'
      }`}>
        {footerText ?? '\u00A0'}
      </p>
    </button>
  );
}
