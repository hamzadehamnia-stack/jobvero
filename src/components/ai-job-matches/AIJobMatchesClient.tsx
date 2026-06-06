'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { logApplicationEvent } from '@/lib/applicationEvents';
import {
  Sparkles, RefreshCw, Loader2, AlertCircle, CheckCircle,
  MapPin, BookmarkPlus, Zap, Briefcase, TrendingUp, Clock,
} from 'lucide-react';
import type { MatchResult } from '@/app/api/ai-job-matches/route';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  userId:         string;
  hasProfile:     boolean;
  hasCv:          boolean;
  initialMatches: MatchResult[];
  cachedAt:       string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreStyle(score: number) {
  if (score >= 90) return {
    badge: 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
    bar:   'bg-emerald-500',
    ring:  'ring-emerald-200 dark:ring-emerald-800',
  };
  if (score >= 70) return {
    badge: 'bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    bar:   'bg-amber-500',
    ring:  'ring-amber-200 dark:ring-amber-800',
  };
  return {
    badge: 'bg-orange-100 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800',
    bar:   'bg-orange-500',
    ring:  'ring-orange-200 dark:ring-orange-800',
  };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 animate-pulse">
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-2 flex-1">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-lg w-3/4" />
          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-lg w-1/2" />
        </div>
        <div className="w-14 h-7 bg-gray-200 dark:bg-gray-700 rounded-full ml-3 flex-shrink-0" />
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full mb-4" />
      <div className="space-y-2 mb-5">
        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-full" />
        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-5/6" />
        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-4/6" />
      </div>
      <div className="flex gap-2">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-xl flex-1" />
        <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded-xl w-20" />
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIJobMatchesClient({
  userId, hasProfile, hasCv, initialMatches, cachedAt,
}: Props) {
  const [matches,     setMatches]     = useState<MatchResult[]>(initialMatches);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [info,        setInfo]        = useState('');
  const [savedIds,    setSavedIds]    = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<string | null>(cachedAt);
  const [hasSearched, setHasSearched] = useState(initialMatches.length > 0);

  const needsSetup = !hasProfile || !hasCv;

  // ── Fetch / refresh ─────────────────────────────────────────────────────────

  async function fetchMatches(force = false) {
    console.log('[AIJobMatchesClient] fetchMatches called, force=', force);
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const res  = await fetch(`/api/ai-job-matches${force ? '?force=1' : ''}`);
      const data = await res.json() as { matches?: MatchResult[]; error?: string; message?: string };
      console.log('[AIJobMatchesClient] API response:', { ok: res.ok, matchCount: data.matches?.length, error: data.error, message: data.message });
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch matches');
      setMatches(data.matches ?? []);
      setHasSearched(true);
      setLastUpdated(new Date().toISOString());
      if (data.message) setInfo(data.message);
    } catch (e) {
      console.error('[AIJobMatchesClient] fetchMatches error:', e);
      setError(e instanceof Error ? e.message : 'Failed to fetch matches');
    } finally {
      setLoading(false);
    }
  }

  // ── Save job ────────────────────────────────────────────────────────────────

  async function handleSave(match: MatchResult) {
    if (savedIds.has(match.id)) return;
    const supabase = createClient();
    const { data: saved, error: err } = await supabase.from('applications').insert({
      user_id:          userId,
      job_title:        match.title,
      company_name:     match.company,
      location:         match.location    ?? null,
      notes:            match.description ?? null,
      job_url:          match.url         ?? null,
      salary:           match.salary      ?? null,
      job_source:       'ai-matches',
      status:           'saved',
      application_type: 'manual',
    }).select('id').single();
    if (!err) {
      setSavedIds(s => new Set([...s, match.id]));
      if (saved?.id) {
        void logApplicationEvent(supabase, saved.id, userId, 'created',
          `AI match saved: ${match.title} at ${match.company}`, { status: 'saved' });
      }
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">AI Job Matches</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Personalized opportunities based on your profile</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {lastUpdated && !loading && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
                <Clock size={11} />
                Updated {fmtDate(lastUpdated)}
              </span>
            )}
            <button
              onClick={() => fetchMatches(true)}
              disabled={loading || needsSetup}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}
            >
              {loading
                ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</>
                : <><RefreshCw size={14} /> Refresh Matches</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 px-6 py-6">
        <div className="max-w-5xl mx-auto">

          {/* Error banner */}
          {error && (
            <div className="mb-5 flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              <AlertCircle size={14} className="flex-shrink-0" /> {error}
            </div>
          )}

          {/* Info banner (e.g. no Adzuna results) */}
          {info && !error && (
            <div className="mb-5 flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-300">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {info}
            </div>
          )}

          {/* ── Needs setup ── */}
          {needsSetup ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-950/40 dark:to-indigo-950/40 flex items-center justify-center mb-4 shadow-inner">
                <Briefcase size={28} className="text-violet-500" />
              </div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Complete your profile to get matches</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-xs leading-relaxed">
                {!hasCv && !hasProfile
                  ? 'Add a target job title in Settings and upload a CV so we can find the best opportunities for you.'
                  : !hasCv
                  ? 'Build a CV first so we can match your skills to real job offers.'
                  : 'Add your target job title in Settings so we know what roles to match.'}
              </p>
              <div className="flex gap-3 flex-wrap justify-center">
                {!hasCv && (
                  <Link
                    href="../cv-builder"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md"
                    style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}
                  >
                    Build my CV
                  </Link>
                )}
                {!hasProfile && (
                  <Link
                    href="../settings"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
                  >
                    Update Settings
                  </Link>
                )}
              </div>
            </div>

          ) : loading ? (
            /* ── Skeleton grid ── */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>

          ) : matches.length === 0 ? (
            /* ── No matches yet / searched but empty ── */
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-950/40 dark:to-indigo-950/40 flex items-center justify-center mb-4 shadow-inner">
                <TrendingUp size={28} className="text-violet-500" />
              </div>
              {hasSearched ? (
                <>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No matches found</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-xs leading-relaxed">
                    We couldn&apos;t find matching jobs right now. Try refreshing or update your target job title in Settings.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Ready to find your match</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-xs leading-relaxed">
                    Our AI will analyze your CV and profile to surface the most relevant opportunities — scored just for you.
                  </p>
                </>
              )}
              <button
                onClick={() => fetchMatches(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md shadow-violet-500/20 transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}
              >
                <Sparkles size={14} /> {hasSearched ? 'Try Again' : 'Get My Matches'}
              </button>
            </div>

          ) : (
            /* ── Match grid ── */
            <>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
                {matches.length} matches · sorted by relevance
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {matches.map(match => {
                  const { badge, bar } = scoreStyle(match.score);
                  const isSaved = savedIds.has(match.id);

                  return (
                    <div
                      key={match.id}
                      className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 flex flex-col gap-3 hover:border-violet-300 dark:hover:border-violet-700 transition-colors group"
                    >
                      {/* Title + badge */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-snug line-clamp-2 group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors">
                            {match.title}
                          </h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{match.company}</p>
                        </div>
                        <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${badge}`}>
                          {match.score}%
                        </span>
                      </div>

                      {/* Match score bar */}
                      <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${bar}`}
                          style={{ width: `${match.score}%` }}
                        />
                      </div>

                      {/* Location + salary */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                        {match.location && (
                          <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                            <MapPin size={10} className="flex-shrink-0" />
                            {match.location}
                          </span>
                        )}
                        {match.salary && (
                          <span className="flex items-center gap-1 font-semibold text-gray-700 dark:text-gray-300">
                            💰 {match.salary}
                          </span>
                        )}
                      </div>

                      {/* Match reasons */}
                      {match.reasons.length > 0 && (
                        <ul className="space-y-1.5">
                          {match.reasons.map((reason, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                              <CheckCircle size={10} className="text-violet-500 flex-shrink-0 mt-0.5" />
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 mt-auto pt-1">
                        {match.url ? (
                          <a
                            href={match.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
                            style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}
                          >
                            <Zap size={11} /> Apply with AI
                          </a>
                        ) : (
                          <span
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-white opacity-40 cursor-not-allowed"
                            style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}
                          >
                            <Zap size={11} /> Apply with AI
                          </span>
                        )}

                        <button
                          onClick={() => handleSave(match)}
                          disabled={isSaved}
                          title={isSaved ? 'Saved' : 'Save job'}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                            isSaved
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-violet-300 dark:hover:border-violet-700 hover:text-violet-700 dark:hover:text-violet-300'
                          }`}
                        >
                          {isSaved
                            ? <><CheckCircle size={11} /> Saved</>
                            : <><BookmarkPlus size={11} /> Save</>
                          }
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
