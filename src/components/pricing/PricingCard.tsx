import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface PricingCardProps {
  name: string;
  price: string;
  currency: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
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

  return (
    <div
      className={cn(
        'relative flex flex-col p-8 rounded-2xl border transition-all duration-300',
        popular
          ? 'bg-gradient-to-b from-violet-950/80 to-gray-900 border-violet-600 shadow-xl shadow-violet-900/20 scale-105'
          : 'bg-gray-900 border-gray-800 hover:border-gray-700'
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
        <h3 className="text-xl font-bold text-white mb-1">{name}</h3>
        <p className="text-sm text-gray-500">{description}</p>
      </div>

      <div className="mb-8">
        <div className="flex items-end gap-1">
          <span className="text-4xl font-extrabold text-white">
            {currency}{price}
          </span>
          <span className="text-gray-500 text-sm mb-1.5">{period}</span>
        </div>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-3">
            <Check size={16} className="text-violet-400 mt-0.5 flex-shrink-0" />
            <span className="text-sm text-gray-300">{f}</span>
          </li>
        ))}
      </ul>

      <Button
        variant={popular ? 'primary' : 'secondary'}
        size="lg"
        className="w-full"
        href={ctaHref}
      >
        {cta}
      </Button>
    </div>
  );
}
