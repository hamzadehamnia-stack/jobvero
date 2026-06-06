'use client';

import { useState } from 'react';
import {
  ChevronDown, ChevronUp, Target, Loader2,
  CheckCircle, XCircle, AlertTriangle, Lightbulb,
} from 'lucide-react';
import type { CVFormData } from './types';

interface MatchResult {
  score: number;
  summary: string;
  strengths: string[];
  presentKeywords: string[];
  missingKeywords: string[];
  suggestions: string[];
  critical: string[];
}

function scoreColors(score: number) {
  if (score >= 75) return { bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-200 dark:ring-emerald-800' };
  if (score >= 50) return { bar: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400',   ring: 'ring-amber-200 dark:ring-amber-800'   };
  return              { bar: 'bg-red-500',          text: 'text-red-600 dark:text-red-400',       ring: 'ring-red-200 dark:ring-red-800'       };
}

export default function CVMatchScore({ cvData }: { cvData: CVFormData }) {
  const [open, setOpen]                   = useState(false);
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading]             = useState(false);
  const [result, setResult]               = useState<MatchResult | null>(null);
  const [error, setError]                 = useState('');

  const analyze = async () => {
    if (!jobDescription.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/cv-match-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvData, jobDescription }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed');
      setResult(data as MatchResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">

      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3
          bg-gray-50 dark:bg-gray-800/60
          hover:bg-gray-100 dark:hover:bg-gray-800
          transition-colors duration-150"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center flex-shrink-0">
            <Target size={14} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">CV Match Score</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-none mt-0.5">
              {result ? `${result.score}% match` : 'Paste a job offer to check compatibility'}
            </p>
          </div>
        </div>
        {open
          ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" />
          : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />
        }
      </button>

      {/* Expanded body */}
      {open && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">

          <textarea
            rows={5}
            value={jobDescription}
            onChange={e => setJobDescription(e.target.value)}
            placeholder="Paste the full job description here…"
            className="w-full px-3.5 py-2.5 rounded-xl
              border border-gray-200 dark:border-gray-700
              bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs
              placeholder:text-gray-400 dark:placeholder:text-gray-500
              focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
              resize-none transition-colors"
          />

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400
              bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800
              px-3 py-2 rounded-xl">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={analyze}
            disabled={loading || !jobDescription.trim()}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl
              bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500
              text-white text-xs font-semibold shadow-md shadow-violet-500/20
              disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {loading
              ? <><Loader2 size={13} className="animate-spin" /> Analysing…</>
              : <><Target size={13} /> Analyse Match</>
            }
          </button>

          {/* Results */}
          {result && (
            <div className="space-y-3 pt-1">

              {/* Score bar */}
              <div className={`flex items-center gap-4 p-3 rounded-xl ring-1 ${scoreColors(result.score).ring} bg-white dark:bg-gray-800`}>
                <div className={`text-4xl font-black tabular-nums leading-none ${scoreColors(result.score).text}`}>
                  {result.score}%
                </div>
                <div className="flex-1 min-w-0">
                  <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden mb-1.5">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${scoreColors(result.score).bar}`}
                      style={{ width: `${result.score}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-snug">
                    {result.summary}
                  </p>
                </div>
              </div>

              {/* Present keywords */}
              {result.presentKeywords?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">
                    Present
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {result.presentKeywords.map((kw, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
                        bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400
                        border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle size={9} /> {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing keywords */}
              {result.missingKeywords?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">
                    Missing
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {result.missingKeywords.map((kw, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
                        bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400
                        border border-red-200 dark:border-red-800">
                        <XCircle size={9} /> {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Strengths */}
              {result.strengths?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">
                    Strengths
                  </p>
                  <ul className="space-y-1">
                    {result.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                        <CheckCircle size={11} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Critical gaps */}
              {result.critical?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">
                    Critical Gaps
                  </p>
                  <ul className="space-y-1">
                    {result.critical.map((c, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                        <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggestions */}
              {result.suggestions?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">
                    Suggestions
                  </p>
                  <ul className="space-y-1">
                    {result.suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                        <Lightbulb size={11} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
}
