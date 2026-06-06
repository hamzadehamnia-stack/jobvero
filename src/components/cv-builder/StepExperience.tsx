'use client';

import { usePathname } from 'next/navigation';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { WorkExperience } from './types';
import DatePicker, { DATE_ORDER_ERRORS } from '@/components/ui/DatePicker';
import BulletRewriter from './BulletRewriter';

const CURRENT_POSITION_LABELS: Record<string, string> = {
  en: 'Currently here',
  fr: 'Poste actuel',
  es: 'Puesto actual',
  pt: 'Cargo atual',
};

interface Props {
  data: WorkExperience[];
  onChange: (data: WorkExperience[]) => void;
  targetCountry?: string;
  language?: string;
}

function newEntry(): WorkExperience {
  return {
    id: crypto.randomUUID(),
    company: '',
    position: '',
    startDate: '',
    endDate: '',
    current: false,
    description: '',
  };
}

export default function StepExperience({ data, onChange, targetCountry, language }: Props) {
  const [expanded, setExpanded] = useState<string | null>(data[0]?.id ?? null);

  const pathname = usePathname();
  const rawLocale = pathname?.split('/')[1] ?? 'en';
  const locale = ['en', 'fr', 'es', 'pt'].includes(rawLocale) ? rawLocale : 'en';
  const currentLabel  = CURRENT_POSITION_LABELS[locale];
  const dateOrderError = DATE_ORDER_ERRORS[locale];

  const add = () => {
    const entry = newEntry();
    onChange([...data, entry]);
    setExpanded(entry.id);
  };

  const remove = (id: string) => {
    onChange(data.filter((e) => e.id !== id));
    if (expanded === id) setExpanded(null);
  };

  const update = (id: string, field: keyof WorkExperience, value: unknown) => {
    onChange(data.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const endDateError = (exp: WorkExperience): string | undefined => {
    if (!exp.current && exp.startDate && exp.endDate && exp.startDate >= exp.endDate) {
      return dateOrderError;
    }
  };

  const inputCls = `w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700
    bg-white dark:bg-gray-800 text-gray-900 dark:text-white
    placeholder:text-gray-400 dark:placeholder:text-gray-500
    focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent
    transition-colors text-sm`;

  return (
    <div className="space-y-3">
      {data.length === 0 && (
        <div className="text-center py-10 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">No work experience added yet</p>
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
          >
            <Plus size={15} /> Add Experience
          </button>
        </div>
      )}

      {data.map((exp, i) => (
        // No overflow-hidden so BulletRewriter dropdown isn't clipped
        <div key={exp.id} className="border border-gray-200 dark:border-gray-700 rounded-2xl">

          {/* Header — rounded only at top when expanded, fully rounded when collapsed */}
          <div
            className={`flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/60 cursor-pointer
              ${expanded === exp.id ? 'rounded-t-2xl' : 'rounded-2xl'}`}
            onClick={() => setExpanded(expanded === exp.id ? null : exp.id)}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {exp.position || exp.company || `Experience ${i + 1}`}
              </p>
              {exp.company && exp.position && (
                <p className="text-xs text-gray-400 truncate">{exp.company}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(exp.id); }}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <Trash2 size={14} />
              </button>
              {expanded === exp.id
                ? <ChevronUp size={15} className="text-gray-400" />
                : <ChevronDown size={15} className="text-gray-400" />}
            </div>
          </div>

          {/* Body */}
          {expanded === exp.id && (
            <div className="p-4 space-y-3 border-t border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Company *</label>
                  <input
                    className={inputCls}
                    value={exp.company}
                    onChange={(e) => update(exp.id, 'company', e.target.value)}
                    placeholder="Acme Corp"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Position *</label>
                  <input
                    className={inputCls}
                    value={exp.position}
                    onChange={(e) => update(exp.id, 'position', e.target.value)}
                    placeholder="Software Engineer"
                  />
                </div>
                <DatePicker
                  label="Start Date"
                  value={exp.startDate}
                  onChange={(v) => update(exp.id, 'startDate', v)}
                />
                <DatePicker
                  label="End Date"
                  value={exp.endDate}
                  onChange={(v) => update(exp.id, 'endDate', v)}
                  allowCurrent
                  isCurrent={exp.current}
                  onCurrentChange={(checked) => update(exp.id, 'current', checked)}
                  currentLabel={currentLabel}
                  error={endDateError(exp)}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  Description <span className="font-normal text-gray-400">(what you did, achievements)</span>
                </label>
                <textarea
                  rows={3}
                  className={`${inputCls} resize-none`}
                  value={exp.description}
                  onChange={(e) => update(exp.id, 'description', e.target.value)}
                  placeholder="Led a team of 5 to build a new payment system. Reduced latency by 40%."
                />
              </div>

              {/* Per-bullet AI rewriter */}
              {exp.description.trim() && (() => {
                const allLines  = exp.description.split('\n');
                const nonEmpty  = allLines
                  .map((text, originalIdx) => ({ text, originalIdx }))
                  .filter(({ text }) => text.replace(/^[-•*]\s*/, '').trim().length > 3);
                if (nonEmpty.length === 0) return null;
                return (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                      Rewrite with AI
                    </p>
                    {nonEmpty.map(({ text, originalIdx }) => {
                      const clean = text.replace(/^[-•*]\s*/, '').trim();
                      return (
                        <div key={originalIdx} className="flex items-center gap-2">
                          <span className="w-3.5 h-3.5 rounded-full bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center flex-shrink-0">
                            <span className="text-[8px] font-bold text-violet-600 dark:text-violet-400">•</span>
                          </span>
                          <span className="flex-1 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                            {clean.length > 55 ? clean.slice(0, 55) + '…' : clean}
                          </span>
                          <BulletRewriter
                            bullet={clean}
                            jobTitle={exp.position}
                            company={exp.company}
                            targetCountry={targetCountry}
                            language={language}
                            onSelect={(version) => {
                              const lines = exp.description.split('\n');
                              const prefix = lines[originalIdx]?.match(/^([-•*]\s*)/)?.[1] ?? '';
                              lines[originalIdx] = prefix + version;
                              update(exp.id, 'description', lines.join('\n'));
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      ))}

      {data.length > 0 && (
        <button
          type="button"
          onClick={add}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700
            text-sm text-gray-500 dark:text-gray-400 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400
            transition-colors duration-150"
        >
          <Plus size={15} /> Add Another Experience
        </button>
      )}
    </div>
  );
}
