'use client';

import { usePathname } from 'next/navigation';
import { X, Check, Zap, Crown, Lock, Sparkles } from 'lucide-react';
import Link from 'next/link';

// ─── Locale data ──────────────────────────────────────────────────────────────
//
// The quotas below are the ones admin_settings actually applies: 10 credits for
// a trial, then 29 / 57 / 111 a month for Starter, Pro and Premium. This window
// used to promise "10 AI credits / month" on Pro and "unlimited" on Premium;
// neither was true, and a paywall that overstates what it sells is worse than
// one that says nothing.
//
// Starter carries no price: the three price lists in this project disagree
// (published site, terms of service, brief) and none has been chosen. Until one
// is, the card shows what the plan gives and sends the reader to the pricing
// page. Nothing here is invented.

const LABELS = {
  en: {
    title:       'Upgrade to unlock this feature',
    trial_expired: 'Your 7-day trial has ended.',
    tier_locked:   'This feature requires a higher plan.',
    no_credits:    'You\'ve used all your AI credits for this period.',
    limit_reached: 'You\'ve reached your usage limit for this period.',
    cta_starter:   'Upgrade to Starter',
    cta_pro:       'Upgrade to Pro',
    cta_premium:   'Upgrade to Premium',
    seePricing:    'See pricing →',
    close:         'Maybe later',
    popular:       'Most Popular',
  },
  fr: {
    title:       'Passez à un abonnement supérieur',
    trial_expired: 'Votre essai de 7 jours est terminé.',
    tier_locked:   'Cette fonctionnalité nécessite un abonnement supérieur.',
    no_credits:    'Vous avez utilisé tous vos crédits IA pour cette période.',
    limit_reached: 'Vous avez atteint votre limite d\'utilisation pour cette période.',
    cta_starter:   'Passer à Starter',
    cta_pro:       'Passer à Pro',
    cta_premium:   'Passer à Premium',
    seePricing:    'Voir les tarifs →',
    close:         'Peut-être plus tard',
    popular:       'Plus populaire',
  },
  es: {
    title:       'Actualiza para desbloquear esta función',
    trial_expired: 'Tu prueba de 7 días ha terminado.',
    tier_locked:   'Esta función requiere un plan superior.',
    no_credits:    'Has usado todos tus créditos IA para este período.',
    limit_reached: 'Has alcanzado tu límite de uso para este período.',
    cta_starter:   'Actualizar a Starter',
    cta_pro:       'Actualizar a Pro',
    cta_premium:   'Actualizar a Premium',
    seePricing:    'Ver precios →',
    close:         'Quizás más tarde',
    popular:       'Más popular',
  },
  pt: {
    title:       'Faça upgrade para desbloquear este recurso',
    trial_expired: 'Seu teste de 7 dias terminou.',
    tier_locked:   'Este recurso requer um plano superior.',
    no_credits:    'Você usou todos os seus créditos de IA neste período.',
    limit_reached: 'Você atingiu seu limite de uso neste período.',
    cta_starter:   'Atualizar para Starter',
    cta_pro:       'Atualizar para Pro',
    cta_premium:   'Atualizar para Premium',
    seePricing:    'Ver preços →',
    close:         'Talvez mais tarde',
    popular:       'Mais popular',
  },
} as const;

// ─── Tier cards ───────────────────────────────────────────────────────────────

const TIER_FEATURES = {
  en: {
    free:    ['No AI credits', 'Job tracker', 'Saved jobs', 'Email support'],
    starter: ['29 AI credits / month', 'CV builder & cover letters', 'ATS score', 'AI assistant', 'No interview coach, no auto-apply'],
    pro:     ['57 AI credits / month', 'Everything in Starter', 'Interview coach', 'Advanced job tracker'],
    premium: ['111 AI credits / month', 'Everything in Pro', 'Auto-apply', 'Priority support'],
  },
  fr: {
    free:    ['Aucun crédit IA', 'Suivi des candidatures', 'Offres enregistrées', 'Support par e-mail'],
    starter: ['29 crédits IA / mois', 'CV et lettres de motivation', 'Score ATS', 'Assistant IA', 'Sans entretien ni candidature auto'],
    pro:     ['57 crédits IA / mois', 'Tout Starter', 'Préparation aux entretiens', 'Suivi avancé'],
    premium: ['111 crédits IA / mois', 'Tout Pro', 'Candidature automatique', 'Support prioritaire'],
  },
  es: {
    free:    ['Sin créditos IA', 'Seguimiento de candidaturas', 'Ofertas guardadas', 'Soporte por email'],
    starter: ['29 créditos IA / mes', 'CV y cartas de presentación', 'Puntuación ATS', 'Asistente IA', 'Sin entrevistas ni candidatura automática'],
    pro:     ['57 créditos IA / mes', 'Todo lo de Starter', 'Preparación de entrevistas', 'Seguimiento avanzado'],
    premium: ['111 créditos IA / mes', 'Todo lo de Pro', 'Candidatura automática', 'Soporte prioritario'],
  },
  pt: {
    free:    ['Sem créditos de IA', 'Rastreador de candidaturas', 'Vagas guardadas', 'Suporte por e-mail'],
    starter: ['29 créditos IA / mês', 'CV e cartas de apresentação', 'Pontuação ATS', 'Assistente IA', 'Sem entrevistas nem candidatura automática'],
    pro:     ['57 créditos IA / mês', 'Tudo do Starter', 'Preparação para entrevistas', 'Rastreador avançado'],
    premium: ['111 créditos IA / mês', 'Tudo do Pro', 'Candidatura automática', 'Suporte prioritário'],
  },
} as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  reason?: 'trial_expired' | 'tier_locked' | 'no_credits' | 'limit_reached';
  upgradeTo?: 'starter' | 'pro' | 'premium';
  /** Override locale; auto-detected from URL if omitted */
  locale?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UpgradeModal({ isOpen, onClose, reason = 'tier_locked', upgradeTo = 'pro', locale: localeProp }: Props) {
  const pathname = usePathname();
  const rawLocale = localeProp ?? (pathname?.split('/')[1] ?? 'en');
  const locale = (['en', 'fr', 'es', 'pt'] as const).includes(rawLocale as 'en') ? rawLocale as keyof typeof LABELS : 'en';

  const l = LABELS[locale];
  const features = TIER_FEATURES[locale];

  if (!isOpen) return null;

  const reasonText = l[reason];

  // Which tier to highlight (the one being promoted)
  const highlightStarter = upgradeTo === 'starter';
  const highlightPro     = upgradeTo === 'pro';
  const highlightPremium = upgradeTo === 'premium';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="relative w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center">
              <Lock size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{l.title}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{reasonText}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        {/* Tier cards */}
        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Free */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3 opacity-60">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Free</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">$0</p>
            </div>
            <ul className="space-y-1.5">
              {features.free.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <Check size={12} className="flex-shrink-0 mt-0.5 text-gray-400" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Starter — no price shown: see the pricing page */}
          <div className={`rounded-xl border p-4 space-y-3 relative
            ${highlightStarter
              ? 'border-cyan-500 dark:border-cyan-400 bg-cyan-50 dark:bg-cyan-950/30 ring-2 ring-cyan-500/20'
              : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            {highlightStarter && (
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <span className="px-3 py-0.5 rounded-full text-xs font-semibold bg-cyan-600 text-white shadow-md">
                  {l.popular}
                </span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-cyan-500" />
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-400">Starter</p>
              </div>
              <Link
                href={`/${locale}/pricing`}
                onClick={onClose}
                className="inline-block mt-1 text-sm font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
              >
                {l.seePricing}
              </Link>
            </div>
            <ul className="space-y-1.5">
              {features.starter.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                  <Check size={12} className="flex-shrink-0 mt-0.5 text-cyan-500" />
                  {f}
                </li>
              ))}
            </ul>
            {highlightStarter && (
              <Link
                href={`/${locale}/pricing`}
                onClick={onClose}
                className="block w-full py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white text-sm font-semibold text-center shadow-md shadow-cyan-500/20 transition-all"
              >
                {l.cta_starter}
              </Link>
            )}
          </div>

          {/* Pro */}
          <div className={`rounded-xl border p-4 space-y-3 relative
            ${highlightPro
              ? 'border-violet-500 dark:border-violet-400 bg-violet-50 dark:bg-violet-950/30 ring-2 ring-violet-500/20'
              : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            {highlightPro && (
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <span className="px-3 py-0.5 rounded-full text-xs font-semibold bg-violet-600 text-white shadow-md">
                  {l.popular}
                </span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <Zap size={14} className="text-violet-500" />
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">Pro</p>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">$19.99<span className="text-sm font-normal text-gray-400">/mo</span></p>
            </div>
            <ul className="space-y-1.5">
              {features.pro.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                  <Check size={12} className="flex-shrink-0 mt-0.5 text-violet-500" />
                  {f}
                </li>
              ))}
            </ul>
            {highlightPro && (
              <Link
                href={`/${locale}/pricing`}
                onClick={onClose}
                className="block w-full py-2 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-sm font-semibold text-center shadow-md shadow-violet-500/20 transition-all"
              >
                {l.cta_pro}
              </Link>
            )}
          </div>

          {/* Premium */}
          <div className={`rounded-xl border p-4 space-y-3 relative
            ${highlightPremium
              ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-950/20 ring-2 ring-amber-400/20'
              : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            {highlightPremium && (
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <span className="px-3 py-0.5 rounded-full text-xs font-semibold bg-amber-500 text-white shadow-md">
                  {l.popular}
                </span>
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <Crown size={14} className="text-amber-500" />
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Premium</p>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">$29.99<span className="text-sm font-normal text-gray-400">/mo</span></p>
            </div>
            <ul className="space-y-1.5">
              {features.premium.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                  <Check size={12} className="flex-shrink-0 mt-0.5 text-amber-500" />
                  {f}
                </li>
              ))}
            </ul>
            {highlightPremium && (
              <Link
                href={`/${locale}/pricing`}
                onClick={onClose}
                className="block w-full py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-white text-sm font-semibold text-center shadow-md shadow-amber-500/20 transition-all"
              >
                {l.cta_premium}
              </Link>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            {l.close}
          </button>
        </div>
      </div>
    </div>
  );
}
