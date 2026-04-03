import { useTranslations } from 'next-intl';

const COMPANIES = [
  'Google',
  'Amazon',
  'Meta',
  'Salesforce',
  'Spotify',
  'Airbnb',
  'Netflix',
  'Stripe',
  'Shopify',
  'Figma',
];

export default function LogosBar() {
  const t = useTranslations('logosBar');

  return (
    <section className="py-12 px-4 border-y border-gray-800/60">
      <div className="max-w-7xl mx-auto">
        <p className="text-center text-xs font-medium uppercase tracking-widest text-gray-600 mb-8">
          {t('label')}
        </p>

        {/* Scrolling ticker */}
        <div className="relative overflow-hidden">
          {/* Fade edges */}
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-gray-950 to-transparent z-10 pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-gray-950 to-transparent z-10 pointer-events-none" />

          <div className="flex gap-12 animate-marquee whitespace-nowrap">
            {[...COMPANIES, ...COMPANIES].map((name, i) => (
              <span
                key={i}
                className="text-gray-600 hover:text-gray-400 transition-colors text-lg font-bold tracking-tight cursor-default select-none"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
