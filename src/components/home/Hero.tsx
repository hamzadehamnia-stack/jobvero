import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Sparkles, ArrowRight, Star, Check } from 'lucide-react';

const MATCHES = [
  {
    photo: 'https://images.unsplash.com/photo-1643297654416-05795d62e39c?w=160',
    name: 'Healthcare',
    role: 'Registered Nurse · Paris',
    match: 96,
  },
  {
    photo: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=160',
    name: 'Business',
    role: 'Accountant · Madrid',
    match: 92,
  },
  {
    photo: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=160',
    name: 'Construction',
    role: 'Site Manager · Lyon',
    match: 88,
  },
  {
    photo: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=160',
    name: 'Trades',
    role: 'Plumbing Tech · Lisbon',
    match: 84,
  },
];

export default function Hero({ locale }: { locale: string }) {
  const t = useTranslations('hero');

  return (
    <section className="relative pt-28 sm:pt-32 pb-20 px-4 sm:px-6 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div
        className="absolute inset-0 opacity-[0.7] dark:opacity-100 pointer-events-none"
        style={{
          maskImage:
            'radial-gradient(ellipse 80% 50% at 50% 0%, black 0%, transparent 70%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 80% 50% at 50% 0%, black 0%, transparent 70%)',
        }}
      >
        <div
          className="absolute inset-0 bg-grid-pattern bg-grid"
          style={{ opacity: 0.4 }}
        />
      </div>

      <div className="relative max-w-6xl mx-auto">

        {/* ── Centered headline block ── */}
        <div className="flex flex-col items-center text-center">
          <div className="animate-fade-up">
            <Badge variant="accent">
              <Sparkles size={11} />
              {t('badge')}
            </Badge>
          </div>

          <h1 className="mt-7 max-w-4xl font-display text-fg text-[44px] sm:text-[60px] lg:text-[72px] leading-[1.05] tracking-tightest animate-fade-up">
            {t('headline')}{' '}
            <span className="text-gradient-accent">{t('headlineAccent')}</span>
          </h1>

          <p className="mt-6 max-w-xl text-fg-muted text-base sm:text-lg leading-relaxed animate-fade-up">
            {t('subheadline')}
          </p>

          <div className="mt-9 flex flex-col sm:flex-row items-center gap-3 animate-fade-up">
            <Button size="lg" href={`/${locale}/auth/register`}>
              {t('ctaPrimary')}
              <ArrowRight size={16} />
            </Button>
            <Button size="lg" variant="outline" href="#features">
              {t('ctaSecondary')}
            </Button>
          </div>

          {/* Social proof */}
          <div className="mt-7 flex items-center gap-3 text-[13px] text-fg-subtle animate-fade-up">
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={12} className="text-amber-400 fill-amber-400" />
              ))}
            </div>
            <span>{t('socialProof')}</span>
          </div>
        </div>

        {/* ── Product preview card ── */}
        <div className="relative mt-16 sm:mt-20 max-w-5xl mx-auto reveal-on-scroll">
          {/* Glow */}
          <div className="absolute -inset-4 bg-gradient-to-b from-accent/20 to-transparent rounded-3xl blur-3xl opacity-50 pointer-events-none" />

          <div className="relative rounded-2xl border border-subtle bg-elevated shadow-elevated overflow-hidden">
            {/* Window chrome */}
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-subtle bg-surface/50">
              <span className="h-2.5 w-2.5 rounded-full bg-fg-subtle/30" />
              <span className="h-2.5 w-2.5 rounded-full bg-fg-subtle/30" />
              <span className="h-2.5 w-2.5 rounded-full bg-fg-subtle/30" />
              <span className="ml-3 text-[11px] text-fg-subtle font-medium tracking-tight">
                jobvero.com / matches
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr,280px]">
              {/* Main: matches list */}
              <div className="p-5 sm:p-6 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[13px] font-semibold text-fg">AI Job Matches</h3>
                  <span className="text-[11px] text-fg-subtle">Updated · Now</span>
                </div>
                {MATCHES.map((m) => (
                  <div
                    key={m.name}
                    className="group flex items-center gap-3 p-3 rounded-xl border border-subtle hover:border-strong bg-surface/60 transition-colors"
                  >
                    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-subtle">
                      <Image src={m.photo} alt={m.name} fill className="object-cover" sizes="40px" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-fg leading-tight truncate">
                        {m.name}
                      </p>
                      <p className="text-[11.5px] text-fg-subtle mt-0.5 truncate">{m.role}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent-soft text-accent text-[11px] font-semibold">
                        <Check size={11} strokeWidth={2.5} />
                        {m.match}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Side panel */}
              <div className="hidden lg:flex flex-col gap-4 p-6 border-l border-subtle bg-surface/30">
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-fg-subtle font-semibold mb-2">
                    {t('statsJobSeekers')}
                  </p>
                  <p className="font-display text-2xl text-fg">27M+</p>
                </div>
                <div className="hairline" />
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-fg-subtle font-semibold mb-2">
                    {t('statsSuccessRate')}
                  </p>
                  <p className="font-display text-2xl text-fg">95%</p>
                </div>
                <div className="hairline" />
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-fg-subtle font-semibold mb-2">
                    {t('statsFasterHiring')}
                  </p>
                  <p className="font-display text-2xl text-fg">
                    4<span className="text-fg-subtle text-base">×</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
