'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { Check, Copy } from 'lucide-react';
import type { Job } from './types';

// ─── Markdown component map ────────────────────────────────────────────────────

const MD: Components = {
  h1: ({ children }) => (
    <h1 className="text-base font-semibold text-violet-700 dark:text-violet-300 mt-6 mb-2 pb-1 border-b border-violet-200 dark:border-violet-800/40 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-semibold text-violet-700 dark:text-violet-300 mt-5 mb-2 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-[11px] font-bold text-indigo-600 dark:text-indigo-300 uppercase tracking-widest mt-4 mb-1.5 first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3 last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-gray-500 dark:text-gray-400">{children}</em>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 space-y-1.5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 space-y-1.5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-violet-500 dark:bg-violet-400 flex-shrink-0" />
      <span className="flex-1 min-w-0">{children}</span>
    </li>
  ),
};

// ─── Progress loader ───────────────────────────────────────────────────────────

const LABEL_PHASE_1 = '📡 Récupération de l\'offre...';
const LABEL_PHASE_2 = '🤖 Analyse du poste...';

function DescriptionProgress({ pct }: { pct: number }) {
  const phase2 = pct >= 50;
  return (
    <div
      className="rounded-xl px-[18px] py-[18px] border"
      style={{
        background:   'rgba(99,102,241,.07)',
        borderColor:  'rgba(99,102,241,.25)',
      }}
    >
      {/* Row 1 — label + percentage */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 transition-all duration-500"
          key={String(phase2)}
        >
          {phase2 ? LABEL_PHASE_2 : LABEL_PHASE_1}
        </span>
        <span className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 tabular-nums">
          {pct}%
        </span>
      </div>

      {/* Row 2 — progress bar */}
      <div
        className="h-1.5 rounded-full overflow-hidden mb-3"
        style={{ background: 'rgba(99,102,241,.15)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width:      `${pct}%`,
            background: 'linear-gradient(90deg,#6366f1,#7c3aed)',
            boxShadow:  '0 0 8px rgba(99,102,241,.6)',
          }}
        />
      </div>

      {/* Row 3 — patience text */}
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        Veuillez patienter svp
      </p>
    </div>
  );
}

// ─── API response shape ────────────────────────────────────────────────────────

interface FullDescriptionResponse {
  description?: string | null;
  source?:      'cache' | 'scrape' | 'ai' | null;
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  job:        Job;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function JobDescriptionLoader({ job, className }: Props) {
  const [text,    setText]    = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pct,     setPct]     = useState(0);
  const [copied,  setCopied]  = useState(false);

  // Tick the progress bar forward while loading
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Destructure stable primitives so the dependency array stays flat
  const { id, url, title, company, location, salary, jobType, category, description } = job;

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setLoading(true);
    setPct(0);

    // Progress ticker: accelerates to ~92% then slows — never reaches 100%
    // until the fetch resolves
    tickRef.current = setInterval(() => {
      setPct(prev => {
        if (prev >= 92) return prev + 0.2;   // slow crawl above 92
        if (prev >= 70) return prev + 0.8;
        if (prev >= 40) return prev + 1.5;
        return prev + 2.5;
      });
    }, 120);

    fetch('/api/jobs/full-description', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId:        id,
        redirectUrl:  url         ?? null,
        title,
        company,
        location:     location    ?? null,
        salary:       salary      ?? null,
        contractType: jobType     ?? null,
        sector:       category    ?? null,
        excerpt:      description,
      }),
    })
      .then(r => r.ok ? r.json() as Promise<FullDescriptionResponse> : Promise.reject(r.status))
      .then(data => { if (!cancelled && data.description) setText(data.description); })
      .catch(() => null)
      .finally(() => {
        if (tickRef.current) clearInterval(tickRef.current);
        if (!cancelled) {
          setPct(100);
          // brief pause at 100% so the bar visibly completes
          setTimeout(() => { if (!cancelled) setLoading(false); }, 300);
        }
      });

    return () => {
      cancelled = true;
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [id, url, title, company, location, salary, jobType, category, description]);

  const handleCopy = async () => {
    const content = text ?? job.description;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  return (
    <div className={className}>
      {loading ? (
        <DescriptionProgress pct={Math.min(Math.round(pct), 100)} />
      ) : (
        <>
          {/* Copy button — top-right, sits above the markdown */}
          <div className="flex justify-end mb-3">
            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150
                ${copied
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-300 dark:hover:border-indigo-700 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20'
                }`}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? '✓ Copié !' : '⎘ Copier la description'}
            </button>
          </div>

          <ReactMarkdown components={MD} remarkPlugins={[remarkGfm]}>
            {text ?? job.description}
          </ReactMarkdown>
        </>
      )}
    </div>
  );
}
