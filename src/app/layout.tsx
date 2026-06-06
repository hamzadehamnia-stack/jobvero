import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import ThemeProvider from '@/components/ThemeProvider';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" translate="no" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {/*
         * Anti-FOUC: plain <script> placed in the React tree inside <body>.
         * It runs synchronously before React hydrates and before the first paint,
         * reading localStorage to apply the 'dark' class if needed.
         *
         * Using a raw <script> (not next/script) keeps the DOM position in <body>
         * exactly matching the React virtual DOM — no hydration mismatch.
         * The class change on <html> is covered by suppressHydrationWarning above.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
