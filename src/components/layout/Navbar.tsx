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
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const navLinks = [
    { label: t('features'), href: `#features` },
    { label: t('pricing'),  href: `/${locale}/pricing` },
    { label: t('about'),    href: `#how-it-works` },
    { label: t('contact'),  href: `#faq` },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-[background,border-color,backdrop-filter] duration-300 ${
          scrolled
            ? 'border-b border-subtle bg-canvas/70 backdrop-blur-xl'
            : 'border-b border-transparent bg-transparent'
        }`}
      >
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 flex h-16 items-center gap-6">

          {/* Logo */}
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-fg"
            onClick={() => setOpen(false)}
          >
            <span className="grid h-7 w-7 place-items-center rounded-md bg-fg text-canvas font-bold text-[12px]">
              J
            </span>
            <span>Jobvero</span>
          </Link>

          {/* Desktop nav */}
          <ul className="hidden md:flex items-center gap-1 ml-4">
            {navLinks.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href}
                  className="px-3 py-2 text-[13.5px] font-medium text-fg-muted hover:text-fg rounded-md transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Right cluster */}
          <div className="flex-1 flex items-center justify-end gap-1.5">
            <ThemeToggle />
            <Link
              href={`/${locale}/auth/login`}
              className="hidden sm:inline-flex px-3 py-2 text-[13.5px] font-medium text-fg-muted hover:text-fg transition-colors"
            >
              {t('signIn')}
            </Link>
            <Button size="sm" href={`/${locale}/auth/register`} className="hidden sm:inline-flex">
              {t('getStarted')}
              <ArrowRight size={14} />
            </Button>

            <button
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={open}
              className="md:hidden p-2 -mr-2 rounded-md text-fg-muted hover:text-fg hover:bg-surface transition-colors"
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </nav>
      </header>

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-canvas/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
        onClick={() => setOpen(false)}
      />

      {/* Mobile menu */}
      <div
        ref={menuRef}
        className={`fixed top-16 left-0 right-0 z-40 md:hidden
          bg-canvas border-b border-subtle
          transition-all duration-300 ease-out-expo
          ${open ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-3 pointer-events-none'}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <ul className="flex flex-col gap-0.5">
            {navLinks.map((link, i) => (
              <li
                key={link.label}
                style={{ transitionDelay: open ? `${i * 30}ms` : '0ms' }}
                className={`transition-all duration-300 ${
                  open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                }`}
              >
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="group flex items-center justify-between px-3 py-3 rounded-md text-[14px] font-medium text-fg hover:bg-surface transition-colors"
                >
                  <span>{link.label}</span>
                  <ArrowRight size={14} className="text-fg-subtle opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-3 pt-3 border-t border-subtle flex flex-col gap-2">
            <Link
              href={`/${locale}/auth/login`}
              onClick={() => setOpen(false)}
              className="text-center px-3 py-2.5 text-[14px] font-medium text-fg-muted hover:text-fg transition-colors"
            >
              {t('signIn')}
            </Link>
            <Button size="md" href={`/${locale}/auth/register`} className="w-full" onClick={() => setOpen(false)}>
              {t('getStarted')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
