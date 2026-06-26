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
    <section
      id="how-it-works"
      className="relative py-24 sm:py-32 px-4 sm:px-6 scroll-mt-16 border-t border-subtle bg-surface/40"
    >
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl mx-auto text-center reveal-on-scroll">
          <Badge variant="default" className="mb-5">
            {t('sectionBadge')}
          </Badge>
          <h2 className="font-display text-fg text-3xl sm:text-5xl tracking-tighter leading-[1.1]">
            {t('headline')}
          </h2>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-7 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-subtle to-transparent" />

          {steps.map((step, i) => (
            <div
              key={i}
              className={`reveal-on-scroll reveal-delay-${Math.min(i + 1, 3)} relative flex flex-col items-center text-center`}
            >
              <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-subtle bg-canvas font-display text-lg text-fg">
                {step.number}
                <span className="absolute -inset-px rounded-2xl bg-gradient-to-b from-accent/20 to-transparent opacity-50 pointer-events-none" />
              </div>
              <h3 className="mt-6 font-display text-fg text-lg leading-tight">
                {step.title}
              </h3>
              <p className="mt-2 max-w-xs text-fg-muted text-[13.5px] leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
