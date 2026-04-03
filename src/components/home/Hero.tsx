import { useTranslations } from 'next-intl';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Sparkles, ArrowRight, ChevronDown } from 'lucide-react';

export default function Hero({ locale }: { locale: string }) {
  const t = useTranslations('hero');

  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 pt-16 overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}
      />

      {/* Decorative blobs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative text-center max-w-4xl mx-auto">
        <div className="mb-6 animate-fade-up">
          <Badge>
            <Sparkles size={12} />
            {t('badge')}
          </Badge>
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-white leading-tight mb-6 animate-fade-up">
          {t('headline')}{' '}
          <span className="gradient-text">{t('headlineAccent')}</span>
        </h1>

        <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-up">
          {t('subheadline')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-up">
          <Button size="lg" href={`/${locale}/pricing`}>
            {t('ctaPrimary')}
            <ArrowRight size={18} className="ml-2" />
          </Button>
          <Button size="lg" variant="secondary" href="#features">
            {t('ctaSecondary')}
            <ChevronDown size={18} className="ml-2" />
          </Button>
        </div>

        <p className="mt-8 text-sm text-gray-600 animate-fade-up">{t('socialProof')}</p>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-3 gap-4 max-w-sm mx-auto sm:max-w-md">
          {[
            { value: '10K+', label: t('statsJobSeekers') },
            { value: '94%', label: t('statsSuccessRate') },
            { value: '3x', label: t('statsFasterHiring') },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-gray-900/60 border border-gray-800 rounded-xl p-3 text-center"
            >
              <div className="text-xl font-bold gradient-text">{stat.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
