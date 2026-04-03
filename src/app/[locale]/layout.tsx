import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { locales } from '@/i18n/config';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import LangSetter from '@/components/LangSetter';

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
    openGraph: {
      siteName: 'Jobvero',
      type: 'website',
    },
  };
}

export default async function LocaleLayout({
  children,
  params: { locale },
}: LocaleLayoutProps) {
  if (!locales.includes(locale as any)) notFound();

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <LangSetter />
      <div className="min-h-screen flex flex-col bg-gray-950">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </NextIntlClientProvider>
  );
}
