'use client';

import { useState } from 'react';
import {
  LifeBuoy, Send, CheckCircle2, AlertCircle, Loader2,
  MessageSquare, Tag,
} from 'lucide-react';

const SUBJECTS = [
  'Technical issue',
  'Billing & subscription',
  'Feature problem',
  'General inquiry',
  'Other',
] as const;

export default function SupportClient() {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const msgLen   = message.trim().length;
  const canSubmit = subject && msgLen >= 50 && msgLen <= 1000 && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/support', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subject, message }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Failed to send message.');
      setSuccess(true);
      setSubject('');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-start justify-center py-10 px-4 bg-gray-50 dark:bg-[#0F172A]">
      <div className="w-full max-w-2xl space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25 flex-shrink-0">
            <LifeBuoy size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Support & Contact</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">We&apos;ll get back to you within 24–48h</p>
          </div>
        </div>

        {/* Success state */}
        {success ? (
          <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 p-10 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Message sent!</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
                Your message has been sent. We&apos;ll get back to you within 24–48h.
              </p>
            </div>
            <button
              onClick={() => setSuccess(false)}
              className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
            >
              Send another message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 p-7 space-y-5">

            {/* Subject */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                <span className="flex items-center gap-1.5"><Tag size={11} /> Subject</span>
              </label>
              <select
                value={subject}
                onChange={e => setSubject(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
                  bg-gray-50 dark:bg-gray-900/50 text-sm text-gray-900 dark:text-white
                  focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500
                  transition-all appearance-none cursor-pointer"
              >
                <option value="" disabled>Select a subject…</option>
                {SUBJECTS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Message */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                <span className="flex items-center gap-1.5"><MessageSquare size={11} /> Message</span>
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value.slice(0, 1000))}
                required
                rows={6}
                maxLength={1000}
                placeholder="Describe your issue or question in detail…"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700
                  bg-gray-50 dark:bg-gray-900/50 text-sm text-gray-900 dark:text-white
                  placeholder:text-gray-400 dark:placeholder:text-gray-600
                  focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500
                  resize-none transition-all"
              />
              <p className={`text-xs mt-1.5 ${
                msgLen > 1000 ? 'text-red-500'
                : msgLen < 50 ? 'text-gray-400'
                : 'text-emerald-500 dark:text-emerald-400'
              }`}>
                {msgLen < 50
                  ? `${msgLen}/1000 characters (minimum 50)`
                  : `${msgLen}/1000 characters ✓`}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <AlertCircle size={15} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white
                disabled:opacity-50 disabled:cursor-not-allowed transition-all
                shadow-lg shadow-violet-500/20 hover:shadow-violet-500/35"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> Sending…</>
                : <><Send size={15} /> Send message</>
              }
            </button>
          </form>
        )}

        {/* Info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: '⚡', title: 'Fast response',  desc: 'Within 24–48h on business days' },
            { icon: '🔒', title: 'Secure data',    desc: 'Your data stays private'        },
            { icon: '💜', title: 'Human support',  desc: 'A real person will reply'       },
          ].map(c => (
            <div key={c.title} className="bg-white dark:bg-gray-800/40 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col items-center text-center gap-1.5">
              <span className="text-xl">{c.icon}</span>
              <p className="text-xs font-semibold text-gray-900 dark:text-white">{c.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{c.desc}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
