'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  Search, MapPin,
  Loader2, SlidersHorizontal, Briefcase,
  Copy, Check, Download, Send, Mail, AlertCircle, Bookmark, BookOpen, X as XIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { logApplicationEvent } from '@/lib/applicationEvents';
import { getSearchEngine, ENGINE_LABELS, type Engine } from '@/lib/jobEngineRouter';
import JobCard from './JobCard';
import JobDetailModal from './JobDetailModal';
import JobFilters from './JobFilters';
import type { Job, SearchFilters } from './types';

// ─── Countries ────────────────────────────────────────────────────────────────

const VISIBLE_COUNTRY_CODES = new Set(['us']);

const ALL_COUNTRIES = [
  { code: 'fr', label: 'France',       flag: '🇫🇷' },
  { code: 'us', label: 'USA',          flag: '🇺🇸' },
  { code: 'gb', label: 'UK',           flag: '🇬🇧' },
  { code: 'ca', label: 'Canada',       flag: '🇨🇦' },
  { code: 'de', label: 'Germany',      flag: '🇩🇪' },
  { code: 'be', label: 'Belgium',      flag: '🇧🇪' },
  { code: 'ch', label: 'Switzerland',  flag: '🇨🇭' },
  { code: 'nl', label: 'Netherlands',  flag: '🇳🇱' },
  { code: 'es', label: 'Spain',        flag: '🇪🇸' },
  { code: 'pt', label: 'Portugal',     flag: '🇵🇹' },
  { code: 'au', label: 'Australia',    flag: '🇦🇺' },
  { code: 'nz', label: 'New Zealand',  flag: '🇳🇿' },
  { code: 'ie', label: 'Ireland',      flag: '🇮🇪' },
  { code: 'br', label: 'Brazil',       flag: '🇧🇷' },
  { code: 'mx', label: 'Mexico',       flag: '🇲🇽' },
  { code: 'pe', label: 'Peru',         flag: '🇵🇪' },
];

// ─── Engine config ────────────────────────────────────────────────────────────

const ENGINE_URLS: Record<Engine, string> = {
  'adzuna':         '/api/jobs/search',
  'jsearch':        '/api/jobs/jsearch',
  'reed':           '/api/jobs/reed',
  'france-travail': '/api/jobs/france-travail',
};

// ─── Adzuna response mapper ───────────────────────────────────────────────────

interface AdzunaResult {
  id: string;
  title: string;
  company?: { display_name: string; logo_url?: string };
  location?: { display_name: string };
  salary_min?: number;
  salary_max?: number;
  description?: string;
  redirect_url?: string;
  created?: string;
  contract_time?: string;
  contract_type?: string;
  logo?: string;
  company_logo?: string;
  category?: { label?: string };
}

function mapAdzunaJob(j: AdzunaResult): Job {
  const salaryParts: string[] = [];
  const min = j.salary_min && j.salary_min > 0 ? Math.round(j.salary_min / 1000) : null;
  const max = j.salary_max && j.salary_max > 0 ? Math.round(j.salary_max / 1000) : null;
  if (min !== null) salaryParts.push(`${min}k`);
  if (max !== null && max !== min) salaryParts.push(`${max}k`);

  const jobType = j.contract_time === 'full_time' ? 'Full-time'
    : j.contract_time === 'part_time' ? 'Part-time'
    : j.contract_type === 'permanent' ? 'Permanent'
    : j.contract_type === 'contract'  ? 'Contract'
    : undefined;

  return {
    id:          j.id,
    title:       j.title,
    company:     j.company?.display_name ?? 'Unknown',
    location:    j.location?.display_name ?? '',
    salary:      salaryParts.length ? salaryParts.join(' – ') : undefined,
    description: j.description ?? '',
    url:         j.redirect_url,
    datePosted:  j.created,
    jobType,
    logo:        j.company?.logo_url || j.logo || j.company_logo || undefined,
    category:    j.category?.label ?? undefined,
  };
}

// ─── Raw job shape returned by Reed / JSearch / France Travail routes ─────────

interface RawJob {
  id:                  string | number;
  title:               string;
  company:             string;
  location:            string;
  salary?:             string;
  description?:        string;
  url?:                string;
  redirect_url?:       string;
  datePosted?:         string;
  created?:            string;
  jobType?:            string;
  logo?:               string;
  company_logo?:       string;
  employer_logo?:      string;
  logoUrl?:            string;
  // Extended fields from routes
  experience?:         string | null;
  education?:          string | null;
  skills?:             string[] | null;
  remoteType?:         string | null;
  companyDescription?: string | null;
  category?:           string | null;
}

function pickLogo(r: RawJob): string | undefined {
  return r.logo || r.company_logo || r.employer_logo || r.logoUrl || undefined;
}

function pickExtended(r: RawJob): Pick<Job, 'experience' | 'education' | 'skills' | 'remoteType' | 'companyDescription' | 'category'> {
  return {
    experience:         r.experience         ?? undefined,
    education:          r.education          ?? undefined,
    skills:             r.skills             ?? undefined,
    remoteType:         r.remoteType         ?? undefined,
    companyDescription: r.companyDescription ?? undefined,
    category:           r.category           ?? undefined,
  };
}

function normalizeResults(engine: Engine, raw: unknown[], country: string): Job[] {
  if (engine === 'adzuna') {
    return (raw as AdzunaResult[]).map(j => ({ ...mapAdzunaJob(j), country }));
  }
  if (engine === 'france-travail') {
    return (raw as RawJob[]).map(r => ({
      id:          String(r.id ?? ''),
      title:       r.title ?? '',
      company:     r.company ?? 'Unknown',
      location:    r.location ?? '',
      salary:      r.salary ?? undefined,
      description: r.description ?? '',
      url:         r.redirect_url ?? undefined,
      datePosted:  r.created ?? undefined,
      jobType:     r.jobType ?? undefined,
      logo:        pickLogo(r),
      country,
      ...pickExtended(r),
    }));
  }
  // reed, jsearch
  return (raw as RawJob[]).map(r => ({
    id:          String(r.id ?? ''),
    title:       r.title ?? '',
    company:     r.company ?? 'Unknown',
    location:    r.location ?? '',
    salary:      r.salary ?? undefined,
    description: r.description ?? '',
    url:         r.url ?? undefined,
    datePosted:  r.datePosted ?? undefined,
    jobType:     r.jobType ?? undefined,
    logo:        pickLogo(r),
    country,
    ...pickExtended(r),
  }));
}

function buildEngineParams(
  engine:   Engine,
  what:     string,
  location: string,
  country:  string,
  page:     number,
  filters:  SearchFilters,
  remote:   boolean,
): URLSearchParams {
  const p       = new URLSearchParams();
  const keyword = remote ? `${what} remote` : what;

  switch (engine) {
    case 'adzuna':
      p.set('what',    keyword);
      p.set('country', country);
      p.set('page',    String(page));
      if (location.trim()) p.set('where',        location.trim());
      if (filters.jobType === 'fulltime')  p.set('full_time',   '1');
      if (filters.jobType === 'parttime')  p.set('part_time',   '1');
      if (filters.jobType === 'contract')  p.set('contract',    '1');
      if (filters.datePosted)              p.set('max_days_old', filters.datePosted);
      break;

    case 'france-travail':
      p.set('what', keyword);
      p.set('page', String(page - 1)); // route expects 0-based
      if (location.trim())   p.set('departement', location.trim());
      if (filters.datePosted) p.set('datePosted',  filters.datePosted);
      break;

    case 'reed':
      p.set('what', keyword);
      p.set('page', String(page - 1)); // route does resultsToSkip = page * 20
      if (location.trim()) p.set('where', location.trim());
      if (filters.jobType === 'fulltime') p.set('fullTime', 'true');
      if (filters.jobType === 'contract') p.set('contract', 'true');
      if (filters.datePosted) p.set('datePosted', filters.datePosted);
      break;

    case 'jsearch':
      p.set('what',    keyword);
      p.set('country', country);
      p.set('page',    String(page));
      if (location.trim()) p.set('where', location.trim());
      if (filters.datePosted) p.set('date_posted', filters.datePosted);
      if (remote) p.set('remote_only', 'true');
      break;
  }

  return p;
}

async function callEngine(
  engine:   Engine,
  what:     string,
  location: string,
  country:  string,
  page:     number,
  filters:  SearchFilters,
  remote:   boolean,
): Promise<{ results: Job[]; count: number }> {
  const params = buildEngineParams(engine, what, location, country, page, filters, remote);
  const res    = await fetch(`${ENGINE_URLS[engine]}?${params}`);

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  const data    = await res.json();
  const results = normalizeResults(engine, data.results ?? [], country);
  return { results, count: data.count ?? results.length };
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
      ${type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
      {message}
    </div>
  );
}

// ─── Template category inference ─────────────────────────────────────────────

function inferTemplateCategory(job: Job): string | null {
  const text = [job.title, job.category].filter(Boolean).join(' ').toLowerCase();
  if (/santé|médical|infirmier|nurse|soin|médecin|health|pharm|hopital|hôpital|clinique/.test(text)) return 'Santé';
  if (/tech|software|developer|développeur|informatique|digital|data|cyber|cloud|devops/.test(text)) return 'Tech';
  if (/commercial|sales|vente|account|business dev|représentant/.test(text)) return 'Commercial';
  if (/btp|construction|chantier|bâtiment|génie civil|maçon|plombier|électricien/.test(text)) return 'BTP';
  if (/éducation|enseignant|teacher|professeur|formation|formateur/.test(text)) return 'Éducation';
  return null;
}

// ─── Cover Letter Success Modal ───────────────────────────────────────────────

const TEMPLATE_CATEGORIES = ['Santé', 'Tech', 'Commercial', 'BTP', 'Éducation', 'Autre'];

function CoverLetterModal({
  html, text, job, locale, onClose, onShowToast,
}: {
  html:         string;
  text:         string;
  job:          Job;
  locale:       string;
  onClose:      () => void;
  onShowToast:  (message: string, type?: 'success' | 'error') => void;
}) {
  const [copied,             setCopied]             = useState(false);
  const [downloadingCv,      setDownloadingCv]      = useState(false);
  const [downloadingLetter,  setDownloadingLetter]  = useState(false);
  const [sending,            setSending]            = useState(false);
  const [noEmailMode,        setNoEmailMode]        = useState(false);
  const [savingQueue,        setSavingQueue]        = useState(false);
  const [savedToQueue,       setSavedToQueue]       = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateName,       setTemplateName]       = useState('');
  const [templateCategory,   setTemplateCategory]   = useState('Autre');
  const [savingTemplate,     setSavingTemplate]     = useState(false);
  const [savedAsTemplate,    setSavedAsTemplate]    = useState(false);
  const [matchingTemplates,  setMatchingTemplates]  = useState(0);

  useEffect(() => {
    const cat = inferTemplateCategory(job);
    if (!cat) return;
    fetch('/api/letter-templates')
      .then(r => r.ok ? r.json() : { templates: [] })
      .then(({ templates }) => {
        const count = (templates as { category: string }[]).filter(t => t.category === cat).length;
        setMatchingTemplates(count);
      })
      .catch(() => null);
  }, [job]);

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      const res = await fetch('/api/letter-templates', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: templateName.trim(), category: templateCategory, content: text }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSavedAsTemplate(true);
      setShowTemplateDialog(false);
      onShowToast('Template sauvegardé ✓');
    } catch {
      onShowToast('Erreur lors de la sauvegarde du template', 'error');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleCopy = async () => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const text = tmp.textContent || tmp.innerText || '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCv = async () => {
    setDownloadingCv(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { onShowToast('Please sign in', 'error'); return; }

      const { data, error } = await supabase.storage
        .from('cvs')
        .download(`${user.id}/cv.pdf`);

      if (error || !data) {
        onShowToast("Aucun CV trouvé. Créez votre CV d'abord.", 'error');
        return;
      }

      const url = URL.createObjectURL(data);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = 'CV.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingCv(false);
    }
  };

  const handleDownloadLetter = async () => {
    setDownloadingLetter(true);
    try {
      const { jsPDF } = await import('jspdf');

      const date     = new Date().toLocaleDateString('fr-FR').replace(/\//g, '-');
      const safe     = job.company.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Lettre_Motivation_${safe}_${date}.pdf`;

      const doc        = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const marginLeft = 20;
      const marginTop  = 15;
      const maxWidth   = 170; // 210 - 20 left - 20 right
      const maxY       = doc.internal.pageSize.getHeight() - 15;
      const blockGap   = 8;   // mm between paragraph blocks

      // Normalise line endings and split into paragraph blocks
      const blocks = text
        .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        .split(/\n{2,}/)
        .map(b => b.trim())
        .filter(Boolean);

      let y = marginTop;

      for (let bi = 0; bi < blocks.length; bi++) {
        if (bi > 0) {
          y += blockGap;
          if (y >= maxY) break;
        }

        const blockLines = blocks[bi].split('\n').map(l => l.trim()).filter(Boolean);

        for (let li = 0; li < blockLines.length; li++) {
          if (y >= maxY) break;

          const line        = blockLines[li];
          const isName      = bi === 0 && li === 0;
          const isContact   = bi === 0 && li > 0;
          const isObjet     = /^objet\s*:/i.test(line);

          if (isName) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(26, 26, 46);
          } else if (isContact) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
          } else if (isObjet) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(26, 26, 46);
          } else {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.setTextColor(26, 26, 46);
          }

          const lh      = isName ? 7 : isContact ? 5 : 6;
          const wrapped = doc.splitTextToSize(line, maxWidth) as string[];

          for (const wl of wrapped) {
            if (y >= maxY) break;
            doc.text(wl, marginLeft, y);
            y += lh;
          }
        }
      }

      doc.save(filename);
    } catch (e) {
      console.error('[download-letter]', e);
      onShowToast('Erreur lors de la génération du PDF', 'error');
    } finally {
      setDownloadingLetter(false);
    }
  };

  const handleSend = async () => {
    const employerEmail = (job as unknown as Record<string, unknown>).employerEmail as string | undefined;
    if (!employerEmail) {
      setNoEmailMode(true);
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/jobs/send-application', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coverLetterHtml: html,
          coverLetterText: text,
          jobTitle:   job.title,
          company:    job.company,
          employerEmail,
          jobId:      job.id,
          jobLocation: job.location,
          salary:     job.salary,
          jobUrl:     job.url,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error || 'Envoi échoué');
      }

      onShowToast('Candidature envoyée ! ✓');
      onClose();
    } catch (e) {
      onShowToast(e instanceof Error ? e.message : 'Envoi échoué', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleSaveToQueue = async () => {
    setSavingQueue(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingQueue(false); return; }

    const { data: appRow } = await supabase.from('applications').insert({
      user_id:          user.id,
      job_title:        job.title,
      company_name:     job.company,
      location:         job.location  ?? null,
      salary:           job.salary    ?? null,
      job_url:          job.url       ?? null,
      status:           'saved',
      send_status:      'no_email',
      cover_letter:     text          || null,
      application_type: 'auto',
    }).select('id').single();

    if (appRow?.id) {
      void logApplicationEvent(supabase, appRow.id, user.id, 'created',
        `Added to pending queue: ${job.title} at ${job.company}`, { reason: 'no_email' });
    }

    await supabase.from('notifications').insert({
      user_id: user.id,
      type:    'pending_email',
      title:   '📧 1 candidature en attente',
      message: `${job.title} chez ${job.company} — Email employeur manquant`,
      read:    false,
    });

    setSavingQueue(false);
    setSavedToQueue(true);
    onShowToast('Ajouté à votre queue Auto Apply');
    setTimeout(onClose, 1200);
  };

  if (noEmailMode) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
        <div
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header — amber */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-amber-100 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center flex-shrink-0">
              <Mail size={16} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white">Email employeur manquant</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{job.title} · {job.company}</p>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 text-sm font-medium text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              Fermer
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <AlertCircle size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                Cet employeur n&apos;a pas fourni d&apos;email de contact. Votre lettre est prête —
                vous pouvez la télécharger pour postuler manuellement.
              </p>
            </div>

            {/* Letter preview */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60">
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Aperçu de votre lettre</p>
              </div>
              <div className="max-h-48 overflow-y-auto" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>

          {/* Footer — 2 action buttons */}
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 space-y-2.5">
            <button
              onClick={handleDownloadLetter}
              disabled={downloadingLetter}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium
                border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300
                hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30 hover:text-violet-700 dark:hover:text-violet-400
                disabled:opacity-60 transition-all"
            >
              {downloadingLetter ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {downloadingLetter ? 'Génération…' : 'Télécharger la lettre (PDF)'}
            </button>

            <button
              onClick={handleSaveToQueue}
              disabled={savingQueue || savedToQueue}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white
                disabled:opacity-60 transition-all"
              style={{ background: savedToQueue ? '#059669' : 'linear-gradient(135deg,#7C3AED,#4F46E5)' }}
            >
              {savingQueue
                ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</>
                : savedToQueue
                ? <><Check size={14} /> Ajouté à la queue ✓</>
                : 'Ajouter à ma queue manuelle'
              }
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h3 className="font-bold text-base text-gray-900 dark:text-white">Lettre de motivation générée ✓</h3>
            <p className="text-xs text-gray-400 mt-0.5">Relisez, puis choisissez comment l&apos;envoyer</p>
          </div>
          <button onClick={onClose} className="text-sm font-medium text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            Fermer
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Template hint notice */}
          {matchingTemplates > 0 && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-900/50">
              <BookOpen size={14} className="text-violet-500 flex-shrink-0" />
              <p className="text-xs text-violet-700 dark:text-violet-300 flex-1">
                💡 Vous avez {matchingTemplates} template{matchingTemplates > 1 ? 's' : ''} similaire{matchingTemplates > 1 ? 's' : ''}.
              </p>
              <a
                href={`/${locale}/dashboard/cover-letters`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-violet-600 dark:text-violet-400 underline whitespace-nowrap hover:text-violet-800 dark:hover:text-violet-200 transition-colors"
              >
                Utiliser un template
              </a>
            </div>
          )}

          <div
            className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>

        {/* Footer buttons */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 space-y-2">
          {/* Row 1: Copy + Save as template */}
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
                text-xs font-medium text-gray-700 dark:text-gray-300
                hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30 hover:text-violet-700 dark:hover:text-violet-400
                transition-all duration-150"
            >
              {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
              {copied ? 'Copié ✓' : 'Copier le texte'}
            </button>

            <button
              onClick={() => { setShowTemplateDialog(true); setTemplateCategory(inferTemplateCategory(job) ?? 'Autre'); }}
              disabled={savedAsTemplate}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
                text-xs font-medium text-gray-700 dark:text-gray-300
                hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30 hover:text-violet-700 dark:hover:text-violet-400
                disabled:opacity-60 transition-all duration-150"
            >
              {savedAsTemplate ? <Check size={13} className="text-emerald-500" /> : <Bookmark size={13} />}
              {savedAsTemplate ? 'Template sauvegardé ✓' : '💾 Sauvegarder comme template'}
            </button>
          </div>

          {/* Row 2: Download CV + Download letter */}
          <div className="flex gap-2">
            <button
              onClick={handleDownloadCv}
              disabled={downloadingCv}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
                text-xs font-medium text-gray-700 dark:text-gray-300
                hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30 hover:text-violet-700 dark:hover:text-violet-400
                disabled:opacity-60 transition-all duration-150"
            >
              {downloadingCv ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              Télécharger CV
            </button>

            <button
              onClick={handleDownloadLetter}
              disabled={downloadingLetter}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
                text-xs font-medium text-gray-700 dark:text-gray-300
                hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30 hover:text-violet-700 dark:hover:text-violet-400
                disabled:opacity-60 transition-all duration-150"
            >
              {downloadingLetter ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {downloadingLetter ? 'Génération…' : 'Télécharger la lettre'}
            </button>
          </div>

          {/* Row 3: Send */}
          <button
            onClick={handleSend}
            disabled={sending}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white
              bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition-colors duration-150"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? 'Envoi en cours…' : 'Postuler maintenant'}
          </button>
        </div>
      </div>

      {/* Save-as-template dialog */}
      {showTemplateDialog && (
        <div className="absolute inset-0 z-10 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm rounded-2xl">
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <h4 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <Bookmark size={14} className="text-violet-500" />
                Sauvegarder comme template
              </h4>
              <button onClick={() => setShowTemplateDialog(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                <XIcon size={16} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nom du template <span className="text-red-400">*</span>
                </label>
                <input
                  autoFocus
                  className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700
                    bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400
                    focus:outline-none focus:ring-2 focus:ring-violet-500 transition-colors"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder="ex: Lettre Infirmier IDE"
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveAsTemplate(); }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Catégorie
                </label>
                <select
                  className="w-full px-3 py-2 rounded-xl text-sm border border-gray-200 dark:border-gray-700
                    bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                    focus:outline-none focus:ring-2 focus:ring-violet-500 transition-colors"
                  value={templateCategory}
                  onChange={e => setTemplateCategory(e.target.value)}
                >
                  {TEMPLATE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex gap-2">
              <button
                onClick={() => setShowTemplateDialog(false)}
                className="flex-1 py-2 rounded-xl text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveAsTemplate}
                disabled={savingTemplate || !templateName.trim()}
                className="flex-1 py-2 rounded-xl text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
              >
                {savingTemplate ? <><Loader2 size={12} className="animate-spin" /> Sauvegarde…</> : 'Sauvegarder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  initialCredits: number;
  initialTargetCountries: string[];
}

export default function JobsClient({ initialCredits, initialTargetCountries }: Props) {
  const pathname = usePathname();
  const locale   = (['en', 'fr', 'es', 'pt'].includes(pathname?.split('/')[1] ?? '')
    ? pathname!.split('/')[1]
    : 'en') as string;

  const [query,    setQuery]    = useState('');
  const [location, setLocation] = useState('');
  const [country,  setCountry]  = useState(initialTargetCountries[0] ?? 'us');
  const [remote,   setRemote]   = useState(false);
  const [filters,  setFilters]  = useState<SearchFilters>({ datePosted: '', jobType: '', experience: '' });

  const [jobs,          setJobs]          = useState<Job[]>([]);
  const [total,         setTotal]         = useState(0);
  const [page,          setPage]          = useState(1);
  const [loading,       setLoading]       = useState(false);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [searched,      setSearched]      = useState(false);
  const [error,         setError]         = useState('');
  const [fallbackNotice,setFallbackNotice]= useState('');
  const [jobSources,    setJobSources]    = useState<Record<string, string>>({});

  const currentEngineRef    = useRef<Engine>('adzuna');
  const filtersInitialized  = useRef(false);

  const [selectedJob,  setSelectedJob]  = useState<Job | null>(null);
  const [savedIds,     setSavedIds]     = useState<Set<string>>(new Set());
  const [trackerIds,   setTrackerIds]   = useState<Set<string>>(new Set());
  const [applyingId,   setApplyingId]   = useState<string | null>(null);
  const [credits,      setCredits]      = useState(initialCredits);

  const [toast,          setToast]          = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [coverLetterHtml, setCoverLetterHtml] = useState<string | null>(null);
  const [coverLetterText, setCoverLetterText] = useState<string>('');
  const [coverLetterJob,  setCoverLetterJob]  = useState<Job | null>(null);
  const [showFilters,    setShowFilters]     = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Search ─────────────────────────────────────────────────────────────────

  const doSearch = useCallback(async (pageNum = 1, append = false) => {
    if (!query.trim()) return;
    if (pageNum === 1) { setLoading(true); setFallbackNotice(''); }
    else setLoadingMore(true);
    setError('');

    const { primary, fallback } = getSearchEngine(country);
    const what = query.trim();

    try {
      let chosenEngine: Engine = primary;
      let result: { results: Job[]; count: number };
      const newSources: Record<string, string> = {};

      // ── France special case ───────────────────────────────────────────────────
      // Any time → France Travail | Date filter → Adzuna
      if (country === 'fr' && pageNum === 1) {
        if (!filters.datePosted) {
          result = await callEngine('france-travail', what, location, country, 1, filters, remote);
          result.results.forEach(j => { newSources[j.id] = 'France Travail'; });
          currentEngineRef.current = 'france-travail';
          setFallbackNotice('Résultats via France Travail');
        } else {
          result = await callEngine('adzuna', what, location, country, 1, filters, remote);
          result.results.forEach(j => { newSources[j.id] = 'Jobvero'; });
          currentEngineRef.current = 'adzuna';
          setFallbackNotice('');
        }

      // ── Standard flow (all other countries) ──────────────────────────────────
      } else if (pageNum === 1) {
        try {
          result = await callEngine(primary, what, location, country, pageNum, filters, remote);
          if (result.results.length === 0) throw new Error('empty');
        } catch (primaryErr) {
          console.warn(`[search] ${ENGINE_LABELS[primary]} failed (${primaryErr instanceof Error ? primaryErr.message : primaryErr}), trying ${ENGINE_LABELS[fallback]}`);
          try {
            result = await callEngine(fallback, what, location, country, pageNum, filters, remote);
            chosenEngine = fallback;
          } catch (fallbackErr) {
            if (fallback === 'jsearch') {
              console.warn('[search] JSearch also failed, trying Adzuna');
              result = await callEngine('adzuna', what, location, country, pageNum, filters, remote);
              chosenEngine = 'adzuna';
            } else {
              throw fallbackErr;
            }
          }
        }
        result.results.forEach(j => { newSources[j.id] = ENGINE_LABELS[chosenEngine]; });
        setFallbackNotice(chosenEngine === 'adzuna' ? '' : `Résultats via ${ENGINE_LABELS[chosenEngine]}`);
        currentEngineRef.current = chosenEngine;

      // ── Load more ─────────────────────────────────────────────────────────────
      } else {
        chosenEngine = currentEngineRef.current;
        if (chosenEngine === 'jsearch') {
          try {
            result = await callEngine('jsearch', what, location, country, pageNum, filters, remote);
          } catch {
            currentEngineRef.current = 'adzuna';
            chosenEngine = 'adzuna';
            result = await callEngine('adzuna', what, location, country, pageNum, filters, remote);
          }
        } else {
          result = await callEngine(chosenEngine, what, location, country, pageNum, filters, remote);
        }
        result.results.forEach(j => { newSources[j.id] = ENGINE_LABELS[chosenEngine]; });
      }

      if (append) {
        setJobs(prev => [...prev, ...result.results]);
        setJobSources(prev => ({ ...prev, ...newSources }));
      } else {
        setJobs(result.results);
        setJobSources(newSources);
        setSearched(true);
      }
      setPage(pageNum);
      setTotal(result.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [query, location, country, remote, filters]);

  // Auto-search when filters or remote change (after initial mount)
  useEffect(() => {
    if (!filtersInitialized.current) {
      filtersInitialized.current = true;
      return;
    }
    if (!searched || !query.trim()) return;
    doSearch(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, remote]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(1, false);
  };

  const handleLoadMore = () => doSearch(page + 1, true);

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async (job: Job) => {
    if (savedIds.has(job.id)) return;
    setSavedIds(prev => new Set([...prev, job.id]));

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast('Please sign in', 'error'); return; }

    const source = (jobSources[job.id] ?? 'unknown').toLowerCase().replace(/\s+/g, '-');

    const { data: saved, error: err } = await supabase.from('applications').insert({
      user_id:          user.id,
      job_title:        job.title,
      company_name:     job.company,
      location:         job.location  ?? null,
      notes:            job.description ?? null,
      job_url:          job.url       ?? null,
      salary:           job.salary    ?? null,
      contract_type:    job.jobType   ?? null,
      status:           'saved',
      job_source:       source,
      application_type: 'manual',
    }).select('id').single();

    if (err) {
      console.error('[handleSave] Supabase error:', err.message, err.details, err.hint);
      setSavedIds(prev => { const s = new Set(prev); s.delete(job.id); return s; });
      showToast(`Failed to save job: ${err.message}`, 'error');
    } else {
      showToast('Job saved to your tracker ✓');
      if (saved?.id) {
        void logApplicationEvent(supabase, saved.id, user.id, 'created',
          `Job saved: ${job.title} at ${job.company}`, { status: 'saved', source });
      }
    }
  };

  // ── Add to Job Tracker ─────────────────────────────────────────────────────

  const handleAddToTracker = useCallback(async (job: Job) => {
    if (trackerIds.has(job.id)) return;
    setTrackerIds(prev => new Set([...prev, job.id]));

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast('Please sign in', 'error'); return; }

    const { data: added, error: err } = await supabase.from('applications').insert({
      user_id:          user.id,
      job_title:        job.title,
      company_name:     job.company,
      location:         job.location  ?? null,
      salary:           job.salary    ?? null,
      status:           'saved',
      notes:            job.description ?? null,
      job_url:          job.url        ?? null,
      job_source:       jobSources[job.id]?.toLowerCase().replace(/\s+/g, '-') ?? null,
      contract_type:    job.jobType   ?? null,
      application_type: 'manual',
    }).select('id').single();

    if (err) {
      setTrackerIds(prev => { const s = new Set(prev); s.delete(job.id); return s; });
      showToast('Failed to add to tracker', 'error');
    } else {
      showToast('Added to Job Tracker ✓');
      if (added?.id) {
        void logApplicationEvent(supabase, added.id, user.id, 'created',
          `Added to tracker: ${job.title} at ${job.company}`, { status: 'saved' });
      }
    }
  }, [trackerIds, jobSources]);

  // ── Apply with AI ──────────────────────────────────────────────────────────

  const handleApply = async (job: Job) => {
    if (credits <= 0) { showToast('No AI credits remaining', 'error'); return; }
    setApplyingId(job.id);

    try {
      const res = await fetch('/api/jobs/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          jobTitle: job.title,
          company: job.company,
          location: job.location,
          salary: job.salary,
          jobDescription: job.description,
          jobUrl: job.url,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setCredits(c => Math.max(0, c - 1));
      setSavedIds(prev => new Set([...prev, job.id]));
      setSelectedJob(null);
      setCoverLetterJob(job);
      setCoverLetterHtml(data.coverLetterHtml);
      const tmp = document.createElement('div');
      tmp.innerHTML = data.coverLetterHtml ?? '';
      setCoverLetterText((tmp.textContent || tmp.innerText || '').trim());
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Application failed', 'error');
    } finally {
      setApplyingId(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasMore = jobs.length < total && jobs.length > 0;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Header ── */}
      <div className="px-3 sm:px-6 pt-4 sm:pt-6 pb-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Briefcase size={20} className="text-violet-500" />
                Job Search
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Find your next opportunity</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
              {credits} AI credits
            </div>
          </div>

          {/* ── Search form ── */}
          <form onSubmit={handleSearch} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Keywords */}
              <div className="flex-1 min-w-0 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Job title, keywords…"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
                    bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white
                    placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                />
              </div>

              {/* Location */}
              <div className="w-full sm:w-48 relative">
                <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder={country === 'fr' ? 'ex: 75, 69, 13…' : 'City, region…'}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
                    bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white
                    placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white
                  disabled:opacity-60 transition-all"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Search
              </button>
            </div>

            {/* Country chips */}
            <div className="flex flex-wrap gap-1.5">
              {ALL_COUNTRIES.filter(c => VISIBLE_COUNTRY_CODES.has(c.code)).map(c => {
                const frozen = c.code === 'fr';
                return (
                  <button
                    key={c.code}
                    type="button"
                    disabled={frozen}
                    onClick={() => !frozen && setCountry(c.code)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-150
                      ${frozen
                        ? 'opacity-50 cursor-not-allowed bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                        : country === c.code
                          ? 'bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-500/20'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700 hover:text-violet-700 dark:hover:text-violet-400'
                      }`}
                  >
                    <span>{c.flag}</span>
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Mobile filter toggle */}
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setShowFilters(f => !f)}
                className="lg:hidden flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400"
              >
                <SlidersHorizontal size={13} />
                Filters
              </button>
            </div>

            {/* Mobile filters */}
            {showFilters && (
              <div className="lg:hidden p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <JobFilters mobile filters={filters} onChange={setFilters} remoteOnly={remote} onRemoteToggle={() => setRemote(r => !r)} onClose={() => setShowFilters(false)} />
              </div>
            )}
          </form>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 px-3 sm:px-6 py-6">
        <div className="max-w-4xl mx-auto flex gap-6">

          {/* Desktop filters */}
          <JobFilters filters={filters} onChange={setFilters} remoteOnly={remote} onRemoteToggle={() => setRemote(r => !r)} />

          {/* Results */}
          <div className="flex-1 min-w-0">

            {/* Error */}
            {error && (
              <div className="mb-4 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Loading skeleton */}
            {loading && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-40 rounded-2xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
                ))}
              </div>
            )}

            {/* Results count + fallback notice */}
            {!loading && searched && jobs.length > 0 && (
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {total} job{total !== 1 ? 's' : ''} found
                </p>
                {fallbackNotice && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">{fallbackNotice}</p>
                )}
              </div>
            )}

            {/* Jobs grid */}
            {!loading && jobs.length > 0 && (
              <div className="space-y-3">
                {jobs.map(job => (
                  <JobCard
                    key={job.id}
                    job={job}
                    saved={savedIds.has(job.id)}
                    applying={applyingId === job.id}
                    locale={locale}
                    onSave={() => handleSave(job)}
                    onApply={() => handleApply(job)}
                    onClick={() => setSelectedJob(job)}
                  />
                ))}

                {/* Load more */}
                {hasMore && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
                        text-sm font-medium text-gray-600 dark:text-gray-300 hover:border-violet-300 dark:hover:border-violet-700
                        hover:bg-violet-50 dark:hover:bg-violet-950/30 hover:text-violet-700 dark:hover:text-violet-400
                        disabled:opacity-60 transition-all"
                    >
                      {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                      Load more jobs
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!loading && searched && jobs.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                  <Briefcase size={28} className="text-gray-300 dark:text-gray-600" />
                </div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">No jobs found</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">Try different keywords or location</p>
              </div>
            )}

            {/* Initial hint */}
            {!loading && !searched && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 rounded-2xl bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center mb-5">
                  <Search size={32} className="text-violet-300 dark:text-violet-600" />
                </div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Search for jobs</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 max-w-xs leading-relaxed">
                  Enter a job title or keywords, choose your country, and click Search to find opportunities.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Job detail modal ── */}
      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          applying={applyingId === selectedJob.id}
          addedToTracker={trackerIds.has(selectedJob.id)}
          locale={locale}
          onApply={() => handleApply(selectedJob)}
          onAddToTracker={() => handleAddToTracker(selectedJob)}
          onClose={() => setSelectedJob(null)}
        />
      )}

      {/* ── Cover letter modal ── */}
      {coverLetterHtml && coverLetterJob && (
        <CoverLetterModal
          html={coverLetterHtml}
          text={coverLetterText}
          job={coverLetterJob}
          locale={locale}
          onShowToast={showToast}
          onClose={() => { setCoverLetterHtml(null); setCoverLetterText(''); setCoverLetterJob(null); }}
        />
      )}

      {/* ── Toast ── */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
