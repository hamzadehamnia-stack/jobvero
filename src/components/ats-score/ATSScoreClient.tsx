'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import {
  Target, Loader2, AlertCircle, ChevronDown,
  FileText, Sparkles, CheckCircle2, XCircle,
  ArrowRight, RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import type { ATSResult } from '@/app/api/ats-score/route';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SavedCV {
  id: string;
  title: string;
  content: { personal?: { summary?: string }; [key: string]: unknown };
  template: string | null;
}

interface Props {
  initialCredits: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 71) return '#22c55e';
  if (score >= 41) return '#f97316';
  return '#ef4444';
}

function scoreLabel(score: number, t: (k: string) => string): string {
  if (score >= 71) return t('labelGood');
  if (score >= 41) return t('labelAverage');
  return t('labelPoor');
}

function scoreLabelColor(score: number): string {
  if (score >= 71) return 'text-emerald-500';
  if (score >= 41) return 'text-orange-500';
  return 'text-red-500';
}

// ─── Score Circle (SVG) ───────────────────────────────────────────────────────

function ScoreCircle({ score }: { score: number }) {
  const radius = 52;
  const circ   = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color  = scoreColor(score);

  return (
    <svg width="140" height="140" className="-rotate-90">
      <circle cx="70" cy="70" r={radius} stroke="#e5e7eb" strokeWidth="10" fill="none"
        className="dark:stroke-gray-700" />
      <circle
        cx="70" cy="70" r={radius}
        stroke={color} strokeWidth="10" fill="none"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease' }}
      />
    </svg>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = scoreColor(score);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600 dark:text-gray-300 font-medium">{label}</span>
        <span className="font-bold tabular-nums" style={{ color }}>{score}/100</span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ATSScoreClient({ initialCredits }: Props) {
  const t      = useTranslations('atsScore');
  const locale = useLocale();
  const supabase = useRef(createClient()).current;

  const [credits, setCredits]             = useState(initialCredits);
  const [savedCVs, setSavedCVs]           = useState<SavedCV[]>([]);
  const [selectedCVId, setSelectedCVId]   = useState<string>('');
  const [cvText, setCvText]               = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [inputMode, setInputMode]         = useState<'saved' | 'paste'>('saved');
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [result, setResult]               = useState<ATSResult | null>(null);

  // Load saved CVs
  useEffect(() => {
    supabase.from('cvs').select('id, title, content, template').order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setSavedCVs(data as SavedCV[]);
      });
  }, [supabase]);

  // When a saved CV is selected, extract its text for the API
  const extractCVText = useCallback((cv: SavedCV): string => {
    try {
      const c = cv.content as Record<string, unknown>;
      const parts: string[] = [];
      const personal = c.personal as Record<string, string> | undefined;
      if (personal) {
        if (personal.firstName) parts.push(`${personal.firstName} ${personal.lastName ?? ''}`);
        if (personal.jobTitle)  parts.push(personal.jobTitle);
        if (personal.email)     parts.push(personal.email);
        if (personal.summary)   parts.push(personal.summary);
      }
      const experience = c.experience as Array<Record<string, string>> | undefined;
      experience?.forEach(e => {
        if (e.title)       parts.push(e.title);
        if (e.company)     parts.push(e.company);
        if (e.description) parts.push(e.description);
      });
      const education = c.education as Array<Record<string, string>> | undefined;
      education?.forEach(e => {
        if (e.degree)      parts.push(e.degree);
        if (e.school)      parts.push(e.school);
        if (e.description) parts.push(e.description);
      });
      const skills = c.skills as Array<Record<string, string>> | undefined;
      skills?.forEach(s => {
        if (s.name) parts.push(s.name);
      });
      return parts.join('\n');
    } catch {
      return '';
    }
  }, []);

  const handleAnalyze = async () => {
    setError('');

    const finalCVText = inputMode === 'saved'
      ? (() => {
          const cv = savedCVs.find(c => c.id === selectedCVId);
          return cv ? extractCVText(cv) : '';
        })()
      : cvText.trim();

    if (!finalCVText) {
      setError(t('errorNoCv'));
      return;
    }
    if (!jobDescription.trim()) {
      setError(t('errorNoJob'));
      return;
    }
    if (credits <= 0) {
      setError(t('errorNoCredits'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/ats-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText: finalCVText, jobDescription: jobDescription.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const { result: atsResult } = await res.json();
      setResult(atsResult);
      setCredits(c => Math.max(0, c - 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 sm:px-6 py-5 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 flex items-center justify-center shadow-md shadow-violet-500/25">
              <Target size={17} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900 dark:text-white leading-tight">{t('title')}</h1>
              <p className="text-xs text-gray-400 dark:text-gray-500">{t('subtitle')}</p>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
            credits === 0
              ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400'
              : credits <= 3
              ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400'
              : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
          }`}>
            <Sparkles size={12} />
            {credits} {t('creditsLeft')}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* ══ LEFT — Input Form ══ */}
          <div className="space-y-5">

            {/* ── CV Section ── */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                <FileText size={16} className="text-violet-500" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('sectionCV')}</h2>
              </div>
              <div className="p-5 space-y-4">
                {/* Mode toggle */}
                <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 text-sm">
                  <button
                    type="button"
                    onClick={() => setInputMode('saved')}
                    className={`flex-1 py-2 font-medium transition-colors ${
                      inputMode === 'saved'
                        ? 'bg-violet-600 text-white'
                        : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {t('tabSaved')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('paste')}
                    className={`flex-1 py-2 font-medium transition-colors ${
                      inputMode === 'paste'
                        ? 'bg-violet-600 text-white'
                        : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {t('tabPaste')}
                  </button>
                </div>

                {inputMode === 'saved' ? (
                  <div className="relative">
                    <select
                      value={selectedCVId}
                      onChange={e => setSelectedCVId(e.target.value)}
                      className="w-full appearance-none bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 pr-10 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
                    >
                      <option value="">{t('selectCVPlaceholder')}</option>
                      {savedCVs.map(cv => (
                        <option key={cv.id} value={cv.id}>{cv.title}</option>
                      ))}
                    </select>
                    <ChevronDown size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    {savedCVs.length === 0 && (
                      <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{t('noCVsSaved')}{' '}
                        <Link href={`/${locale}/dashboard/cv-builder`} className="text-violet-500 hover:underline">{t('buildOne')}</Link>
                      </p>
                    )}
                  </div>
                ) : (
                  <textarea
                    value={cvText}
                    onChange={e => setCvText(e.target.value)}
                    placeholder={t('cvTextPlaceholder')}
                    rows={10}
                    className="w-full resize-none bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all leading-relaxed"
                  />
                )}
              </div>
            </div>

            {/* ── Job Offer Section ── */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                <Target size={16} className="text-violet-500" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{t('sectionJob')}</h2>
              </div>
              <div className="p-5">
                <textarea
                  value={jobDescription}
                  onChange={e => setJobDescription(e.target.value)}
                  placeholder={t('jobPlaceholder')}
                  rows={10}
                  className="w-full resize-none bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all leading-relaxed"
                />
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{jobDescription.length} {t('characters')}</p>
              </div>
            </div>

            {/* ── Error ── */}
            {error && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
                <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* ── Analyze Button ── */}
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={loading || credits <= 0}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 shadow-lg shadow-violet-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" />{t('analyzing')}</>
              ) : (
                <><Target size={16} />{t('analyze')} · 2 {t('credits')}</>
              )}
            </button>
          </div>

          {/* ══ RIGHT — Results ══ */}
          <div className="space-y-5">
            {!result && !loading && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-10 flex flex-col items-center justify-center text-center gap-4 min-h-[300px]">
                <div className="w-14 h-14 rounded-2xl bg-violet-50 dark:bg-violet-950/40 border border-violet-100 dark:border-violet-800 flex items-center justify-center">
                  <Target size={24} className="text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('emptyTitle')}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-xs">{t('emptyDesc')}</p>
                </div>
              </div>
            )}

            {loading && (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-10 flex flex-col items-center justify-center gap-4 min-h-[300px]">
                <Loader2 size={32} className="animate-spin text-violet-500" />
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('analyzingDesc')}</p>
              </div>
            )}

            {result && !loading && (
              <>
                {/* A) Score Circle */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 flex flex-col items-center gap-2">
                  <div className="relative w-[140px] h-[140px]">
                    <ScoreCircle score={result.overall_score} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-extrabold tabular-nums" style={{ color: scoreColor(result.overall_score) }}>
                        {result.overall_score}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">/100</span>
                    </div>
                  </div>
                  <p className={`text-base font-bold ${scoreLabelColor(result.overall_score)}`}>
                    {scoreLabel(result.overall_score, t)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    className="mt-1 flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  >
                    <RotateCcw size={12} /> {t('newAnalysis')}
                  </button>
                </div>

                {/* B) Score Breakdown */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('breakdown')}</h3>
                  <ScoreBar label={t('keywordsScore')}   score={result.keywords_score} />
                  <ScoreBar label={t('skillsScore')}     score={result.skills_score} />
                  <ScoreBar label={t('experienceScore')} score={result.experience_score} />
                  <ScoreBar label={t('educationScore')}  score={result.education_score} />
                </div>

                {/* C) Missing Keywords */}
                {result.missing_keywords.length > 0 && (
                  <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <XCircle size={15} className="text-red-500" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('missingKeywords')}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {result.missing_keywords.map(kw => (
                        <span key={kw} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* D) Strong Points */}
                {result.strong_points.length > 0 && (
                  <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={15} className="text-emerald-500" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('strongPoints')}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {result.strong_points.map(kw => (
                        <span key={kw} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* E) Recommendations */}
                {result.recommendations.length > 0 && (
                  <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles size={15} className="text-violet-500" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('recommendations')}</h3>
                    </div>
                    <ul className="space-y-2.5">
                      {result.recommendations.map((rec, i) => (
                        <li key={i} className="flex gap-2.5 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 text-xs font-bold flex items-center justify-center mt-0.5">
                            {i + 1}
                          </span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={`/${locale}/dashboard/cv-builder`}
                      className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 transition-all shadow-sm shadow-violet-500/20"
                    >
                      {t('improveCV')}
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
