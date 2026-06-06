import { useTranslations } from 'next-intl';
import Badge from '@/components/ui/Badge';

export default function HowItWorks() {
  const t = useTranslations('howItWorks');
  const steps = t.raw('steps') as Array<{
    number: string;
    title: string;
    description: string;
  }>;

  return (
    <section id="how-it-works" className="py-24 px-4 bg-gray-50/80 dark:bg-gray-900/40 scroll-mt-16 transition-colors duration-200">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16 reveal-on-scroll">
          <Badge className="mb-4">{t('sectionBadge')}</Badge>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white">{t('headline')}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-10 left-[calc(16.66%)] right-[calc(16.66%)] h-px bg-gradient-to-r from-violet-400 via-cyan-400 to-violet-400 opacity-30 dark:from-violet-800 dark:via-cyan-800 dark:to-violet-800 dark:opacity-40" />

          {steps.map((step, i) => (
            <div key={i} className="reveal-on-scroll flex flex-col items-center text-center px-4">
              <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600 to-cyan-600 flex items-center justify-center mb-6 shadow-lg shadow-violet-500/20 dark:shadow-violet-900/30 z-10">
                <span className="text-2xl font-extrabold text-white">{step.number}</span>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">{step.title}</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed max-w-xs">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
