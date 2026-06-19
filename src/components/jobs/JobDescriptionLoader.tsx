'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
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

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function DescriptionSkeleton() {
  return (
    <div className="space-y-2.5 animate-pulse" aria-busy="true" aria-label="Loading description">
      <div className="h-3 bg-gray-200 dark:bg-gray-700/40 rounded w-full" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700/40 rounded w-5/6" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700/40 rounded w-4/6" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700/40 rounded w-full" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700/40 rounded w-3/4" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700/40 rounded w-5/6" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700/40 rounded w-2/3" />
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

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setLoading(true);

    fetch('/api/jobs/full-description', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId:        job.id,
        redirectUrl:  job.url        ?? null,
        title:        job.title,
        company:      job.company,
        location:     job.location   ?? null,
        salary:       job.salary     ?? null,
        contractType: job.jobType    ?? null,
        sector:       job.category   ?? null,
        excerpt:      job.description,
      }),
    })
      .then(r => r.ok ? r.json() as Promise<FullDescriptionResponse> : Promise.reject(r.status))
      .then(data => { if (!cancelled && data.description) setText(data.description); })
      .catch(() => null)
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [job.id]);

  return (
    <div className={className}>
      {loading ? (
        <DescriptionSkeleton />
      ) : (
        <ReactMarkdown components={MD} remarkPlugins={[remarkGfm]}>
          {text ?? job.description}
        </ReactMarkdown>
      )}
    </div>
  );
}
