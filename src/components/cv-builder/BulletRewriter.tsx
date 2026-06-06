'use client';

import { useState } from 'react';
import { Wand2, RefreshCw, Check, Loader2, X } from 'lucide-react';

interface Props {
  bullet: string;
  jobTitle?: string;
  company?: string;
  targetCountry?: string;
  language?: string;
  onSelect: (version: string) => void;
}

export default function BulletRewriter({
  bullet,
  jobTitle,
  company,
  targetCountry,
  language,
  onSelect,
}: Props) {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [versions, setVersions]   = useState<string[]>([]);
  const [error, setError]         = useState('');
  const [selected, setSelected]   = useState<number | null>(null);

  const fetchVersions = async () => {
    if (!bullet.trim()) return;
    setLoading(true);
    setError('');
    setVersions([]);
    setSelected(null);
    try {
      const res = await fetch('/api/rewrite-bullet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bullet, jobTitle, company, targetCountry, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate versions');
      setVersions(data.versions);
      setOpen(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An error occurred');
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleButtonClick = async () => {
    if (open && versions.length > 0) {
      setOpen(false);
    } else {
      await fetchVersions();
    }
  };

  const handleSelect = (i: number) => {
    setSelected(i);
    onSelect(versions[i]);
    setTimeout(() => {
      setOpen(false);
      setSelected(null);
    }, 400);
  };

  if (!bullet.trim()) return null;

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={handleButtonClick}
        disabled={loading}
        title="Rewrite with AI"
        className={`flex-shrink-0 p-1.5 rounded-lg transition-all duration-150 disabled:opacity-50
          ${open
            ? 'bg-violet-600 text-white shadow-sm'
            : 'text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/40'
          }`}
      >
        {loading
          ? <Loader2 size={13} className="animate-spin" />
          : <Wand2 size={13} />
        }
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 right-0 top-full mt-1.5 w-80 rounded-2xl
          border border-gray-200 dark:border-gray-700
          bg-white dark:bg-gray-900
          shadow-xl shadow-gray-200/60 dark:shadow-black/50
          overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2
            border-b border-gray-100 dark:border-gray-800
            bg-gray-50 dark:bg-gray-800/80">
            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
              3 AI Versions
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={fetchVersions}
                disabled={loading}
                title="Regenerate"
                className="p-1.5 rounded-lg text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={11} />
              </button>
            </div>
          </div>

          {/* Error state */}
          {error && (
            <div className="px-3 py-2.5 text-xs text-red-600 dark:text-red-400
              bg-red-50 dark:bg-red-950/40 border-b border-red-100 dark:border-red-900">
              {error}
            </div>
          )}

          {/* Version list */}
          {versions.length > 0 && (
            <div className="p-2 space-y-1">
              {versions.map((v, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelect(i)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs leading-relaxed transition-all duration-150
                    ${selected === i
                      ? 'bg-violet-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 hover:text-violet-700 dark:hover:text-violet-300'
                    }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5 transition-colors
                      ${selected === i
                        ? 'bg-white/20 text-white'
                        : 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400'
                      }`}>
                      {selected === i ? <Check size={9} /> : i + 1}
                    </span>
                    <span>{v}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Loading state (after open) */}
          {loading && versions.length === 0 && !error && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400 dark:text-gray-500">
              <Loader2 size={13} className="animate-spin text-violet-500" />
              Generating 3 versions…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
