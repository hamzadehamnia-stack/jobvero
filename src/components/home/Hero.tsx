import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Sparkles, ArrowRight, ChevronDown } from 'lucide-react';

const WORKERS = [
  {
    src: 'https://images.unsplash.com/photo-1643297654416-05795d62e39c?w=800',
    alt: 'Female doctor in white coat',
    label: 'Healthcare',
    accent: 'from-cyan-500 to-teal-500',
    rotate: '-rotate-[2deg]',
    position: 'left-0 top-0',
  },
  {
    src: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=800',
    alt: 'Male accountant in suit',
    label: 'Business',
    accent: 'from-violet-500 to-purple-600',
    rotate: 'rotate-[1.5deg]',
    position: 'right-0 top-5',
  },
  {
    src: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800',
    alt: 'Construction worker on site',
    label: 'Construction',
    accent: 'from-amber-500 to-orange-500',
    rotate: 'rotate-[1deg]',
    position: 'left-5 bottom-0',
  },
  {
    src: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800',
    alt: 'Plumber / mason at work',
    label: 'Trades',
    accent: 'from-emerald-500 to-green-600',
    rotate: '-rotate-[1.5deg]',
    position: 'right-0 bottom-5',
  },
];

export default function Hero({ locale }: { locale: string }) {
  const t = useTranslations('hero');

  return (
    <section className="relative min-h-screen flex items-center px-4 sm:px-6 pt-16 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 bg-hero-glow pointer-events-none opacity-50 dark:opacity-100" />

      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.2) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Blobs */}
      <div className="absolute top-1/4 -left-40 w-96 h-96 bg-violet-300/10 dark:bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-40 w-96 h-96 bg-cyan-300/10 dark:bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-7xl mx-auto py-16 lg:py-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 xl:gap-20 items-center">

          {/* ── Left: text content ── */}
          <div className="text-center lg:text-left">
            <div className="mb-6 animate-fade-up">
              <Badge>
                <Sparkles size={12} />
                {t('badge')}
              </Badge>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-6xl xl:text-7xl font-extrabold text-gray-900 dark:text-white leading-tight mb-6 animate-fade-up">
              {t('headline')}{' '}
              <span className="gradient-text">{t('headlineAccent')}</span>
            </h1>

            <p className="text-lg sm:text-xl text-gray-500 dark:text-gray-400 max-w-lg mx-auto lg:mx-0 mb-10 leading-relaxed animate-fade-up">
              {t('subheadline')}
            </p>

            <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-4 animate-fade-up">
              <Button size="lg" href={`/${locale}/auth/register`}>
                {t('ctaPrimary')}
                <ArrowRight size={18} className="ml-2" />
              </Button>
              <Button size="lg" variant="secondary" href="#features">
                {t('ctaSecondary')}
                <ChevronDown size={18} className="ml-2" />
              </Button>
            </div>

            <p className="mt-7 text-sm text-gray-400 dark:text-gray-600 animate-fade-up">
              {t('socialProof')}
            </p>

            {/* Stats */}
            <div className="mt-10 grid grid-cols-3 gap-3 max-w-sm mx-auto lg:mx-0">
              {[
                { value: '27M+', label: t('statsJobSeekers') },
                { value: '95%',  label: t('statsSuccessRate') },
                { value: '4',    label: t('statsFasterHiring') },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white/80 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-800 rounded-xl p-3 text-center shadow-sm dark:shadow-none transition-colors duration-200"
                >
                  <div className="text-xl font-bold gradient-text">{stat.value}</div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-tight">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: 2×2 staggered image collage ── */}
          <div className="relative hidden lg:block h-[540px]">
            {/* Soft glow behind cards */}
            <div className="absolute inset-6 bg-gradient-to-br from-violet-200/25 via-cyan-200/15 to-transparent dark:from-violet-800/15 dark:via-cyan-800/10 rounded-3xl blur-2xl pointer-events-none" />

            {WORKERS.map((w) => (
              <div
                key={w.label}
                className={`absolute ${w.position} ${w.rotate} w-[47%] h-[47%]
                  rounded-2xl overflow-hidden
                  border border-white/60 dark:border-gray-700/50
                  shadow-xl shadow-gray-300/50 dark:shadow-black/40
                  transition-transform duration-300 hover:scale-[1.03] hover:z-10`}
              >
                <Image
                  src={w.src}
                  alt={w.alt}
                  fill
                  className="object-cover object-center"
                  sizes="240px"
                  priority={w.label === 'Healthcare' || w.label === 'Business'}
                />
                {/* Bottom gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
              </div>
            ))}

          </div>

        </div>

        {/* Mobile: compact 4-column strip */}
        <div className="lg:hidden mt-12 grid grid-cols-4 gap-2.5">
          {WORKERS.map((w) => (
            <div
              key={w.label}
              className="relative aspect-[3/4] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-md"
            >
              <Image
                src={w.src}
                alt={w.alt}
                fill
                className="object-cover object-top"
                sizes="90px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
