import { createClient } from '@/lib/supabase/server';
import {
  FileText, Mail, Sparkles, Briefcase, Target, Send,
  ArrowRight, Clock, CheckCircle2, TrendingUp, Plus,
  MapPin, Zap, Flame, Lightbulb, Star, Bookmark,
  ChevronRight, Mic, BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import StatCard from '@/components/dashboard/StatCard';

interface Props {
  params: { locale: string };
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  Applied:   'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/30',
  Screening: 'bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border border-violet-200/60 dark:border-violet-800/30',
  Interview: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/30',
  Offer:     'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/30',
  Rejected:  'bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400 border border-red-200/60 dark:border-red-800/30',
  Saved:     'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200/60 dark:border-gray-700/30',
} as const;

type StatusKey = keyof typeof STATUS_STYLES;

function StatusBadge({ status }: { status: StatusKey }) {
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-lg whitespace-nowrap ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns 0 if the query errors (table missing, RLS block, etc.) */
async function safeCount(p: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try {
    const { count } = await p;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** 7-point sparkline that ramps from (total − recentDelta) up to total */
function sparkline(total: number, delta: number): number[] {
  const base = Math.max(0, total - delta);
  return Array.from({ length: 7 }, (_, i) =>
    Math.round(base + (delta * i) / 6)
  );
}

/** "+N this week" / "-N this week" / "stable" */
function weekDelta(curr: number, prev: number): { text: string; trend: 'up' | 'down' | 'neutral' } {
  if (curr > prev) return { text: `+${curr - prev} this week`, trend: 'up' };
  if (curr < prev) return { text: `−${prev - curr} this week`, trend: 'down' };
  return { text: 'No change', trend: 'neutral' };
}

/** Relative time string */
function relTime(dateStr: string): string {
  const ms   = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  if (hrs < 48)  return 'Yesterday';
  const days = Math.floor(hrs / 24);
  if (days < 7)  return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** DB status string → display label */
function toStatusKey(s: string): StatusKey {
  const m: Record<string, StatusKey> = {
    applied:   'Applied',
    screening: 'Screening',
    interview: 'Interview',
    offer:     'Offer',
    rejected:  'Rejected',
    saved:     'Saved',
  };
  return m[s.toLowerCase()] ?? 'Applied';
}

/** Map application_event.event_type → icon colour */
function eventMeta(type: string): { color: string; iconName: string } {
  switch (type) {
    case 'created':        return { color: '#7C3AED', iconName: 'FileText'    };
    case 'sent':           return { color: '#0EA5E9', iconName: 'Send'        };
    case 'status_changed': return { color: '#10B981', iconName: 'TrendingUp'  };
    case 'reply_received': return { color: '#EC4899', iconName: 'Mail'        };
    default:               return { color: '#6B7280', iconName: 'Clock'       };
  }
}

/** Calculate current streak (consecutive days with ≥1 event, going back from today) */
function calcStreak(dates: string[]): { streak: number; activeDays: Set<string> } {
  const daySet = new Set(dates.map(d => d.split('T')[0]));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const day = new Date(today.getTime() - i * 86_400_000)
      .toISOString().split('T')[0];
    if (daySet.has(day)) {
      streak++;
    } else if (i > 0) {
      break; // gap found — streak ends
    }
  }
  return { streak, activeDays: daySet };
}

/** Build a 7-point sparkline showing streak value over last 7 days */
function streakSparkline(activeDays: Set<string>): number[] {
  const today = new Date();
  let running = 0;
  const points: number[] = [];
  // Build from 6 days ago → today (oldest first)
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today.getTime() - i * 86_400_000)
      .toISOString().split('T')[0];
    if (activeDays.has(day)) running++; else running = 0;
    points.push(running);
  }
  return points;
}

// ─── Plan credit limits ───────────────────────────────────────────────────────
function planCreditLimit(plan: string | null): number {
  switch (plan) {
    case 'premium': return 500;
    case 'pro':     return 100;
    default:        return 50;   // free / trial
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function DashboardPage({ params: { locale } }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user!.id;

  const now     = new Date();
  const d7      = new Date(now.getTime() -  7 * 86_400_000).toISOString();
  const d14     = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const d90     = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const mStart  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // ── Run all queries in parallel — each isolated ────────────────────────────
  const [
    cvTotal, cv7, cvPrev,
    clTotal, cl7, clPrev,
    aaTotal, aa7, aaPrev,
    ivTotal, iv7, ivPrev,
    atsRow,
    eventDates,
    activityRows,
    savedApps,
    trackerApps,
    profileRow,
    featureRows,
  ] = await Promise.all([

    // ── CVs ──────────────────────────────────────────────────────────────────
    safeCount(supabase.from('cvs').select('*', { count: 'exact', head: true }).eq('user_id', uid)),
    safeCount(supabase.from('cvs').select('*', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', d7)),
    safeCount(supabase.from('cvs').select('*', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', d14).lt('created_at', d7)),

    // ── Cover Letters ─────────────────────────────────────────────────────────
    safeCount(supabase.from('cover_letters').select('*', { count: 'exact', head: true }).eq('user_id', uid)),
    safeCount(supabase.from('cover_letters').select('*', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', d7)),
    safeCount(supabase.from('cover_letters').select('*', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', d14).lt('created_at', d7)),

    // ── Auto Apply ────────────────────────────────────────────────────────────
    safeCount(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('application_type', 'auto')),
    safeCount(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('application_type', 'auto').gte('created_at', d7)),
    safeCount(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('application_type', 'auto').gte('created_at', d14).lt('created_at', d7)),

    // ── Interviews ────────────────────────────────────────────────────────────
    safeCount(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'interview')),
    safeCount(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'interview').gte('updated_at', d7)),
    safeCount(supabase.from('applications').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'interview').gte('updated_at', d14).lt('updated_at', d7)),

    // ── ATS avg score ─────────────────────────────────────────────────────────
    Promise.resolve(supabase.from('ats_scores').select('score').eq('user_id', uid).order('created_at', { ascending: false }).limit(7))
      .then(r => r.data ?? []).catch(() => [] as { score: number }[]),

    // ── Streak: all event dates last 90 days ──────────────────────────────────
    Promise.resolve(supabase.from('application_events').select('created_at').eq('user_id', uid).gte('created_at', d90))
      .then(r => (r.data ?? []).map((e: { created_at: string }) => e.created_at)).catch(() => [] as string[]),

    // ── Recent activity ───────────────────────────────────────────────────────
    Promise.resolve(supabase.from('application_events')
      .select('event_type, description, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(10))
      .then(r => r.data ?? []).catch(() => [] as { event_type: string; description: string; created_at: string }[]),

    // ── Saved job matches ─────────────────────────────────────────────────────
    Promise.resolve(supabase.from('applications')
      .select('job_title, company_name, location, job_url')
      .eq('user_id', uid)
      .eq('status', 'saved')
      .order('created_at', { ascending: false })
      .limit(6))
      .then(r => r.data ?? []).catch(() => [] as { job_title: string; company_name: string; location: string | null; job_url: string | null }[]),

    // ── Job Tracker: recent applications ─────────────────────────────────────
    Promise.resolve(supabase.from('applications')
      .select('job_title, company_name, status, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(5))
      .then(r => r.data ?? []).catch(() => [] as { job_title: string; company_name: string; status: string; created_at: string }[]),

    // ── Profile (credits) ─────────────────────────────────────────────────────
    Promise.resolve(supabase.from('profiles')
      .select('ai_credits_remaining, subscription_plan')
      .eq('id', uid)
      .single())
      .then(r => r.data).catch(() => null),

    // ── Feature usage this month ──────────────────────────────────────────────
    Promise.resolve(supabase.from('feature_usage')
      .select('feature_key')
      .eq('user_id', uid)
      .gte('used_at', mStart))
      .then(r => r.data ?? []).catch(() => [] as { feature_key: string }[]),
  ]);

  // ── Process stat card data ─────────────────────────────────────────────────

  const { streak, activeDays } = calcStreak(eventDates);

  const atsScores  = (atsRow as { score: number }[]).map(r => r.score);
  const atsAvg     = atsScores.length ? Math.round(atsScores.reduce((a, b) => a + b, 0) / atsScores.length) : 0;
  const atsSparkline = atsScores.length >= 7
    ? [...atsScores].reverse()
    : [...Array(7 - atsScores.length).fill(0), ...atsScores.reverse()];

  const cvDelta = weekDelta(cv7, cvPrev);
  const clDelta = weekDelta(cl7, clPrev);
  const aaDelta = weekDelta(aa7, aaPrev);
  const ivDelta = weekDelta(iv7, ivPrev);

  const stats = [
    {
      label: 'CVs Created',
      value:    cvTotal,
      iconName: 'FileText',
      color:    '#7C3AED',
      data:     sparkline(cvTotal, cv7),
      delta:    cvDelta.text,
      trend:    cvDelta.trend,
    },
    {
      label: 'Cover Letters',
      value:    clTotal,
      iconName: 'Mail',
      color:    '#10B981',
      data:     sparkline(clTotal, cl7),
      delta:    clDelta.text,
      trend:    clDelta.trend,
    },
    {
      label: 'Auto Apply',
      value:    aaTotal,
      iconName: 'Send',
      color:    '#0EA5E9',
      data:     sparkline(aaTotal, aa7),
      delta:    aaDelta.text,
      trend:    aaDelta.trend,
    },
    {
      label: 'ATS Score',
      value:    atsAvg > 0 ? `${atsAvg}%` : '—',
      iconName: 'BarChart3',
      color:    '#F59E0B',
      data:     atsSparkline,
      delta:    atsAvg > 0 ? `${atsAvg}% avg` : 'No scores yet',
      trend:    'neutral' as const,
    },
    {
      label: 'Interviews',
      value:    ivTotal,
      iconName: 'Mic',
      color:    '#EC4899',
      data:     sparkline(ivTotal, iv7),
      delta:    ivDelta.text,
      trend:    ivDelta.trend,
    },
    {
      label: 'Streak',
      value:    streak > 0 ? `${streak} day${streak === 1 ? '' : 's'}` : '0 days',
      iconName: 'Flame',
      color:    '#F97316',
      data:     streakSparkline(activeDays),
      delta:    streak > 0 ? `${streak} day streak` : 'No streak yet',
      trend:    streak > 0 ? 'up' as const : 'neutral' as const,
    },
  ] satisfies { label: string; value: number | string; iconName: string; color: string; data: number[]; delta: string; trend: 'up' | 'down' | 'neutral' }[];

  // ── Credits ────────────────────────────────────────────────────────────────
  const plan            = (profileRow as { subscription_plan?: string | null } | null)?.subscription_plan ?? null;
  const creditsRemaining = (profileRow as { ai_credits_remaining?: number | null } | null)?.ai_credits_remaining ?? 0;
  const creditLimit     = planCreditLimit(plan);
  const creditsUsed     = Math.max(0, creditLimit - creditsRemaining);

  // Count feature usage this month per key
  const usageByKey: Record<string, number> = {};
  for (const row of featureRows as { feature_key: string }[]) {
    usageByKey[row.feature_key] = (usageByKey[row.feature_key] ?? 0) + 1;
  }

  const creditFeatures = [
    { label: 'CV Builder',    key: 'CV_BUILDER_AI',          color: '#7C3AED' },
    { label: 'Cover Letters', key: 'COVER_LETTER_AI',         color: '#10B981' },
    { label: 'AI Assistant',  key: 'AI_ASSISTANT_CHAT',       color: '#0EA5E9' },
    { label: 'Job Matching',  key: 'AI_JOB_TRACKER_ADVICE',   color: '#F59E0B' },
  ].map(f => ({
    label: f.label,
    color: f.color,
    used:  usageByKey[f.key] ?? 0,
    total: Math.max(1, Math.round(creditLimit / 4)),
  }));

  // ── Recent activity ────────────────────────────────────────────────────────
  const ACTIVITY_ICONS: Record<string, React.ElementType> = {
    FileText: FileText, Send, TrendingUp, Mail, Clock,
  };

  // ── Quick actions (static) ─────────────────────────────────────────────────
  const quickActions = [
    { label: 'Build your CV',      description: 'AI-powered in minutes',     href: `/${locale}/dashboard/cv-builder`,    icon: FileText, primary: true  },
    { label: 'Write Cover Letter', description: 'Generate with AI instantly', href: `/${locale}/dashboard/cover-letters`, icon: Mail,     primary: false },
    { label: 'Auto Apply',         description: 'AI applies to jobs for you', href: `/${locale}/dashboard/job-tracker`,   icon: Send,     primary: false },
    { label: 'Ask AI Assistant',   description: 'Get career advice now',      href: `/${locale}/dashboard/assistant`,     icon: Sparkles, primary: false },
  ];

  const tips = [
    { icon: Flame,     color: '#F59E0B', title: 'Tailor for each role', text: 'Customized CVs increase interview rates by up to 40%.' },
    { icon: Lightbulb, color: '#7C3AED', title: 'Use action verbs',     text: 'Start bullet points with impact verbs like "Led", "Built", "Grew".' },
    { icon: Zap,       color: '#10B981', title: 'ATS keywords matter',  text: 'Mirror the job description language to pass automated screening.' },
  ];

  return (
    <div className="p-5 sm:p-7 max-w-[1400px] mx-auto w-full space-y-6">

      {/* ── KPI stat cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* ── Main 3-col grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left + center (2/3) ── */}
        <div className="xl:col-span-2 space-y-6">

          {/* Quick Actions */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Quick Actions</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {quickActions.map(({ label, description, href, icon: Icon, primary }) => (
                <Link key={label} href={href}
                  className={`group relative flex flex-col gap-3 p-4 rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg
                    ${primary
                      ? 'bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] border-transparent shadow-lg shadow-violet-500/25 text-white'
                      : 'bg-white/80 dark:bg-[#111827]/90 backdrop-blur-sm border-gray-100 dark:border-[#1F2937] hover:border-violet-200 dark:hover:border-violet-800/50 shadow-sm'
                    }`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${primary ? 'bg-white/20' : 'bg-gray-50 dark:bg-gray-800'}`}>
                    <Icon size={18} className={primary ? 'text-white' : 'text-[#7C3AED]'} />
                  </div>
                  <div>
                    <p className={`text-xs font-bold leading-tight ${primary ? 'text-white' : 'text-gray-900 dark:text-white'}`}>{label}</p>
                    <p className={`text-[11px] mt-0.5 leading-snug ${primary ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'}`}>{description}</p>
                  </div>
                  <ArrowRight size={13}
                    className={`absolute bottom-3.5 right-3.5 transition-transform duration-200 group-hover:translate-x-1 ${primary ? 'text-white/50' : 'text-gray-300 dark:text-gray-600'}`}
                  />
                </Link>
              ))}
            </div>
          </section>

          {/* ── AI Job Matches ─────────────────────────────────────────────────── */}
          <section className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] shadow-lg shadow-violet-500/20">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.13),_transparent_60%)] pointer-events-none" />

            <div className="relative flex items-center justify-between gap-4 px-5 pt-5 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Briefcase size={16} className="text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-white leading-tight">Saved Job Matches</h2>
                  <p className="text-[11px] text-white/70 mt-0.5 leading-none">Jobs you bookmarked from search</p>
                </div>
              </div>
              <Link
                href={`/${locale}/dashboard/job-tracker`}
                className="flex-shrink-0 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold px-3.5 py-2 rounded-xl border border-white/20 transition-colors duration-150 whitespace-nowrap"
              >
                View All <ArrowRight size={11} />
              </Link>
            </div>

            <div className="relative px-5 pb-5">
              {(savedApps as { job_title: string; company_name: string; location: string | null; job_url: string | null }[]).length === 0 ? (
                <div className="text-center py-8 text-white/60 text-sm">
                  <Bookmark size={28} className="mx-auto mb-2 opacity-50" />
                  No saved jobs yet — explore jobs and save the ones you like!
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto hide-scrollbar scroll-smooth snap-x snap-mandatory">
                  {(savedApps as { job_title: string; company_name: string; location: string | null; job_url: string | null }[]).map((job, idx) => (
                    <div
                      key={idx}
                      className="group flex-none min-w-[240px] snap-start bg-white rounded-xl p-4 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600 font-bold text-base shadow-sm flex-shrink-0">
                          {job.company_name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <Bookmark size={15} className="text-violet-400 fill-violet-400" />
                      </div>
                      <p className="text-sm font-semibold text-gray-900 leading-snug mb-0.5 truncate">{job.job_title}</p>
                      <p className="text-xs text-gray-500 mb-1.5 truncate">{job.company_name}</p>
                      {job.location && (
                        <div className="flex items-center gap-1">
                          <MapPin size={12} className="text-gray-400 flex-shrink-0" />
                          <span className="text-xs text-gray-400 truncate">{job.location}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ── Job Tracker Table ─────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Job Tracker</h2>
              <Link href={`/${locale}/dashboard/job-tracker`}
                className="flex items-center gap-1 text-xs text-[#7C3AED] dark:text-violet-400 font-semibold hover:underline">
                Add application <Plus size={12} />
              </Link>
            </div>
            <div className="bg-white/80 dark:bg-[#111827]/90 backdrop-blur-sm rounded-2xl border border-gray-100 dark:border-[#1F2937] shadow-sm overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_140px_100px] gap-4 px-5 py-3 border-b border-gray-100 dark:border-[#1F2937] bg-gray-50/60 dark:bg-gray-800/20">
                <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Position</p>
                <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider hidden sm:block">Applied</p>
                <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Status</p>
              </div>

              {(trackerApps as { job_title: string; company_name: string; status: string; created_at: string }[]).length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  No applications yet — start applying to track your progress!
                </div>
              ) : (
                <div className="divide-y divide-gray-50 dark:divide-[#1F2937]">
                  {(trackerApps as { job_title: string; company_name: string; status: string; created_at: string }[]).map((app, idx) => (
                    <div key={idx}
                      className="group grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_140px_100px] gap-4 items-center px-5 py-3.5 hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors duration-150 cursor-pointer">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate group-hover:text-[#7C3AED] dark:group-hover:text-violet-400 transition-colors duration-150">
                          {app.job_title || 'Untitled Role'}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{app.company_name}</p>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block whitespace-nowrap">
                        {new Date(app.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      <StatusBadge status={toStatusKey(app.status)} />
                    </div>
                  ))}
                </div>
              )}

              <div className="px-5 py-3 border-t border-gray-100 dark:border-[#1F2937] bg-gray-50/50 dark:bg-gray-800/20">
                <Link href={`/${locale}/dashboard/job-tracker`}
                  className="text-xs text-[#7C3AED] dark:text-violet-400 font-semibold hover:underline flex items-center gap-1">
                  Open full tracker <ChevronRight size={12} />
                </Link>
              </div>
            </div>
          </section>

        </div>

        {/* ── Right column (1/3) ── */}
        <div className="space-y-5">

          {/* ── Recent Activity ───────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Recent Activity</h2>
              <Link href={`/${locale}/dashboard/analytics`} className="text-xs text-[#7C3AED] dark:text-violet-400 font-semibold hover:underline">View all</Link>
            </div>
            <div className="bg-white/80 dark:bg-[#111827]/90 backdrop-blur-sm rounded-2xl border border-gray-100 dark:border-[#1F2937] shadow-sm overflow-hidden">
              {(activityRows as { event_type: string; description: string; created_at: string }[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <Target size={24} className="text-gray-300 dark:text-gray-600 mb-2" />
                  <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">No activity yet</p>
                  <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">Start exploring jobs to see your activity here!</p>
                </div>
              ) : (
                (activityRows as { event_type: string; description: string; created_at: string }[]).map((ev, i, arr) => {
                  const meta = eventMeta(ev.event_type);
                  const Icon = ACTIVITY_ICONS[meta.iconName] ?? Clock;
                  return (
                    <div key={i}
                      className={`flex items-start gap-3 p-4 hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors duration-150 ${i < arr.length - 1 ? 'border-b border-gray-50 dark:border-[#1F2937]' : ''}`}>
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm"
                        style={{ backgroundColor: meta.color + '18' }}
                      >
                        <Icon size={14} style={{ color: meta.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 dark:text-white leading-snug capitalize">
                          {ev.event_type.replace(/_/g, ' ')}
                        </p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-snug line-clamp-2">{ev.description}</p>
                        <div className="flex items-center gap-1 mt-1.5">
                          <Clock size={10} className="text-gray-300 dark:text-gray-600" />
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{relTime(ev.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* ── AI Credits Panel ──────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">AI Credits Usage</h2>
            </div>
            <div className="bg-white/80 dark:bg-[#111827]/90 backdrop-blur-sm rounded-2xl border border-gray-100 dark:border-[#1F2937] shadow-sm p-4">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100 dark:border-[#1F2937]">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-3xl font-black text-gray-900 dark:text-white tabular-nums">{creditsUsed}</p>
                    <span className="text-sm text-gray-400 font-medium">/ {creditLimit === 500 ? '∞' : creditLimit}</span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">credits used this month</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center">
                  <Zap size={18} className="text-[#7C3AED]" />
                </div>
              </div>

              <div className="space-y-3.5">
                {creditFeatures.map(({ label, used, total, color }) => {
                  const pct = Math.min(100, Math.round((used / total) * 100));
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{label}</span>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">{used} / {total}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-[#1F2937] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700 shadow-sm"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <Link href={`/${locale}/pricing`}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] text-white text-xs font-semibold py-2.5 rounded-xl hover:opacity-90 transition-opacity duration-150 shadow-md shadow-violet-500/20">
                <Zap size={12} /> Upgrade for unlimited credits
              </Link>
            </div>
          </section>

          {/* Career Tips */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Career Tips</h2>
            </div>
            <div className="space-y-3">
              {tips.map(({ icon: Icon, color, title, text }) => (
                <div key={title}
                  className="bg-white/80 dark:bg-[#111827]/90 backdrop-blur-sm rounded-2xl border border-gray-100 dark:border-[#1F2937] p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: color + '18' }}
                    >
                      <Icon size={14} style={{ color }} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">{title}</p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-relaxed">{text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
