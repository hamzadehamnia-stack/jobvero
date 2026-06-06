'use client';

import { useState } from 'react';
import Image from 'next/image';
import { MapPin, Clock, Bookmark, Zap, BookmarkCheck, Briefcase } from 'lucide-react';
import type { Job } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clearbitLogo(company: string): string {
  const domain = company
    .toLowerCase()
    .replace(/\b(inc\.?|llc\.?|ltd\.?|corp\.?|co\.?|group|company|sarl|sas|sa|gmbh|ag)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  return `https://logo.clearbit.com/${domain}.com`;
}

const CURRENCY: Record<string, { symbol: string; period: string }> = {
  fr: { symbol: '€', period: '/an' },
  be: { symbol: '€', period: '/an' },
  de: { symbol: '€', period: '/an' },
  ch: { symbol: '€', period: '/an' },
  nl: { symbol: '€', period: '/an' },
  es: { symbol: '€', period: '/an' },
  pt: { symbol: '€', period: '/an' },
  gb: { symbol: '£', period: '/yr' },
  ie: { symbol: '£', period: '/yr' },
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
  const rangeMatch = salary.match(/^(\d+)k\s*[-–]\s*(\d+)k$/i);
  if (rangeMatch) {
    const lo = parseInt(rangeMatch[1], 10);
    const hi = parseInt(rangeMatch[2], 10);
    if (lo === 0 && hi === 0) return undefined;
    if (hi === 0 || hi <= lo) return `${lo}k${symbol}${period}`;
    return `${lo}k-${hi}k${symbol}${period}`;
  }
  const singleMatch = salary.match(/^(\d+)k$/i);
  if (singleMatch) {
    const val = parseInt(singleMatch[1], 10);
    if (val === 0) return undefined;
    return `${val}k${symbol}${period}`;
  }
  return salary;
}

function relativeDate(dateStr?: string, locale?: string): string | undefined {
  if (!dateStr) return undefined;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return undefined;
  const diffMs    = Date.now() - date.getTime();
  const diffMins  = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays  = Math.floor(diffMs / 86_400_000);
  const lang = locale ?? 'en';
  if (diffMins < 60) {
    return lang === 'fr' ? 'À l\'instant' : lang === 'es' ? 'Ahora' : lang === 'pt' ? 'Agora' : 'Just now';
  }
  if (diffHours < 24) {
    return lang === 'fr' ? `Il y a ${diffHours}h`
         : lang === 'es' ? `Hace ${diffHours}h`
         : lang === 'pt' ? `Há ${diffHours}h`
         : `${diffHours}h ago`;
  }
  if (diffDays === 1) {
    return lang === 'fr' ? 'Il y a 1 jour' : lang === 'es' ? 'Hace 1 día' : lang === 'pt' ? 'Há 1 dia' : '1 day ago';
  }
  if (diffDays < 7) {
    return lang === 'fr' ? `Il y a ${diffDays} jours`
         : lang === 'es' ? `Hace ${diffDays} días`
         : lang === 'pt' ? `Há ${diffDays} dias`
         : `${diffDays} days ago`;
  }
  if (diffDays < 30) {
    const w = Math.floor(diffDays / 7);
    return lang === 'fr' ? `Il y a ${w} semaine${w > 1 ? 's' : ''}`
         : lang === 'es' ? `Hace ${w} semana${w > 1 ? 's' : ''}`
         : lang === 'pt' ? `Há ${w} semana${w > 1 ? 's' : ''}`
         : `${w}w ago`;
  }
  const m = Math.floor(diffDays / 30);
  return lang === 'fr' ? `Il y a ${m} mois` : `${m}mo ago`;
}

function normalizeJobType(jt?: string): string | undefined {
  if (!jt) return undefined;
  const key = jt.toLowerCase().trim();
  const map: Record<string, string> = {
    'full_time': 'Temps plein', 'fulltime': 'Temps plein', 'full-time': 'Temps plein', 'full time': 'Temps plein',
    'temps plein': 'Temps plein', 'cdi': 'CDI', 'permanent': 'CDI',
    'part_time': 'Temps partiel', 'parttime': 'Temps partiel', 'part-time': 'Temps partiel', 'part time': 'Temps partiel',
    'temps partiel': 'Temps partiel', 'cdd': 'CDD',
    'contract': 'CDD', 'contractor': 'CDD',
    'interim': 'Intérim', 'intérim': 'Intérim',
    'internship': 'Stage', 'stage': 'Stage',
    'remote': 'Remote',
  };
  if (map[key]) return map[key];
  if (key.includes('permanent') || key.includes('cdi')) return 'CDI';
  if (key.includes('contract')) return 'CDD';
  if (key.includes('full')) return 'Temps plein';
  if (key.includes('part')) return 'Temps partiel';
  if (key.includes('intern') || key.includes('stage')) return 'Stage';
  if (key.includes('interim') || key.includes('intérim')) return 'Intérim';
  return jt;
}

const TYPE_COLORS: Record<string, string> = {
  'full-time':   'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  'full_time':   'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  'temps plein': 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  'cdi':         'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  'part-time':   'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  'part_time':   'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  'cdd':         'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  'contract':    'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
  'permanent':   'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400',
  'remote':      'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400',
  'internship':  'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400',
  'stage':       'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-400',
  'intérim':     'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
};

function typeClass(jt?: string): string {
  if (!jt) return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  // Resolve via normalized label first so "permanent" → "CDI" → green
  const normalized = normalizeJobType(jt);
  const key = (normalized ?? jt).toLowerCase().trim();
  return TYPE_COLORS[key]
    ?? TYPE_COLORS[jt.toLowerCase().trim()]
    ?? (Object.entries(TYPE_COLORS).find(([k]) => key.includes(k))?.[1])
    ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  job:      Job;
  saved:    boolean;
  applying: boolean;
  locale?:  string;
  onSave:   () => void;
  onApply:  () => void;
  onClick:  () => void;
}

export default function JobCard({ job, saved, applying, locale, onSave, onApply, onClick }: Props) {
  const [logoError, setLogoError] = useState(false);

  const initials = job.company.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2);
  const colors   = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2'];
  const color    = colors[job.company.charCodeAt(0) % colors.length];
  const logoSrc  = job.logo || clearbitLogo(job.company);
  const showLogo = !logoError;

  const displaySalary  = formatSalary(job.salary, job.country);
  const displayDate    = relativeDate(job.datePosted, locale);
  const displayJobType = normalizeJobType(job.jobType);

  return (
    <div
      onClick={onClick}
      className="group p-4 rounded-2xl border border-gray-200 dark:border-gray-700
        bg-white dark:bg-gray-800/60 hover:border-violet-300 dark:hover:border-violet-700
        hover:shadow-md transition-all duration-150 cursor-pointer"
    >
      {/* Top row: avatar + title + type badge */}
      <div className="flex items-start gap-3 mb-2.5">
        {showLogo ? (
          <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 shadow-sm bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center">
            <Image
              src={logoSrc}
              alt={job.company}
              width={40}
              height={40}
              className="object-contain w-full h-full"
              onError={() => setLogoError(true)}
              unoptimized
            />
          </div>
        ) : (
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm"
            style={{ backgroundColor: color }}
          >
            {initials || <Briefcase size={14} />}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 dark:text-white leading-snug group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors line-clamp-2">
            {job.title}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{job.company}</p>
        </div>

        {displayJobType && (
          <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${typeClass(job.jobType)}`}>
            {displayJobType}
          </span>
        )}
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-xs text-gray-500 dark:text-gray-400">
        {job.location && (
          <span className="flex items-center gap-1 min-w-0">
            <MapPin size={10} className="flex-shrink-0 text-gray-400" />
            <span className="truncate max-w-[160px]">{job.location}</span>
          </span>
        )}
        <span className={`flex items-center gap-1 font-medium flex-shrink-0 ${
          displaySalary
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-gray-400 dark:text-gray-500'
        }`}>
          💰 {displaySalary ?? 'Salaire non précisé'}
        </span>
        {displayDate && (
          <span className="flex items-center gap-1 flex-shrink-0">
            <Clock size={10} className="flex-shrink-0" />
            {displayDate}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
        <button
          onClick={onSave}
          disabled={saved}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150
            ${saved
              ? 'border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-400 cursor-default'
              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30 hover:text-violet-700 dark:hover:text-violet-400'
            }`}
        >
          {saved ? <BookmarkCheck size={11} /> : <Bookmark size={11} />}
          {saved ? 'Saved' : 'Save'}
        </button>

        <button
          onClick={onApply}
          disabled={applying}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white
            transition-all duration-150 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}
        >
          <Zap size={11} />
          {applying ? 'Applying…' : 'Apply with AI'}
        </button>
      </div>
    </div>
  );
}
