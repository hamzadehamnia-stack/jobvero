'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import {
  Plus, X, Loader2, MapPin, DollarSign, Calendar,
  Trash2, GripVertical, AlertCircle, FileText, ExternalLink,
  Briefcase, History, Bookmark, Send, Mic, Trophy, XCircle,
  MessageSquare, TrendingUp, BarChart3, Medal, NotepadText,
  Check, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { logApplicationEvent } from '@/lib/applicationEvents';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Job, ColumnId } from './types';
import { COLUMNS } from './types';
import { createClient } from '@/lib/supabase/client';
import DatePicker from '@/components/ui/DatePicker';
import JobDetailModal from '@/components/jobs/JobDetailModal';
import type { Job as SearchJob } from '@/components/jobs/types';

// ─── Avatar colors ────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500',   'bg-indigo-500', 'bg-cyan-500',  'bg-pink-500',
  'bg-teal-500',   'bg-orange-500',
];
function avatarColor(name: string): string {
  return AVATAR_COLORS[(name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];
}

// ─── Column icons ─────────────────────────────────────────────────────────────

const COLUMN_ICONS: Record<ColumnId, typeof Bookmark> = {
  saved:     Bookmark,
  applied:   Send,
  interview: Mic,
  offer:     Trophy,
  rejected:  XCircle,
};

// ─── Priority config ──────────────────────────────────────────────────────────

type Priority = 'high' | 'medium' | 'low';
const PRIORITY_CFG: Record<Priority, { label: string; emoji: string; bg: string; text: string; next: Priority }> = {
  high:   { label: 'Haute',   emoji: '🔴', bg: 'bg-red-100 dark:bg-red-950/40',     text: 'text-red-700 dark:text-red-400',     next: 'medium' },
  medium: { label: 'Moyenne', emoji: '🟡', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', next: 'low'    },
  low:    { label: 'Basse',   emoji: '🟢', bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', next: 'high' },
};

// ─── Job type styles ──────────────────────────────────────────────────────────

const JOB_TYPE_STYLES: Record<string, string> = {
  'full-time':   'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  'fulltime':    'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  'cdi':         'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  'temps plein': 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  'part-time':   'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  'parttime':    'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  'cdd':         'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  'contract':    'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
  'permanent':   'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400',
  'remote':      'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  'internship':  'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400',
  'stage':       'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400',
  'intérim':     'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
};
function jobTypeStyle(jt?: string): string {
  if (!jt) return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
  const key = jt.toLowerCase().trim();
  return (
    JOB_TYPE_STYLES[key] ??
    Object.entries(JOB_TYPE_STYLES).find(([k]) => key.includes(k))?.[1] ??
    'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
  );
}
function normalizeJobType(jt?: string): string | undefined {
  if (!jt) return undefined;
  const map: Record<string, string> = {
    'full_time': 'Full-time', 'fulltime': 'Full-time', 'full-time': 'Full-time',
    'temps plein': 'Temps plein', 'cdi': 'CDI',
    'part_time': 'Part-time', 'parttime': 'Part-time', 'part-time': 'Part-time',
    'temps partiel': 'Temps partiel', 'cdd': 'CDD',
    'contract': 'Contract', 'contractor': 'Contract',
    'interim': 'Intérim', 'intérim': 'Intérim',
    'permanent': 'Permanent',
    'internship': 'Stage', 'stage': 'Stage',
    'remote': 'Remote',
  };
  return map[jt.toLowerCase().trim()] ?? jt;
}

// ─── Locale / date labels ─────────────────────────────────────────────────────

type DateLabels = {
  appliedOn: string;
  interviewDate: string;
  followUpDate: string;
  appliedAgo: (n: number) => string;
  appliedToday: string;
  interviewIn: (n: number) => string;
  interviewToday: string;
  followUpOverdue: string;
};

const DATE_LABELS: Record<string, DateLabels> = {
  en: {
    appliedOn:       'Applied on',
    interviewDate:   'Interview date',
    followUpDate:    'Follow-up date',
    appliedAgo:      (n) => n === 1 ? 'Applied 1 day ago' : `Applied ${n} days ago`,
    appliedToday:    'Applied today',
    interviewIn:     (n) => n === 1 ? 'Interview in 1 day' : `Interview in ${n} days`,
    interviewToday:  'Interview today',
    followUpOverdue: 'Follow up overdue',
  },
  fr: {
    appliedOn:       'Date de candidature',
    interviewDate:   "Date d'entretien",
    followUpDate:    'Date de relance',
    appliedAgo:      (n) => n === 1 ? 'Postulé il y a 1 jour' : `Postulé il y a ${n} jours`,
    appliedToday:    "Postulé aujourd'hui",
    interviewIn:     (n) => n === 1 ? 'Entretien dans 1 jour' : `Entretien dans ${n} jours`,
    interviewToday:  "Entretien aujourd'hui",
    followUpOverdue: 'Relance à faire',
  },
  es: {
    appliedOn:       'Fecha de candidatura',
    interviewDate:   'Fecha de entrevista',
    followUpDate:    'Fecha de seguimiento',
    appliedAgo:      (n) => n === 1 ? 'Postulado hace 1 día' : `Postulado hace ${n} días`,
    appliedToday:    'Postulado hoy',
    interviewIn:     (n) => n === 1 ? 'Entrevista en 1 día' : `Entrevista en ${n} días`,
    interviewToday:  'Entrevista hoy',
    followUpOverdue: 'Seguimiento pendiente',
  },
  pt: {
    appliedOn:       'Data de candidatura',
    interviewDate:   'Data da entrevista',
    followUpDate:    'Data de acompanhamento',
    appliedAgo:      (n) => n === 1 ? 'Candidatou há 1 dia' : `Candidatou há ${n} dias`,
    appliedToday:    'Candidatou hoje',
    interviewIn:     (n) => n === 1 ? 'Entrevista em 1 dia' : `Entrevista em ${n} dias`,
    interviewToday:  'Entrevista hoje',
    followUpOverdue: 'Acompanhamento pendente',
  },
};

function diffDays(dateStr: string): number {
  const d = new Date(dateStr), today = new Date();
  today.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
function todayISO(): string { return new Date().toISOString().split('T')[0]; }

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props { initialJobs: Job[]; userId: string; }

type FormState = {
  job_title: string; company_name: string; location: string; salary: string;
  status: ColumnId; notes: string; job_url: string;
  sent_at: string; interview_date: string; follow_up_date: string;
  priority: Priority;
};

const inputCls = `w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
  bg-white dark:bg-gray-800 text-gray-900 dark:text-white
  placeholder:text-gray-400 dark:placeholder:text-gray-500
  focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
  transition-colors text-sm`;

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ jobs }: { jobs: Job[] }) {
  const total        = jobs.length;
  const postSaved    = jobs.filter(j => j.status !== 'saved').length;
  const interviews   = jobs.filter(j => j.status === 'interview').length;
  const offers       = jobs.filter(j => j.status === 'offer').length;
  const responseRate = postSaved > 0 ? Math.round(((interviews + offers) / postSaved) * 100) : 0;

  const stats = [
    { icon: BarChart3,    value: total,          label: 'Total candidatures', color: 'text-violet-500',  bg: 'bg-violet-50 dark:bg-violet-900/20'  },
    { icon: TrendingUp,   value: `${responseRate}%`, label: 'Taux de réponse',   color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-900/20'      },
    { icon: Mic,          value: interviews,     label: 'Entretiens en cours',color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-900/20'    },
    { icon: Medal,        value: offers,         label: 'Offres reçues',      color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      {stats.map(({ icon: Icon, value, label, color, bg }) => (
        <div key={label} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${bg}`}>
          <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-white dark:bg-gray-900 shadow-sm`}>
            <Icon size={18} className={color} />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-gray-900 dark:text-white leading-none">{value}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Cover Letter Modal ───────────────────────────────────────────────────────

function CoverLetterModal({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h3 className="font-bold text-base text-gray-900 dark:text-white">Cover Letter</h3>
            <p className="text-xs text-gray-400 mt-0.5">Generated for this position</p>
          </div>
          <button onClick={onClose} className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline">Close</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}

// ─── Job Card ─────────────────────────────────────────────────────────────────

function JobCard({
  job, locale, onDelete, onCoverLetter, onClick, onTimeline,
  onPriorityChange, onNotesChange, labels, isGenerating,
}: {
  job: Job; locale: string;
  onDelete: (id: string) => void;
  onCoverLetter: (job: Job) => void;
  onClick: (job: Job) => void;
  onTimeline: (job: Job) => void;
  onPriorityChange: (id: string, p: Priority) => void;
  onNotesChange: (id: string, notes: string) => Promise<void>;
  labels: DateLabels;
  isGenerating: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: job.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 };

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notesOpen,     setNotesOpen]     = useState(false);
  const [notesDraft,    setNotesDraft]    = useState(job.notes ?? '');
  const [notesSaving,   setNotesSaving]   = useState(false);

  const initial  = (job.company_name?.[0] ?? '?').toUpperCase();
  const bgColor  = avatarColor(job.company_name ?? '');
  const priority = (job.priority ?? 'medium') as Priority;
  const pCfg     = PRIORITY_CFG[priority];

  const appliedDiff   = job.sent_at        ? diffDays(job.sent_at)        : null;
  const interviewDiff = job.interview_date ? diffDays(job.interview_date) : null;
  const followUpDiff  = job.follow_up_date ? diffDays(job.follow_up_date) : null;

  const isFollowUpOverdue    = followUpDiff  !== null && followUpDiff  <= 0;
  const hasUpcomingInterview = interviewDiff !== null && interviewDiff >= 0;
  // Show "Relance?" if applied more than 7 days ago
  const needsFollowUp = job.status === 'applied' && appliedDiff !== null && appliedDiff < -7;

  let appliedLabel = '';
  if (appliedDiff !== null) {
    if (appliedDiff === 0)    appliedLabel = labels.appliedToday;
    else if (appliedDiff < 0) appliedLabel = labels.appliedAgo(Math.abs(appliedDiff));
  }
  let interviewLabel = '';
  if (hasUpcomingInterview && interviewDiff !== null) {
    interviewLabel = interviewDiff === 0 ? labels.interviewToday : labels.interviewIn(interviewDiff);
  }

  const saveNotes = async () => {
    setNotesSaving(true);
    await onNotesChange(job.id, notesDraft);
    setNotesSaving(false);
    setNotesOpen(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => !confirmDelete && !notesOpen && onClick(job)}
      className={`group relative bg-white dark:bg-gray-900 rounded-2xl border cursor-pointer
        transition-all duration-150
        ${isFollowUpOverdue
          ? 'border-red-200 dark:border-red-800'
          : 'border-gray-200 dark:border-gray-800 hover:border-violet-200 dark:hover:border-violet-800'
        }
        ${isDragging
          ? 'shadow-2xl rotate-1 scale-[1.02] border-violet-400 dark:border-violet-500 z-50'
          : 'shadow-sm hover:shadow-lg'
        }`}
    >
      {/* Overdue pulse dot */}
      {isFollowUpOverdue && (
        <span className="absolute top-3.5 left-3.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900 animate-pulse z-10" />
      )}

      {/* Controls */}
      <div className="absolute top-3 right-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={e => e.stopPropagation()}>
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-2.5 py-1.5">
            <AlertTriangle size={11} className="text-red-500 flex-shrink-0" />
            <span className="text-[11px] text-red-700 dark:text-red-300 font-medium">Supprimer ?</span>
            <button onClick={() => { onDelete(job.id); setConfirmDelete(false); }}
              className="text-[10px] font-bold text-red-600 hover:text-red-800 uppercase tracking-wide ml-1">Oui</button>
            <button onClick={() => setConfirmDelete(false)}
              className="text-[10px] font-bold text-gray-500 hover:text-gray-700 uppercase tracking-wide">Non</button>
          </div>
        ) : (
          <>
            <button type="button" onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
              <Trash2 size={13} />
            </button>
            <div {...attributes} {...listeners}
              className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing">
              <GripVertical size={13} />
            </div>
          </>
        )}
      </div>

      <div className="p-4">
        {/* Company avatar + title */}
        <div className="flex items-start gap-3 mb-2.5 pr-12">
          <div className={`w-10 h-10 rounded-xl ${bgColor} flex items-center justify-center flex-shrink-0 shadow-sm`}>
            <span className="text-white font-bold text-sm">{initial}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-gray-900 dark:text-white leading-snug">{job.job_title}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{job.company_name}</p>
          </div>
        </div>

        {/* Priority badge + follow-up reminder */}
        <div className="flex items-center gap-2 mb-2.5 flex-wrap" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onPriorityChange(job.id, pCfg.next)}
            title="Cliquer pour changer la priorité"
            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${pCfg.bg} ${pCfg.text}`}
          >
            {pCfg.emoji} {pCfg.label}
          </button>
          {needsFollowUp && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400">
              ⏰ Relance ?
            </span>
          )}
        </div>

        {/* Meta info */}
        <div className="space-y-1 mb-2.5">
          {job.location && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
              <MapPin size={11} className="flex-shrink-0" />
              <span className="truncate">{job.location}</span>
            </div>
          )}
          {job.salary && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
              <DollarSign size={11} className="flex-shrink-0" />
              <span className="truncate">{job.salary}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-gray-300 dark:text-gray-600">
              <Calendar size={11} className="flex-shrink-0" />
              <span>{appliedLabel || new Date(job.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
            </div>
            {job.contract_type && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full truncate max-w-[100px] ${jobTypeStyle(job.contract_type)}`}>
                {normalizeJobType(job.contract_type)}
              </span>
            )}
          </div>
        </div>

        {/* Date alert badges */}
        {(hasUpcomingInterview || isFollowUpOverdue) && (
          <div className="mb-2.5 space-y-1">
            {hasUpcomingInterview && interviewLabel && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <Calendar size={10} className="flex-shrink-0" />{interviewLabel}
              </div>
            )}
            {isFollowUpOverdue && (
              <div className="flex items-center gap-1.5 text-xs font-medium text-red-500 dark:text-red-400">
                <AlertCircle size={10} className="flex-shrink-0" />{labels.followUpOverdue}
              </div>
            )}
          </div>
        )}

        {/* Inline notes editor */}
        {notesOpen ? (
          <div className="mb-2.5" onClick={e => e.stopPropagation()}>
            <textarea
              autoFocus
              rows={3}
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              placeholder="Notes sur ce poste…"
              className="w-full px-3 py-2 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
            <div className="flex gap-2 mt-1.5">
              <button type="button" onClick={saveNotes} disabled={notesSaving}
                className="flex items-center gap-1 px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-medium disabled:opacity-60 transition-colors">
                {notesSaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Sauvegarder
              </button>
              <button type="button" onClick={() => { setNotesOpen(false); setNotesDraft(job.notes ?? ''); }}
                className="px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-[11px] hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Annuler
              </button>
            </div>
          </div>
        ) : job.notes ? (
          <p className="mb-2.5 text-xs text-gray-400 dark:text-gray-500 line-clamp-2 leading-relaxed">{job.notes}</p>
        ) : null}

        {/* Action buttons */}
        <div className="flex gap-1.5 pt-3 border-t border-gray-100 dark:border-gray-800" onClick={e => e.stopPropagation()}>
          {/* Cover letter */}
          <button type="button" disabled={isGenerating} onClick={() => onCoverLetter(job)}
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white transition-colors flex-1">
            {isGenerating ? <Loader2 size={10} className="animate-spin" /> : <FileText size={10} />}
            CV
          </button>

          {/* Notes */}
          <button type="button" onClick={() => setNotesOpen(v => !v)}
            title="Notes rapides"
            className={`flex items-center justify-center px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors
              ${notesOpen
                ? 'border-violet-300 dark:border-violet-700 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/20'
                : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-violet-500 hover:border-violet-300 dark:hover:border-violet-700'
              }`}>
            <NotepadText size={11} />
          </button>

          {/* Message → inbox */}
          <a href={`/${locale}/dashboard/inbox`}
            title="Ouvrir l'inbox"
            className="flex items-center justify-center px-2.5 py-1.5 rounded-lg text-[11px] border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-blue-500 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
            <MessageSquare size={11} />
          </a>

          {/* Job offer link */}
          {job.job_url ? (
            <a href={job.job_url} target="_blank" rel="noopener noreferrer"
              title="Voir l'offre"
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
              <ExternalLink size={10} /> Offre
            </a>
          ) : (
            <button type="button" disabled title="Pas de lien"
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed">
              <ExternalLink size={10} /> Offre
            </button>
          )}

          {/* Timeline */}
          <button type="button" onClick={() => onTimeline(job)} title="Timeline"
            className="flex items-center justify-center px-2 py-1.5 rounded-lg text-[11px] border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:text-violet-500 hover:border-violet-300 dark:hover:border-violet-700 transition-colors">
            <History size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function Column({
  id, label, headerBg, headerText, badge, dot, overBg,
  jobs, locale, onDelete, onAddClick, onCoverLetter, onJobClick, onTimeline,
  onPriorityChange, onNotesChange, generatingId, labels,
}: {
  id: ColumnId; label: string;
  headerBg: string; headerText: string; badge: string; dot: string; overBg: string;
  jobs: Job[]; locale: string;
  onDelete: (id: string) => void;
  onAddClick: (col: ColumnId) => void;
  onCoverLetter: (job: Job) => void;
  onJobClick: (job: Job) => void;
  onTimeline: (job: Job) => void;
  onPriorityChange: (id: string, p: Priority) => void;
  onNotesChange: (id: string, notes: string) => Promise<void>;
  generatingId: string | null;
  labels: DateLabels;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const Icon = COLUMN_ICONS[id];

  return (
    <div className="flex flex-col w-[280px] min-w-[280px] flex-shrink-0">
      {/* Column header */}
      <div className={`flex items-center justify-between px-3.5 py-3 rounded-xl mb-3 ${headerBg} ${isOver ? 'ring-2 ring-violet-400 dark:ring-violet-600' : ''} transition-all`}>
        <div className="flex items-center gap-2.5">
          <Icon size={14} className={headerText} />
          <span className={`text-xs font-bold uppercase tracking-wider ${headerText}`}>{label}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge}`}>{jobs.length}</span>
        </div>
        <button type="button" onClick={() => onAddClick(id)}
          className={`p-1.5 rounded-lg hover:bg-white/50 dark:hover:bg-black/20 transition-colors ${headerText}`}
          title={`Ajouter dans ${label}`}>
          <Plus size={14} />
        </button>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2.5 min-h-[160px] rounded-xl transition-all duration-150 p-1 -m-1
          ${isOver
            ? `${overBg} ring-2 ring-violet-300 dark:ring-violet-700 ring-dashed scale-[1.01]`
            : ''
          }`}
      >
        <SortableContext items={jobs.map(j => j.id)} strategy={verticalListSortingStrategy}>
          {jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              locale={locale}
              onDelete={onDelete}
              onCoverLetter={onCoverLetter}
              onClick={onJobClick}
              onTimeline={onTimeline}
              onPriorityChange={onPriorityChange}
              onNotesChange={onNotesChange}
              labels={labels}
              isGenerating={generatingId === job.id}
            />
          ))}
        </SortableContext>

        {jobs.length === 0 && !isOver && (
          <div className="flex flex-col items-center justify-center h-24 gap-2 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
            <Briefcase size={18} className="text-gray-200 dark:text-gray-700" />
            <p className="text-xs text-gray-300 dark:text-gray-700">Déposer ici</p>
          </div>
        )}
        {jobs.length === 0 && isOver && (
          <div className="flex flex-col items-center justify-center h-24 gap-2 border-2 border-dashed border-violet-300 dark:border-violet-700 rounded-xl bg-violet-50/50 dark:bg-violet-950/20">
            <CheckCircle2 size={20} className="text-violet-400" />
            <p className="text-xs text-violet-500 font-medium">Déposer ici</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add Job Modal ────────────────────────────────────────────────────────────

function AddJobModal({
  defaultStatus, onClose, onAdd, labels,
}: {
  defaultStatus: ColumnId;
  onClose: () => void;
  onAdd: (data: FormState) => Promise<void>;
  labels: DateLabels;
}) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [form,    setForm]    = useState<FormState>({
    job_title: '', company_name: '', location: '', salary: '',
    status: defaultStatus,
    notes: '', job_url: '',
    sent_at:        defaultStatus === 'applied'   ? todayISO() : '',
    interview_date: defaultStatus === 'interview' ? todayISO() : '',
    follow_up_date: '',
    priority: 'medium',
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const set = (k: keyof FormState, v: string) =>
    setForm(prev => {
      const next = { ...prev, [k]: v };
      if (k === 'status') {
        if (v === 'applied'   && !prev.sent_at)        next.sent_at        = todayISO();
        if (v === 'interview' && !prev.interview_date) next.interview_date = todayISO();
      }
      return next;
    });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (!form.job_title.trim() || !form.company_name.trim()) return;
    setError(''); setLoading(true);
    try { await onAdd(form); }
    catch (err) { setError(err instanceof Error ? err.message : 'Erreur'); setLoading(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="add-job-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <h2 id="add-job-title" className="text-base font-semibold text-gray-900 dark:text-white">Ajouter un job</h2>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={17} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="jt-title" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Titre du poste <span className="text-red-400">*</span>
              </label>
              <input id="jt-title" type="text" className={inputCls} required autoFocus autoComplete="off"
                value={form.job_title} onChange={e => set('job_title', e.target.value)} placeholder="Software Engineer" />
            </div>

            <div className="col-span-2">
              <label htmlFor="jt-company" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Entreprise <span className="text-red-400">*</span>
              </label>
              <input id="jt-company" type="text" className={inputCls} required autoComplete="off"
                value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Acme Corp" />
            </div>

            <div>
              <label htmlFor="jt-location" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Localisation</label>
              <input id="jt-location" type="text" className={inputCls} autoComplete="off"
                value={form.location} onChange={e => set('location', e.target.value)} placeholder="Paris, France" />
            </div>

            <div>
              <label htmlFor="jt-salary" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Salaire</label>
              <input id="jt-salary" type="text" className={inputCls} autoComplete="off"
                value={form.salary} onChange={e => set('salary', e.target.value)} placeholder="€50k / an" />
            </div>

            <div className="col-span-2">
              <label htmlFor="jt-url" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Lien de l&apos;offre <span className="text-gray-400 font-normal">(optionnel)</span>
              </label>
              <input id="jt-url" type="url" className={inputCls} autoComplete="off"
                value={form.job_url} onChange={e => set('job_url', e.target.value)} placeholder="https://linkedin.com/jobs/..." />
            </div>

            <div>
              <label htmlFor="jt-status" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Statut</label>
              <div className="relative">
                <select id="jt-status" value={form.status} onChange={e => set('status', e.target.value as ColumnId)}
                  className={`${inputCls} appearance-none cursor-pointer pr-8`}>
                  {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Priorité</label>
              <div className="flex gap-2">
                {(['high', 'medium', 'low'] as Priority[]).map(p => {
                  const cfg = PRIORITY_CFG[p];
                  return (
                    <button key={p} type="button" onClick={() => set('priority', p)}
                      className={`flex-1 py-2 rounded-xl text-[11px] font-semibold border-2 transition-all
                        ${form.priority === p
                          ? `${cfg.bg} ${cfg.text} border-current`
                          : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:border-gray-300'
                        }`}>
                      {cfg.emoji}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="col-span-2">
              <DatePicker label={`${labels.appliedOn} (optionnel)`} value={form.sent_at} onChange={v => set('sent_at', v)} showDay />
            </div>

            {form.status === 'interview' && (
              <div className="col-span-2">
                <DatePicker label={`${labels.interviewDate} (optionnel)`} value={form.interview_date} onChange={v => set('interview_date', v)} showDay />
              </div>
            )}

            <div className="col-span-2">
              <DatePicker label={`${labels.followUpDate} (optionnel)`} value={form.follow_up_date} onChange={v => set('follow_up_date', v)} showDay />
            </div>

            <div className="col-span-2">
              <label htmlFor="jt-notes" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Notes <span className="text-gray-400 font-normal">(optionnel)</span>
              </label>
              <textarea id="jt-notes" rows={2} className={`${inputCls} resize-none`}
                value={form.notes} onChange={e => set('notes', e.target.value)}
                placeholder="Notes sur ce poste…" />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Annuler
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-sm font-semibold shadow-lg shadow-violet-500/20 disabled:opacity-60 transition-all inline-flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={14} className="animate-spin" /> Sauvegarde…</> : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Kanban Board ─────────────────────────────────────────────────────────────

export default function KanbanBoard({ initialJobs, userId }: Props) {
  const [jobs,          setJobs]          = useState<Job[]>(initialJobs);
  const [activeJob,     setActiveJob]     = useState<Job | null>(null);
  const [modalOpen,     setModalOpen]     = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<ColumnId>('saved');
  const [generatingId,  setGeneratingId]  = useState<string | null>(null);
  const [coverLetterHtml, setCoverLetterHtml] = useState<string | null>(null);
  const [toast,         setToast]         = useState<string | null>(null);
  const [detailJob,     setDetailJob]     = useState<Job | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<'details' | 'timeline'>('details');

  const supabase = useMemo(() => createClient(), []);

  const pathname  = usePathname();
  const rawLocale = pathname?.split('/')[1] ?? 'fr';
  const locale    = ['en', 'fr', 'es', 'pt'].includes(rawLocale) ? rawLocale : 'fr';
  const labels    = DATE_LABELS[locale];

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const jobsInColumn = useCallback((col: ColumnId) => jobs.filter(j => j.status === col), [jobs]);
  const openModal    = useCallback((col: ColumnId) => { setDefaultStatus(col); setModalOpen(true); }, []);
  const closeModal   = useCallback(() => setModalOpen(false), []);

  // ── Add job ─────────────────────────────────────────────────────────────────
  const handleAddJob = useCallback(async (data: FormState) => {
    const { data: inserted, error } = await supabase
      .from('applications')
      .insert({
        user_id:          userId,
        job_title:        data.job_title,
        company_name:     data.company_name,
        location:         data.location      || null,
        salary:           data.salary        || null,
        status:           data.status,
        notes:            data.notes         || null,
        job_url:          data.job_url       || null,
        sent_at:          data.sent_at       || null,
        interview_date:   data.interview_date || null,
        follow_up_date:   data.follow_up_date || null,
        priority:         data.priority,
        application_type: 'manual',
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    setJobs(prev => [inserted as Job, ...prev]);
    setModalOpen(false);
    void logApplicationEvent(supabase, (inserted as Job).id, userId, 'created',
      `Application added: ${data.job_title} at ${data.company_name}`, { status: data.status });
  }, [supabase, userId]);

  // ── Delete job ──────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id));
    await supabase.from('applications').delete().eq('id', id);
  }, [supabase]);

  // ── Priority change ─────────────────────────────────────────────────────────
  const handlePriorityChange = useCallback(async (id: string, priority: Priority) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, priority } : j));
    await supabase.from('applications').update({ priority }).eq('id', id);
  }, [supabase]);

  // ── Notes change ────────────────────────────────────────────────────────────
  const handleNotesChange = useCallback(async (id: string, notes: string) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, notes } : j));
    await supabase.from('applications').update({ notes }).eq('id', id);
  }, [supabase]);

  // ── Cover letter ────────────────────────────────────────────────────────────
  const handleCoverLetter = useCallback(async (job: Job) => {
    setGeneratingId(job.id);
    try {
      const res = await fetch('/api/jobs/apply', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId:          job.id,
          jobTitle:       job.job_title,
          company:        job.company_name,
          location:       job.location,
          salary:         job.salary,
          jobDescription: '',
          jobUrl:         job.job_url,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; throw new Error(d.error || `HTTP ${res.status}`); }
      const d = await res.json();
      if (d.coverLetterHtml) { setCoverLetterHtml(d.coverLetterHtml); }
      else { showToast('Cover letter générée — consultez vos candidatures.'); }
    } catch (e) { showToast(e instanceof Error ? e.message : 'Erreur génération cover letter.'); }
    finally { setGeneratingId(null); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Status change ───────────────────────────────────────────────────────────
  const handleStatusChange = useCallback(async (id: string, status: string) => {
    const prevStatus = jobs.find(j => j.id === id)?.status;
    const col = status as ColumnId;
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: col } : j));
    setDetailJob(prev => prev?.id === id ? { ...prev, status: col } : prev);
    await supabase.from('applications').update({ status: col }).eq('id', id);
    if (prevStatus && prevStatus !== col) {
      void logApplicationEvent(supabase, id, userId, 'status_changed',
        `Status changed from ${prevStatus} to ${status}`, { from: prevStatus, to: status });
    }
  }, [supabase, jobs, userId]);

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveJob(jobs.find(j => j.id === active.id) ?? null);
  }, [jobs]);

  const handleDragOver = useCallback(({ active, over }: DragOverEvent) => {
    if (!over) return;
    const job = jobs.find(j => j.id === active.id);
    if (!job) return;
    const overCol = COLUMNS.find(c => c.id === over.id);
    if (overCol && job.status !== overCol.id) {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: overCol.id } : j));
    }
  }, [jobs]);

  const handleDragEnd = useCallback(async ({ active, over }: DragEndEvent) => {
    setActiveJob(null);
    if (!over) return;
    const job = jobs.find(j => j.id === active.id);
    if (!job) return;
    let targetCol: ColumnId = job.status;
    const overCol = COLUMNS.find(c => c.id === over.id);
    if (overCol) { targetCol = overCol.id; }
    else { const overJob = jobs.find(j => j.id === over.id); if (overJob) targetCol = overJob.status; }

    if (active.id !== over.id && job.status === targetCol) {
      setJobs(prev => {
        const col  = prev.filter(j => j.status === targetCol);
        const rest = prev.filter(j => j.status !== targetCol);
        const oldIdx = col.findIndex(j => j.id === active.id);
        const newIdx = col.findIndex(j => j.id === over.id);
        if (oldIdx === -1 || newIdx === -1) return prev;
        return [...rest, ...arrayMove(col, oldIdx, newIdx)];
      });
    }

    if (job.status !== targetCol) {
      const prevStatus = job.status;
      await supabase.from('applications').update({ status: targetCol }).eq('id', job.id);
      void logApplicationEvent(supabase, job.id, userId, 'status_changed',
        `Status moved from ${prevStatus} to ${targetCol}`, { from: prevStatus, to: targetCol });
    }
  }, [jobs, supabase, userId]);

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Briefcase size={20} className="text-violet-500" /> Job Tracker
            </h1>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
              {jobs.length} job{jobs.length !== 1 ? 's' : ''} suivis
            </p>
          </div>
          <button type="button" onClick={() => openModal('saved')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-sm font-semibold shadow-lg shadow-violet-500/20 transition-all">
            <Plus size={16} /> Ajouter un job
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <StatsBar jobs={jobs} />

      {/* ── Board ── */}
      <div className="flex-1 overflow-x-auto px-6 py-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 min-w-max items-start">
            {COLUMNS.map(col => (
              <Column
                key={col.id}
                id={col.id}
                label={col.label}
                headerBg={col.headerBg}
                headerText={col.headerText}
                badge={col.badge}
                dot={col.dot}
                overBg={col.overBg}
                jobs={jobsInColumn(col.id)}
                locale={locale}
                onDelete={handleDelete}
                onAddClick={openModal}
                onCoverLetter={handleCoverLetter}
                onJobClick={job => { setDetailInitialTab('details'); setDetailJob(job); }}
                onTimeline={job => { setDetailInitialTab('timeline'); setDetailJob(job); }}
                onPriorityChange={handlePriorityChange}
                onNotesChange={handleNotesChange}
                generatingId={generatingId}
                labels={labels}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18,0.67,0.6,1.22)' }}>
            {activeJob && (
              <div className="rotate-2 scale-105 opacity-95">
                <JobCard
                  job={activeJob}
                  locale={locale}
                  onDelete={() => {}}
                  onCoverLetter={() => {}}
                  onClick={() => {}}
                  onTimeline={() => {}}
                  onPriorityChange={() => {}}
                  onNotesChange={async () => {}}
                  labels={labels}
                  isGenerating={false}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* ── Add Job Modal ── */}
      {modalOpen && (
        <AddJobModal defaultStatus={defaultStatus} onClose={closeModal} onAdd={handleAddJob} labels={labels} />
      )}

      {/* ── Job Detail Modal ── */}
      {detailJob && (() => {
        const searchJob: SearchJob = {
          id:          detailJob.id,
          title:       detailJob.job_title,
          company:     detailJob.company_name,
          location:    detailJob.location ?? '',
          salary:      detailJob.salary        || undefined,
          jobType:     detailJob.contract_type || undefined,
          datePosted:  detailJob.created_at,
          description: detailJob.notes || 'No description available.',
          url:         detailJob.job_url       || undefined,
        };
        return (
          <JobDetailModal
            job={searchJob}
            onClose={() => { setDetailJob(null); setDetailInitialTab('details'); }}
            onCoverLetter={() => handleCoverLetter(detailJob)}
            onStatusChange={handleStatusChange}
            currentStatus={detailJob.status}
            isGenerating={generatingId === detailJob.id}
            initialTab={detailInitialTab}
          />
        );
      })()}

      {/* ── Cover Letter Modal ── */}
      {coverLetterHtml && (
        <CoverLetterModal html={coverLetterHtml} onClose={() => setCoverLetterHtml(null)} />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900">
          {toast}
        </div>
      )}
    </div>
  );
}
