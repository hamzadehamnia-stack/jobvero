import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import { ArrowRight } from 'lucide-react';

export default function CTA({ locale }: { locale: string }) {
  const t = useTranslations('cta');

  return (
    <section className="py-24 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <div className="gradient-border inline-block w-full">
          <div className="bg-gray-950 rounded-[calc(0.75rem-1px)] px-8 py-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">{t('headline')}</h2>
            <p className="text-gray-400 text-lg mb-10 max-w-xl mx-auto">{t('subheadline')}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" href={`/${locale}/pricing`}>
                {t('ctaPrimary')}
                <ArrowRight size={18} className="ml-2" />
              </Button>
              <Button size="lg" variant="secondary" href={`/${locale}/pricing`}>
                {t('ctaSecondary')}
              </Button>
            </div>
            <p className="mt-6 text-xs text-gray-600">{t('disclaimer')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
