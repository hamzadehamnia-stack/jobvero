'use client';
import { useLocale } from 'next-intl';
import { useEffect } from 'react';

// Sets <html lang="..."> on the client to match the active locale.
// The root layout renders a static lang="en" default for SSR;
// this corrects it after hydration without causing a mismatch.
export default function LangSetter() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
