'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { AlertCircle, CalendarClock, Loader2 } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';

// ─── What the subscription is doing, said plainly ─────────────────────────────
//
// Three states a customer must not have to guess at:
//
//   past_due            a payment failed and Stripe is retrying. ACCESS
//                       CONTINUES. The banner must reassure and point at the
//                       card, not threaten — the account is not suspended and
//                       saying so would be false.
//   scheduled_plan      a change already booked for the end of the period.
//   cancel_at_period_end the subscription stops on the renewal date; the
//                       account then becomes Free rather than disappearing.
//
// Silence on any of these means a customer discovers the change by losing
// something. The notice shows nothing at all when there is nothing to say.

const COPY = {
  en: {
    pastDueTitle: 'Your last payment did not go through',
    pastDueBody:  'Your plan is still active and nothing has been lost. Your bank is being retried automatically — updating your card settles it.',
    pastDueCta:   'Update payment method',
    downgradeTo:  (plan: string, date: string) => `Your plan changes to ${plan} on ${date}.`,
    cancelOn:     (date: string) => `Your subscription ends on ${date}. You keep everything until then, and the account stays open on the free plan afterwards.`,
    portalError:  'We could not open your subscription settings. Nothing has changed — please try again.',
    manage:       'Manage subscription',
  },
  fr: {
    pastDueTitle: 'Votre dernier paiement n’est pas passé',
    pastDueBody:  'Votre plan reste actif et vous n’avez rien perdu. Une nouvelle tentative est faite automatiquement auprès de votre banque — mettre à jour votre carte règle la situation.',
    pastDueCta:   'Mettre à jour le moyen de paiement',
    downgradeTo:  (plan: string, date: string) => `Votre plan passe à ${plan} le ${date}.`,
    cancelOn:     (date: string) => `Votre abonnement prend fin le ${date}. Vous gardez tout jusque-là, et le compte reste ouvert sur le plan Gratuit ensuite.`,
    portalError:  'Nous n’avons pas pu ouvrir la gestion de votre abonnement. Rien n’a changé — réessayez.',
    manage:       'Gérer l’abonnement',
  },
  es: {
    pastDueTitle: 'Tu último pago no se ha completado',
    pastDueBody:  'Tu plan sigue activo y no has perdido nada. Se reintenta automáticamente con tu banco — actualizar tu tarjeta lo resuelve.',
    pastDueCta:   'Actualizar método de pago',
    downgradeTo:  (plan: string, date: string) => `Tu plan cambia a ${plan} el ${date}.`,
    cancelOn:     (date: string) => `Tu suscripción termina el ${date}. Conservas todo hasta entonces, y después la cuenta sigue abierta en el plan gratuito.`,
    portalError:  'No hemos podido abrir la gestión de tu suscripción. No ha cambiado nada — inténtalo de nuevo.',
    manage:       'Gestionar suscripción',
  },
  pt: {
    pastDueTitle: 'O seu último pagamento não foi concluído',
    pastDueBody:  'O seu plano continua ativo e não perdeu nada. É feita automaticamente uma nova tentativa junto do seu banco — atualizar o cartão resolve a situação.',
    pastDueCta:   'Atualizar método de pagamento',
    downgradeTo:  (plan: string, date: string) => `O seu plano muda para ${plan} a ${date}.`,
    cancelOn:     (date: string) => `A sua subscrição termina a ${date}. Mantém tudo até lá, e depois a conta continua aberta no plano gratuito.`,
    portalError:  'Não conseguimos abrir a gestão da sua subscrição. Nada mudou — tente novamente.',
    manage:       'Gerir subscrição',
  },
} as const;

const PLAN_NAMES: Record<string, string> = { free: 'Free', pro: 'Pro', premium: 'Premium' };

function fmtDate(date: Date, locale: string): string {
  return date.toLocaleDateString(
    locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-PT' : 'en-US',
    { day: 'numeric', month: 'long', year: 'numeric' },
  );
}

export default function SubscriptionNotice() {
  const pathname  = usePathname();
  const rawLocale = pathname?.split('/')[1] ?? 'en';
  const locale    = (['en', 'fr', 'es', 'pt'] as const).includes(rawLocale as 'en')
    ? rawLocale as keyof typeof COPY
    : 'en';
  const l = COPY[locale];

  const {
    subscriptionStatus, scheduledPlan, cancelAtPeriodEnd, creditsResetAt, isLoading,
  } = useSubscription();

  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const res  = await fetch('/api/stripe/portal', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.url) { window.location.href = body.url as string; return; }
      setError(l.portalError);
    } catch {
      setError(l.portalError);
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return null;

  const isPastDue  = subscriptionStatus === 'past_due';
  const endDate    = creditsResetAt ? fmtDate(creditsResetAt, locale) : null;
  const hasEndNote = Boolean(endDate) && (cancelAtPeriodEnd || Boolean(scheduledPlan));

  if (!isPastDue && !hasEndNote) return null;

  return (
    <div className="px-4 pt-4 space-y-2">
      {isPastDue && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/20">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{l.pastDueTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/80">{l.pastDueBody}</p>
              <button
                type="button"
                onClick={openPortal}
                disabled={busy}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
              >
                {busy && <Loader2 size={12} className="animate-spin" />}
                {l.pastDueCta}
              </button>
            </div>
          </div>
        </div>
      )}

      {hasEndNote && endDate && (
        <div className="rounded-2xl border border-gray-200 bg-white p-3.5 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start gap-3">
            <CalendarClock size={16} className="mt-0.5 flex-shrink-0 text-gray-400" />
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                {cancelAtPeriodEnd
                  ? l.cancelOn(endDate)
                  : l.downgradeTo(PLAN_NAMES[scheduledPlan ?? 'free'] ?? String(scheduledPlan), endDate)}
              </p>
              <button
                type="button"
                onClick={openPortal}
                disabled={busy}
                className="mt-2 text-xs font-semibold text-violet-600 underline transition-colors hover:text-violet-500 disabled:opacity-50 dark:text-violet-400"
              >
                {l.manage}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
