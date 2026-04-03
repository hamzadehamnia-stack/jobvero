import { useTranslations } from 'next-intl';
import Badge from '@/components/ui/Badge';

type FaqItem = { q: string; a: string };

export default function FAQ() {
  const t = useTranslations('homeFaq');
  const items = t.raw('items') as FaqItem[];

  return (
    <section className="py-24 px-4 bg-gray-900/30">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-14 reveal-on-scroll">
          <Badge className="mb-4">{t('sectionBadge')}</Badge>
          <h2 className="text-4xl sm:text-5xl font-bold text-white">{t('headline')}</h2>
        </div>

        <div className="space-y-3">
          {items.map((item, i) => (
            <details
              key={i}
              className="reveal-on-scroll group bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-700 transition-colors duration-200"
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none select-none">
                <span className="font-semibold text-white text-[15px] leading-snug">
                  {item.q}
                </span>
                <span className="flex-shrink-0 w-6 h-6 rounded-full border border-gray-700 group-open:border-violet-600 flex items-center justify-center text-gray-500 group-open:text-violet-400 group-open:rotate-45 transition-all duration-200 text-lg leading-none">
                  +
                </span>
              </summary>
              <div className="px-6 pb-5">
                <div className="h-px bg-gray-800 mb-4" />
                <p className="text-gray-400 text-sm leading-relaxed">{item.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
