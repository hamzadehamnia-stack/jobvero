import { useTranslations } from 'next-intl';
import Badge from '@/components/ui/Badge';
import { Brain, FileText, Mail, BarChart3, Mic2, TrendingUp } from 'lucide-react';

const ICONS = [Brain, FileText, Mail, BarChart3, Mic2, TrendingUp];

export default function Features() {
  const t = useTranslations('features');
  const items = t.raw('items') as Array<{ title: string; description: string }>;

  return (
    <section id="features" className="relative py-24 sm:py-32 px-4 sm:px-6 scroll-mt-16">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="max-w-2xl reveal-on-scroll">
          <Badge variant="default" className="mb-5">
            {t('sectionBadge')}
          </Badge>
          <h2 className="font-display text-fg text-3xl sm:text-5xl tracking-tighter leading-[1.1]">
            {t('headline')}
          </h2>
          <p className="mt-5 text-fg-muted text-base sm:text-lg leading-relaxed">
            {t('subheadline')}
          </p>
        </div>

        {/* Bento grid */}
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {items.map((item, i) => {
            const Icon = ICONS[i] ?? ICONS[0];
            return (
              <div
                key={i}
                className={`reveal-on-scroll reveal-delay-${Math.min(i + 1, 6)} group
                  relative flex flex-col gap-4 p-6 sm:p-7 rounded-2xl
                  bg-surface border border-subtle
                  hover:border-strong hover:bg-elevated
                  transition-[border-color,background] duration-300`}
              >
                {/* Icon */}
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-subtle bg-elevated text-accent">
                  <Icon size={18} strokeWidth={1.75} />
                </div>

                {/* Text */}
                <div className="flex-1">
                  <h3 className="font-display text-fg text-[16px] leading-snug">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-fg-muted text-[13.5px] leading-relaxed">
                    {item.description}
                  </p>
                </div>

                {/* Hover indicator */}
                <div className="absolute top-6 right-6 h-1.5 w-1.5 rounded-full bg-accent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
