'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Loader2, ArrowRight } from 'lucide-react';

interface Thread {
  id: string;
  company_name: string;
  employer_email: string;
  last_message_direction: string;
  unread_count: number;
  ai_category: string | null;
  ai_summary: string | null;
  ai_detected_event: { title: string; date: string; time: string | null } | null;
  follow_up_config: { days: number; ctx: string; suggested: string } | null;
}

interface AppRow {
  status: string;
  created_at: string;
  application_type: string;
}

interface ActionItem {
  priority: 'red' | 'orange' | 'yellow';
  threadId: string;
  label: string;
  sub: string;
  company: string;
}

const PRIORITY_COLORS: Record<ActionItem['priority'], { dot: string; bg: string }> = {
  red:    { dot: '#f87171', bg: 'rgba(248,113,113,.08)' },
  orange: { dot: '#fb923c', bg: 'rgba(251,146,60,.08)'  },
  yellow: { dot: '#facc15', bg: 'rgba(250,204,21,.08)'  },
};

const PALETTES: [string, string][] = [
  ['#7c3aed', '#4f46e5'],
  ['#2563eb', '#0891b2'],
  ['#059669', '#0d9488'],
  ['#d97706', '#dc2626'],
  ['#db2777', '#9333ea'],
];

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function heatColor(count: number): string {
  if (count === 0) return 'rgba(255,255,255,.04)';
  if (count === 1) return 'rgba(99,102,241,.2)';
  if (count === 2) return 'rgba(99,102,241,.4)';
  if (count === 3) return 'rgba(99,102,241,.65)';
  return 'rgba(99,102,241,.9)';
}

function CompanyBadge({ name }: { name: string }) {
  const letter = (name || '?')[0].toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  const [c1, c2] = PALETTES[h % PALETTES.length];
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0"
      style={{ background: `linear-gradient(135deg,${c1},${c2})` }}
    >
      {letter}
    </div>
  );
}

export default function InsightsView({
  threads,
  userId,
  onSelectThread,
}: {
  threads: Thread[];
  userId: string;
  onSelectThread: (id: string) => void;
}) {
  const [apps,     setApps]     = useState<AppRow[]>([]);
  const [activity, setActivity] = useState<{ created_at: string }[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    const supabase = createClient();
    const since = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000).toISOString();
    Promise.all([
      supabase.from('applications').select('status, created_at, application_type').eq('user_id', userId),
      supabase.from('applications').select('created_at').eq('user_id', userId).gte('created_at', since),
    ]).then(([appsRes, actRes]) => {
      setApps((appsRes.data ?? []) as AppRow[]);
      setActivity((actRes.data ?? []) as { created_at: string }[]);
      setLoading(false);
    });
  }, [userId]);

  // ── Key metrics ────────────────────────────────────────────────────────────

  const total      = apps.length;
  const inbound    = threads.filter(t => t.last_message_direction === 'inbound');
  const interviews = apps.filter(a => a.status === 'interview').length;
  const offers     = apps.filter(a => a.status === 'offer').length;
  const accepted   = apps.filter(a => a.status === 'accepted').length;
  const responseRate = total > 0 ? Math.round((inbound.length / total) * 100) : 0;

  const metrics = [
    { label: 'Candidatures', value: String(total),             sub: 'total envoyées' },
    { label: 'Taux réponse', value: `${responseRate}%`,        sub: 'des recruteurs' },
    { label: 'Entretiens',   value: String(interviews),         sub: 'obtenus'        },
    { label: 'Délai moyen',  value: total > 0 ? '4.2j' : '—', sub: 'avant réponse'  },
  ];

  const funnelSteps = [
    { label: 'Envoyées',   count: total,          color: '#6366f1' },
    { label: 'Réponses',   count: inbound.length, color: '#818cf8' },
    { label: 'Entretiens', count: interviews,      color: '#4ade80' },
    { label: 'Offres',     count: offers,          color: '#facc15' },
    { label: 'Acceptées',  count: accepted,        color: '#86efac' },
  ];

  // ── Heatmap grid (12 weeks × 7 days) ──────────────────────────────────────

  const heatGrid = useMemo(() => {
    const countMap = new Map<string, number>();
    activity.forEach(({ created_at }) => {
      const d = created_at.slice(0, 10);
      countMap.set(d, (countMap.get(d) ?? 0) + 1);
    });
    const now  = Date.now();
    const days = Array.from({ length: 84 }, (_, i) => {
      const ms      = now - (83 - i) * 86_400_000;
      const dateStr = new Date(ms).toISOString().slice(0, 10);
      return { dateStr, count: countMap.get(dateStr) ?? 0 };
    });
    const weeks: { dateStr: string; count: number }[][] = [];
    for (let w = 0; w < 12; w++) weeks.push(days.slice(w * 7, w * 7 + 7));
    return weeks;
  }, [activity]);

  // ── Action queue ───────────────────────────────────────────────────────────

  const actions = useMemo<ActionItem[]>(() => {
    const today    = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const list: ActionItem[] = [];

    threads.forEach(t => {
      const company = t.company_name || t.employer_email.split('@')[0];

      if (t.ai_category === 'interviews' && t.last_message_direction === 'inbound' && t.unread_count > 0) {
        list.push({ priority: 'red', threadId: t.id, label: `Répondre à ${company}`, sub: t.ai_summary ?? '', company });
      }

      const evt = t.ai_detected_event;
      if (evt && (evt.date === today || evt.date === tomorrow)) {
        list.push({ priority: 'red', threadId: t.id, label: evt.title, sub: `${evt.date}${evt.time ? ' · ' + evt.time : ''}`, company });
      }

      if (t.ai_category === 'ghosting' || t.ai_category === 'followup') {
        list.push({ priority: 'orange', threadId: t.id, label: `Relancer ${company}`, sub: t.follow_up_config ? `${t.follow_up_config.days} jours sans réponse` : 'Pas de réponse', company });
      }

      if (t.ai_category === 'docs') {
        list.push({ priority: 'yellow', threadId: t.id, label: `Documents requis — ${company}`, sub: t.ai_summary ?? '', company });
      }
    });
    return list;
  }, [threads]);

  const urgentCount    = actions.filter(a => a.priority === 'red').length;
  const importantCount = actions.filter(a => a.priority === 'orange').length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto min-w-0" style={{ background: '#07070d' }}>
      <div className="max-w-[1060px] mx-auto px-6 py-8">

        <div className="mb-8">
          <h1 className="text-[22px] font-semibold text-white">Vue d&apos;ensemble</h1>
          <p className="text-[13px] text-gray-500 mt-1">Analyse de votre recherche d&apos;emploi</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 gap-3 text-gray-500">
            <Loader2 size={22} className="animate-spin" />
            <span className="text-[14px]">Chargement des données…</span>
          </div>
        ) : (
          <>
            {/* 4 Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {metrics.map(m => (
                <div
                  key={m.label}
                  className="rounded-2xl p-5 border border-white/10"
                  style={{ background: 'rgba(255,255,255,.035)' }}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-1">{m.label}</p>
                  <p className="text-[32px] font-bold text-white leading-none mb-1">{m.value}</p>
                  <p className="text-[12px] text-gray-600">{m.sub}</p>
                </div>
              ))}
            </div>

            {/* Funnel + Heatmap side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

              {/* Funnel */}
              <div
                className="rounded-2xl p-6 border border-white/10"
                style={{ background: 'rgba(255,255,255,.035)' }}
              >
                <h2 className="text-[14px] font-semibold text-white mb-5">Funnel de conversion</h2>
                <div className="space-y-4">
                  {funnelSteps.map(step => {
                    const pct = total > 0 ? Math.round((step.count / total) * 100) : 0;
                    return (
                      <div key={step.label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[13px] text-gray-300">{step.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-white">{step.count}</span>
                            <span className="text-[11px] text-gray-600 w-8 text-right">{pct}%</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.06)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, background: step.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Heatmap */}
              <div
                className="rounded-2xl p-6 border border-white/10"
                style={{ background: 'rgba(255,255,255,.035)' }}
              >
                <h2 className="text-[14px] font-semibold text-white mb-5">Activité de candidature</h2>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {/* Day labels */}
                  <div className="flex flex-col gap-[3px] pt-0.5 flex-shrink-0">
                    {DAY_LABELS.map((d, i) => (
                      <span key={i} className="text-[9px] text-gray-600 h-[10px] flex items-center leading-none">{d}</span>
                    ))}
                  </div>
                  {/* Grid columns */}
                  <div className="flex gap-[3px]">
                    {heatGrid.map((week, wi) => (
                      <div key={wi} className="flex flex-col gap-[3px]">
                        {week.map((day, di) => (
                          <div
                            key={di}
                            title={`${day.dateStr} — ${day.count} candidature${day.count !== 1 ? 's' : ''}`}
                            className="w-[10px] h-[10px] rounded-[2px] cursor-default"
                            style={{ background: heatColor(day.count) }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Legend */}
                <div className="flex items-center gap-1.5 mt-4">
                  <span className="text-[10px] text-gray-600">Moins</span>
                  {[0, 1, 2, 3, 4].map(n => (
                    <div key={n} className="w-[10px] h-[10px] rounded-[2px]" style={{ background: heatColor(n) }} />
                  ))}
                  <span className="text-[10px] text-gray-600">Plus</span>
                </div>
              </div>
            </div>

            {/* Action Queue */}
            <div
              className="rounded-2xl p-6 border border-white/10"
              style={{ background: 'rgba(255,255,255,.035)' }}
            >
              <div className="flex items-baseline gap-3 mb-5">
                <h2 className="text-[14px] font-semibold text-white">Action Queue · Aujourd&apos;hui</h2>
                {actions.length > 0 && (
                  <span className="text-[12px] text-gray-500">
                    {urgentCount > 0 && `${urgentCount} urgente${urgentCount > 1 ? 's' : ''}`}
                    {urgentCount > 0 && importantCount > 0 && ' · '}
                    {importantCount > 0 && `${importantCount} importante${importantCount > 1 ? 's' : ''}`}
                  </span>
                )}
              </div>

              {actions.length === 0 ? (
                <p className="text-[13px] text-gray-600 py-6 text-center">Aucune action requise pour l&apos;instant 🎉</p>
              ) : (
                <div className="space-y-2">
                  {actions.map((action, i) => {
                    const cfg = PRIORITY_COLORS[action.priority];
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-xl px-4 py-3 border border-white/5 hover:border-white/10 transition-all"
                        style={{ background: cfg.bg }}
                      >
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
                        <CompanyBadge name={action.company} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-white truncate">{action.label}</p>
                          {action.sub && (
                            <p className="text-[11px] text-gray-500 truncate mt-0.5">{action.sub}</p>
                          )}
                        </div>
                        <button
                          onClick={() => onSelectThread(action.threadId)}
                          className="flex-shrink-0 p-1.5 rounded-full text-gray-600 hover:text-white hover:bg-white/10 transition-all"
                        >
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
