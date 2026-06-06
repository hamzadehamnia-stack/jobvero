import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { locales } from '@/i18n/config';
import LangSetter from '@/components/LangSetter';
import ScrollReveal from '@/components/ui/ScrollReveal';
import CookieBanner from '@/components/CookieBanner';

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params: { locale },
}: LocaleLayoutProps): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'hero' });
  return {
    title: {
      default: 'Jobvero — AI Job Search Assistant',
      template: '%s | Jobvero',
    },
    description: t('subheadline'),
    metadataBase: new URL('https://getjobvero.com'),
    openGraph: { siteName: 'Jobvero', type: 'website' },
  };
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: LocaleLayoutProps) {
  if (!locales.includes(locale as any)) notFound();

  const messages = await getMessages({ locale });

  return (
    <NextIntlClientProvider messages={messages}>
      <LangSetter />
      <ScrollReveal />
      {children}
      <CookieBanner />
    </NextIntlClientProvider>
  );
}
