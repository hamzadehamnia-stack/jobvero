'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Users, BarChart3, DollarSign, Settings, Activity,
  RefreshCw, Search, ChevronLeft, ChevronRight, Shield,
  Zap, Mail, FileText, Mic, Target, Send, Cpu,
  TrendingUp, Crown, AlertTriangle, CheckCircle2,
  Bell, Trash2, Edit3, Ban, UserCheck, Loader2,
  ToggleLeft, ToggleRight, X, Briefcase, ClipboardList,
  MessageSquare, Reply, Clock,
  type LucideIcon,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import Toast from '@/components/ui/Toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OverviewStats {
  users: {
    total: number; trial: number; pro: number; premium: number; free: number;
    newToday: number; new7d: number; new30d: number; mrr: number;
  };
  features: {
    cvs: number; coverLetters: number; applications: number; autoApply: number;
    interviews: number; aiMatches: number; messages: number; atsScores: number;
  };
  dailyChart: { date: string; cvs: number; letters: number; applications: number; autoApply: number }[];
}

interface AdminUser {
  id: string; email: string; name: string; avatarUrl: string | null;
  plan: string; aiCredits: number; cvCount: number; letterCount: number;
  appCount: number; createdAt: string; blocked: boolean;
}

interface AdminSettings {
  features: Record<string, boolean>;
  limits: Record<string, number>;
}

interface AppLog {
  id: string; user_id?: string; job_title?: string; company_name?: string;
  company?: string; status?: string; send_status?: string;
  created_at?: string; applied_at?: string;
  // registration fields
  email?: string; name?: string; plan?: string; createdAt?: string;
}

interface SupportMessage {
  id:         string;
  user_id:    string;
  user_email: string;
  user_name:  string;
  subject:    string;
  message:    string;
  status:     'pending' | 'replied';
  reply_text: string | null;
  replied_at: string | null;
  created_at: string;
}

// ─── Tab config ───────────────────────────────────────────────────────────────

type Tab = 'overview' | 'users' | 'support' | 'usage' | 'costs' | 'controls' | 'logs';

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'overview',  label: 'Vue générale',       icon: LayoutDashboard },
  { id: 'users',     label: 'Utilisateurs',       icon: Users           },
  { id: 'support',   label: 'Messages Support',   icon: MessageSquare   },
  { id: 'usage',     label: 'Usage Features',     icon: BarChart3       },
  { id: 'costs',     label: 'Coûts API',          icon: DollarSign      },
  { id: 'controls',  label: 'Contrôles',          icon: Settings        },
  { id: 'logs',      label: 'Logs & Activité',    icon: Activity        },
];

const PLAN_COLORS: Record<string, string> = {
  trial:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  pro:     'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  premium: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  free:    'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string;
  color: string; icon: LucideIcon;
}) {
  return (
    <div className={`rounded-2xl p-5 border ${color} flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest opacity-70">{label}</span>
        <Icon size={16} className="opacity-60" />
      </div>
      <p className="text-3xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60">{sub}</p>}
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${PLAN_COLORS[plan] ?? PLAN_COLORS.free}`}>
      {plan}
    </span>
  );
}

function SetupBanner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
        <AlertTriangle size={28} className="text-amber-600 dark:text-amber-400" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Service Role Key manquant</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
        Ajoutez <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-violet-600 dark:text-violet-400 font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code> dans votre <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs">.env.local</code> pour utiliser l&apos;admin dashboard.
      </p>
      <p className="text-xs text-gray-400 mt-3">Supabase Dashboard → Settings → API → service_role (secret)</p>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function OverviewTab({ stats, loading, onRefresh }: { stats: OverviewStats | null; loading: boolean; onRefresh: () => void }) {
  if (loading) return <Spinner />;
  if (!stats)  return <SetupBanner />;

  const { users, features, dailyChart } = stats;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Vue générale</h2>
        <button onClick={onRefresh} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      {/* User KPIs */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Utilisateurs</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total inscrits"  value={users.total}   color="bg-violet-50 border-violet-200 text-violet-900 dark:bg-violet-950/30 dark:border-violet-800 dark:text-violet-100" icon={Users} />
          <KpiCard label="Trial actifs"    value={users.trial}   color="bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-100"   icon={Zap} />
          <KpiCard label="Pro $27"         value={users.pro}     color="bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-100"           icon={Crown} />
          <KpiCard label="Premium $49"     value={users.premium} color="bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-100" icon={Crown} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <KpiCard label="MRR estimé"         value={`$${users.mrr.toLocaleString()}`} sub="Pro×27 + Premium×49" color="bg-green-50 border-green-200 text-green-900 dark:bg-green-950/30 dark:border-green-800 dark:text-green-100" icon={TrendingUp} />
          <KpiCard label="Inscrits aujourd'hui" value={users.newToday} color="bg-gray-50 border-gray-200 text-gray-900 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" icon={Users} />
          <KpiCard label="Inscrits 7 jours"  value={users.new7d}   color="bg-gray-50 border-gray-200 text-gray-900 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" icon={Users} />
          <KpiCard label="Inscrits 30 jours" value={users.new30d}  color="bg-gray-50 border-gray-200 text-gray-900 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" icon={Users} />
        </div>
      </section>

      {/* Feature KPIs */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Usage total des features</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="CVs générés"       value={features.cvs}          color="bg-violet-50 border-violet-200 text-violet-900 dark:bg-violet-950/30 dark:border-violet-800 dark:text-violet-100" icon={FileText} />
          <KpiCard label="Cover letters"     value={features.coverLetters} color="bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-100" icon={Mail} />
          <KpiCard label="Auto-apply lancés" value={features.autoApply}    color="bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-100" icon={Send} />
          <KpiCard label="Applications"      value={features.applications} color="bg-teal-50 border-teal-200 text-teal-900 dark:bg-teal-950/30 dark:border-teal-800 dark:text-teal-100" icon={ClipboardList} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <KpiCard label="Sessions interview" value={features.interviews} color="bg-pink-50 border-pink-200 text-pink-900 dark:bg-pink-950/30 dark:border-pink-800 dark:text-pink-100" icon={Mic} />
          <KpiCard label="AI Job Matches"     value={features.aiMatches} color="bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-950/30 dark:border-indigo-800 dark:text-indigo-100" icon={Briefcase} />
          <KpiCard label="Messages inbox"     value={features.messages}  color="bg-cyan-50 border-cyan-200 text-cyan-900 dark:bg-cyan-950/30 dark:border-cyan-800 dark:text-cyan-100" icon={Mail} />
          <KpiCard label="ATS Scores"         value={features.atsScores} color="bg-orange-50 border-orange-200 text-orange-900 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-100" icon={Target} />
        </div>
      </section>

      {/* 7-day chart */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Activité 7 derniers jours</h3>
        <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dailyChart.map(d => ({ ...d, date: fmtDate(d.date) }))} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="rgba(148,163,184,0.4)" />
              <YAxis tick={{ fontSize: 11 }} stroke="rgba(148,163,184,0.4)" />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }} />
              <Bar dataKey="cvs"          fill="#7C3AED" radius={[4,4,0,0]} name="CVs" />
              <Bar dataKey="letters"      fill="#3B82F6" radius={[4,4,0,0]} name="Lettres" />
              <Bar dataKey="applications" fill="#10B981" radius={[4,4,0,0]} name="Applications" />
              <Bar dataKey="autoApply"    fill="#F59E0B" radius={[4,4,0,0]} name="Auto-apply" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

// ─── Users tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users,    setUsers]    = useState<AdminUser[]>([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [search,   setSearch]   = useState('');
  const [plan,     setPlan]     = useState('');
  const [loading,  setLoading]  = useState(true);
  const [setup503, setSetup503] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [editing,  setEditing]  = useState<AdminUser | null>(null);
  const [editPlan, setEditPlan] = useState('');
  const [editCredits, setEditCredits] = useState(0);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  const load = useCallback(async (p: number, s: string, pl: string) => {
    setLoading(true);
    setApiError(null);
    try {
      const qs  = new URLSearchParams({ page: String(p), search: s, plan: pl });
      const res = await fetch(`/api/admin/users?${qs}`);
      if (res.status === 503) { setSetup503(true); return; }
      const json = await res.json() as { users?: AdminUser[]; total?: number; error?: string };
      if (!res.ok) {
        setApiError(json.error ?? `Server error ${res.status}`);
        return;
      }
      setUsers(json.users ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Failed to load users');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(page, search, plan); }, [load, page, search, plan]);

  const handleSearch = (v: string) => { setSearch(v); setPage(1); };
  const handlePlan   = (v: string) => { setPlan(v);   setPage(1); };

  const openEdit = (u: AdminUser) => { setEditing(u); setEditPlan(u.plan); setEditCredits(u.aiCredits); };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    await fetch(`/api/admin/users/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: editPlan, credits: editCredits }),
    });
    setSaving(false);
    setEditing(null);
    load(page, search, plan);
  };

  const toggleBlock = async (u: AdminUser) => {
    const newBlocked = !u.blocked;
    try {
      const res = await fetch('/api/admin/block-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, isBlocked: newBlocked }),
      });
      const json = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) {
        showToast(json.error ?? 'Failed to update user', 'error');
        return;
      }
      // Update local state immediately — no full reload needed
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, blocked: newBlocked } : x));
      showToast(newBlocked ? 'User blocked successfully' : 'User unblocked successfully');
    } catch {
      showToast('Network error — please try again', 'error');
    }
  };

  const deleteUser = async (u: AdminUser) => {
    if (!confirm(`Supprimer définitivement ${u.email} ?`)) return;
    await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
    load(page, search, plan);
  };

  const totalPages = Math.ceil(total / 20);

  if (setup503) return <SetupBanner />;

  if (apiError) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
        <AlertTriangle size={28} className="text-red-600 dark:text-red-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Failed to load users</h3>
      <p className="text-sm text-red-600 dark:text-red-400 max-w-lg font-mono bg-red-50 dark:bg-red-950/30 rounded-lg px-4 py-3 mb-4">{apiError}</p>
      <button
        onClick={() => load(page, search, plan)}
        className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
      >
        Retry
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex-1">Utilisateurs <span className="text-sm font-normal text-gray-400">({total})</span></h2>
        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => handleSearch(e.target.value)}
            placeholder="Rechercher…" type="text"
            className="pl-8 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/50 w-52"
          />
        </div>
        {/* Plan filter */}
        <select value={plan} onChange={e => handlePlan(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/50">
          <option value="">Tous les plans</option>
          <option value="trial">Trial</option>
          <option value="pro">Pro</option>
          <option value="premium">Premium</option>
          <option value="free">Free</option>
        </select>
      </div>

      {loading ? <Spinner /> : (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3 text-left">Utilisateur</th>
                  <th className="px-4 py-3 text-left">Plan</th>
                  <th className="px-4 py-3 text-center">Crédits IA</th>
                  <th className="px-4 py-3 text-center">CVs</th>
                  <th className="px-4 py-3 text-center">Lettres</th>
                  <th className="px-4 py-3 text-center">Applications</th>
                  <th className="px-4 py-3 text-left">Inscription</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {users.map(u => (
                  <tr key={u.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors ${u.blocked ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {u.name.slice(0,2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white truncate max-w-[140px]">{u.name}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[140px]">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><PlanBadge plan={u.plan} /></td>
                    <td className="px-4 py-3 text-center font-mono text-sm">{u.aiCredits}</td>
                    <td className="px-4 py-3 text-center">{u.cvCount}</td>
                    <td className="px-4 py-3 text-center">{u.letterCount}</td>
                    <td className="px-4 py-3 text-center">{u.appCount}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(u.createdAt).toLocaleDateString('fr-FR')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => openEdit(u)} title="Modifier" className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors">
                          <Edit3 size={13} />
                        </button>
                        <button
                          onClick={() => toggleBlock(u)}
                          title={u.blocked ? 'Unblock user' : 'Block user'}
                          className={`p-1.5 rounded-lg transition-colors ${
                            u.blocked
                              ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50'
                              : 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30'
                          }`}
                        >
                          {u.blocked ? <UserCheck size={13} /> : <Ban size={13} />}
                        </button>
                        <button onClick={() => deleteUser(u)} title="Supprimer" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">Aucun utilisateur trouvé</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40">
              <p className="text-xs text-gray-500">Page {page} / {totalPages} — {total} utilisateurs</p>
              <div className="flex items-center gap-1.5">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <ChevronLeft size={14} />
                </button>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setEditing(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900 dark:text-white">Modifier l&apos;utilisateur</h3>
              <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={16} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4 truncate">{editing.email}</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Plan</label>
                <select value={editPlan} onChange={e => setEditPlan(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50">
                  <option value="free">Free</option>
                  <option value="trial">Trial</option>
                  <option value="pro">Pro</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Crédits IA restants</label>
                <input type="number" min={0} value={editCredits} onChange={e => setEditCredits(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
              </div>
            </div>
            <div className="flex gap-2.5 mt-6">
              <button onClick={() => setEditing(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Annuler</button>
              <button onClick={saveEdit} disabled={saving} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all" style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

// ─── Usage tab ────────────────────────────────────────────────────────────────

function UsageTab({ stats, loading }: { stats: OverviewStats | null; loading: boolean }) {
  if (loading) return <Spinner />;
  if (!stats)  return <SetupBanner />;

  const { features, dailyChart } = stats;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });

  const tiles: { label: string; value: number; icon: LucideIcon; color: string }[] = [
    { label: 'CVs générés',          value: features.cvs,          icon: FileText,     color: 'text-violet-600' },
    { label: 'Cover letters',        value: features.coverLetters, icon: Mail,         color: 'text-blue-600'   },
    { label: 'Auto-apply lancés',    value: features.autoApply,    icon: Send,         color: 'text-amber-600'  },
    { label: 'Sessions interview',   value: features.interviews,   icon: Mic,          color: 'text-pink-600'   },
    { label: 'AI Job Matches cache', value: features.aiMatches,    icon: Briefcase,    color: 'text-indigo-600' },
    { label: 'Applications envoyées',value: features.applications, icon: ClipboardList,color: 'text-teal-600'   },
    { label: 'Messages inbox',       value: features.messages,     icon: Mail,         color: 'text-cyan-600'   },
    { label: 'ATS Scores',           value: features.atsScores,    icon: Target,       color: 'text-orange-600' },
  ];

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Usage des Features</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map(t => (
          <div key={t.label} className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex flex-col gap-2">
            <t.icon size={18} className={t.color} />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{t.value.toLocaleString()}</p>
            <p className="text-xs text-gray-500">{t.label}</p>
          </div>
        ))}
      </div>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Activité 7 jours — CVs & Lettres</h3>
        <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyChart.map(d => ({ ...d, date: fmtDate(d.date) }))} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="rgba(148,163,184,0.4)" />
              <YAxis tick={{ fontSize: 11 }} stroke="rgba(148,163,184,0.4)" />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }} />
              <Bar dataKey="cvs"          fill="#7C3AED" radius={[4,4,0,0]} name="CVs" />
              <Bar dataKey="letters"      fill="#3B82F6" radius={[4,4,0,0]} name="Lettres" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Applications & Auto-apply 7 jours</h3>
        <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyChart.map(d => ({ ...d, date: fmtDate(d.date) }))} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="rgba(148,163,184,0.4)" />
              <YAxis tick={{ fontSize: 11 }} stroke="rgba(148,163,184,0.4)" />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }} />
              <Bar dataKey="applications" fill="#10B981" radius={[4,4,0,0]} name="Applications" />
              <Bar dataKey="autoApply"    fill="#F59E0B" radius={[4,4,0,0]} name="Auto-apply" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

// ─── Costs tab ────────────────────────────────────────────────────────────────

function CostsTab({ stats, loading }: { stats: OverviewStats | null; loading: boolean }) {
  if (loading) return <Spinner />;
  if (!stats)  return <SetupBanner />;

  const f = stats.features;
  const rows = [
    { label: 'Claude API — CVs',                  qty: f.cvs,          rate: 0.05,  cost: f.cvs * 0.05 },
    { label: 'Claude API — Cover letters',         qty: f.coverLetters, rate: 0.02,  cost: f.coverLetters * 0.02 },
    { label: 'Claude API — Sessions interview',    qty: f.interviews,   rate: 0.88,  cost: f.interviews * 0.88 },
    { label: 'Claude API — Chat assistant',        qty: f.messages,     rate: 0.01,  cost: f.messages * 0.01 },
    { label: 'OpenAI Whisper — Interview audio',   qty: f.interviews,   rate: 0.07,  cost: f.interviews * 0.07 },
    { label: 'Gemini TTS — Interview voix',        qty: f.interviews,   rate: 0.14,  cost: f.interviews * 0.14 },
    { label: 'Resend — Emails envoyés',            qty: f.applications, rate: 0.001, cost: f.applications * 0.001 },
  ];

  const totalCost    = rows.reduce((s, r) => s + r.cost, 0);
  const revenue      = stats.users.mrr;
  const margin       = revenue - totalCost;
  const marginPct    = revenue > 0 ? ((margin / revenue) * 100).toFixed(1) : '—';

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Coûts API estimés</h2>

      <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <th className="px-5 py-3 text-left">Service</th>
              <th className="px-5 py-3 text-right">Quantité</th>
              <th className="px-5 py-3 text-right">$/unité</th>
              <th className="px-5 py-3 text-right">Coût estimé</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map(r => (
              <tr key={r.label} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                <td className="px-5 py-3 text-gray-700 dark:text-gray-300">{r.label}</td>
                <td className="px-5 py-3 text-right text-gray-500">{r.qty.toLocaleString()}</td>
                <td className="px-5 py-3 text-right text-gray-500 font-mono">${r.rate.toFixed(3)}</td>
                <td className="px-5 py-3 text-right font-semibold text-gray-900 dark:text-white font-mono">${r.cost.toFixed(2)}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 dark:bg-gray-800/60 font-bold">
              <td colSpan={3} className="px-5 py-3 text-gray-900 dark:text-white uppercase text-xs tracking-widest">Total coûts</td>
              <td className="px-5 py-3 text-right text-red-600 dark:text-red-400 font-mono">${totalCost.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-2xl p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-green-600 dark:text-green-400 mb-1">Revenus MRR</p>
          <p className="text-3xl font-bold text-green-700 dark:text-green-300">${revenue.toLocaleString()}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-red-600 dark:text-red-400 mb-1">Coûts API</p>
          <p className="text-3xl font-bold text-red-700 dark:text-red-300">${totalCost.toFixed(2)}</p>
        </div>
        <div className={`rounded-2xl p-5 border ${margin >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'}`}>
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: margin >= 0 ? '#059669' : '#DC2626' }}>Marge nette</p>
          <p className="text-3xl font-bold" style={{ color: margin >= 0 ? '#047857' : '#B91C1C' }}>
            ${margin.toFixed(2)} <span className="text-base font-semibold opacity-70">({marginPct}%)</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Controls tab ─────────────────────────────────────────────────────────────

function ControlsTab({ stats }: { stats: OverviewStats | null }) {
  const [settings, setSettings]     = useState<AdminSettings | null>(null);
  const [loading,  setLoading]      = useState(true);
  const [saving,   setSaving]       = useState(false);
  const [clearing, setClearing]     = useState(false);
  const [notifTitle,   setNotifTitle]   = useState('');
  const [notifMsg,     setNotifMsg]     = useState('');
  const [notifSending, setNotifSending] = useState(false);
  const [notifResult,  setNotifResult]  = useState<string | null>(null);
  const [clearResult,  setClearResult]  = useState<string | null>(null);
  const [setup503, setSetup503] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/admin/settings');
      if (res.status === 503) { setSetup503(true); setLoading(false); return; }
      setSettings(await res.json() as AdminSettings);
      setLoading(false);
    })();
  }, []);

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);
  };

  const toggleFeature = (key: string) => {
    if (!settings) return;
    setSettings({ ...settings, features: { ...settings.features, [key]: !settings.features[key] } });
  };

  const updateLimit = (key: string, val: number) => {
    if (!settings) return;
    setSettings({ ...settings, limits: { ...settings.limits, [key]: val } });
  };

  const sendNotif = async () => {
    if (!notifTitle.trim() || !notifMsg.trim()) return;
    setNotifSending(true);
    const res = await fetch('/api/admin/notify-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: notifTitle, message: notifMsg }),
    });
    const data = await res.json() as { sent?: number; error?: string };
    setNotifResult(data.error ? `Erreur: ${data.error}` : `✓ Envoyé à ${data.sent} utilisateurs`);
    setNotifSending(false);
    setNotifTitle(''); setNotifMsg('');
  };

  const clearCache = async () => {
    if (!confirm('Vider tout le cache AI Job Matches ?')) return;
    setClearing(true);
    const res = await fetch('/api/admin/clear-cache', { method: 'DELETE' });
    const data = await res.json() as { deleted?: number; error?: string };
    setClearResult(data.error ? `Erreur: ${data.error}` : `✓ ${data.deleted} entrées supprimées`);
    setClearing(false);
  };

  const featureLabels: Record<string, string> = {
    cv_builder:      'CV Builder AI',
    cover_letter:    'Cover Letter AI',
    auto_apply:      'Auto Apply',
    interview_coach: 'Interview Coach',
    ai_matches:      'AI Job Matches',
    ats_score:       'ATS Score',
  };

  if (loading)  return <Spinner />;
  if (setup503) return <SetupBanner />;

  return (
    <div className="space-y-8 max-w-2xl">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Contrôles & Paramètres</h2>

      {/* Feature toggles */}
      <section className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><Cpu size={15} /> Activer / Désactiver les features</h3>
        <div className="space-y-3">
          {settings && Object.entries(featureLabels).map(([key, label]) => {
            const on = settings.features[key] ?? true;
            return (
              <div key={key} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                <button onClick={() => toggleFeature(key)} className={`transition-colors ${on ? 'text-violet-600' : 'text-gray-300 dark:text-gray-600'}`}>
                  {on ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tier limits */}
      <section className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><Crown size={15} /> Limites par tier</h3>
        {settings && (
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: 'pro_auto_apply_monthly',     label: 'Pro — Auto-apply/mois'      },
              { key: 'pro_interviews_monthly',     label: 'Pro — Interviews/mois'       },
              { key: 'premium_auto_apply_monthly', label: 'Premium — Auto-apply/mois'   },
              { key: 'premium_interviews_monthly', label: 'Premium — Interviews/mois'   },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">{label}</label>
                <input type="number" min={0} value={settings.limits[key] ?? 0}
                  onChange={e => updateLimit(key, Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
              </div>
            ))}
          </div>
        )}
        <button onClick={saveSettings} disabled={saving} className="mt-5 flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all" style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
          {saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
        </button>
      </section>

      {/* Broadcast notification */}
      <section className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2"><Bell size={15} /> Envoyer une notification à tous</h3>
        <div className="space-y-3">
          <input value={notifTitle} onChange={e => setNotifTitle(e.target.value)} placeholder="Titre de la notification"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50" />
          <textarea value={notifMsg} onChange={e => setNotifMsg(e.target.value)} placeholder="Message…" rows={3}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none" />
          <div className="flex items-center gap-3">
            <button onClick={sendNotif} disabled={notifSending || !notifTitle.trim() || !notifMsg.trim()}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}>
              {notifSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {notifSending ? 'Envoi…' : `Envoyer à tous${stats ? ` (${stats.users.total})` : ''}`}
            </button>
            {notifResult && <span className={`text-xs ${notifResult.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>{notifResult}</span>}
          </div>
        </div>
      </section>

      {/* Clear cache */}
      <section className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2"><Trash2 size={15} /> Cache AI Job Matches</h3>
        <p className="text-xs text-gray-500 mb-4">Supprime tous les résultats mis en cache. Les utilisateurs verront de nouvelles suggestions au prochain accès.</p>
        <div className="flex items-center gap-3">
          <button onClick={clearCache} disabled={clearing}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 transition-colors">
            {clearing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {clearing ? 'Suppression…' : 'Vider le cache'}
          </button>
          {clearResult && <span className={`text-xs ${clearResult.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>{clearResult}</span>}
        </div>
      </section>
    </div>
  );
}

// ─── Support tab ─────────────────────────────────────────────────────────────

function SupportTab({ onReplySent }: { onReplySent: () => void }) {
  const [tickets,  setTickets]  = useState<SupportMessage[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [setup503, setSetup503] = useState(false);
  const [filter,   setFilter]   = useState<'all' | 'pending' | 'replied'>('all');

  // Reply modal
  const [replying,  setReplying]  = useState<SupportMessage | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending,   setSending]   = useState(false);
  const [toast,     setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch('/api/admin/logs?type=support');
      if (res.status === 503) { setSetup503(true); setLoading(false); return; }
      const data = await res.json() as { logs: SupportMessage[] };
      setTickets(data.logs ?? []);
      setLoading(false);
    })();
  }, []);

  const openReply = (t: SupportMessage) => { setReplying(t); setReplyText(''); };

  const sendReply = async () => {
    if (!replying || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/reply-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: replying.id,
          userId:    replying.user_id,
          userEmail: replying.user_email,
          subject:   replying.subject,
          replyText: replyText.trim(),
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setToast({ message: json.error ?? 'Send failed', type: 'error' }); return; }
      setTickets(prev => prev.map(t =>
        t.id === replying.id ? { ...t, status: 'replied', reply_text: replyText.trim(), replied_at: new Date().toISOString() } : t
      ));
      setToast({ message: 'Réponse envoyée avec succès', type: 'success' });
      setReplying(null);
      onReplySent(); // refresh sidebar badge
    } catch { setToast({ message: 'Network error — please try again', type: 'error' }); }
    finally { setSending(false); }
  };

  if (setup503) return <SetupBanner />;

  const displayed = filter === 'all' ? tickets
    : tickets.filter(t => t.status === (filter === 'pending' ? 'pending' : 'replied'));

  const pendingCount = tickets.filter(t => t.status === 'pending').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <MessageSquare size={20} className="text-violet-500" />
            Messages Support
            {pendingCount > 0 && (
              <span className="text-sm font-normal text-gray-400">— <span className="text-amber-500 font-semibold">{pendingCount} en attente</span></span>
            )}
          </h2>
        </div>
        {/* Filter pills */}
        <div className="flex gap-1.5">
          {(['all', 'pending', 'replied'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === f
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}>
              {f === 'all' ? 'Tous' : f === 'pending' ? 'En attente' : 'Répondus'}
              {f === 'pending' && pendingCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-[9px] rounded-full px-1">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? <Spinner /> : (
        <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3 text-left">Utilisateur</th>
                  <th className="px-4 py-3 text-left">Objet</th>
                  <th className="px-4 py-3 text-left">Message</th>
                  <th className="px-4 py-3 text-left">Statut</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {displayed.map(ticket => (
                  <tr key={ticket.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors ${ticket.status === 'pending' ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white text-xs">{ticket.user_name}</p>
                      <p className="text-[11px] text-gray-400">{ticket.user_email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 max-w-[140px] truncate font-medium">{ticket.subject}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[220px] truncate">{ticket.message}</td>
                    <td className="px-4 py-3">
                      {ticket.status === 'replied' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                          <CheckCircle2 size={9} /> Répondu
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          <Clock size={9} /> En attente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-gray-400 whitespace-nowrap">
                      {new Date(ticket.created_at).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openReply(ticket)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-950/50">
                        <Reply size={11} />
                        {ticket.status === 'replied' ? 'Voir / Rép.' : 'Répondre'}
                      </button>
                    </td>
                  </tr>
                ))}
                {displayed.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-16 text-gray-400 text-sm">
                    {filter === 'pending' ? 'Aucun message en attente 🎉' : 'Aucun ticket support'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reply modal */}
      {replying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setReplying(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-violet-500" />
                <span className="font-bold text-gray-900 dark:text-white text-sm">Répondre au ticket</span>
              </div>
              <button onClick={() => setReplying(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-6 pt-4 pb-2 space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-semibold text-gray-700 dark:text-gray-300">{replying.user_name}</span>
                <span>·</span>
                <span>{replying.user_email}</span>
              </div>
              <p className="text-xs font-semibold text-violet-600 dark:text-violet-400">{replying.subject}</p>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed max-h-28 overflow-y-auto">
                {replying.message}
              </div>
              {replying.status === 'replied' && replying.reply_text && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800">
                  <p className="text-[10px] font-bold uppercase text-emerald-600 mb-1">Réponse précédente</p>
                  <p className="text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed">{replying.reply_text}</p>
                </div>
              )}
            </div>
            <div className="px-6 pb-5 pt-2 space-y-3">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Votre réponse</label>
              <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                placeholder="Tapez votre réponse ici…" rows={5}
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 transition" />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Envoyé à <strong>{replying.user_email}</strong><br />+ sauvegardé dans son Inbox Jobvero
                </p>
                <button onClick={sendReply} disabled={sending || !replyText.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}>
                  {sending ? <Loader2 size={13} className="animate-spin" /> : <Reply size={13} />}
                  {sending ? 'Envoi…' : 'Envoyer la réponse'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Logs tab ─────────────────────────────────────────────────────────────────

type LogType = 'applications' | 'auto-apply' | 'registrations' | 'support';

function LogsTab() {
  const [logType,  setLogType]  = useState<LogType>('applications');
  const [logs,     setLogs]     = useState<AppLog[]>([]);
  const [tickets,  setTickets]  = useState<SupportMessage[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [setup503, setSetup503] = useState(false);

  // Reply modal state
  const [replying,  setReplying]  = useState<SupportMessage | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending,   setSending]   = useState(false);
  const [toast,     setToast]     = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/admin/logs?type=${logType}`);
      if (res.status === 503) { setSetup503(true); setLoading(false); return; }
      const data = await res.json() as { logs: (AppLog | SupportMessage)[] };
      if (logType === 'support') {
        setTickets((data.logs ?? []) as SupportMessage[]);
      } else {
        setLogs((data.logs ?? []) as AppLog[]);
      }
      setLoading(false);
    })();
  }, [logType]);

  const openReply = (ticket: SupportMessage) => { setReplying(ticket); setReplyText(''); };

  const sendReply = async () => {
    if (!replying || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/reply-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: replying.id,
          userId:    replying.user_id,
          userEmail: replying.user_email,
          subject:   replying.subject,
          replyText: replyText.trim(),
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setToast({ message: json.error ?? 'Send failed', type: 'error' }); return; }
      setTickets(prev => prev.map(t =>
        t.id === replying.id ? { ...t, status: 'replied', reply_text: replyText.trim(), replied_at: new Date().toISOString() } : t
      ));
      setToast({ message: 'Reply sent successfully', type: 'success' });
      setReplying(null);
    } catch { setToast({ message: 'Network error — please try again', type: 'error' }); }
    finally { setSending(false); }
  };

  const LOG_TABS: { id: LogType; label: string }[] = [
    { id: 'applications', label: 'Applications' },
    { id: 'auto-apply',   label: 'Auto-apply'   },
    { id: 'registrations',label: 'Inscriptions' },
    { id: 'support',      label: 'Support'       },
  ];

  const STATUS_COLOR: Record<string, string> = {
    applied:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    saved:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    interview: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    rejected:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    offer:     'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    failed:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    sent:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    pending:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    no_email:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    skipped:   'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };

  if (setup503) return <SetupBanner />;

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Logs & Activité</h2>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {LOG_TABS.map(t => (
          <button key={t.id} onClick={() => setLogType(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5
              ${logType === t.id ? 'border-violet-500 text-violet-600 dark:text-violet-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {t.id === 'support' && <MessageSquare size={13} />}
            {t.label}
            {t.id === 'support' && logType !== 'support' && tickets.filter(x => x.status === 'pending').length > 0 && (
              <span className="bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {tickets.filter(x => x.status === 'pending').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : logType === 'support' ? (
        /* ── Support tickets ── */
        <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3 text-left">Utilisateur</th>
                  <th className="px-4 py-3 text-left">Objet</th>
                  <th className="px-4 py-3 text-left">Message</th>
                  <th className="px-4 py-3 text-left">Statut</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {tickets.map(ticket => (
                  <tr key={ticket.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-white text-xs">{ticket.user_name}</p>
                      <p className="text-[11px] text-gray-400">{ticket.user_email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 max-w-[140px] truncate">{ticket.subject}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">{ticket.message}</td>
                    <td className="px-4 py-3">
                      {ticket.status === 'replied' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                          <CheckCircle2 size={9} /> Répondu
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          <Clock size={9} /> En attente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-gray-400 whitespace-nowrap">
                      {new Date(ticket.created_at).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openReply(ticket)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-950/50"
                      >
                        <Reply size={11} />
                        {ticket.status === 'replied' ? 'Voir / Rép.' : 'Répondre'}
                      </button>
                    </td>
                  </tr>
                ))}
                {tickets.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">Aucun ticket support</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Existing logs ── */
        <div className="bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {logType === 'registrations' ? (
                    <>
                      <th className="px-4 py-3 text-left">Utilisateur</th>
                      <th className="px-4 py-3 text-left">Plan</th>
                      <th className="px-4 py-3 text-left">Date inscription</th>
                    </>
                  ) : logType === 'applications' ? (
                    <>
                      <th className="px-4 py-3 text-left">Poste</th>
                      <th className="px-4 py-3 text-left">Entreprise</th>
                      <th className="px-4 py-3 text-left">Statut</th>
                      <th className="px-4 py-3 text-left">Envoi</th>
                      <th className="px-4 py-3 text-left">Date</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 text-left">Poste</th>
                      <th className="px-4 py-3 text-left">Entreprise</th>
                      <th className="px-4 py-3 text-left">Statut</th>
                      <th className="px-4 py-3 text-left">Date</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {logs.map((log, i) => (
                  <tr key={log.id ?? i} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    {logType === 'registrations' ? (
                      <>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-white">{log.name}</p>
                          <p className="text-xs text-gray-400">{log.email}</p>
                        </td>
                        <td className="px-4 py-3"><PlanBadge plan={log.plan ?? 'free'} /></td>
                        <td className="px-4 py-3 text-xs text-gray-500">{new Date(log.createdAt ?? '').toLocaleString('fr-FR')}</td>
                      </>
                    ) : logType === 'applications' ? (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[160px] truncate">{log.job_title ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-[120px] truncate">{log.company_name ?? '—'}</td>
                        <td className="px-4 py-3"><StatusBadge status={log.status ?? ''} colors={STATUS_COLOR} /></td>
                        <td className="px-4 py-3"><StatusBadge status={log.send_status ?? ''} colors={STATUS_COLOR} /></td>
                        <td className="px-4 py-3 text-xs text-gray-500">{log.created_at ? new Date(log.created_at).toLocaleString('fr-FR') : '—'}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[160px] truncate">{log.job_title ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-[120px] truncate">{log.company ?? '—'}</td>
                        <td className="px-4 py-3"><StatusBadge status={log.status ?? ''} colors={STATUS_COLOR} /></td>
                        <td className="px-4 py-3 text-xs text-gray-500">{log.applied_at ? new Date(log.applied_at).toLocaleString('fr-FR') : '—'}</td>
                      </>
                    )}
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">Aucun log disponible</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reply modal */}
      {replying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setReplying(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-violet-500" />
                <span className="font-bold text-gray-900 dark:text-white text-sm">Répondre au ticket</span>
              </div>
              <button onClick={() => setReplying(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Ticket summary */}
            <div className="px-6 pt-4 pb-2 space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-semibold text-gray-700 dark:text-gray-300">{replying.user_name}</span>
                <span>·</span>
                <span>{replying.user_email}</span>
              </div>
              <p className="text-xs font-semibold text-violet-600 dark:text-violet-400">{replying.subject}</p>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed max-h-28 overflow-y-auto">
                {replying.message}
              </div>
              {replying.status === 'replied' && replying.reply_text && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800">
                  <p className="text-[10px] font-bold uppercase text-emerald-600 mb-1">Réponse précédente</p>
                  <p className="text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed">{replying.reply_text}</p>
                </div>
              )}
            </div>

            {/* Reply area */}
            <div className="px-6 pb-5 pt-2 space-y-3">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Votre réponse</label>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Tapez votre réponse ici…"
                rows={5}
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 transition"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Envoyé à <strong>{replying.user_email}</strong><br />+ sauvegardé dans son Inbox Jobvero
                </p>
                <button
                  onClick={sendReply}
                  disabled={sending || !replyText.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}
                >
                  {sending ? <Loader2 size={13} className="animate-spin" /> : <Reply size={13} />}
                  {sending ? 'Envoi…' : 'Envoyer la réponse'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

function StatusBadge({ status, colors }: { status: string; colors: Record<string, string> }) {
  const cls = colors[status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${cls}`}>{status || '—'}</span>;
}

function Spinner() {
  return (
    <div className="flex justify-center py-20">
      <Loader2 size={24} className="animate-spin text-violet-500" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { userEmail: string }

export default function AdminDashboard({ userEmail }: Props) {
  const [tab,          setTab]          = useState<Tab>('overview');
  const [stats,        setStats]        = useState<OverviewStats | null>(null);
  const [loadingSt,    setLoadingSt]    = useState(true);
  const [unreadSupport,setUnreadSupport]= useState(0);

  const loadStats = useCallback(async () => {
    setLoadingSt(true);
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) setStats(await res.json() as OverviewStats);
      else        setStats(null);
    } catch { setStats(null); }
    finally  { setLoadingSt(false); }
  }, []);

  // Fetch unread (pending) support ticket count for sidebar badge
  const loadUnreadSupport = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/logs?type=support');
      if (!res.ok) return;
      const data = await res.json() as { logs: SupportMessage[] };
      setUnreadSupport((data.logs ?? []).filter(m => m.status === 'pending').length);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { loadStats(); loadUnreadSupport(); }, [loadStats, loadUnreadSupport]);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-gray-50 dark:bg-[#0F172A]">

      {/* ── Inner sidebar ── */}
      <aside className="w-52 flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111827] overflow-y-auto">
        <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-md shadow-red-500/30 flex-shrink-0">
              <Shield size={14} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white leading-none">Admin Panel</p>
              <p className="text-[10px] text-gray-400 truncate mt-0.5">{userEmail}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-2 px-2 space-y-0.5">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            const badge  = id === 'support' && unreadSupport > 0 ? unreadSupport : 0;
            return (
              <button key={id} onClick={() => setTab(id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-left
                  ${active
                    ? 'bg-gradient-to-r from-violet-600/10 to-indigo-600/5 text-violet-700 dark:text-violet-400 font-semibold'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800/60'
                  }`}>
                <Icon size={16} className={active ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400 dark:text-gray-500'} />
                <span className="truncate flex-1">{label}</span>
                {badge > 0 && (
                  <span className="ml-auto flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
                {active && badge === 0 && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-600 flex-shrink-0" />}
              </button>
            );
          })}
        </nav>

        {/* Stats summary */}
        {stats && (
          <div className="p-3 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Total users</span>
              <span className="font-bold text-gray-700 dark:text-gray-300">{stats.users.total}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">MRR</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">${stats.users.mrr.toLocaleString()}</span>
            </div>
          </div>
        )}
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 min-w-0 overflow-y-auto p-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-violet-600/40 [&::-webkit-scrollbar-track]:bg-transparent">
        {tab === 'overview' && <OverviewTab stats={stats} loading={loadingSt} onRefresh={loadStats} />}
        {tab === 'users'    && <UsersTab />}
        {tab === 'support'  && <SupportTab onReplySent={loadUnreadSupport} />}
        {tab === 'usage'    && <UsageTab stats={stats} loading={loadingSt} />}
        {tab === 'costs'    && <CostsTab stats={stats} loading={loadingSt} />}
        {tab === 'controls' && <ControlsTab stats={stats} />}
        {tab === 'logs'     && <LogsTab />}
      </main>
    </div>
  );
}
