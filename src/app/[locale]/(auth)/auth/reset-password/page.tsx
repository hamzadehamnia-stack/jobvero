'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const t = useTranslations('auth.resetPassword');
  const locale = useLocale();
  const router = useRouter();
  const supabase = createClient();

  const [newPassword, setNewPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword]     = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [success, setSuccess]               = useState(false);
  const [sessionValid, setSessionValid]     = useState<boolean | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      // Give Supabase time to parse the URL fragment / PKCE code
      await new Promise(resolve => setTimeout(resolve, 500));
      const { data: { session } } = await supabase.auth.getSession();
      setSessionValid(!!session);
    };
    checkSession();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError(t('errorTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('errorMismatch'));
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser?.email) {
        await fetch('/api/auth/password-changed-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentUser.email, locale }),
        });
      }
    } catch {
      // Non-blocking — confirmation email failure must not prevent the user from proceeding
    }

    setSuccess(true);
    setTimeout(() => router.push(`/${locale}/auth/login`), 3000);
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (sessionValid === null) {
    return (
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl p-8 flex items-center justify-center gap-3 text-gray-400 dark:text-gray-500">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">{t('loading')}</span>
        </div>
      </div>
    );
  }

  // ── Invalid / expired link ────────────────────────────────────────────────
  if (!sessionValid) {
    return (
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl p-8">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('errorTitle')}</h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('errorInvalidLink')}</p>
          <Link
            href={`/${locale}/auth/forgot-password`}
            className="block w-full text-center px-4 py-3 rounded-xl
              bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400
              text-white font-semibold text-sm shadow-lg shadow-violet-500/20 transition-all"
          >
            {t('requestNewLink')}
          </Link>
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl p-8 text-center">
          <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('successTitle')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('successMessage')}</p>
        </div>
      </div>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-md">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl shadow-gray-200/50 dark:shadow-black/40 p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1.5">{t('title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('subtitle')}</p>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('newPasswordLabel')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={t('passwordPlaceholder')}
                className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 dark:border-gray-700
                  bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                  placeholder:text-gray-400 dark:placeholder:text-gray-500
                  focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
                  transition-colors text-sm"
              />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('confirmPasswordLabel')}
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder={t('confirmPasswordPlaceholder')}
                className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 dark:border-gray-700
                  bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                  placeholder:text-gray-400 dark:placeholder:text-gray-500
                  focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
                  transition-colors text-sm"
              />
              <button type="button" onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !newPassword || !confirmPassword}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
              bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400
              text-white font-semibold text-sm shadow-lg shadow-violet-500/20
              transition-all duration-200 disabled:opacity-60"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? t('updating') : t('updatePassword')}
          </button>
        </form>
      </div>
    </div>
  );
}
