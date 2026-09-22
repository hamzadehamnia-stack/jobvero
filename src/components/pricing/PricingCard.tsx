'use client';

import { Check, Minus, Loader2 } from 'lucide-react';

// ─── One plan, drawn ──────────────────────────────────────────────────────────
//
// Presentational. Every figure it shows arrives as a formatted string from
// PricingTable, which reads src/lib/plans.ts — the card holds no number of its
// own, so there is nowhere for a stale price to hide.
//
// The two counters are deliberately two separate lines. They are two different
// things that are never added together: AI credits buy writing and analysis,
// automatic applications are their own monthly quota. A single "X actions a
// month" line would be the shortest way to make a customer believe a credit and
// an application are interchangeable.

export interface PricingCardProps {
  name:        string;
  /** "$39", or the translated word for free. */
  price:       string;
  /** "/month" — omitted on the free plan, which is not per anything. */
  period:      string | null;
  description: string;
  /** The AI credits line. */
  creditsLine: string;
  /** The automatic applications line — or the line saying there are none. */
  autoApplyLine: string;
  /** Whether that second counter is a quota (Check) or its absence (Minus). */
  hasAutoApply: boolean;
  features:    string[];
  cta:         string;
  onCta?:      () => void;
  ctaHref?:    string;
  disabled?:   boolean;
  busy?:       boolean;
  popular?:    boolean;
  /** Shown instead of the button when this is the plan the customer is on. */
  currentLabel?: string | null;
}

export default function PricingCard({
  name, price, period, description,
  creditsLine, autoApplyLine, hasAutoApply,
  features, cta, onCta, ctaHref, disabled, busy, popular, currentLabel,
}: PricingCardProps) {
  const isCurrent = Boolean(currentLabel);

  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 transition-shadow ${
        popular
          ? 'border-violet-500 shadow-lg shadow-violet-500/10 dark:border-violet-400'
          : 'border-gray-200 dark:border-gray-700'
      } bg-white dark:bg-gray-900`}
    >
      {popular && (
        <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
          {name}
        </span>
      )}

      <h3 className="text-lg font-bold text-gray-900 dark:text-white">{name}</h3>

      <p className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-extrabold text-gray-900 dark:text-white">{price}</span>
        {period && <span className="text-sm text-gray-400">{period}</span>}
      </p>

      <p className="mt-3 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>

      {/* The two counters, kept apart. */}
      <ul className="mt-5 space-y-2 border-y border-gray-100 py-4 dark:border-gray-800">
        <li className="flex items-start gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <Check size={16} className="mt-0.5 flex-shrink-0 text-violet-500" />
          <span>{creditsLine}</span>
        </li>
        <li
          className={`flex items-start gap-2 text-sm font-semibold ${
            hasAutoApply ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
          }`}
        >
          {hasAutoApply
            ? <Check size={16} className="mt-0.5 flex-shrink-0 text-violet-500" />
            : <Minus  size={16} className="mt-0.5 flex-shrink-0 text-gray-300 dark:text-gray-600" />}
          <span>{autoApplyLine}</span>
        </li>
      </ul>

      <ul className="mt-4 flex-1 space-y-2">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Check size={15} className="mt-0.5 flex-shrink-0 text-gray-300 dark:text-gray-600" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {isCurrent ? (
        <p className="mt-6 rounded-xl border border-gray-200 py-2.5 text-center text-sm font-semibold text-gray-500 dark:border-gray-700 dark:text-gray-400">
          {currentLabel}
        </p>
      ) : ctaHref ? (
        <a
          href={ctaHref}
          className={`mt-6 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 ${
            popular
              ? 'bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] text-white shadow-md shadow-violet-500/20'
              : 'border border-gray-200 text-gray-900 dark:border-gray-700 dark:text-white'
          }`}
        >
          {cta}
        </a>
      ) : (
        <button
          type="button"
          onClick={onCta}
          disabled={disabled || busy}
          className={`mt-6 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${
            popular
              ? 'bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] text-white shadow-md shadow-violet-500/20'
              : 'border border-gray-200 text-gray-900 dark:border-gray-700 dark:text-white'
          }`}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {cta}
        </button>
      )}
    </div>
  );
}
