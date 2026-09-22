'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Zap, Crown, ChevronUp, RefreshCw, Send, Inbox, AtSign } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';

// ─── Labels ───────────────────────────────────────────────────────────────────

const LABELS = {
  en: {
    aiCredits:   'AI Credits',
    remaining:   'remaining',
    resetOn:     'Resets on',
    upgrade:     'Upgrade Plan',
    autoApply:   'Automatic applications',
    inbox:       'Emails sorted',
    notIncluded: 'not in this plan',
    aliasLabel:  'Your sorting address',
    noDrafts:    'AI-written replies come with the paid plans.',
    tier:        { free: 'Free', pro: 'Pro', premium: 'Premium' },
  },
  fr: {
    aiCredits:   'Crédits IA',
    remaining:   'restants',
    resetOn:     'Recharge le',
    upgrade:     'Améliorer le plan',
    autoApply:   'Candidatures automatiques',
    inbox:       'E-mails triés',
    notIncluded: 'pas dans ce plan',
    aliasLabel:  'Votre adresse de tri',
    noDrafts:    'Les réponses rédigées par l’IA sont dans les plans payants.',
    tier:        { free: 'Gratuit', pro: 'Pro', premium: 'Premium' },
  },
  es: {
    aiCredits:   'Créditos IA',
    remaining:   'restantes',
    resetOn:     'Se reinicia el',
    upgrade:     'Mejorar plan',
    autoApply:   'Candidaturas automáticas',
    inbox:       'Correos clasificados',
    notIncluded: 'no incluido en este plan',
    aliasLabel:  'Tu dirección de clasificación',
    noDrafts:    'Las respuestas redactadas por la IA están en los planes de pago.',
    tier:        { free: 'Gratis', pro: 'Pro', premium: 'Premium' },
  },
  pt: {
    aiCredits:   'Créditos IA',
    remaining:   'restantes',
    resetOn:     'Recarrega em',
    upgrade:     'Melhorar plano',
    autoApply:   'Candidaturas automáticas',
    inbox:       'E-mails triados',
    notIncluded: 'não incluído neste plano',
    aliasLabel:  'O seu endereço de triagem',
    noDrafts:    'As respostas redigidas pela IA estão nos planos pagos.',
    tier:        { free: 'Grátis', pro: 'Pro', premium: 'Premium' },
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
//
// TWO COUNTERS, NEVER ONE. Credits buy writing and analysis; automatic
// applications have their own monthly quota and cost no credit. They are drawn
// as two separate rows with two separate denominators because they are two
// different things — a single merged number would teach a customer that
// spending a credit costs them an application, which is false in both
// directions. Both refill on the same date, the one this panel already shows.

export default function CreditGauge() {
  const pathname  = usePathname();
  const router    = useRouter();
  const rawLocale = pathname?.split('/')[1] ?? 'en';
  const locale    = (['en', 'fr', 'es', 'pt'] as const).includes(rawLocale as 'en')
    ? rawLocale as keyof typeof LABELS
    : 'en';

  const {
    effectiveTier, creditsRemaining, creditsTotal, creditsResetAt,
    autoApplyUsed, autoApplyQuota, inboxUsed, inboxQuota, emailAlias,
    isLoading,
  } = useSubscription();
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

  // No tier is unlimited: Premium has its 150 credits a month like the others
  // have theirs. `creditsTotal` is null only when the allowance is not configured —
  // and then the gauge shows the balance alone rather than inventing a
  // denominator or drawing a bar against a number nobody set.
  const hasTotal = typeof creditsTotal === 'number' && creditsTotal > 0;
  const pct      = hasTotal ? Math.min(100, Math.round((creditsRemaining / creditsTotal) * 100)) : 0;
  const isLow    = hasTotal && pct <= 30;
  const isMid    = hasTotal && pct > 30 && pct <= 60;

  const barColor = isLow ? 'bg-red-400' : isMid ? 'bg-amber-400' : 'bg-violet-500';
  const zapColor = isLow ? 'text-red-400' : 'text-violet-500';

  const tierLabel = l.tier[effectiveTier] ?? l.tier.free;

  // The application quota: its own counter, spent by auto-apply alone. 0 is a
  // real answer — the Free plan has none — and null means unconfigured.
  const hasAutoApply  = typeof autoApplyQuota === 'number' && autoApplyQuota > 0;
  const autoApplyLeft = hasAutoApply ? Math.max(0, autoApplyQuota - autoApplyUsed) : 0;
  const autoApplyPct  = hasAutoApply
    ? Math.min(100, Math.round((autoApplyLeft / autoApplyQuota) * 100))
    : 0;

  // The inbox month exists only where there is a monthly ceiling — the Free
  // plan. 'unlimited' means no MONTHLY limit, not no limit at all.
  const hasInboxQuota = typeof inboxQuota === 'number' && inboxQuota > 0;

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
        <div className="absolute right-0 top-full mt-2 w-72 z-50
          bg-white dark:bg-gray-900
          border border-gray-200 dark:border-gray-700
          rounded-2xl shadow-xl shadow-gray-200/60 dark:shadow-black/40
          overflow-hidden">

          {/* Header — counter one: AI credits */}
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

          {/* Counter two: automatic applications. A separate quota, refilled on
              the same date, spent by nothing else. */}
          <div className="px-4 pt-3 pb-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Send size={13} className="text-sky-500" />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  {l.autoApply}
                </span>
              </div>
              <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
                {hasAutoApply
                  ? `${autoApplyLeft} / ${autoApplyQuota}`
                  : <span className="text-gray-400 dark:text-gray-500 font-normal">{l.notIncluded}</span>}
              </span>
            </div>
            {hasAutoApply && (
              <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-700"
                  style={{ width: `${autoApplyPct}%` }}
                />
              </div>
            )}
          </div>

          {/* The inbox month — shown only where a monthly ceiling exists. */}
          {hasInboxQuota && (
            <div className="px-4 pt-3 pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Inbox size={13} className="text-emerald-500" />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {l.inbox}
                  </span>
                </div>
                <span className="text-xs font-semibold text-gray-900 dark:text-white tabular-nums">
                  {inboxUsed} / {inboxQuota}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
                {l.noDrafts}
              </p>
            </div>
          )}

          {/* The address that does the sorting. It is what the Free plan is
              for, and it is useless if the customer cannot read it. */}
          {emailAlias && (
            <div className="px-4 pt-3 pb-1">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                <AtSign size={11} />
                <span>{l.aliasLabel}</span>
              </div>
              <p className="mt-1 text-xs font-medium text-gray-700 dark:text-gray-300 break-all">
                {emailAlias}
              </p>
            </div>
          )}

          {/* Footer info */}
          <div className="px-4 py-3 space-y-1.5">
            {/* No trial line: Free is a permanent plan with its own credits,
                not a countdown to a lockout. */}

            {/* Reset date — one date for both counters. */}
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
