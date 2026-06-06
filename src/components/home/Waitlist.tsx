'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Mail, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';

export default function Waitlist() {
  const t = useTranslations('waitlist');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'loading' || status === 'success') return;

    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setStatus('error');
      setErrorMsg(t('errorInvalid'));
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });

      if (res.status === 201) {
        setStatus('success');
      } else if (res.status === 409) {
        setStatus('error');
        setErrorMsg(t('errorDuplicate'));
      } else {
        setStatus('error');
        setErrorMsg(t('errorServer'));
      }
    } catch {
      setStatus('error');
      setErrorMsg(t('errorServer'));
    }
  };

  return (
    <section className="relative py-24 px-4 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 dark:from-violet-900 dark:via-violet-950 dark:to-indigo-950" />
      {/* Decorative blobs */}
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-white/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-2xl mx-auto text-center">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 border border-white/20 mb-6">
          <Mail size={24} className="text-white" />
        </div>

        {/* Heading */}
        <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
          {t('title')}
        </h2>
        <p className="text-violet-200 text-lg mb-10 max-w-md mx-auto leading-relaxed">
          {t('subtitle')}
        </p>

        {/* Form / Success */}
        {status === 'success' ? (
          <div className="inline-flex items-center gap-3 bg-white/10 border border-white/20 text-white px-6 py-4 rounded-2xl text-base font-medium backdrop-blur-sm">
            <CheckCircle2 size={20} className="text-emerald-300 flex-shrink-0" />
            {t('success')}
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === 'error') setStatus('idle');
                }}
                placeholder={t('placeholder')}
                className={`flex-1 px-4 py-3 rounded-xl text-sm
                  bg-white/10 border backdrop-blur-sm
                  text-white placeholder-violet-300
                  focus:outline-none focus:ring-2 focus:ring-white/40
                  transition-colors duration-150
                  ${status === 'error'
                    ? 'border-red-400/70'
                    : 'border-white/20 hover:border-white/40'
                  }`}
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl
                  bg-white text-violet-700 font-semibold text-sm
                  hover:bg-violet-50 active:scale-[0.98]
                  disabled:opacity-70 disabled:cursor-not-allowed
                  transition-all duration-150 shadow-lg shadow-black/20
                  flex-shrink-0"
              >
                {status === 'loading' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    {t('cta')}
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </div>

            {/* Error message */}
            {status === 'error' && errorMsg && (
              <p className="mt-3 text-sm text-red-300">{errorMsg}</p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
