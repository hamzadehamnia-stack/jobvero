'use client';

import { useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import {
  Zap, Settings, Send, Clock, AlertCircle, ChevronDown, ChevronUp,
  Plus, X, CheckCircle, Loader2, Crown, ExternalLink, FileText,
  Globe, MapPin, Briefcase, Play, Pause, Download, Trash2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { logApplicationEvent } from '@/lib/applicationEvents';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_COUNTRIES = [
  { code: 'us', label: 'USA', flag: '🇺🇸' },
];

const CONTRACT_TYPE_OPTIONS = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Remote'];

const EXPERIENCE_OPTIONS = [
  { value: 'any',    label: 'Any level'    },
  { value: 'entry',  label: 'Entry (0–2 yrs)' },
  { value: 'mid',    label: 'Mid (3–5 yrs)'   },
  { value: 'senior', label: 'Senior (6+ yrs)' },
];

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500',   'bg-indigo-500', 'bg-cyan-500',  'bg-pink-500',
];

function avatarColor(name: string): string {
  return AVATAR_COLORS[(name?.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];
}

const SKIPPED_LABELS: Record<string, string> = {
  no_access:          'This feature requires Pro or Premium.',
  not_configured:     "Auto Apply isn't set up yet — open Settings below.",
  paused:             'Auto Apply is paused. Enable it above first.',
  daily_limit:        'Daily limit reached. The cron will run again tomorrow.',
  monthly_limit:      'Monthly limit reached — resets at the start of next month.',
  no_email_alias:     "Your email alias isn't configured. Check your account settings.",
  env_not_configured: 'Server configuration error. Please contact support.',
};

interface RunResult {
  applied:        number;
  failed:         number;
  skipped:        number;
  skippedReason?: string;
  message?:       string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Settings {
  id?:               string;
  is_active:         boolean;
  keywords:          string[];
  excluded_keywords: string[];
  target_countries:  string[];
  locations:         string[];
  contract_types:    string[];
  min_salary:        number;
  remote_only:       boolean;
  experience_level:  string;
  daily_limit:       number;
  monthly_limit:     number;
  ats_threshold:     number;
}

interface Application {
  id:            string;
  job_title:     string;
  company_name:  string;
  location:      string | null;
  salary:        string | null;
  contract_type: string | null;
  send_status:   string | null;
  sent_at:       string | null;
  cover_letter:  string | null;
  thread_id:     string | null;
  status:        string;
  ats_score:     number | null;
}

type FeedFilter = 'all' | 'sent' | 'pending' | 'failed';

interface Props {
  userId:          string;
  locale:          string;
  isPremium:       boolean;
  initialSettings: Settings | null;
  applications:    Application[];
  sentToday:       number;
  sentMonth:       number;
  lastRunAt:       string | null;
}

const DEFAULT_SETTINGS: Settings = {
  is_active:         false,
  keywords:          [],
  excluded_keywords: [],
  target_countries:  ['us'],
  locations:         [],
  contract_types:    [],
  min_salary:        0,
  remote_only:       false,
  experience_level:  'any',
  daily_limit:       5,
  monthly_limit:     50,
  ats_threshold:     70,
};

const inputCls = `w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
  bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white
  placeholder:text-gray-400 dark:placeholder:text-gray-500
  focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400
  transition-colors`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTime(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

// ─── Cover Letter Modal ───────────────────────────────────────────────────────

function CoverLetterModal({ app, onClose }: { app: Application; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!app.cover_letter) return;
    await navigator.clipboard.writeText(app.cover_letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">Cover Letter</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{app.job_title} · {app.company_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
            >
              {copied ? <CheckCircle size={11} className="text-emerald-500" /> : <FileText size={11} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {app.cover_letter ? (
            <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans leading-relaxed">
              {app.cover_letter}
            </pre>
          ) : (
            <div className="flex items-center justify-center h-24 text-sm text-gray-400">
              No cover letter available for this application.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Chip Input ───────────────────────────────────────────────────────────────

function ChipInput({
  label, placeholder, chips, onAdd, onRemove, disabled,
}: {
  label:       string;
  placeholder: string;
  chips:       string[];
  onAdd:       (v: string) => void;
  onRemove:    (v: string) => void;
  disabled?:   boolean;
}) {
  const [val, setVal] = useState('');

  function commit() {
    const trimmed = val.trim();
    if (!trimmed || chips.includes(trimmed)) { setVal(''); return; }
    onAdd(trimmed);
    setVal('');
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        {label}
      </label>
      <div className="flex gap-2 mb-2">
        <input
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } }}
          placeholder={placeholder}
          disabled={disabled}
          className={`${inputCls} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        />
        <button
          type="button"
          onClick={commit}
          disabled={disabled}
          className="flex-shrink-0 p-2.5 rounded-xl text-white disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}
        >
          <Plus size={14} />
        </button>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map(chip => (
            <span
              key={chip}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-100 dark:bg-violet-950/40 text-violet-800 dark:text-violet-300 text-xs font-medium"
            >
              {chip}
              {!disabled && (
                <button onClick={() => onRemove(chip)} className="ml-0.5 text-violet-400 hover:text-violet-700 dark:hover:text-violet-100 transition-colors">
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AutoApplyClient({
  userId, locale, isPremium, initialSettings, applications, sentToday, sentMonth, lastRunAt,
}: Props) {
  const pathname = usePathname();
  const resolvedLocale = locale || pathname?.split('/')[1] || 'en';

  const [settings,     setSettings]     = useState<Settings>(initialSettings ?? DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [saveOk,       setSaveOk]       = useState(false);
  const [saveErr,      setSaveErr]      = useState('');
  const [toggling,     setToggling]     = useState(false);
  const [feedFilter,   setFeedFilter]   = useState<FeedFilter>('all');
  const [viewLetter,   setViewLetter]   = useState<Application | null>(null);
  const [apps,            setApps]            = useState<Application[]>(applications);
  const [markingId,       setMarkingId]       = useState<string | null>(null);
  const [downloadingPdfId,setDownloadingPdfId]= useState<string | null>(null);
  const [deletingId,      setDeletingId]      = useState<string | null>(null);
  const [toast,           setToast]           = useState<string | null>(null);
  const [running,        setRunning]        = useState(false);
  const [runResult,      setRunResult]      = useState<RunResult | null>(null);
  const [localSentToday, setLocalSentToday] = useState(sentToday);
  const [localSentMonth, setLocalSentMonth] = useState(sentMonth);

  // ── Chip helpers ─────────────────────────────────────────────────────────────

  function addChip(key: keyof Settings, value: string) {
    setSettings(s => {
      const arr = s[key] as string[];
      if (arr.includes(value)) return s;
      return { ...s, [key]: [...arr, value] };
    });
  }

  function removeChip(key: keyof Settings, value: string) {
    setSettings(s => ({ ...s, [key]: (s[key] as string[]).filter(v => v !== value) }));
  }

  function toggleCountry(code: string) {
    setSettings(s => ({
      ...s,
      target_countries: s.target_countries.includes(code)
        ? s.target_countries.filter(c => c !== code)
        : [...s.target_countries, code],
    }));
  }

  function toggleContractType(ct: string) {
    setSettings(s => ({
      ...s,
      contract_types: s.contract_types.includes(ct)
        ? s.contract_types.filter(c => c !== ct)
        : [...s.contract_types, ct],
    }));
  }

  // ── Save settings ────────────────────────────────────────────────────────────

  const saveSettings = useCallback(async (overrides?: Partial<Settings>) => {
    setSaving(true);
    setSaveOk(false);
    setSaveErr('');
    const { id: _id, ...merged } = { ...settings, ...overrides };
    const payload = { user_id: userId, ...merged };
    console.log('[auto-apply] upsert payload:', JSON.stringify(payload, null, 2));
    const supabase = createClient();
    const { error } = await supabase.from('auto_apply_settings').upsert(
      payload,
      { onConflict: 'user_id' },
    );
    if (error?.message) {
      setSaveErr('Failed to save. Please try again.');
      console.error('[auto-apply] SAVE FAILED', {
        message: error.message,
        code:    error.code,
        details: error.details,
        hint:    error.hint,
      });
    } else {
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    }
    setSaving(false);
  }, [settings, userId]);

  // ── Toggle active ─────────────────────────────────────────────────────────────

  async function handleToggle() {
    if (!isPremium || toggling) return;
    const next = !settings.is_active;
    setToggling(true);
    setSettings(s => ({ ...s, is_active: next }));
    const supabase = createClient();
    const { id: _id, ...rest } = settings;
    await supabase.from('auto_apply_settings').upsert(
      { user_id: userId, ...rest, is_active: next },
      { onConflict: 'user_id' },
    );
    setToggling(false);
    showToast(next ? 'Auto Apply activated' : 'Auto Apply paused');
  }

  // ── Mark as applied (pending queue) ──────────────────────────────────────────

  async function handleMarkApplied(id: string) {
    setMarkingId(id);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('applications')
      .update({ status: 'applied', send_status: 'manual_download', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (user) {
      void logApplicationEvent(supabase, id, user.id, 'sent',
        'Application sent manually (letter downloaded)', { send_method: 'manual_download' });
      void logApplicationEvent(supabase, id, user.id, 'status_changed',
        'Status changed to applied', { from: 'saved', to: 'applied' });
    }
    setApps(prev => prev.map(a => a.id === id
      ? { ...a, status: 'applied', send_status: 'manual_download' }
      : a,
    ));
    setMarkingId(null);
    showToast('Marqué comme postulé ✓');
  }

  // ── Download cover letter PDF (pending queue) ─────────────────────────────────

  async function handleDownloadPdf(app: Application) {
    if (!app.cover_letter) { showToast('Aucune lettre disponible'); return; }
    setDownloadingPdfId(app.id);
    try {
      const { jsPDF } = await import('jspdf');
      const date = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
      const safe = (app.company_name || '').replace(/[^a-zA-Z0-9]/g, '_');
      const doc  = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const marginLeft = 20;
      const marginTop  = 15;
      const maxWidth   = 170;
      const maxY       = doc.internal.pageSize.getHeight() - 15;

      const blocks = app.cover_letter
        .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        .split(/\n{2,}/).map(b => b.trim()).filter(Boolean);

      let y = marginTop;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(26, 26, 46);

      for (let bi = 0; bi < blocks.length; bi++) {
        if (bi > 0) { y += 8; if (y >= maxY) break; }
        for (const line of blocks[bi].split('\n').map(l => l.trim()).filter(Boolean)) {
          if (y >= maxY) break;
          const wrapped = doc.splitTextToSize(line, maxWidth) as string[];
          for (const wl of wrapped) {
            if (y >= maxY) break;
            doc.text(wl, marginLeft, y);
            y += 6;
          }
        }
      }

      doc.save(`Lettre_Motivation_${safe}_${date}.pdf`);
    } catch (e) {
      console.error('[download-pdf]', e);
      showToast('Erreur lors de la génération du PDF');
    } finally {
      setDownloadingPdfId(null);
    }
  }

  // ── Delete pending application ────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setDeletingId(id);
    const supabase = createClient();
    await supabase.from('applications').delete().eq('id', id);
    setApps(prev => prev.filter(a => a.id !== id));
    setDeletingId(null);
    showToast('Candidature supprimée');
  }

  // ── Toast ─────────────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleRunNow() {
    if (!isPremium || running) return;
    setRunning(true);
    setRunResult(null);
    try {
      const res  = await fetch('/api/auto-apply/run', { method: 'POST' });
      const data = await res.json() as RunResult;
      setRunResult(data);
      if (data.applied > 0) {
        setLocalSentToday(n => n + data.applied);
        setLocalSentMonth(n => n + data.applied);
      }
      setTimeout(() => setRunResult(null), 10000);
    } catch {
      showToast('Run failed — please try again.');
    } finally {
      setRunning(false);
    }
  }

  // ── Derived data ──────────────────────────────────────────────────────────────

  const dailyMax   = settings.daily_limit;
  const monthlyMax = settings.monthly_limit;

  const pendingApps = apps.filter(a => a.send_status === 'no_email' || (a.send_status === 'pending' && a.status !== 'applied'));

  const filteredApps = apps.filter(a => {
    if (pendingApps.some(p => p.id === a.id)) return false; // pending queue handled separately
    if (feedFilter === 'sent')    return a.send_status === 'sent';
    if (feedFilter === 'pending') return a.send_status === 'pending' || a.send_status === 'no_email';
    if (feedFilter === 'failed')  return a.send_status === 'failed';
    return true;
  });

  const feedCounts = {
    all:     apps.filter(a => !pendingApps.some(p => p.id === a.id)).length,
    sent:    apps.filter(a => a.send_status === 'sent').length,
    pending: apps.filter(a => a.send_status === 'pending' || a.send_status === 'no_email').length,
    failed:  apps.filter(a => a.send_status === 'failed').length,
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Page Header ── */}
      <div className="px-3 sm:px-6 pt-4 sm:pt-6 pb-5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30 flex-shrink-0">
              <Zap size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">Auto Apply</h1>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Automatic job applications powered by AI</p>
            </div>
          </div>

          {!isPremium && (
            <a
              href={`/${resolvedLocale}/pricing`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-sm shadow-amber-400/30 hover:from-amber-500 hover:to-orange-500 transition-all"
            >
              <Crown size={11} /> Premium Feature — Upgrade
            </a>
          )}
        </div>
      </div>

      <div className="flex-1 px-3 sm:px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-4">

          {/* ── Premium Wall ── */}
          {!isPremium && (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-400 flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-400/30">
                <Crown size={22} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-white mb-1">Auto Apply is a Premium feature</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Upgrade to Premium to let Jobvero search and apply to matching jobs automatically — hands-free.
                </p>
              </div>
              <a
                href={`/${resolvedLocale}/pricing`}
                className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-lg shadow-amber-500/20 transition-all"
                style={{ background: 'linear-gradient(135deg,#F59E0B,#EF4444)' }}
              >
                <Crown size={14} /> Upgrade to Premium
              </a>
            </div>
          )}

          {/* ── Section 1: Status Card ── */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">

            {/* Toggle row */}
            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={handleToggle}
                disabled={!isPremium || toggling}
                aria-label="Toggle Auto Apply"
                className="relative flex-shrink-0 disabled:cursor-not-allowed"
              >
                <div className={`w-14 h-7 rounded-full transition-colors duration-200 ${
                  settings.is_active
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600'
                    : 'bg-gray-200 dark:bg-gray-700'
                }`}>
                  <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform duration-200 ${
                    settings.is_active ? 'translate-x-7' : 'translate-x-0.5'
                  }`} />
                </div>
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Auto Apply</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    settings.is_active
                      ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${settings.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                    {settings.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {settings.is_active
                    ? `Running — applies up to ${dailyMax} jobs/day automatically`
                    : 'Enable to start applying to matching jobs automatically'}
                </p>
              </div>

              {isPremium && (
                <button
                  onClick={handleToggle}
                  disabled={toggling}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    settings.is_active
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      : 'bg-violet-600 text-white hover:bg-violet-500'
                  }`}
                >
                  {toggling
                    ? <Loader2 size={11} className="animate-spin" />
                    : settings.is_active
                    ? <><Pause size={11} /> Pause</>
                    : <><Play  size={11} /> Resume</>
                  }
                </button>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {/* Sent today */}
              <div className="flex flex-col gap-1 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-semibold flex items-center gap-1">
                  <Send size={9} /> Sent today
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-gray-900 dark:text-white">{localSentToday}</span>
                  <span className="text-xs text-gray-400">/ {dailyMax}</span>
                </div>
                <div className="h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-violet-500 transition-all"
                    style={{ width: `${Math.min((localSentToday / Math.max(dailyMax, 1)) * 100, 100)}%` }}
                  />
                </div>
              </div>

              {/* Sent this month */}
              <div className="flex flex-col gap-1 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-semibold flex items-center gap-1">
                  <Briefcase size={9} /> This month
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-gray-900 dark:text-white">{localSentMonth}</span>
                  <span className="text-xs text-gray-400">/ {monthlyMax}</span>
                </div>
                <div className="h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min((localSentMonth / Math.max(monthlyMax, 1)) * 100, 100)}%`,
                      background: localSentMonth >= monthlyMax ? '#ef4444' : 'linear-gradient(90deg,#7C3AED,#4F46E5)',
                    }}
                  />
                </div>
              </div>

              {/* Last run */}
              <div className="flex flex-col gap-1 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
                <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-semibold flex items-center gap-1">
                  <Clock size={9} /> Last run
                </span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white mt-1">
                  {relTime(lastRunAt)}
                </span>
                {lastRunAt && (
                  <span className="text-[10px] text-gray-400">
                    {new Date(lastRunAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </span>
                )}
              </div>
            </div>

            {/* Run Now */}
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={handleRunNow}
                disabled={!isPremium || running}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-md shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}
              >
                {running
                  ? <><Loader2 size={13} className="animate-spin" /> Running…</>
                  : <><Zap size={13} /> Run Now</>
                }
              </button>
              <span className="text-xs text-gray-400">
                {running ? 'Searching and sending applications…' : 'Trigger one run manually'}
              </span>
            </div>

            {/* Run result banner */}
            {runResult && (
              <div className={`mt-3 flex items-start gap-2.5 px-3.5 py-3 rounded-xl border text-xs ${
                runResult.applied > 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
              }`}>
                {runResult.applied > 0
                  ? <CheckCircle size={14} className="flex-shrink-0 mt-0.5" />
                  : <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                }
                <span className="flex-1">
                  {runResult.applied > 0
                    ? <><strong>{runResult.applied}</strong> application{runResult.applied !== 1 ? 's' : ''} sent! Check your email for the recap.</>
                    : (SKIPPED_LABELS[runResult.skippedReason ?? ''] ?? runResult.message ?? 'No applications sent this run.')
                  }
                </span>
                <button
                  onClick={() => setRunResult(null)}
                  className="flex-shrink-0 ml-1 opacity-60 hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Active notice */}
            {settings.is_active && isPremium && (
              <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 text-xs text-violet-700 dark:text-violet-300">
                <Zap size={11} className="flex-shrink-0 mt-0.5" />
                Auto Apply is active. Jobvero will run daily and apply to up to {dailyMax} jobs matching your keywords.
              </div>
            )}
          </div>

          {/* ── Section 2: Settings ── */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            {/* Collapsible header */}
            <button
              type="button"
              onClick={() => setSettingsOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Settings size={15} className="text-violet-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Settings</span>
                {!initialSettings && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 uppercase">
                    Not configured
                  </span>
                )}
              </div>
              {settingsOpen
                ? <ChevronUp size={16} className="text-gray-400" />
                : <ChevronDown size={16} className="text-gray-400" />
              }
            </button>

            {settingsOpen && (
              <div className={`px-5 pb-5 space-y-5 border-t border-gray-100 dark:border-gray-800 pt-5 ${!isPremium ? 'opacity-60 pointer-events-none select-none' : ''}`}>

                {/* Keywords */}
                <ChipInput
                  label="Job keywords"
                  placeholder='e.g. React Developer, Data Analyst…'
                  chips={settings.keywords}
                  onAdd={v => addChip('keywords', v)}
                  onRemove={v => removeChip('keywords', v)}
                  disabled={!isPremium}
                />

                {/* Excluded keywords */}
                <ChipInput
                  label="Excluded keywords (avoid in job titles)"
                  placeholder='e.g. Manager, Director…'
                  chips={settings.excluded_keywords}
                  onAdd={v => addChip('excluded_keywords', v)}
                  onRemove={v => removeChip('excluded_keywords', v)}
                  disabled={!isPremium}
                />

                {/* Countries */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    <Globe size={11} /> Target countries
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_COUNTRIES.map(c => {
                      const active = settings.target_countries.includes(c.code);
                      return (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => toggleCountry(c.code)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                            active
                              ? 'bg-violet-600 border-violet-600 text-white'
                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-violet-400'
                          }`}
                        >
                          {c.flag} {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Locations / departments */}
                <ChipInput
                  label="Locations / departments"
                  placeholder='e.g. New York, Los Angeles, Chicago…'
                  chips={settings.locations}
                  onAdd={v => addChip('locations', v)}
                  onRemove={v => removeChip('locations', v)}
                  disabled={!isPremium}
                />

                {/* Contract types */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Contract types
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CONTRACT_TYPE_OPTIONS.map(ct => {
                      const checked = settings.contract_types.includes(ct);
                      return (
                        <label key={ct} className="flex items-center gap-2 cursor-pointer group">
                          <div
                            onClick={() => toggleContractType(ct)}
                            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer ${
                              checked
                                ? 'bg-violet-600 border-violet-600'
                                : 'border-gray-300 dark:border-gray-600 group-hover:border-violet-400'
                            }`}
                          >
                            {checked && <CheckCircle size={10} className="text-white" />}
                          </div>
                          <span className="text-sm text-gray-700 dark:text-gray-300" onClick={() => toggleContractType(ct)}>
                            {ct}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Row: min salary + remote + experience */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      Min salary ($/yr)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={5000}
                      value={settings.min_salary}
                      onChange={e => setSettings(s => ({ ...s, min_salary: Number(e.target.value) }))}
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      Experience
                    </label>
                    <select
                      value={settings.experience_level}
                      onChange={e => setSettings(s => ({ ...s, experience_level: e.target.value }))}
                      className={`${inputCls} appearance-none cursor-pointer`}
                    >
                      {EXPERIENCE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col justify-between">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      Remote only
                    </label>
                    <button
                      type="button"
                      onClick={() => setSettings(s => ({ ...s, remote_only: !s.remote_only }))}
                      className="relative self-start"
                    >
                      <div className={`w-11 h-6 rounded-full transition-colors ${
                        settings.remote_only
                          ? 'bg-violet-600'
                          : 'bg-gray-200 dark:bg-gray-700'
                      }`}>
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                          settings.remote_only ? 'translate-x-5' : 'translate-x-0.5'
                        }`} />
                      </div>
                    </button>
                  </div>
                </div>

                {/* ATS minimum score — Premium only */}
                {isPremium && (
                  <div className="p-4 rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                      ATS minimum score (Premium)
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Skip jobs where your CV scores below this threshold. Saves applications for well-matched offers only.
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={100}
                        step={1}
                        value={settings.ats_threshold}
                        onChange={e => setSettings(s => ({ ...s, ats_threshold: Number(e.target.value) }))}
                        className="flex-1 accent-violet-600"
                      />
                      <span className={`flex-shrink-0 w-12 text-center text-sm font-bold rounded-lg px-2 py-1 ${
                        settings.ats_threshold >= 70
                          ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                          : 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                      }`}>
                        {settings.ats_threshold}%
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                      <span>1% (min)</span>
                      <span>100% (max)</span>
                    </div>
                  </div>
                )}

                {/* Daily + Monthly limits */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      Daily limit <span className="text-gray-400 font-normal normal-case">(max {isPremium ? 10 : 5})</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={isPremium ? 10 : 5}
                      value={settings.daily_limit}
                      onChange={e => setSettings(s => ({ ...s, daily_limit: Math.min(Number(e.target.value), isPremium ? 10 : 5) }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                      Monthly limit <span className="text-gray-400 font-normal normal-case">(max {isPremium ? 200 : 50})</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={isPremium ? 200 : 50}
                      value={settings.monthly_limit}
                      onChange={e => setSettings(s => ({ ...s, monthly_limit: Math.min(Number(e.target.value), isPremium ? 200 : 50) }))}
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Save button */}
                <div className="flex items-center gap-3 pt-1 border-t border-gray-100 dark:border-gray-800">
                  <button
                    onClick={() => saveSettings()}
                    disabled={saving || !isPremium}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md shadow-violet-500/20 disabled:opacity-60 transition-all"
                    style={{ background: 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}
                  >
                    {saving
                      ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                      : <><CheckCircle size={14} /> Save Settings</>
                    }
                  </button>
                  {saveOk && (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle size={12} /> Saved
                    </span>
                  )}
                  {saveErr && (
                    <span className="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400">
                      <AlertCircle size={12} /> {saveErr}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Section 3: Applications Feed ── */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            {/* Header + filter tabs */}
            <div className="px-5 pt-4 pb-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Send size={14} className="text-violet-500" />
                  Sent applications
                </h2>
                <span className="text-xs text-gray-400">{apps.length} total</span>
              </div>

              {/* Filter tabs */}
              <div className="flex gap-1 border-b border-gray-100 dark:border-gray-800">
                {([ 'all', 'sent', 'pending', 'failed' ] as FeedFilter[]).map(tab => {
                  const count = feedCounts[tab];
                  const labels: Record<FeedFilter, string> = {
                    all: 'All', sent: 'Sent', pending: 'Pending email', failed: 'Failed',
                  };
                  return (
                    <button
                      key={tab}
                      onClick={() => setFeedFilter(tab)}
                      className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                        feedFilter === tab
                          ? 'border-violet-600 text-violet-700 dark:text-violet-400'
                          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                    >
                      {labels[tab]}
                      {count > 0 && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                          feedFilter === tab
                            ? 'bg-violet-100 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                        }`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Feed list */}
            <div className="p-5">
              {filteredApps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                    <Send size={20} className="text-gray-300 dark:text-gray-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {feedFilter === 'all' ? 'No applications yet' : `No ${feedFilter} applications`}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Applications sent by Auto Apply will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredApps.map(app => {
                    const initial  = (app.company_name?.[0] ?? '?').toUpperCase();
                    const bgColor  = avatarColor(app.company_name ?? '');
                    const isSent   = app.send_status === 'sent';
                    const isFailed = app.send_status === 'failed';

                    return (
                      <div
                        key={app.id}
                        className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-colors"
                      >
                        {/* Avatar */}
                        <div className={`w-9 h-9 rounded-lg ${bgColor} flex items-center justify-center flex-shrink-0`}>
                          <span className="text-white font-bold text-sm">{initial}</span>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{app.job_title}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{app.company_name}</span>
                            {app.location && (
                              <span className="flex items-center gap-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                                <MapPin size={9} /> {app.location}
                              </span>
                            )}
                            {app.salary && (
                              <span className="text-[10px] text-gray-400 dark:text-gray-500">{app.salary}</span>
                            )}
                            {app.contract_type && (
                              <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full">
                                {app.contract_type}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right side */}
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              isSent
                                ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                                : isFailed
                                ? 'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400'
                                : 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                            }`}>
                              {isSent ? 'Sent' : isFailed ? 'Failed' : 'Pending'}
                            </span>

                            {typeof app.ats_score === 'number' && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                app.ats_score >= 70
                                  ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                                  : 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                              }`}>
                                ATS {app.ats_score}%
                              </span>
                            )}
                          </div>

                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            {relTime(app.sent_at)}
                          </span>

                          <div className="flex items-center gap-1">
                            {app.cover_letter && (
                              <button
                                onClick={() => setViewLetter(app)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 border border-violet-200 dark:border-violet-800 transition-colors"
                              >
                                <FileText size={9} /> Letter
                              </button>
                            )}
                            {app.thread_id && (
                              <a
                                href={`/${resolvedLocale}/dashboard/inbox`}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 border border-blue-200 dark:border-blue-800 transition-colors"
                              >
                                <ExternalLink size={9} /> Thread
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Section 4: Pending Queue ── */}
          {pendingApps.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-amber-200 dark:border-amber-800 overflow-hidden">

              {/* Header with count badge */}
              <div className="px-5 pt-4 pb-3 border-b border-amber-100 dark:border-amber-900/50 flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center flex-shrink-0">
                  <AlertCircle size={14} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      Candidatures en attente
                    </p>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                      {pendingApps.length}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Téléchargez la lettre et postulez manuellement, puis marquez comme postulé.
                  </p>
                </div>
              </div>

              <div className="p-5 space-y-3">
                {pendingApps.map(app => {
                  const initial = (app.company_name?.[0] ?? '?').toUpperCase();
                  const bgColor = avatarColor(app.company_name ?? '');
                  const preview = app.cover_letter?.slice(0, 200);

                  return (
                    <div
                      key={app.id}
                      className="rounded-xl bg-amber-50 dark:bg-amber-950/10 border border-amber-100 dark:border-amber-900/40 p-4 space-y-3"
                    >
                      {/* Row 1: avatar + title/company + reason */}
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-lg ${bgColor} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <span className="text-white font-bold text-sm">{initial}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{app.job_title}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{app.company_name}</p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                            <AlertCircle size={10} className="flex-shrink-0" />
                            Email employeur non disponible
                          </p>
                        </div>
                      </div>

                      {/* Cover letter preview */}
                      {preview && (
                        <div className="px-3 py-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-3">
                            {preview}{app.cover_letter && app.cover_letter.length > 200 ? '…' : ''}
                          </p>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => handleDownloadPdf(app)}
                          disabled={downloadingPdfId === app.id || !app.cover_letter}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-50 transition-colors"
                        >
                          {downloadingPdfId === app.id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <Download size={11} />
                          }
                          Télécharger la lettre
                        </button>

                        <button
                          onClick={() => handleMarkApplied(app.id)}
                          disabled={markingId === app.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 transition-colors"
                        >
                          {markingId === app.id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <CheckCircle size={11} />
                          }
                          Marquer comme postulé
                        </button>

                        <button
                          onClick={() => handleDelete(app.id)}
                          disabled={deletingId === app.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-colors"
                        >
                          {deletingId === app.id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <Trash2 size={11} />
                          }
                          Supprimer
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Spacer at bottom */}
          <div className="h-4" />

        </div>
      </div>

      {/* ── Cover Letter Modal ── */}
      {viewLetter && (
        <CoverLetterModal app={viewLetter} onClose={() => setViewLetter(null)} />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}
    </div>
  );
}
