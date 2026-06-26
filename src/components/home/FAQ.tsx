import { useTranslations } from 'next-intl';
import Badge from '@/components/ui/Badge';

type FaqItem = { q: string; a: string };

export default function FAQ() {
  const t = useTranslations('homeFaq');
  const items = t.raw('items') as FaqItem[];

  return (
    <section
      id="faq"
      className="relative py-24 sm:py-32 px-4 sm:px-6 border-t border-subtle bg-surface/40"
    >
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-14 reveal-on-scroll">
          <Badge variant="default" className="mb-5">
            {t('sectionBadge')}
          </Badge>
          <h2 className="font-display text-fg text-3xl sm:text-5xl tracking-tighter leading-[1.1]">
            {t('headline')}
          </h2>
        </div>

        <div className="space-y-2">
          {items.map((item, i) => (
            <details
              key={i}
              className="reveal-on-scroll group rounded-xl border border-subtle bg-canvas hover:border-strong transition-colors"
              style={{ transitionDelay: `${i * 40}ms` }}
            >
              <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer list-none select-none">
                <span className="font-medium text-fg text-[14.5px] leading-snug">
                  {item.q}
                </span>
                <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 text-fg-subtle group-open:text-accent group-open:rotate-45 transition-all duration-200 text-lg leading-none">
                  +
                </span>
              </summary>
              <div className="px-5 pb-5 -mt-1">
                <p className="text-fg-muted text-[13.5px] leading-relaxed">
                  {item.a}
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
