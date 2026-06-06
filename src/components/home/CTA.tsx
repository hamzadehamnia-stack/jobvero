import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function CTA({ locale }: { locale: string }) {
  const t = useTranslations('cta');

  return (
    <section className="relative py-28 px-4 overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-700 dark:from-violet-950 dark:via-indigo-950 dark:to-blue-950" />

      {/* Decorative orbs */}
      <div className="absolute -top-40 left-1/4 w-[480px] h-[480px] bg-white/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 right-1/4 w-[400px] h-[400px] bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-2xl mx-auto text-center">
        {/* Headline */}
        <h2 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold text-white mb-5 leading-tight tracking-tight">
          {t('headline')}
        </h2>

        {/* Subheadline */}
        <p className="text-indigo-200 dark:text-indigo-300 text-lg sm:text-xl mb-10 leading-relaxed">
          {t('subheadline')}
        </p>

        {/* Single CTA button */}
        <Link
          href={`/${locale}/auth/register`}
          className="inline-flex items-center justify-center px-10 py-4 rounded-xl
            bg-white text-violet-700 font-bold text-base sm:text-lg
            hover:bg-violet-50 active:scale-[0.97]
            shadow-xl shadow-black/25
            transition-all duration-150"
        >
          {t('ctaPrimary')}
        </Link>

        {/* Small disclaimer */}
        <p className="mt-5 text-sm text-indigo-300/80 dark:text-indigo-400/70">
          {t('disclaimer')}
        </p>
      </div>
    </section>
  );
}
