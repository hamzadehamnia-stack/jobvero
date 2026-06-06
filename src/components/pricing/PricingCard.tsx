import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface PricingCardProps {
  name: string;
  price: string;
  currency: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  disabled: boolean;
  popular: boolean;
  ctaHref?: string;
}

export default function PricingCard({
  name,
  price,
  currency,
  period,
  description,
  features,
  cta,
  popular,
  ctaHref = '#',
}: PricingCardProps) {
  const t = useTranslations('pricingCard');
  const isFree = price === '0';

  return (
    <div
      className={cn(
        'relative flex flex-col p-8 rounded-2xl border transition-all duration-300',
        popular
          ? 'bg-gradient-to-b from-violet-950/80 to-gray-900 border-violet-500 shadow-xl shadow-violet-900/20 scale-105'
          : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:border-violet-300 dark:hover:border-gray-700 shadow-sm dark:shadow-none'
      )}
    >
      {popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="bg-gradient-to-r from-violet-600 to-cyan-600 text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow-lg">
            {t('mostPopular')}
          </span>
        </div>
      )}

      <div className="mb-6">
        <h3 className={cn('text-xl font-bold mb-1', popular ? 'text-white' : 'text-gray-900 dark:text-white')}>
          {name}
        </h3>
        <p className={cn('text-sm', popular ? 'text-gray-400' : 'text-gray-500')}>{description}</p>
      </div>

      <div className="mb-8">
        <div className="flex items-end gap-1">
          <span className={cn('text-4xl font-extrabold', popular ? 'text-white' : 'text-gray-900 dark:text-white')}>
            {isFree ? 'Free' : `${currency}${price}`}
          </span>
          <span className={cn('text-sm mb-1.5', popular ? 'text-gray-400' : 'text-gray-500')}>{period}</span>
        </div>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-3">
            <Check size={16} className="text-violet-400 mt-0.5 flex-shrink-0" />
            <span className={cn('text-sm', popular ? 'text-gray-300' : 'text-gray-600 dark:text-gray-300')}>
              {f}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        className="w-full inline-flex items-center justify-center font-semibold rounded-lg px-7 py-3.5 text-base transition-all duration-200
          bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400
          text-white shadow-lg shadow-violet-500/20"
      >
        {cta}
      </Link>
    </div>
  );
}
