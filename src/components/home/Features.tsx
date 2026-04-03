import { useTranslations } from 'next-intl';
import Badge from '@/components/ui/Badge';
import { Brain, FileText, Mail, BarChart3, Mic2, DollarSign } from 'lucide-react';

const ICONS = [Brain, FileText, Mail, BarChart3, Mic2, DollarSign];

export default function Features() {
  const t = useTranslations('features');
  const items = t.raw('items') as Array<{ title: string; description: string }>;

  return (
    <section id="features" className="py-24 px-4 scroll-mt-16">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16 reveal-on-scroll">
          <Badge className="mb-4">{t('sectionBadge')}</Badge>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">{t('headline')}</h2>
          <p className="text-gray-400 max-w-xl mx-auto text-lg">{t('subheadline')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item, i) => {
            const Icon = ICONS[i] ?? Brain;
            return (
              <div
                key={i}
                className="reveal-on-scroll group p-6 rounded-xl bg-gray-900 border border-gray-800 hover:border-violet-800/60 transition-all duration-300 hover:bg-card-gradient"
              >
                <div className="w-11 h-11 rounded-lg bg-violet-950 border border-violet-800 flex items-center justify-center mb-5 group-hover:bg-violet-900 transition-colors">
                  <Icon size={20} className="text-violet-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
