import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function CTA({ locale }: { locale: string }) {
  const t = useTranslations('cta');

  return (
    <section className="relative px-4 sm:px-6 py-24 sm:py-32">
      <div className="relative max-w-5xl mx-auto rounded-3xl border border-subtle bg-elevated overflow-hidden">
        {/* Glow */}
        <div className="absolute inset-x-0 -top-24 h-96 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,hsl(var(--accent)/0.30)_0%,transparent_70%)] pointer-events-none" />
        <div
          className="absolute inset-0 opacity-50 pointer-events-none"
          style={{
            maskImage:
              'radial-gradient(ellipse 60% 50% at 50% 0%, black 0%, transparent 70%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 60% 50% at 50% 0%, black 0%, transparent 70%)',
          }}
        >
          <div className="absolute inset-0 bg-grid-pattern bg-grid" style={{ opacity: 0.6 }} />
        </div>

        <div className="relative px-6 sm:px-10 py-16 sm:py-20 text-center">
          <h2 className="font-display text-fg text-3xl sm:text-5xl lg:text-[56px] tracking-tightest leading-[1.05] max-w-2xl mx-auto">
            {t('headline')}
          </h2>
          <p className="mt-5 max-w-xl mx-auto text-fg-muted text-base sm:text-lg leading-relaxed">
            {t('subheadline')}
          </p>

          <div className="mt-9 flex justify-center">
            <Link
              href={`/${locale}/auth/register`}
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-fg px-6 text-[15px] font-medium text-canvas shadow-soft hover:bg-fg/90 active:scale-[0.98] transition-all"
            >
              {t('ctaPrimary')}
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          <p className="mt-5 text-[13px] text-fg-subtle">{t('disclaimer')}</p>
        </div>
      </div>
    </section>
  );
}
