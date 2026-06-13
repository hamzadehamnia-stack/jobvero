const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**' }, // company logos from any CDN
    ],
  },
  // pdf-parse and mammoth use Node.js built-ins (fs, path, canvas) —
  // mark them as server-only so Next.js doesn't attempt to bundle them for the edge runtime
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'mammoth', 'puppeteer', 'puppeteer-core', '@sparticuz/chromium'],
  },
};

module.exports = withNextIntl(nextConfig);
