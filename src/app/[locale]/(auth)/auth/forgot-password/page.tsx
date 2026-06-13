'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgotPassword');
  const locale = useLocale();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/${locale}/auth/reset-password`,
    });
    if (error) {
      setError(t('errorGeneric'));
      setLoading(false);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return (
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl shadow-gray-200/50 dark:shadow-black/40 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-violet-100 dark:bg-violet-950/50 flex items-center justify-center mx-auto mb-4">
            <Mail size={28} className="text-violet-600 dark:text-violet-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('successTitle')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('successMessage')}</p>
          <Link
            href={`/${locale}/auth/login`}
            className="inline-flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400 font-medium hover:underline"
          >
            <ArrowLeft size={14} />
            {t('backToLogin')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl shadow-gray-200/50 dark:shadow-black/40 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1.5">{t('title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('email')}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
                bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                placeholder:text-gray-400 dark:placeholder:text-gray-500
                focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
                transition-colors text-sm"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
              bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400
              text-white font-semibold text-sm shadow-lg shadow-violet-500/20
              transition-all duration-200 disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {t('submit')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            href={`/${locale}/auth/login`}
            className="inline-flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400 font-medium hover:underline"
          >
            <ArrowLeft size={14} />
            {t('backToLogin')}
          </Link>
        </div>
      </div>
    </div>
  );
}
