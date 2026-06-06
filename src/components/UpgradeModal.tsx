'use client';

import { usePathname } from 'next/navigation';
import { X, Check, Zap, Crown, Lock } from 'lucide-react';
import Link from 'next/link';

// ─── Locale data ──────────────────────────────────────────────────────────────

const LABELS = {
  en: {
    title:       'Upgrade to unlock this feature',
    trial_expired: 'Your 7-day trial has ended.',
    tier_locked:   'This feature requires a higher plan.',
    no_credits:    'You\'ve used all your AI credits for this period.',
    limit_reached: 'You\'ve reached your usage limit for this period.',
    cta_pro:       'Upgrade to Pro',
    cta_premium:   'Upgrade to Premium',
    close:         'Maybe later',
    popular:       'Most Popular',
  },
  fr: {
    title:       'Passez à un abonnement supérieur',
    trial_expired: 'Votre essai de 7 jours est terminé.',
    tier_locked:   'Cette fonctionnalité nécessite un abonnement supérieur.',
    no_credits:    'Vous avez utilisé tous vos crédits IA pour cette période.',
    limit_reached: 'Vous avez atteint votre limite d\'utilisation pour cette période.',
    cta_pro:       'Passer à Pro',
    cta_premium:   'Passer à Premium',
    close:         'Peut-être plus tard',
    popular:       'Plus populaire',
  },
  es: {
    title:       'Actualiza para desbloquear esta función',
    trial_expired: 'Tu prueba de 7 días ha terminado.',
    tier_locked:   'Esta función requiere un plan superior.',
    no_credits:    'Has usado todos tus créditos IA para este período.',
    limit_reached: 'Has alcanzado tu límite de uso para este período.',
    cta_pro:       'Actualizar a Pro',
    cta_premium:   'Actualizar a Premium',
    close:         'Quizás más tarde',
    popular:       'Más popular',
  },
  pt: {
    title:       'Faça upgrade para desbloquear este recurso',
    trial_expired: 'Seu teste de 7 dias terminou.',
    tier_locked:   'Este recurso requer um plano superior.',
    no_credits:    'Você usou todos os seus créditos de IA neste período.',
    limit_reached: 'Você atingiu seu limite de uso neste período.',
    cta_pro:       'Atualizar para Pro',
    cta_premium:   'Atualizar para Premium',
    close:         'Talvez mais tarde',
    popular:       'Mais popular',
  },
} as const;

// ─── Tier cards ───────────────────────────────────────────────────────────────

const TIER_FEATURES = {
  en: {
    free: ['5 AI credits / month', '1 CV template', '1 cover letter / week', 'Basic job tracker'],
    pro:  ['10 AI credits / month', '10 CV templates', '20 cover letters / month', 'Advanced job tracker', 'ATS score', 'Interview AI'],
    premium: ['Unlimited AI credits', 'All CV templates', 'Unlimited cover letters', 'AI auto-fix CV', 'Auto-apply', 'Priority support'],
  },
  fr: {
    free: ['5 crédits IA / mois', '1 modèle de CV', '1 lettre / semaine', 'Suivi d\'emplois basique'],
    pro:  ['10 crédits IA / mois', '10 modèles de CV', '20 lettres / mois', 'Suivi avancé', 'Score ATS', 'Préparation entretien IA'],
    premium: ['Crédits IA illimités', 'Tous les modèles', 'Lettres illimitées', 'Correction IA auto', 'Candidature auto', 'Support prioritaire'],
  },
  es: {
    free: ['5 créditos IA / mes', '1 plantilla de CV', '1 carta / semana', 'Seguimiento básico'],
    pro:  ['10 créditos IA / mes', '10 plantillas de CV', '20 cartas / mes', 'Seguimiento avanzado', 'Puntuación ATS', 'IA para entrevistas'],
    premium: ['Créditos IA ilimitados', 'Todas las plantillas', 'Cartas ilimitadas', 'Autocorrección IA', 'Candidatura automática', 'Soporte prioritario'],
  },
  pt: {
    free: ['5 créditos IA / mês', '1 modelo de CV', '1 carta / semana', 'Rastreador básico'],
    pro:  ['10 créditos IA / mês', '10 modelos de CV', '20 cartas / mês', 'Rastreador avançado', 'Pontuação ATS', 'IA para entrevistas'],
    premium: ['Créditos IA ilimitados', 'Todos os modelos', 'Cartas ilimitadas', 'Autocorreção IA', 'Candidatura automática', 'Suporte prioritário'],
  },
} as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  reason?: 'trial_expired' | 'tier_locked' | 'no_credits' | 'limit_reached';
  upgradeTo?: 'pro' | 'premium';
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
  const highlightPro     = upgradeTo === 'pro';
  const highlightPremium = upgradeTo === 'premium';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">

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
        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-3 gap-4">

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
