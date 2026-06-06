import { useTranslations } from 'next-intl';
import Badge from '@/components/ui/Badge';
import { Brain, FileText, Mail, BarChart3, Mic2, TrendingUp, ArrowRight } from 'lucide-react';

const FEATURE_STYLES = [
  {
    icon: Brain,
    gradient: 'from-blue-500 to-indigo-600',
    shadow: 'shadow-blue-500/25',
    ring: 'group-hover:ring-blue-200 dark:group-hover:ring-blue-900',
  },
  {
    icon: FileText,
    gradient: 'from-purple-500 to-violet-600',
    shadow: 'shadow-purple-500/25',
    ring: 'group-hover:ring-purple-200 dark:group-hover:ring-purple-900',
  },
  {
    icon: Mail,
    gradient: 'from-emerald-500 to-green-600',
    shadow: 'shadow-emerald-500/25',
    ring: 'group-hover:ring-emerald-200 dark:group-hover:ring-emerald-900',
  },
  {
    icon: BarChart3,
    gradient: 'from-orange-500 to-amber-500',
    shadow: 'shadow-orange-500/25',
    ring: 'group-hover:ring-orange-200 dark:group-hover:ring-orange-900',
  },
  {
    icon: Mic2,
    gradient: 'from-pink-500 to-rose-600',
    shadow: 'shadow-pink-500/25',
    ring: 'group-hover:ring-pink-200 dark:group-hover:ring-pink-900',
  },
  {
    icon: TrendingUp,
    gradient: 'from-yellow-400 to-amber-500',
    shadow: 'shadow-yellow-400/25',
    ring: 'group-hover:ring-yellow-200 dark:group-hover:ring-yellow-900',
  },
];

export default function Features() {
  const t = useTranslations('features');
  const items = t.raw('items') as Array<{ title: string; description: string }>;

  return (
    <section id="features" className="py-24 px-4 scroll-mt-16">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="text-center mb-16 reveal-on-scroll">
          <Badge className="mb-4">{t('sectionBadge')}</Badge>
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            {t('headline')}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto text-lg">
            {t('subheadline')}
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item, i) => {
            const style = FEATURE_STYLES[i] ?? FEATURE_STYLES[0];
            const Icon = style.icon;
            return (
              <div
                key={i}
                className={`reveal-on-scroll reveal-delay-${Math.min(i + 1, 6)} group
                  relative flex flex-col p-6 rounded-2xl
                  bg-white dark:bg-gray-900
                  border border-gray-200 dark:border-gray-800
                  ring-2 ring-transparent ${style.ring}
                  shadow-sm hover:shadow-xl ${style.shadow}
                  hover:-translate-y-1
                  transition-all duration-300 ease-out`}
              >
                {/* Icon */}
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${style.gradient}
                    flex items-center justify-center mb-5 shadow-lg ${style.shadow}
                    group-hover:scale-110 transition-transform duration-300`}
                >
                  <Icon size={22} className="text-white" strokeWidth={2} />
                </div>

                {/* Text */}
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {item.title}
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed flex-1">
                  {item.description}
                </p>

                {/* Arrow */}
                <div className="mt-5 flex justify-end">
                  <span
                    className={`w-7 h-7 rounded-full bg-gradient-to-br ${style.gradient}
                      flex items-center justify-center
                      opacity-0 group-hover:opacity-100
                      translate-x-1 group-hover:translate-x-0
                      transition-all duration-300`}
                  >
                    <ArrowRight size={13} className="text-white" strokeWidth={2.5} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
