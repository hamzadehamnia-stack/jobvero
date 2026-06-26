'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';

/* ─── Social SVG icons — brand colors ──────────────────────────────────── */

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
      {/* TikTok three-layer logo: cyan shadow, red shadow, black main */}
      <path fill="#69C9D0" d="M19.89 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 1 1-2.09-2.78V9.41a6.34 6.34 0 1 0 5.54 6.26V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" opacity="0.5"/>
      <path fill="#EE1D52" d="M19.59 6.44a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 1 1-2.09-2.78V9.41a6.34 6.34 0 1 0 5.54 6.26V8.44a8.18 8.18 0 0 0 4.78 1.52V6.5a4.85 4.85 0 0 1-1.01-.06z" opacity="0.5"/>
      <path fill="#000" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/>
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
      <path fill="#1877F2" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
          <stop offset="0%"   stopColor="#fdf497"/>
          <stop offset="5%"   stopColor="#fdf497"/>
          <stop offset="45%"  stopColor="#fd5949"/>
          <stop offset="60%"  stopColor="#d6249f"/>
          <stop offset="90%"  stopColor="#285AEB"/>
        </radialGradient>
      </defs>
      <path fill="url(#ig-grad)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
      {/* X/Twitter official black — inverted for dark mode via CSS */}
      <path className="fill-black dark:fill-white" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}

const SOCIAL = [
  { Icon: TikTokIcon,    label: 'TikTok' },
  { Icon: FacebookIcon,  label: 'Facebook' },
  { Icon: InstagramIcon, label: 'Instagram' },
  { Icon: XIcon,         label: 'X (Twitter)' },
];

/* ─── Payment method SVG badges ─────────────────────────────────────────── */
/* Each renders a 38×24 card-shaped badge at its natural brand colors.
   The wrapper applies grayscale + low opacity by default, full color on hover. */

function VisaIcon() {
  return (
    <svg viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="#1A1F71" />
      <text x="19" y="16.5" textAnchor="middle" fill="white"
        fontFamily="Arial, sans-serif" fontSize="11" fontWeight="800" fontStyle="italic"
        letterSpacing="1">VISA</text>
    </svg>
  );
}

function MastercardIcon() {
  return (
    <svg viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="#252525" />
      <circle cx="14.5" cy="12" r="7" fill="#EB001B" />
      <circle cx="23.5" cy="12" r="7" fill="#F79E1B" />
      <path d="M19 6.8a7 7 0 0 1 0 10.4A7 7 0 0 1 19 6.8z" fill="#FF5F00" />
    </svg>
  );
}

function AmexIcon() {
  return (
    <svg viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="#2E77BC" />
      <text x="19" y="16" textAnchor="middle" fill="white"
        fontFamily="Arial, sans-serif" fontSize="8.5" fontWeight="700"
        letterSpacing="0.5">AMERICAN</text>
      <text x="19" y="22" textAnchor="middle" fill="white"
        fontFamily="Arial, sans-serif" fontSize="7" fontWeight="600"
        letterSpacing="1">EXPRESS</text>
    </svg>
  );
}

function DiscoverIcon() {
  return (
    <svg viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="#fff" stroke="#e5e7eb" strokeWidth="0.5" />
      <circle cx="27" cy="12" r="8" fill="#F76F20" opacity="0.9" />
      <text x="6" y="15.5" fill="#231F20"
        fontFamily="Arial, sans-serif" fontSize="6.5" fontWeight="700"
        letterSpacing="0.3">DISCOVER</text>
    </svg>
  );
}

function CBIcon() {
  return (
    <svg viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="#0066B2" />
      <text x="19" y="16.5" textAnchor="middle" fill="white"
        fontFamily="Arial, sans-serif" fontSize="13" fontWeight="800"
        letterSpacing="1">CB</text>
    </svg>
  );
}

function PayPalIcon() {
  return (
    <svg viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="#fff" stroke="#e5e7eb" strokeWidth="0.5" />
      <text x="19" y="15" textAnchor="middle"
        fontFamily="Arial, sans-serif" fontSize="9" fontWeight="800">
        <tspan fill="#003087">Pay</tspan><tspan fill="#009cde">Pal</tspan>
      </text>
    </svg>
  );
}

function ApplePayIcon() {
  return (
    <svg viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="#000" />
      {/* Apple logo mark */}
      <path d="M14.5 7.5c.6-.7 1-1.6.9-2.5-.9.1-2 .6-2.6 1.3-.6.6-.9 1.5-.8 2.4.9 0 1.9-.5 2.5-1.2z" fill="white" />
      <path d="M14.4 8.9c-1.4-.1-2.6.8-3.2.8-.7 0-1.7-.8-2.8-.7-1.4.1-2.7.8-3.4 2-.6 1.1-.8 2.5-.5 3.9.4 2.4 2.8 5.2 4.1 5.2.6 0 1.1-.4 1.9-.4.8 0 1.2.4 2 .4 1.3 0 3.4-2.6 3.7-4.8-1.4-.6-2.3-2-2.3-3.5.1-1.2.7-2.2 1.5-2.9z" fill="white" />
      <text x="25" y="15.5" textAnchor="middle" fill="white"
        fontFamily="Arial, sans-serif" fontSize="7.5" fontWeight="600"
        letterSpacing="0.2">Pay</text>
    </svg>
  );
}

function GooglePayIcon() {
  return (
    <svg viewBox="0 0 38 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="38" height="24" rx="4" fill="#fff" stroke="#e5e7eb" strokeWidth="0.5" />
      {/* Colored G */}
      <text x="8" y="16" fill="#4285F4"
        fontFamily="Arial, sans-serif" fontSize="11" fontWeight="700">G</text>
      <text x="16" y="16" fill="#3C4043"
        fontFamily="Arial, sans-serif" fontSize="9" fontWeight="600">Pay</text>
    </svg>
  );
}

const PAYMENT_ICONS = [
  { Icon: ApplePayIcon,  label: 'Apple Pay' },
  { Icon: GooglePayIcon, label: 'Google Pay' },
  { Icon: VisaIcon,      label: 'Visa' },
  { Icon: MastercardIcon,label: 'Mastercard' },
  { Icon: AmexIcon,      label: 'American Express' },
  { Icon: DiscoverIcon,  label: 'Discover' },
  { Icon: CBIcon,        label: 'CB' },
  { Icon: PayPalIcon,    label: 'PayPal' },
];

/* ─── Store badges ──────────────────────────────────────────────────────── */
function AppStoreBadge() {
  return (
    <svg viewBox="0 0 135 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Download on the App Store">
      <rect width="135" height="40" rx="6" fill="#000"/>
      <rect width="135" height="40" rx="6" fill="none" stroke="#A6A6A6" strokeWidth="0.5"/>
      {/* Apple logo */}
      <path d="M24.77 20.3c-.03-3.25 2.65-4.83 2.77-4.9-1.51-2.21-3.86-2.51-4.7-2.54-1.99-.2-3.9 1.18-4.91 1.18-1.02 0-2.58-1.16-4.25-1.13-2.17.03-4.18 1.27-5.3 3.2-2.27 3.93-.58 9.74 1.62 12.93 1.08 1.56 2.35 3.3 4.02 3.24 1.62-.07 2.23-1.04 4.18-1.04 1.95 0 2.5 1.04 4.2 1.01 1.74-.03 2.84-1.58 3.9-3.15.95-1.38 1.49-2.88 1.52-2.96-.03-.02-2.99-1.15-3.05-4.84z" fill="#fff"/>
      <path d="M21.6 11.37c.87-1.07 1.46-2.54 1.3-4.02-1.26.05-2.82.85-3.73 1.9-.8.93-1.52 2.44-1.33 3.87 1.4.11 2.84-.72 3.76-1.75z" fill="#fff"/>
      {/* "Download on the" */}
      <text x="33" y="16" fill="#fff" fontFamily="'Helvetica Neue',Arial,sans-serif" fontSize="7.5" letterSpacing="0.1">Download on the</text>
      {/* "App Store" */}
      <text x="33" y="28" fill="#fff" fontFamily="'Helvetica Neue',Arial,sans-serif" fontSize="13" fontWeight="600" letterSpacing="-0.2">App Store</text>
    </svg>
  );
}

function GooglePlayBadge() {
  return (
    <svg viewBox="0 0 135 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Get it on Google Play">
      <rect width="135" height="40" rx="6" fill="#000"/>
      <rect width="135" height="40" rx="6" fill="none" stroke="#A6A6A6" strokeWidth="0.5"/>
      {/* Play triangle — 4-color Google style */}
      <path d="M10 8.5l15.5 11.5L10 31.5V8.5z" fill="#EA4335"/>
      <path d="M10 8.5l9 9-9 9V8.5z" fill="#FBBC05"/>
      <path d="M10 8.5l15.5 11.5-6.5 6.5L10 17.5V8.5z" fill="#4285F4"/>
      <path d="M19 20l6.5 6.5-9-6.5H19z" fill="#34A853"/>
      {/* Simpler solid arrow approach */}
      <path d="M8.5 7.5c-.55.3-.9.87-.9 1.55v22c0 .68.35 1.25.9 1.55l.1.06 12.3-12.3v-.14L8.6 7.44l-.1.06z" fill="#EA4335"/>
      <path d="M24.9 24.4l-4.1-4.1v-.14l4.1-4.1.1.05 4.85 2.76c1.39.79 1.39 2.07 0 2.86L25 24.35l-.1.05z" fill="#FBBC05"/>
      <path d="M25 24.35L20.8 20.1 8.5 32.45c.46.49 1.21.55 2.07.06L25 24.35z" fill="#4285F4"/>
      <path d="M25 15.85L10.57 7.59c-.86-.5-1.61-.43-2.07.06L20.8 19.9 25 15.85z" fill="#34A853"/>
      {/* "GET IT ON" */}
      <text x="33" y="16" fill="#fff" fontFamily="'Helvetica Neue',Arial,sans-serif" fontSize="7.5" letterSpacing="0.5">GET IT ON</text>
      {/* "Google Play" */}
      <text x="33" y="28" fill="#fff" fontFamily="'Helvetica Neue',Arial,sans-serif" fontSize="13" fontWeight="500" letterSpacing="-0.2">Google Play</text>
    </svg>
  );
}

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function Footer() {
  const t = useTranslations('footer');
  const locale = useLocale();

  const productLinks = [
    { label: t('links.features'),  href: `#features` },
    { label: t('links.pricing'),   href: `/${locale}/pricing` },
    { label: t('links.about'),     href: `#` },
  ];

  const supportLinks = [
    { label: t('links.contact'),       href: `#` },
    { label: t('links.faq'),           href: `#faq` },
    { label: t('links.legalMentions'), href: `/${locale}/legal` },
    { label: t('links.terms'),         href: `/${locale}/terms` },
    { label: t('links.privacy'),       href: `/${locale}/privacy` },
  ];

  return (
    <footer className="border-t border-subtle bg-canvas">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">

          {/* Brand block */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <Link
              href={`/${locale}`}
              className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-fg w-fit"
            >
              <span className="grid h-7 w-7 place-items-center rounded-md bg-fg text-canvas font-bold text-[12px]">
                J
              </span>
              <span>Jobvero</span>
            </Link>
            <p className="text-[13.5px] text-fg-muted leading-relaxed max-w-sm">
              {t('tagline')}
            </p>

            {/* Social */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {SOCIAL.map(({ Icon, label }) => (
                <button
                  key={label}
                  aria-label={label}
                  className="w-8 h-8 flex items-center justify-center rounded-md border border-subtle hover:border-strong hover:bg-surface transition-colors"
                >
                  <Icon />
                </button>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-8">
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle mb-4">
                {t('product')}
              </h4>
              <ul className="space-y-3">
                {productLinks.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-[13.5px] text-fg-muted hover:text-fg transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle mb-4">
                {t('support')}
              </h4>
              <ul className="space-y-3">
                {supportLinks.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-[13.5px] text-fg-muted hover:text-fg transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right cluster */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle mb-4">
                Download
              </h4>
              <div className="flex flex-col gap-2">
                <div className="w-[135px] h-[40px] rounded-md overflow-hidden opacity-90 hover:opacity-100 transition-opacity">
                  <AppStoreBadge />
                </div>
                <div className="w-[135px] h-[40px] rounded-md overflow-hidden opacity-90 hover:opacity-100 transition-opacity">
                  <GooglePlayBadge />
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle mb-3">
                Payment
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {PAYMENT_ICONS.map(({ Icon, label }) => (
                  <div
                    key={label}
                    title={label}
                    className="w-[34px] h-[22px] rounded overflow-hidden opacity-70 hover:opacity-100 transition-opacity"
                  >
                    <Icon />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-14 pt-6 border-t border-subtle flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[12px] text-fg-subtle">{t('copyright')}</p>
          <p className="text-[12px] text-fg-subtle">
            Made with intent · AI Job Search
          </p>
        </div>
      </div>
    </footer>
  );
}
