const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// ─── Content-Security-Policy ──────────────────────────────────────────────────
// Every client-side fetch in this app is same-origin (/api/*, see ENGINE_URLS in
// JobsClient.tsx); Supabase is the only external origin the browser talks to.
//
// script-src keeps 'unsafe-inline' and 'unsafe-eval' on purpose: the anti-FOUC
// script in layout.tsx is inline, and moving to a nonce requires threading it
// through next-intl's middleware response, which cannot be regression-tested
// without an authenticated session. So script-src is NOT the XSS control here --
// sanitising the dangerouslySetInnerHTML sinks is. What this policy does buy is
// the set of directives that block XSS *escalation* and cost nothing:
// base-uri (base-tag hijacking), object-src, form-action (credential
// exfiltration to a foreign endpoint) and frame-ancestors (clickjacking).
const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
  } catch {
    return '';
  }
})();

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${SUPABASE_ORIGIN ? ` ${SUPABASE_ORIGIN} ${SUPABASE_ORIGIN.replace(/^https:/, 'wss:')}` : ''}`,
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Do not advertise the framework — reduces fingerprinting for targeted CVE probing
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Company logos come from Adzuna / JSearch / France Travail, which return
      // arbitrary CDN URLs (see pickLogo in JobsClient.tsx). The host cannot be
      // enumerated ahead of time, so the wildcard stays — but note it makes
      // /_next/image a remote fetcher. https only: an http:// target such as a
      // link-local metadata address is rejected before any request is made.
      { protocol: 'https', hostname: '**' },
    ],
    // Never rasterise remote SVG: it can carry script and would then be served
    // from our own origin. This is the Next.js default; pinned explicitly so a
    // future edit has to opt in deliberately.
    dangerouslyAllowSVG: false,
    // Anything that slips through is downloaded, not rendered inline on our origin.
    contentDispositionType: 'attachment',
  },
  // pdf-parse and mammoth use Node.js built-ins (fs, path, canvas) —
  // mark them as server-only so Next.js doesn't attempt to bundle them for the edge runtime
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'mammoth', 'puppeteer', 'puppeteer-core', '@sparticuz/chromium-min'],
  },
  // Security headers applied to every route.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Send the full URL only to same-origin targets; cross-origin gets the
          // bare origin. Prevents dashboard URLs (which embed record ids) from
          // leaking to job boards and company sites the user clicks through to.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Never let the browser second-guess Content-Type. Without this, a
          // response carrying user-derived content can be sniffed as script.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Clickjacking: the app is never meant to be framed. Legacy header for
          // old browsers; CSP frame-ancestors in middleware.ts is the modern one.
          { key: 'X-Frame-Options', value: 'DENY' },
          // Least privilege on device APIs. microphone=self is required by the
          // interview coach (getUserMedia in InterviewCoachClient); camera and
          // geolocation are never used by this app, so deny them outright.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), microphone=(self), payment=(), usb=(), interest-cohort=()',
          },
          // Pin the origin to HTTPS for 2 years. Vercel already redirects to
          // HTTPS, but the redirect itself is the window an SSL-strip attack
          // needs; HSTS closes it after the first visit. Browsers ignore this
          // header over plain HTTP, so local dev is unaffected.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'Content-Security-Policy', value: CSP_DIRECTIVES },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      const existing = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [...existing, '@sparticuz/chromium-min', 'puppeteer-core'];
    }
    return config;
  },
};

module.exports = withNextIntl(nextConfig);
