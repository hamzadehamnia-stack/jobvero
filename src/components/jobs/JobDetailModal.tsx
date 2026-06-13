'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  X, MapPin, Zap,
  PlusCircle, CheckCircle2, Loader2, FileText, ChevronDown,
  Briefcase, GraduationCap, Globe, Tag, Wrench, History,
} from 'lucide-react';
import type { Job } from './types';
import { createClient } from '@/lib/supabase/client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCompanyDomain(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|group|company|sarl|sas|sa|gmbh|ag|se|plc)\b/g, '')
    .replace(/[^a-z0-9]/g, '') + '.com';
}

const CURRENCY: Record<string, { symbol: string; period: string }> = {
  fr: { symbol: '€', period: '/an' }, be: { symbol: '€', period: '/an' },
  de: { symbol: '€', period: '/an' }, ch: { symbol: '€', period: '/an' },
  nl: { symbol: '€', period: '/an' }, es: { symbol: '€', period: '/an' },
  pt: { symbol: '€', period: '/an' },
  gb: { symbol: '£', period: '/yr' }, ie: { symbol: '£', period: '/yr' },
};

function formatSalary(salary?: string, country?: string): string | undefined {
  if (!salary) return undefined;
  if (/[€£₹¥]|USD|EUR|GBP|CAD|AUD|R\$/.test(salary)) return salary;
  const { symbol, period } = CURRENCY[country ?? ''] ?? { symbol: '$', period: '/yr' };
  const ftAnnual = salary.match(/Annuel\s+de\s+([\d,.]+)\s+Euros(?:\s+[àa]\s+([\d,.]+)\s+Euros)?/i);
  if (ftAnnual) {
    const lo = Math.round(parseFloat(ftAnnual[1].replace(',', '.')) / 1000);
    const hi = ftAnnual[2] ? Math.round(parseFloat(ftAnnual[2].replace(',', '.')) / 1000) : null;
    if (lo === 0 && (!hi || hi === 0)) return undefined;
    return hi && hi !== lo ? `${lo}k-${hi}k€/an` : `${lo}k€/an`;
  }
  const ftMonthly = salary.match(/Mensuel\s+de\s+([\d,.]+)\s+Euros(?:\s+[àa]\s+([\d,.]+)\s+Euros)?/i);
  if (ftMonthly) {
    const lo = Math.round((parseFloat(ftMonthly[1].replace(',', '.')) * 12) / 1000);
    const hi = ftMonthly[2] ? Math.round((parseFloat(ftMonthly[2].replace(',', '.')) * 12) / 1000) : null;
    if (lo === 0 && (!hi || hi === 0)) return undefined;
    return hi && hi !== lo ? `${lo}k-${hi}k€/an` : `${lo}k€/an`;
  }
  const range = salary.match(/^(\d+)k\s*[-–]\s*(\d+)k$/i);
  if (range) {
    const lo = parseInt(range[1], 10);
    const hi = parseInt(range[2], 10);
    if (lo === 0 && hi === 0) return undefined;
    if (hi === 0 || hi <= lo) return `${lo}k${symbol}${period}`;
    return `${lo}k-${hi}k${symbol}${period}`;
  }
  const single = salary.match(/^(\d+)k$/i);
  if (single) {
    const val = parseInt(single[1], 10);
    if (val === 0) return undefined;
    return `${val}k${symbol}${period}`;
  }
  return salary;
}

function publishedDate(dateStr?: string, locale?: string): string | undefined {
  if (!dateStr) return undefined;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return undefined;
  const diffMs = Date.now() - date.getTime();
  const lang = locale ?? 'en';
  if (diffMs < 0) {
    return lang === 'fr' ? 'Récemment' : lang === 'es' ? 'Reciente' : lang === 'pt' ? 'Recente' : 'Recently';
  }
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays < 1) {
    return lang === 'fr' ? "Aujourd'hui" : lang === 'es' ? 'Hoy' : lang === 'pt' ? 'Hoje' : 'Today';
  }
  if (diffDays < 30) {
    return lang === 'fr' ? `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`
         : lang === 'es' ? `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`
         : lang === 'pt' ? `Há ${diffDays} dia${diffDays > 1 ? 's' : ''}`
         : `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }
  const months = Math.floor(diffDays / 30);
  return lang === 'fr' ? `Il y a ${months} mois`
       : lang === 'es' ? `Hace ${months} mes${months > 1 ? 'es' : ''}`
       : lang === 'pt' ? `Há ${months} ${months > 1 ? 'meses' : 'mês'}`
       : `${months} month${months > 1 ? 's' : ''} ago`;
}

function detectSource(url?: string, country?: string): string | undefined {
  if (url?.includes('reed.co.uk'))  return 'Reed UK';
  if (country === 'fr')             return 'France Travail';
  if (url?.includes('rapidapi') || url?.includes('jsearch')) return 'JSearch';
  return undefined;
}

type JobTypeKey = 'full-time' | 'part-time' | 'cdi' | 'cdd' | 'interim' | 'stage' | 'remote';

const JOB_TYPE_LABELS: Record<JobTypeKey, Record<string, string>> = {
  'full-time': { en: 'Full-time',  fr: 'Temps plein',   es: 'Tiempo completo', pt: 'Tempo integral' },
  'part-time': { en: 'Part-time',  fr: 'Temps partiel', es: 'Tiempo parcial',  pt: 'Meio período'   },
  'cdi':       { en: 'Permanent',  fr: 'CDI',           es: 'Indefinido',      pt: 'Efetivo'        },
  'cdd':       { en: 'Contract',   fr: 'CDD',           es: 'Contrato',        pt: 'Contrato'       },
  'interim':   { en: 'Temporary',  fr: 'Intérim',       es: 'Temporal',        pt: 'Temporário'     },
  'stage':     { en: 'Internship', fr: 'Stage',         es: 'Prácticas',       pt: 'Estágio'        },
  'remote':    { en: 'Remote',     fr: 'Remote',        es: 'Remoto',          pt: 'Remoto'         },
};

function toJobTypeKey(jt: string): JobTypeKey | null {
  const key = jt.toLowerCase().trim();
  if (key === 'full_time' || key === 'fulltime' || key === 'full-time' || key === 'full time' || key === 'temps plein') return 'full-time';
  if (key === 'cdi' || key === 'permanent') return 'cdi';
  if (key === 'part_time' || key === 'parttime' || key === 'part-time' || key === 'part time' || key === 'temps partiel') return 'part-time';
  if (key === 'cdd' || key === 'contract' || key === 'contractor') return 'cdd';
  if (key === 'interim' || key === 'intérim') return 'interim';
  if (key === 'internship' || key === 'stage') return 'stage';
  if (key === 'remote') return 'remote';
  if (key.includes('permanent') || key.includes('cdi')) return 'cdi';
  if (key.includes('full')) return 'full-time';
  if (key.includes('part')) return 'part-time';
  if (key.includes('contract')) return 'cdd';
  if (key.includes('intern') || key.includes('stage')) return 'stage';
  if (key.includes('interim') || key.includes('intérim')) return 'interim';
  return null;
}

function normalizeJobType(jt?: string, locale?: string): string | undefined {
  if (!jt) return undefined;
  const typeKey = toJobTypeKey(jt);
  if (!typeKey) return jt;
  const labels = JOB_TYPE_LABELS[typeKey];
  return labels[locale ?? 'en'] ?? labels['en'];
}

// ─── UI labels ────────────────────────────────────────────────────────────────

const MODAL_LABELS: Record<string, {
  salaryUnknown: string; aboutCompany: string; jobDescription: string;
  additionalInfo: string; company: string; location: string; contractType: string;
  salary: string; published: string; sector: string; requiredSkills: string;
  tabDetails: string; tabTimeline: string; generating: string; coverLetter: string;
  inTracker: string; addToTracker: string; applyWithAI: string;
  noEvents: string; noEventsSubtitle: string;
}> = {
  en: {
    salaryUnknown: 'Salary not specified', aboutCompany: 'About the company',
    jobDescription: 'Job description', additionalInfo: 'Additional information',
    company: 'Company', location: 'Location', contractType: 'Contract type',
    salary: 'Salary', published: 'Published', sector: 'Sector',
    requiredSkills: 'Required skills', tabDetails: 'Details', tabTimeline: 'Timeline',
    generating: 'Generating…', coverLetter: 'Cover letter',
    inTracker: 'In Tracker', addToTracker: 'Add to Tracker', applyWithAI: '✨ Apply with AI',
    noEvents: 'No events recorded.', noEventsSubtitle: 'Events will appear as applications progress.',
  },
  fr: {
    salaryUnknown: 'Salaire non précisé', aboutCompany: "À propos de l'entreprise",
    jobDescription: 'Description du poste', additionalInfo: 'Informations complémentaires',
    company: 'Entreprise', location: 'Localisation', contractType: 'Type de contrat',
    salary: 'Salaire', published: 'Publié', sector: 'Secteur',
    requiredSkills: 'Compétences requises', tabDetails: 'Détails', tabTimeline: 'Historique',
    generating: 'Génération…', coverLetter: 'Lettre de motivation',
    inTracker: 'Dans le Tracker', addToTracker: 'Ajouter au Tracker', applyWithAI: "✨ Postuler avec l'IA",
    noEvents: 'Aucun événement enregistré.', noEventsSubtitle: 'Les événements apparaîtront au fil des candidatures.',
  },
  es: {
    salaryUnknown: 'Salario no especificado', aboutCompany: 'Sobre la empresa',
    jobDescription: 'Descripción del puesto', additionalInfo: 'Información adicional',
    company: 'Empresa', location: 'Ubicación', contractType: 'Tipo de contrato',
    salary: 'Salario', published: 'Publicado', sector: 'Sector',
    requiredSkills: 'Habilidades requeridas', tabDetails: 'Detalles', tabTimeline: 'Historial',
    generating: 'Generando…', coverLetter: 'Carta de presentación',
    inTracker: 'En el Tracker', addToTracker: 'Añadir al Tracker', applyWithAI: '✨ Postular con IA',
    noEvents: 'Ningún evento registrado.', noEventsSubtitle: 'Los eventos aparecerán a medida que avancen las solicitudes.',
  },
  pt: {
    salaryUnknown: 'Salário não especificado', aboutCompany: 'Sobre a empresa',
    jobDescription: 'Descrição da vaga', additionalInfo: 'Informações adicionais',
    company: 'Empresa', location: 'Localização', contractType: 'Tipo de contrato',
    salary: 'Salário', published: 'Publicado', sector: 'Setor',
    requiredSkills: 'Habilidades exigidas', tabDetails: 'Detalhes', tabTimeline: 'Histórico',
    generating: 'Gerando…', coverLetter: 'Carta de apresentação',
    inTracker: 'No Tracker', addToTracker: 'Adicionar ao Tracker', applyWithAI: '✨ Candidatar com IA',
    noEvents: 'Nenhum evento registrado.', noEventsSubtitle: 'Os eventos aparecerão conforme as candidaturas avançam.',
  },
};

// ─── Tracker helpers ──────────────────────────────────────────────────────────

const TRACKER_STATUSES: { id: string; labels: Record<string, string> }[] = [
  { id: 'saved',     labels: { en: 'Saved',     fr: 'Sauvegardé',  es: 'Guardado',   pt: 'Salvo'       } },
  { id: 'applied',   labels: { en: 'Applied',   fr: 'Postulé',     es: 'Postulado',  pt: 'Candidatado' } },
  { id: 'interview', labels: { en: 'Interview', fr: 'Entretien',   es: 'Entrevista', pt: 'Entrevista'  } },
  { id: 'offer',     labels: { en: 'Offer',     fr: 'Offre reçue', es: 'Oferta',     pt: 'Oferta'      } },
  { id: 'rejected',  labels: { en: 'Rejected',  fr: 'Refusé',      es: 'Rechazado',  pt: 'Recusado'    } },
];

interface AppEvent {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
}

const EVENT_DOT: Record<string, string> = {
  created:             'bg-violet-500',
  sent:                'bg-blue-500',
  send_failed:         'bg-red-500',
  reply_received:      'bg-purple-500',
  status_changed:      'bg-amber-500',
  interview_scheduled: 'bg-teal-500',
  offer_received:      'bg-green-500',
  rejected:            'bg-red-500',
};

function relTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30)  return `${d}j`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} mois`;
  return `${Math.floor(mo / 12)} an${Math.floor(mo / 12) > 1 ? 's' : ''}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  job:            Job;
  onClose:        () => void;
  applying?:       boolean;
  addedToTracker?: boolean;
  locale?:         string;
  onApply?:        () => void;
  onAddToTracker?: () => Promise<void>;
  onCoverLetter?:  (job: Job) => void;
  onStatusChange?: (id: string, status: string) => Promise<void>;
  currentStatus?:  string;
  isGenerating?:   boolean;
  initialTab?:     'details' | 'timeline';
}

export default function JobDetailModal({
  job, onClose,
  applying = false, addedToTracker = false,
  locale,
  onApply, onAddToTracker,
  onCoverLetter, onStatusChange, currentStatus, isGenerating = false,
  initialTab = 'details',
}: Props) {
  const lang = locale ?? 'en';
  const lbl  = MODAL_LABELS[lang] ?? MODAL_LABELS['en'];
  const [addingToTracker, setAddingToTracker] = useState(false);
  const [statusChanging,  setStatusChanging]  = useState(false);
  const [logoError,       setLogoError]       = useState(false);
  const [activeTab,       setActiveTab]       = useState<'details' | 'timeline'>(initialTab);
  const [events,          setEvents]          = useState<AppEvent[]>([]);
  const [eventsLoading,   setEventsLoading]   = useState(false);

  const isTrackerMode = Boolean(onCoverLetter);

  useEffect(() => {
    if (activeTab !== 'timeline' || !isTrackerMode) return;
    setEventsLoading(true);
    const supabase = createClient();
    supabase
      .from('application_events')
      .select('id, event_type, description, created_at')
      .eq('application_id', job.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setEvents((data ?? []) as AppEvent[]);
        setEventsLoading(false);
      });
  }, [activeTab, job.id, isTrackerMode]);

  const initials = job.company.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2);
  const avatarColors = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2'];
  const avatarColor  = avatarColors[job.company.charCodeAt(0) % avatarColors.length];
  const domain       = getCompanyDomain(job.company);
  const logoSrc      = job.logo || `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

  const displaySalary  = formatSalary(job.salary, job.country);
  const displayDate    = publishedDate(job.datePosted, locale);
  const displayJobType = normalizeJobType(job.jobType, locale);
  const displaySource  = detectSource(job.url, job.country);

  const handleAddToTracker = async () => {
    if (addedToTracker || addingToTracker) return;
    setAddingToTracker(true);
    try { await onAddToTracker?.(); } finally { setAddingToTracker(false); }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === currentStatus || statusChanging) return;
    setStatusChanging(true);
    await onStatusChange?.(job.id, newStatus);
    setStatusChanging(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[95vw] max-w-[1000px] h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden
          bg-white dark:bg-gray-900"
        onClick={e => e.stopPropagation()}
      >

        {/* ── HEADER — flex-shrink-0 ── */}
        <div className="flex-shrink-0 flex items-start gap-5 p-6 pb-4
          bg-gradient-to-br from-slate-900 via-slate-800 to-gray-900">

          {!logoError ? (
            <div className="w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden bg-white/10 border border-white/20 flex items-center justify-center shadow-md">
              <Image
                src={logoSrc}
                alt={job.company}
                width={64} height={64}
                className="object-contain w-full h-full"
                onError={() => setLogoError(true)}
                unoptimized
              />
            </div>
          ) : (
            <div
              className="w-16 h-16 flex-shrink-0 rounded-xl flex items-center justify-center text-white text-xl font-bold shadow-md"
              style={{ backgroundColor: avatarColor }}
            >
              {initials}
            </div>
          )}

          <div className="flex-1 min-w-0 pt-1">
            <h2 className="text-2xl font-bold text-white leading-tight mb-1">{job.title}</h2>
            <p className="text-lg text-slate-300">{job.company}</p>
          </div>

          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── BADGES — flex-shrink-0 ── */}
        <div className="flex-shrink-0 px-6 pb-4 pt-3 flex flex-wrap gap-2
          bg-gradient-to-br from-slate-900 via-slate-800 to-gray-900
          border-b border-slate-700/50">
          {job.location && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 bg-white/10 border border-white/10 px-3 py-1.5 rounded-full">
              <MapPin size={11} className="text-slate-400" /> {job.location}
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border
            ${displaySalary
              ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30'
              : 'text-slate-400 bg-white/10 border-white/10'
            }`}>
            💰 {displaySalary ?? lbl.salaryUnknown}
          </span>
          {displayJobType && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-300 bg-violet-500/15 border border-violet-500/30 px-3 py-1.5 rounded-full">
              📋 {displayJobType}
            </span>
          )}
          {displayDate && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 bg-white/10 border border-white/10 px-3 py-1.5 rounded-full">
              🕐 {displayDate}
            </span>
          )}
          {job.experience && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-300 bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 rounded-full">
              <Briefcase size={10} /> {job.experience}
            </span>
          )}
          {job.remoteType && (
            <span className="inline-flex items-center gap-1.5 text-xs text-blue-300 bg-blue-500/15 border border-blue-500/30 px-3 py-1.5 rounded-full">
              <Globe size={10} /> {job.remoteType}
            </span>
          )}
          {job.education && (
            <span className="inline-flex items-center gap-1.5 text-xs text-teal-300 bg-teal-500/15 border border-teal-500/30 px-3 py-1.5 rounded-full">
              <GraduationCap size={10} /> {job.education}
            </span>
          )}
          {job.category && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-300 bg-white/10 border border-white/10 px-3 py-1.5 rounded-full">
              <Tag size={10} /> {job.category}
            </span>
          )}
          {displaySource && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-3 py-1.5 rounded-full">
              🌍 {displaySource}
            </span>
          )}
        </div>

        {/* ── TAB NAV — flex-shrink-0 (tracker only) ── */}
        {isTrackerMode && (
          <div className="flex-shrink-0 flex border-b border-gray-100 dark:border-gray-800">
            {(['details', 'timeline'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-2.5 text-sm font-medium transition-colors
                  ${activeTab === tab
                    ? 'border-b-2 border-violet-500 text-violet-600 dark:text-violet-400'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
              >
                {tab === 'timeline' && <History size={12} className="inline mr-1.5 -mt-0.5" />}
                {tab === 'details' ? lbl.tabDetails : lbl.tabTimeline}
              </button>
            ))}
          </div>
        )}

        {/* ── BODY DETAILS — flex-1 min-h-0 overflow-y-auto ── */}
        {activeTab === 'details' && (
          <div className="flex-1 min-h-0 overflow-y-auto
            [&::-webkit-scrollbar]:w-1.5
            [&::-webkit-scrollbar-track]:bg-gray-800
            [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-purple-600">

            <div className="py-5 space-y-5">

              {/* Company description */}
              {job.companyDescription && (
                <section className="px-6">
                  <h3 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">
                    {lbl.aboutCompany}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {job.companyDescription}
                  </p>
                </section>
              )}

              {/* Description */}
              <section>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3 px-6">
                  {lbl.jobDescription}
                </h3>
                <div className="mx-6 p-6 rounded-xl bg-gray-800/30 dark:bg-gray-800/50 border border-gray-700/30 dark:border-gray-700/50">
                  <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                    {job.description}
                  </div>
                </div>
              </section>

              {/* Details grid */}
              {[job.company, job.location, displayJobType, displaySalary, displayDate, job.category].some(Boolean) && (
                <section className="px-6">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
                    {lbl.additionalInfo}
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: lbl.company,      value: job.company    },
                      { label: lbl.location,     value: job.location   },
                      { label: lbl.contractType, value: displayJobType },
                      { label: lbl.salary,       value: displaySalary  },
                      { label: lbl.published,    value: displayDate    },
                      { label: lbl.sector,       value: job.category   },
                    ].filter(item => item.value).map(({ label, value }) => (
                      <div key={label} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50">
                        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-0.5">{label}</p>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{value}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Skills */}
              {job.skills && job.skills.length > 0 && (
                <section className="px-6 pb-2">
                  <h3 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Wrench size={11} /> {lbl.requiredSkills}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {job.skills.map(skill => (
                      <span key={skill} className="text-xs font-medium px-3 py-1.5 rounded-full
                        bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400
                        border border-violet-100 dark:border-violet-900">
                        {skill}
                      </span>
                    ))}
                  </div>
                </section>
              )}

            </div>
          </div>
        )}

        {/* ── BODY TIMELINE — flex-1 min-h-0 overflow-y-auto ── */}
        {activeTab === 'timeline' && isTrackerMode && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
            {eventsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={20} className="animate-spin text-gray-400" />
              </div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <History size={32} className="text-gray-300 dark:text-gray-700 mb-3" />
                <p className="text-sm text-gray-400">{lbl.noEvents}</p>
                <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">{lbl.noEventsSubtitle}</p>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-[5px] top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />
                <div className="space-y-5">
                  {events.map(ev => (
                    <div key={ev.id} className="flex gap-4">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ring-2 ring-white dark:ring-gray-900 ${EVENT_DOT[ev.event_type] ?? 'bg-gray-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-200">{ev.description}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{relTime(ev.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FOOTER — flex-shrink-0 ── */}
        <div className="flex-shrink-0 flex justify-between items-center gap-3 p-6 pt-4
          border-t border-gray-200 dark:border-gray-700
          bg-white dark:bg-gray-900">
          {onCoverLetter ? (
            // Tracker mode
            <>
              <button
                onClick={() => onCoverLetter(job)}
                disabled={isGenerating}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
              >
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                {isGenerating ? lbl.generating : lbl.coverLetter}
              </button>

              <div className="relative w-52">
                <select
                  value={currentStatus ?? ''}
                  onChange={e => handleStatusChange(e.target.value)}
                  disabled={statusChanging}
                  className="w-full appearance-none px-4 py-3 pr-9 rounded-xl border border-gray-200 dark:border-gray-700
                    bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium
                    focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
                    disabled:opacity-60 cursor-pointer transition-colors"
                >
                  {TRACKER_STATUSES.map(s => (
                    <option key={s.id} value={s.id}>{s.labels[lang] ?? s.labels['en']}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  {statusChanging
                    ? <Loader2 size={13} className="animate-spin text-gray-400" />
                    : <ChevronDown size={13} className="text-gray-400" />
                  }
                </div>
              </div>
            </>
          ) : (
            // Search mode
            <>
              <button
                onClick={handleAddToTracker}
                disabled={addedToTracker || addingToTracker}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-semibold transition-all duration-150
                  ${addedToTracker
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-600 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 cursor-default'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-700'
                  }`}
              >
                {addingToTracker
                  ? <Loader2 size={15} className="animate-spin" />
                  : addedToTracker ? <CheckCircle2 size={15} /> : <PlusCircle size={15} />
                }
                {addedToTracker ? lbl.inTracker : lbl.addToTracker}
              </button>

              <button
                onClick={onApply}
                disabled={applying}
                className="flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-base font-bold text-white
                  disabled:opacity-60 transition-all shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
              >
                <Zap size={16} />
                {applying ? lbl.generating : lbl.applyWithAI}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
