'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle } from 'lucide-react';
import PricingCard from './PricingCard';
import {
  PLANS, PLAN_ORDER, PREMIUM_EQUIVALENT, PREMIUM_EQUIVALENT_TOTAL,
  formatPrice, type PlanId,
} from '@/lib/plans';

// ─── The three plans ──────────────────────────────────────────────────────────
//
// The figures come from src/lib/plans.ts and the words from the locale files.
// Neither holds both: a price appears in exactly one place in this project, and
// a translator changing a sentence cannot change an amount.
//
// The buttons send a plan NAME to the server — never a price and never a Stripe
// price id. What that name costs is decided by /api/stripe/checkout against the
// environment's own price ids, so a customer editing the page cannot buy
// Premium at the Pro price.

interface Entitlement {
  tier:            PlanId;
  hasSubscription: boolean;
}

export default function PricingTable() {
  const t      = useTranslations('pricing');
  const locale = useLocale();

  const [me,      setMe]      = useState<Entitlement | null>(null);
  const [loaded,  setLoaded]  = useState(false);
  const [busy,    setBusy]    = useState<PlanId | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  // Anonymous visitors get a 401 here, which is the answer, not a failure.
  useEffect(() => {
    let alive = true;
    fetch('/api/me/entitlement', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        if (data) setMe({ tier: data.tier as PlanId, hasSubscription: Boolean(data.hasSubscription) });
        setLoaded(true);
      })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  async function startCheckout(plan: PlanId) {
    setBusy(plan);
    setError(null);
    try {
      const res  = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ plan }),
      });
      const body = await res.json().catch(() => ({}));

      if (res.ok && body.url) { window.location.href = body.url as string; return; }

      // 409 means a subscription already exists: the portal is where a plan is
      // changed, and offering checkout again would open a second one.
      if (res.status === 409) { await openPortal(); return; }
      if (res.status === 401) { window.location.href = `/${locale}/auth/login`; return; }

      setError(t('errors.checkout'));
    } catch {
      setError(t('errors.network'));
    } finally {
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy(null);
    try {
      const res  = await fetch('/api/stripe/portal', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.url) { window.location.href = body.url as string; return; }
      setError(t('errors.portal'));
    } catch {
      setError(t('errors.network'));
    }
  }

  const faqItems = (t.raw('faq.items') ?? []) as { q: string; a: string }[];

  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="text-center">
        <span className="text-xs font-bold uppercase tracking-widest text-violet-500">
          {t('sectionBadge')}
        </span>
        <h2 className="mt-3 text-3xl font-extrabold text-gray-900 dark:text-white">{t('headline')}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-500 dark:text-gray-400">{t('subheadline')}</p>
      </div>

      {error && (
        <p className="mx-auto mt-6 flex max-w-md items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertCircle size={16} className="flex-shrink-0" /> {error}
        </p>
      )}

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const plan  = PLANS[id];
          const words = t.raw(`plans.${id}`) as { name: string; description: string; cta: string; features: string[] };
          const isCurrent = loaded && me?.tier === id;

          return (
            <PricingCard
              key={id}
              name={words.name}
              price={formatPrice(plan, t('freeLabel'))}
              period={plan.priceUsd === 0 ? null : t('perMonth')}
              description={words.description}
              creditsLine={t('creditsLine', { n: plan.credits })}
              autoApplyLine={plan.autoApply > 0
                ? t('autoApplyLine', { n: plan.autoApply })
                : t('autoApplyNone')}
              hasAutoApply={plan.autoApply > 0}
              features={words.features}
              cta={words.cta}
              currentLabel={isCurrent ? t('currentPlan') : null}
              popular={id === 'pro'}
              busy={busy === id}
              // The free plan is reached by signing up, not by paying.
              ctaHref={id === 'free' && !isCurrent ? `/${locale}/auth/register` : undefined}
              onCta={id === 'free' ? undefined : () => startCheckout(id)}
            />
          );
        })}
      </div>

      {/* Where an existing subscriber changes or cancels a plan. Shown only to
          someone who has one — there is nothing to manage otherwise. */}
      {loaded && me?.hasSubscription && (
        <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <button type="button" onClick={openPortal} className="font-semibold text-violet-600 underline hover:text-violet-500 dark:text-violet-400">
            {t('manageSubscription')}
          </button>
        </p>
      )}

      {/* ─── What the same thing costs elsewhere ─────────────────────────────
          Published list prices for tools sold separately, compared by what they
          do. No product is named and no quality is judged — the only claim is
          arithmetic, and that none of them answers an email. */}
      <div className="mt-16 rounded-2xl border border-gray-200 bg-gray-50 p-8 dark:border-gray-700 dark:bg-gray-900/40">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{t('compare.headline')}</h3>
        <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">{t('compare.intro')}</p>

        <ul className="mt-6 divide-y divide-gray-200 dark:divide-gray-700">
          {PREMIUM_EQUIVALENT.map((tool) => (
            <li key={tool.purpose} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-gray-600 dark:text-gray-300">{t(`compare.tools.${tool.purpose}`)}</span>
              <span className="font-semibold text-gray-900 dark:text-white">${tool.priceUsd}</span>
            </li>
          ))}
          <li className="flex items-center justify-between py-3 text-sm">
            <span className="font-semibold text-gray-900 dark:text-white">{t('compare.total')}</span>
            <span className="text-lg font-extrabold text-gray-900 dark:text-white">${PREMIUM_EQUIVALENT_TOTAL}</span>
          </li>
        </ul>

        <p className="mt-4 text-sm font-medium text-gray-900 dark:text-white">{t('compare.conclusion')}</p>
      </div>

      {faqItems.length > 0 && (
        <div className="mt-16">
          <h3 className="text-center text-xl font-bold text-gray-900 dark:text-white">{t('faq.headline')}</h3>
          <div className="mx-auto mt-6 max-w-3xl space-y-4">
            {faqItems.map((item) => (
              <details key={item.q} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-white">{item.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
