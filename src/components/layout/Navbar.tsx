'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { useEffect, useRef, useState } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';

export default function Navbar() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const menuLinks = [
    { label: t('signIn'),   href: `/${locale}/auth/login` },
    { label: t('pricing'),  href: `/${locale}/pricing` },
    { label: t('features'), href: `#features` },
    { label: t('about'),    href: `#` },
    { label: t('contact'),  href: `#` },
  ];

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Lock body scroll when menu open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-50 border-b border-gray-200/70 dark:border-gray-800/50 bg-white/75 dark:bg-gray-950/75 backdrop-blur-lg transition-colors duration-200">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 flex h-16 items-center">

          {/* ── Left: Hamburger ── */}
          <div className="flex-1 flex items-center justify-start">
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={open}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-400
                hover:text-gray-900 dark:hover:text-white
                hover:bg-gray-100 dark:hover:bg-gray-800
                transition-colors duration-150"
            >
              {open ? <X size={20} strokeWidth={2} /> : <Menu size={20} strokeWidth={2} />}
            </button>
          </div>

          {/* ── Center: Logo ── */}
          <div className="flex-none">
            <Link
              href={`/${locale}`}
              className="text-xl font-bold gradient-text"
              onClick={() => setOpen(false)}
            >
              Jobvero
            </Link>
          </div>

          {/* ── Right: controls ── */}
          <div className="flex-1 flex items-center justify-end gap-3">
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Link
                href={`/${locale}/auth/login`}
                className="hidden sm:inline-flex text-sm font-medium text-gray-700 dark:text-gray-300
                  hover:text-violet-600 dark:hover:text-violet-400 transition-colors duration-150 px-2"
              >
                {t('signIn')}
              </Link>
            </div>
            <Button size="sm" href={`/${locale}/auth/register`} className="hidden sm:inline-flex">
              {t('getStarted')}
            </Button>
          </div>
        </nav>
      </header>

      {/* ── Backdrop ── */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300
          ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />

      {/* ── Slide-down menu panel ── */}
      <div
        ref={menuRef}
        className={`fixed top-16 left-0 right-0 z-40
          bg-white dark:bg-gray-950
          border-b border-gray-200 dark:border-gray-800
          shadow-xl shadow-gray-200/50 dark:shadow-black/50
          transition-all duration-300 ease-out
          ${open
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 -translate-y-3 pointer-events-none'}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <ul className="flex flex-col gap-1">
            {menuLinks.map((link, i) => (
              <li
                key={link.label}
                style={{
                  transitionDelay: open ? `${i * 40}ms` : '0ms',
                }}
                className={`transition-all duration-300
                  ${open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
              >
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="group flex items-center justify-between px-4 py-3 rounded-xl
                    text-gray-700 dark:text-gray-300 font-medium
                    hover:text-gray-900 dark:hover:text-white
                    hover:bg-gray-50 dark:hover:bg-gray-900/60
                    transition-colors duration-150"
                >
                  <span>{link.label}</span>
                  <ArrowRight
                    size={15}
                    className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 text-gray-400"
                  />
                </Link>
              </li>
            ))}
          </ul>

          {/* Mobile CTA */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800 sm:hidden">
            <Button size="sm" href={`/${locale}/auth/register`} className="w-full justify-center" onClick={() => setOpen(false)}>
              {t('getStarted')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
