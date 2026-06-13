'use client';

import { useState, useMemo } from 'react';
import {
  ComposedChart, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import {
  Briefcase, TrendingUp, Clock, Target, BarChart2,
  ArrowUp, ArrowDown, Minus, Send, MessageCircle,
  RefreshCw, Calendar, Trophy, Plus, XCircle,
  Activity, Filter, ChevronDown,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawApp {
  id: string;
  job_title: string | null;
  company_name: string | null;
  location: string | null;
  status: string;
  job_source: string | null;
  sent_at: string | null;
  created_at: string;
  send_status: string | null;
  application_type: string | null;
}

export interface RawEvent {
  id: string;
  application_id: string;
  event_type: string;
  description: string;
  created_at: string;
}

export interface AnalyticsData {
  rawApps:   RawApp[];
  rawEvents: RawEvent[];
}

type DateRange = '7d' | '30d' | '90d' | 'all';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  saved: '#64748b', applied: '#3b82f6', interview: '#f59e0b',
  offer: '#10b981', rejected: '#ef4444',
};
const STATUS_LABELS: Record<string, string> = {
  saved: 'Saved', applied: 'Applied', interview: 'Interview',
  offer: 'Offer', rejected: 'Rejected',
};
const STATUS_STYLES: Record<string, string> = {
  saved:     'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
  applied:   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  interview: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  offer:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  rejected:  'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400',
};

const SOURCE_LABELS: Record<string, string> = {
  'france-travail': 'France Travail',
  adzuna:   'Jobvero',
  jsearch:  'JSearch',
  reed:     'Reed',
  'auto-apply': 'Auto Apply',
  manual:   'Manual',
  unknown:  'Unknown',
};

const EVENT_META: Record<string, { icon: React.ElementType; color: string; dotColor: string }> = {
  created:             { icon: Plus,          color: 'text-gray-400',   dotColor: 'bg-gray-400' },
  sent:                { icon: Send,           color: 'text-blue-500',   dotColor: 'bg-blue-500' },
  send_failed:         { icon: XCircle,        color: 'text-red-500',    dotColor: 'bg-red-500' },
  reply_received:      { icon: MessageCircle,  color: 'text-violet-500', dotColor: 'bg-violet-500' },
  status_changed:      { icon: RefreshCw,      color: 'text-amber-500',  dotColor: 'bg-amber-500' },
  interview_scheduled: { icon: Calendar,       color: 'text-teal-500',   dotColor: 'bg-teal-500' },
  offer_received:      { icon: Trophy,         color: 'text-emerald-500',dotColor: 'bg-emerald-500' },
  rejected:            { icon: XCircle,        color: 'text-red-500',    dotColor: 'bg-red-500' },
};

const DATE_RANGE_OPTIONS: { label: string; value: DateRange }[] = [
  { label: '7 days',   value: '7d'  },
  { label: '30 days',  value: '30d' },
  { label: '90 days',  value: '90d' },
  { label: 'All time', value: 'all' },
];

const DAYS_SHORT  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_SLOTS  = [
  { label: 'Night',      sub: '0–6h'   },
  { label: 'Morning',    sub: '6–12h'  },
  { label: 'Afternoon',  sub: '12–18h' },
  { label: 'Evening',    sub: '18–24h' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTime(dateStr: string): string {
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7)  return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function extractKeyword(title: string | null): string {
  if (!title) return 'Other';
  const stop = new Set(['de', 'du', 'des', 'le', 'la', 'les', 'et', 'en', 'h/f', 'f/h',
    'junior', 'senior', 'stage', 'alternance', 'cdi', 'cdd', 'the', 'a', 'an', 'for', '&', 'at']);
  const words = title.toLowerCase()
    .replace(/[()\/\\–-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stop.has(w));
  return words.slice(0, 2).join(' ') || title.slice(0, 18);
}

function heatIntensity(count: number, max: number) {
  if (count === 0 || max === 0) return 'bg-gray-100 dark:bg-gray-800/60 text-gray-300 dark:text-gray-700';
  const r = count / max;
  if (r < 0.2) return 'bg-violet-100 dark:bg-violet-900/30 text-violet-500 dark:text-violet-400';
  if (r < 0.4) return 'bg-violet-200 dark:bg-violet-800/50 text-violet-600 dark:text-violet-300';
  if (r < 0.65) return 'bg-violet-400 dark:bg-violet-600/70 text-white';
  return 'bg-violet-600 dark:bg-violet-500 text-white';
}

function rateColor(rate: number): string {
  if (rate > 15) return 'text-emerald-500';
  if (rate >= 10) return 'text-amber-500';
  return 'text-red-500';
}
function rateAccent(rate: number): string {
  if (rate > 15) return 'bg-emerald-500';
  if (rate >= 10) return 'bg-amber-500';
  return 'bg-red-500';
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?:  boolean;
  payload?: Array<{ name: string; value: number; color?: string; fill?: string; unit?: string }>;
  label?:   string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 shadow-2xl text-xs min-w-[120px]">
      {label && <p className="text-gray-400 mb-1.5 text-[11px]">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <span style={{ color: p.color ?? p.fill ?? '#a78bfa' }} className="font-medium">{p.name}</span>
          <span className="font-bold text-white tabular-nums">{p.value}{p.unit ?? ''}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, accent, valueColor, trend,
}: {
  icon:        React.ElementType;
  label:       string;
  value:       string | number;
  sub:         string;
  accent:      string;
  valueColor?: string;
  trend?:      { delta: number } | null;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider leading-none">
          {label}
        </p>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}>
          <Icon size={15} className="text-white" />
        </div>
      </div>
      <div>
        <p className={`text-3xl font-bold tabular-nums ${valueColor ?? 'text-gray-900 dark:text-white'}`}>
          {value}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          {trend !== undefined && trend !== null && (
            trend.delta > 0
              ? <ArrowUp size={11} className="text-emerald-500 flex-shrink-0" />
              : trend.delta < 0
              ? <ArrowDown size={11} className="text-red-400 flex-shrink-0" />
              : <Minus size={11} className="text-gray-400 flex-shrink-0" />
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
  title, subtitle, children, className = '',
}: {
  title:      string;
  subtitle?:  string;
  children:   React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 ${className}`}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ height = 180, label = 'No data yet' }: { height?: number; label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center rounded-xl border-2 border-dashed border-gray-100 dark:border-gray-800"
      style={{ height }}
    >
      <BarChart2 size={20} className="text-gray-200 dark:text-gray-700 mb-1.5" />
      <p className="text-xs text-gray-300 dark:text-gray-700">{label}</p>
    </div>
  );
}

// ─── Funnel visualisation ─────────────────────────────────────────────────────

function FunnelViz({ data }: { data: { label: string; count: number; pct: number; color: string }[] }) {
  if (data.every(d => d.count === 0)) return <EmptyChart height={200} />;
  return (
    <div className="space-y-2.5 pt-1">
      {data.map((step, i) => (
        <div key={step.label}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{step.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                {i > 0 && data[i - 1].count > 0
                  ? `${Math.round(step.count / data[i - 1].count * 100)}% of prev`
                  : ''}
              </span>
              <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums w-8 text-right">{step.count}</span>
            </div>
          </div>
          <div className="h-6 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-lg transition-all duration-700"
              style={{ width: `${Math.max(step.pct, step.count > 0 ? 4 : 0)}%`, backgroundColor: step.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

function Heatmap({ data, maxCount }: {
  data: { day: string; slot: string; count: number; rate: number }[];
  maxCount: number;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[480px]">
        {/* Column headers */}
        <div className="grid mb-1.5" style={{ gridTemplateColumns: '56px repeat(4, 1fr)', gap: '6px' }}>
          <div />
          {TIME_SLOTS.map(ts => (
            <div key={ts.label} className="text-center">
              <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">{ts.label}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-600">{ts.sub}</p>
            </div>
          ))}
        </div>
        {/* Data rows */}
        {DAYS_SHORT.map((day, di) => (
          <div key={day} className="grid items-center mb-1.5" style={{ gridTemplateColumns: '56px repeat(4, 1fr)', gap: '6px' }}>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{day}</span>
            {TIME_SLOTS.map((_, si) => {
              const cell = data[di * 4 + si];
              const cls  = heatIntensity(cell?.count ?? 0, maxCount);
              return (
                <div
                  key={si}
                  title={cell ? `${cell.count} apps · ${cell.rate}% response rate` : ''}
                  className={`h-10 rounded-xl flex items-center justify-center text-xs font-semibold cursor-default transition-colors ${cls}`}
                >
                  {(cell?.count ?? 0) > 0 ? cell.count : ''}
                </div>
              );
            })}
          </div>
        ))}
        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 justify-end">
          <span className="text-[11px] text-gray-400">Less</span>
          {['bg-gray-100 dark:bg-gray-800/60', 'bg-violet-100 dark:bg-violet-900/30', 'bg-violet-200 dark:bg-violet-800/50', 'bg-violet-400 dark:bg-violet-600/70', 'bg-violet-600 dark:bg-violet-500'].map((cls, i) => (
            <div key={i} className={`w-5 h-5 rounded-md ${cls}`} />
          ))}
          <span className="text-[11px] text-gray-400">More</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AnalyticsClient({ data }: { data: AnalyticsData }) {
  const { rawApps, rawEvents } = data;

  const [dateRange,    setDateRange]    = useState<DateRange>('30d');
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showFilters,  setShowFilters]  = useState(false);

  // ── All available sources from the data ──────────────────────────────────
  const availableSources = useMemo(() =>
    [...new Set(rawApps.map(a => a.job_source ?? 'manual').filter(Boolean))].sort(),
  [rawApps]);

  // ── Core analytics computation ────────────────────────────────────────────
  const analytics = useMemo(() => {
    const now    = Date.now();
    const msMap  = { '7d': 7, '30d': 30, '90d': 90, 'all': Infinity } as const;
    const days   = msMap[dateRange];
    const start  = days === Infinity ? 0 : now - days * 86_400_000;

    // Filter applications
    const apps = rawApps.filter(a => {
      const ts = new Date(a.created_at).getTime();
      if (ts < start) return false;
      if (sourceFilter.length > 0 && !sourceFilter.includes(a.job_source ?? 'manual')) return false;
      if (statusFilter && a.status !== statusFilter) return false;
      return true;
    });

    const appIds = new Set(apps.map(a => a.id));
    const events = rawEvents.filter(e => appIds.has(e.application_id));

    const replyAppIds = new Set(
      events.filter(e => e.event_type === 'reply_received').map(e => e.application_id)
    );

    // ── Stats ────────────────────────────────────────────────────────────────
    const total     = apps.filter(a => a.status !== 'saved').length;
    const saved     = apps.filter(a => a.status === 'saved').length;
    const applied   = apps.filter(a => ['applied', 'interview', 'offer', 'rejected'].includes(a.status)).length;
    const interviews = apps.filter(a => a.status === 'interview').length;
    const offers     = apps.filter(a => a.status === 'offer').length;
    const responded  = apps.filter(a => ['interview', 'offer', 'rejected'].includes(a.status)).length;

    const responseRate  = applied > 0 ? Math.round(responded  / applied  * 100) : 0;
    const interviewRate = applied > 0 ? Math.round(interviews / applied  * 100) : 0;

    const weekAgo      = now - 7  * 86_400_000;
    const prevWeekAgo  = now - 14 * 86_400_000;
    const thisWeek     = apps.filter(a => new Date(a.created_at).getTime() >= weekAgo).length;
    const prevWeek     = apps.filter(a => {
      const t = new Date(a.created_at).getTime();
      return t >= prevWeekAgo && t < weekAgo;
    }).length;

    // ── Average response time ────────────────────────────────────────────────
    const responseTimes: number[] = [];
    for (const app of apps) {
      if (!app.sent_at) continue;
      const reply = events
        .filter(e => e.application_id === app.id && e.event_type === 'reply_received')
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
      if (!reply) continue;
      const d = (new Date(reply.created_at).getTime() - new Date(app.sent_at).getTime()) / 86_400_000;
      if (d >= 0 && d <= 120) responseTimes.push(d);
    }
    const avgResponseDays = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length)
      : null;

    // ── Weekly trend (8 buckets) ─────────────────────────────────────────────
    const refSunday = new Date(now);
    refSunday.setDate(refSunday.getDate() - refSunday.getDay());
    refSunday.setHours(0, 0, 0, 0);
    const weeklyData = Array.from({ length: 8 }, (_, i) => {
      const ws = new Date(refSunday.getTime() - (7 - i) * 7 * 86_400_000);
      const we = new Date(ws.getTime() + 7 * 86_400_000);
      const slice = apps.filter(a => {
        const t = new Date(a.created_at).getTime();
        return t >= ws.getTime() && t < we.getTime();
      });
      return {
        week:    ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count:   slice.length,
        applied: slice.filter(a => a.status !== 'saved').length,
      };
    });

    // ── Status breakdown ─────────────────────────────────────────────────────
    const statusCounts: Record<string, number> = {};
    for (const a of apps) statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
    const statusData = Object.entries(statusCounts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({
        name:  STATUS_LABELS[name] ?? name,
        value,
        color: STATUS_COLORS[name] ?? '#94a3b8',
      }));

    // ── Source performance ───────────────────────────────────────────────────
    const srcGroups: Record<string, { total: number; applied: number; replied: number; interviews: number }> = {};
    for (const a of apps) {
      const src = a.job_source ?? 'manual';
      if (!srcGroups[src]) srcGroups[src] = { total: 0, applied: 0, replied: 0, interviews: 0 };
      srcGroups[src].total++;
      if (['applied', 'interview', 'offer', 'rejected'].includes(a.status)) {
        srcGroups[src].applied++;
        if (['interview', 'offer', 'rejected'].includes(a.status)) srcGroups[src].replied++;
        if (a.status === 'interview') srcGroups[src].interviews++;
      }
    }
    const sourceData = Object.entries(srcGroups)
      .map(([source, g]) => ({
        source: SOURCE_LABELS[source] ?? source,
        sent:        g.total,
        replies:     g.replied,
        interviews:  g.interviews,
        rate:        g.applied > 0 ? Math.round(g.replied / g.applied * 100) : 0,
      }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 6);

    // ── Keyword / sector performance ─────────────────────────────────────────
    const kwGroups: Record<string, { count: number; replied: number }> = {};
    for (const a of apps.filter(a => a.status !== 'saved')) {
      const kw = extractKeyword(a.job_title);
      if (!kwGroups[kw]) kwGroups[kw] = { count: 0, replied: 0 };
      kwGroups[kw].count++;
      if (['interview', 'offer', 'rejected'].includes(a.status) || replyAppIds.has(a.id)) {
        kwGroups[kw].replied++;
      }
    }
    const sectorData = Object.entries(kwGroups)
      .map(([keyword, { count, replied }]) => ({
        keyword,
        count,
        rate: count > 0 ? Math.round(replied / count * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // ── Location performance ─────────────────────────────────────────────────
    const locGroups: Record<string, { count: number; replied: number }> = {};
    for (const a of apps.filter(a => a.status !== 'saved' && a.location)) {
      const loc = a.location!.split(',')[0].trim();
      if (!locGroups[loc]) locGroups[loc] = { count: 0, replied: 0 };
      locGroups[loc].count++;
      if (['interview', 'offer', 'rejected'].includes(a.status) || replyAppIds.has(a.id)) {
        locGroups[loc].replied++;
      }
    }
    const locationData = Object.entries(locGroups)
      .map(([location, { count, replied }]) => ({
        location,
        count,
        rate: count > 0 ? Math.round(replied / count * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // ── Funnel ───────────────────────────────────────────────────────────────
    const funnelMax = Math.max(saved + applied, 1);
    const funnelData = [
      { label: 'Saved',     count: saved,      pct: Math.round(saved      / funnelMax * 100), color: '#64748b' },
      { label: 'Applied',   count: applied,    pct: Math.round(applied    / funnelMax * 100), color: '#3b82f6' },
      { label: 'Interview', count: interviews, pct: Math.round(interviews / funnelMax * 100), color: '#f59e0b' },
      { label: 'Offer',     count: offers,     pct: Math.round(offers     / funnelMax * 100), color: '#10b981' },
    ];

    // ── Heatmap ──────────────────────────────────────────────────────────────
    const heatGrid: { count: number; replied: number }[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 4 }, () => ({ count: 0, replied: 0 }))
    );
    for (const a of apps) {
      const date    = new Date(a.sent_at || a.created_at);
      const dayIdx  = (date.getDay() + 6) % 7; // 0=Mon … 6=Sun
      const slotIdx = Math.min(3, Math.floor(date.getHours() / 6));
      heatGrid[dayIdx][slotIdx].count++;
      if (['interview', 'offer', 'rejected'].includes(a.status) || replyAppIds.has(a.id)) {
        heatGrid[dayIdx][slotIdx].replied++;
      }
    }
    const heatmapData = DAYS_SHORT.flatMap((day, di) =>
      TIME_SLOTS.map((ts, si) => ({
        day,
        slot:  ts.label,
        count: heatGrid[di][si].count,
        rate:  heatGrid[di][si].count > 0
          ? Math.round(heatGrid[di][si].replied / heatGrid[di][si].count * 100)
          : 0,
      }))
    );
    const heatMaxCount = Math.max(...heatmapData.map(d => d.count), 1);

    // ── Activity timeline ────────────────────────────────────────────────────
    const recentEvents = [...events]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20)
      .map(e => {
        const app = rawApps.find(a => a.id === e.application_id);
        return {
          id:         e.id,
          event_type: e.event_type,
          description:e.description,
          created_at: e.created_at,
          job_title:  app?.job_title  ?? null,
          company:    app?.company_name ?? null,
          status:     app?.status ?? '',
        };
      });

    return {
      total, saved, applied, interviews, offers, responseRate, interviewRate,
      avgResponseDays, thisWeek, prevWeek,
      weeklyData, statusData, sourceData, sectorData, locationData, funnelData,
      heatmapData, heatMaxCount, recentEvents,
    };
  }, [rawApps, rawEvents, dateRange, sourceFilter, statusFilter]);

  const isEmpty = rawApps.length === 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                <Activity size={16} className="text-white" />
              </div>
              Analytics
            </h1>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5 ml-10.5">
              {rawApps.length} applications tracked
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Date range */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-0.5">
              {DATE_RANGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDateRange(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    dateRange === opt.value
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(f => !f)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                showFilters || sourceFilter.length > 0 || statusFilter
                  ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <Filter size={12} />
              Filters
              {(sourceFilter.length > 0 || statusFilter) && (
                <span className="w-4 h-4 rounded-full bg-violet-500 text-white text-[10px] flex items-center justify-center">
                  {sourceFilter.length + (statusFilter ? 1 : 0)}
                </span>
              )}
              <ChevronDown size={12} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-4">
            {/* Source multi-select */}
            {availableSources.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Source</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableSources.map(src => (
                    <button
                      key={src}
                      onClick={() => setSourceFilter(prev =>
                        prev.includes(src) ? prev.filter(s => s !== src) : [...prev, src]
                      )}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        sourceFilter.includes(src)
                          ? 'bg-violet-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {SOURCE_LABELS[src] ?? src}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Status single-select */}
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Status</p>
              <div className="flex flex-wrap gap-1.5">
                {['applied', 'interview', 'offer', 'rejected', 'saved'].map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(prev => prev === s ? '' : s)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      statusFilter === s
                        ? 'bg-violet-600 text-white'
                        : STATUS_STYLES[s]
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {(sourceFilter.length > 0 || statusFilter) && (
              <div className="flex items-end">
                <button
                  onClick={() => { setSourceFilter([]); setStatusFilter(''); }}
                  className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 underline transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 px-6 py-6 space-y-5 max-w-[1400px] mx-auto w-full">

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Briefcase}
            label="Total Applications"
            value={analytics.total}
            sub={analytics.thisWeek > 0
              ? `+${analytics.thisWeek} this week`
              : 'No new apps this week'}
            accent="bg-violet-500"
            trend={{ delta: analytics.thisWeek - analytics.prevWeek }}
          />
          <StatCard
            icon={TrendingUp}
            label="Response Rate"
            value={`${analytics.responseRate}%`}
            sub={`Industry avg: 15% · ${analytics.responseRate > 15 ? 'Above' : analytics.responseRate >= 10 ? 'Near' : 'Below'} average`}
            accent={rateAccent(analytics.responseRate)}
            valueColor={rateColor(analytics.responseRate)}
          />
          <StatCard
            icon={Clock}
            label="Avg Response Time"
            value={analytics.avgResponseDays !== null ? `${analytics.avgResponseDays}d` : '—'}
            sub="Days between send & first reply"
            accent="bg-cyan-500"
          />
          <StatCard
            icon={Target}
            label="Interview Rate"
            value={`${analytics.interviewRate}%`}
            sub={`${analytics.interviews} interview${analytics.interviews !== 1 ? 's' : ''} from ${analytics.applied} applied`}
            accent="bg-amber-500"
          />
        </div>

        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center mb-5">
              <BarChart2 size={32} className="text-violet-300 dark:text-violet-600" />
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">No data yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs leading-relaxed">
              Start applying to jobs via Job Search or the Job Tracker to see your analytics here.
            </p>
          </div>
        ) : (
          <>
            {/* ── Row: Timeline + Funnel ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-3">
                <SectionCard title="Applications Over Time" subtitle="Weekly breakdown — total vs. applied">
                  <ResponsiveContainer width="100%" height={210}>
                    <LineChart data={analytics.weeklyData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.08)" />
                      <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line type="monotone" dataKey="count"   name="Total"   stroke="#7c3aed" strokeWidth={2.5} dot={{ fill: '#7c3aed', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} />
                      <Line type="monotone" dataKey="applied" name="Applied" stroke="#3b82f6" strokeWidth={2}   dot={{ fill: '#3b82f6', r: 2.5, strokeWidth: 0 }} activeDot={{ r: 4, strokeWidth: 0 }} strokeDasharray="4 2" />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-4 mt-2 justify-center">
                    {[{ label: 'Total', color: '#7c3aed' }, { label: 'Applied', color: '#3b82f6' }].map(l => (
                      <div key={l.label} className="flex items-center gap-1.5">
                        <span className="w-3 h-0.5 rounded-full inline-block" style={{ backgroundColor: l.color }} />
                        <span className="text-xs text-gray-400">{l.label}</span>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>

              <div className="lg:col-span-2">
                <SectionCard title="Conversion Funnel" subtitle="Saved → Applied → Interview → Offer">
                  <FunnelViz data={analytics.funnelData} />
                </SectionCard>
              </div>
            </div>

            {/* ── Row: Source performance + Status donut ── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <div className="lg:col-span-3">
                <SectionCard
                  title="Performance by Source"
                  subtitle="Which job board gets you the most replies"
                >
                  {analytics.sourceData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <ComposedChart data={analytics.sourceData} margin={{ top: 4, right: 40, left: -16, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.08)" />
                          <XAxis dataKey="source" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                          <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} unit="%" width={32} />
                          <Tooltip content={<ChartTooltip />} />
                          <Bar yAxisId="left" dataKey="sent"       name="Sent"       fill="#4f46e5" radius={[3, 3, 0, 0]} maxBarSize={20} />
                          <Bar yAxisId="left" dataKey="replies"    name="Replies"    fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={20} />
                          <Bar yAxisId="left" dataKey="interviews" name="Interviews" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={20} />
                          <Line yAxisId="right" type="monotone" dataKey="rate" name="Rate" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3, strokeWidth: 0 }} unit="%" />
                        </ComposedChart>
                      </ResponsiveContainer>
                      <div className="flex items-center gap-4 mt-2 justify-center flex-wrap">
                        {[
                          { label: 'Sent',       color: '#4f46e5' },
                          { label: 'Replies',    color: '#0ea5e9' },
                          { label: 'Interviews', color: '#f59e0b' },
                          { label: 'Rate %',     color: '#10b981' },
                        ].map(l => (
                          <div key={l.label} className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: l.color }} />
                            <span className="text-xs text-gray-400">{l.label}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <EmptyChart height={200} />
                  )}
                </SectionCard>
              </div>

              <div className="lg:col-span-2">
                <SectionCard title="By Status" subtitle="Current distribution">
                  {analytics.statusData.length > 0 ? (
                    <div className="flex flex-col items-center gap-3">
                      <PieChart width={150} height={150}>
                        <Pie data={analytics.statusData} cx={75} cy={75} innerRadius={40} outerRadius={68} dataKey="value" paddingAngle={2}>
                          {analytics.statusData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} strokeWidth={0} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                      <div className="w-full space-y-1.5">
                        {analytics.statusData.map((s, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                              <span className="text-xs text-gray-500 dark:text-gray-400">{s.name}</span>
                            </div>
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 tabular-nums">{s.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <EmptyChart height={220} />
                  )}
                </SectionCard>
              </div>
            </div>

            {/* ── Row: Sector + Location ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              <SectionCard title="Performance by Job Title" subtitle="Top keywords — applied count + response rate">
                {analytics.sectorData.length > 0 ? (
                  <div className="space-y-2.5 pt-1">
                    {analytics.sectorData.map(d => (
                      <div key={d.keyword}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 capitalize truncate max-w-[140px]">
                            {d.keyword}
                          </span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-[11px] font-bold ${rateColor(d.rate)}`}>{d.rate}%</span>
                            <span className="text-xs text-gray-400 tabular-nums w-5 text-right">{d.count}</span>
                          </div>
                        </div>
                        <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                          <div
                            className="bg-indigo-400 dark:bg-indigo-500 rounded-full"
                            style={{ width: `${Math.max((d.count / (analytics.sectorData[0]?.count || 1)) * 100, 4)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyChart />
                )}
              </SectionCard>

              <SectionCard title="Performance by Location" subtitle="Top 5 cities — applied count + response rate">
                {analytics.locationData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={analytics.locationData} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="location"
                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                        tickLine={false}
                        axisLine={false}
                        width={110}
                        tickFormatter={v => v.length > 15 ? `${v.slice(0, 13)}…` : v}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Applied" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={14} />
                      <Bar dataKey="rate"  name="Rate %"  fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart />
                )}
              </SectionCard>
            </div>

            {/* ── Heatmap ── */}
            <SectionCard
              title="Activity Heatmap"
              subtitle="When you apply most — hover for response rate per time slot"
            >
              <Heatmap data={analytics.heatmapData} maxCount={analytics.heatMaxCount} />
            </SectionCard>

            {/* ── Activity Timeline ── */}
            <SectionCard title="Activity Timeline" subtitle={`Last ${analytics.recentEvents.length} events`}>
              {analytics.recentEvents.length > 0 ? (
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-100 dark:bg-gray-800" />
                  <div className="space-y-0">
                    {analytics.recentEvents.map((ev, i) => {
                      const meta = EVENT_META[ev.event_type] ?? EVENT_META['created'];
                      const Icon = meta.icon;
                      return (
                        <div key={ev.id} className={`relative flex gap-3 ${i < analytics.recentEvents.length - 1 ? 'pb-4' : ''}`}>
                          {/* Dot */}
                          <div className={`relative z-10 w-[30px] h-[30px] flex-shrink-0 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-gray-900 ${meta.dotColor}`}>
                            <Icon size={13} className="text-white" />
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 dark:text-white leading-tight truncate">
                                  {ev.description}
                                </p>
                                {(ev.job_title || ev.company) && (
                                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                                    {ev.job_title}{ev.job_title && ev.company ? ' · ' : ''}{ev.company}
                                  </p>
                                )}
                              </div>
                              <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5">
                                {relTime(ev.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="py-8 text-center text-xs text-gray-400 dark:text-gray-600">
                  No events recorded yet. Start applying to jobs to see activity here.
                </p>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </div>
  );
}
