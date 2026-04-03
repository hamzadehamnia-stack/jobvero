'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';
import Button from '@/components/ui/Button';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

export default function Navbar() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  const links = [
    { label: t('home'), href: `/${locale}` },
    { label: t('pricing'), href: `/${locale}/pricing` },
    { label: t('legal'), href: `/${locale}/legal` },
  ];

  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-gray-800/60 bg-gray-950/80 backdrop-blur-md">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href={`/${locale}`} className="flex items-center gap-2">
          <span className="text-xl font-bold gradient-text">Jobvero</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Desktop right */}
        <div className="hidden md:flex items-center gap-4">
          <LanguageSwitcher />
          <Button size="sm" href={`/${locale}/pricing`}>
            {t('getStarted')}
          </Button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-gray-400 hover:text-white"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-gray-800 bg-gray-950 px-4 py-4 flex flex-col gap-4">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="text-sm text-gray-300 hover:text-white transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <LanguageSwitcher />
          <Button size="sm" href={`/${locale}/pricing`} className="w-full">
            {t('getStarted')}
          </Button>
        </div>
      )}
    </header>
  );
}
