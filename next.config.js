const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Do not advertise the framework — reduces fingerprinting for targeted CVE probing
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**' }, // company logos from any CDN
    ],
  },
  // pdf-parse and mammoth use Node.js built-ins (fs, path, canvas) —
  // mark them as server-only so Next.js doesn't attempt to bundle them for the edge runtime
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'mammoth', 'puppeteer', 'puppeteer-core', '@sparticuz/chromium-min'],
  },
  // Security headers applied to every route.
  // Note: Content-Security-Policy is NOT set here — it is emitted per-request
  // from middleware.ts because it carries a per-response nonce.
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
