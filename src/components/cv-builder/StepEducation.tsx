'use client';

import { usePathname } from 'next/navigation';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { Education } from './types';
import DatePicker, { DATE_ORDER_ERRORS } from '@/components/ui/DatePicker';

const CURRENTLY_STUDYING_LABELS: Record<string, string> = {
  en: 'Currently studying',
  fr: 'En cours',
  es: 'Estudiando actualmente',
  pt: 'Estudando atualmente',
};

interface Props {
  data: Education[];
  onChange: (data: Education[]) => void;
  targetCountry?: string;
}

function newEntry(): Education {
  return {
    id: crypto.randomUUID(),
    school: '',
    degree: '',
    field: '',
    startDate: '',
    endDate: '',
    current: false,
  };
}

export default function StepEducation({ data, onChange, targetCountry }: Props) {
  const isUSA = targetCountry === 'USA';
  const [expanded, setExpanded] = useState<string | null>(data[0]?.id ?? null);

  const pathname = usePathname();
  const rawLocale = pathname?.split('/')[1] ?? 'en';
  const locale = ['en', 'fr', 'es', 'pt'].includes(rawLocale) ? rawLocale : 'en';
  const currentLabel = CURRENTLY_STUDYING_LABELS[locale];
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

  const update = (id: string, field: keyof Education, value: any) => {
    onChange(data.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const endDateError = (edu: Education): string | undefined => {
    if (!edu.current && edu.startDate && edu.endDate && edu.startDate >= edu.endDate) {
      return dateOrderError;
    }
  };

  const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-colors text-sm';

  return (
    <div className="space-y-3">
      {data.length === 0 && (
        <div className="text-center py-10 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">No education added yet</p>
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
          >
            <Plus size={15} /> Add Education
          </button>
        </div>
      )}

      {data.map((edu, i) => (
        <div key={edu.id} className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/60 cursor-pointer"
            onClick={() => setExpanded(expanded === edu.id ? null : edu.id)}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {edu.school || `Education ${i + 1}`}
              </p>
              {edu.degree && edu.field && (
                <p className="text-xs text-gray-400 truncate">{edu.degree} in {edu.field}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(edu.id); }}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                <Trash2 size={14} />
              </button>
              {expanded === edu.id
                ? <ChevronUp size={15} className="text-gray-400" />
                : <ChevronDown size={15} className="text-gray-400" />}
            </div>
          </div>

          {expanded === edu.id && (
            <div className="p-4 space-y-3 border-t border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">School / University *</label>
                <input
                  className={inputCls}
                  value={edu.school}
                  onChange={(e) => update(edu.id, 'school', e.target.value)}
                  placeholder="MIT"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Degree</label>
                  <input
                    className={inputCls}
                    value={edu.degree}
                    onChange={(e) => update(edu.id, 'degree', e.target.value)}
                    placeholder="Bachelor of Science"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Field of Study</label>
                  <input
                    className={inputCls}
                    value={edu.field}
                    onChange={(e) => update(edu.id, 'field', e.target.value)}
                    placeholder="Computer Science"
                  />
                </div>
                <DatePicker
                  label="Start Date"
                  value={edu.startDate}
                  onChange={(v) => update(edu.id, 'startDate', v)}
                />
                <DatePicker
                  label="End Date"
                  value={edu.endDate}
                  onChange={(v) => update(edu.id, 'endDate', v)}
                  allowCurrent
                  isCurrent={edu.current ?? false}
                  onCurrentChange={(checked) => update(edu.id, 'current', checked)}
                  currentLabel={currentLabel}
                  error={endDateError(edu)}
                />
              </div>

              {isUSA && (
                <div className="max-w-[160px]">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    GPA <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    className={inputCls}
                    value={edu.gpa ?? ''}
                    onChange={(e) => update(edu.id, 'gpa', e.target.value)}
                    placeholder="3.8 / 4.0"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {data.length > 0 && (
        <button
          type="button"
          onClick={add}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors duration-150"
        >
          <Plus size={15} /> Add Another Education
        </button>
      )}
    </div>
  );
}
