import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import PricingCard from './PricingCard';
import Badge from '@/components/ui/Badge';

type Plan = {
  name: string;
  price: string;
  currency: string;
  period: string;
  description: string;
  cta: string;
  disabled: boolean;
  popular: boolean;
  features: string[];
};

type FaqItem = { q: string; a: string };

export default function PricingTable() {
  const t = useTranslations('pricing');
  const locale = useLocale();
  const plans = t.raw('plans') as Plan[];
  const faqItems = t.raw('faq.items') as FaqItem[];

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="text-center mb-16">
        <Badge className="mb-4">{t('sectionBadge')}</Badge>
        <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">{t('headline')}</h1>
        <p className="text-gray-500 dark:text-gray-400 text-lg">{t('subheadline')}</p>
      </div>

      {/* Pricing cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center mb-24 px-4">
        {plans.map((plan, i) => (
          <PricingCard
            key={plan.name}
            {...plan}
            ctaHref={`/${locale}/auth/register`}
          />
        ))}
      </div>

      {/* FAQ */}
      <div className="max-w-2xl mx-auto px-4">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-10">
          {t('faq.headline')}
        </h2>
        <div className="space-y-4">
          {faqItems.map((item, i) => (
            <details
              key={i}
              className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-6 py-4 cursor-pointer hover:border-gray-300 dark:hover:border-gray-700 transition-colors duration-200"
            >
              <summary className="flex justify-between items-center list-none font-medium text-gray-900 dark:text-white select-none">
                {item.q}
                <span className="text-gray-400 dark:text-gray-500 group-open:rotate-45 transition-transform duration-200 text-xl leading-none ml-4">
                  +
                </span>
              </summary>
              <p className="mt-3 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
