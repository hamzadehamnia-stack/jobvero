'use client';

import { useMemo } from 'react';
import { X, Check, Layout } from 'lucide-react';
import { TEMPLATES, type TemplateId, type CVTemplate } from './templates';
import { defaultFormData, DEFAULT_SKILL_CATEGORIES } from './types';
import type { CVFormData } from './types';

// ─── Sample data for live previews ───────────────────────────────────────────

const PREVIEW_DATA: CVFormData = {
  personalInfo: {
    fullName: 'Alexandra Martin',
    email: 'a.martin@email.com',
    phone: '+1 555 000 0000',
    location: 'Paris, France',
    linkedin: 'linkedin.com/in/amartin',
    portfolio: '',
  },
  workExperience: [
    {
      id: '1',
      position: 'Senior Product Manager',
      company: 'TechVision Corp',
      startDate: '2021-03',
      endDate: '',
      current: true,
      description:
        'Led cross-functional team of 12 engineers to deliver SaaS platform\nIncreased user retention by 34% through data-driven product improvements\nDefined product roadmap and OKRs aligned with company strategy',
    },
    {
      id: '2',
      position: 'Product Manager',
      company: 'Innovate Labs',
      startDate: '2018-06',
      endDate: '2021-02',
      current: false,
      description:
        'Launched 3 successful product lines generating $2M ARR\nCollaborated with design and engineering on user research initiatives',
    },
  ],
  education: [
    {
      id: '1',
      degree: 'Master of Business Administration',
      field: 'Product & Innovation',
      school: 'Sciences Po Paris',
      startDate: '2016-09',
      endDate: '2018-05',
      current: false,
    },
  ],
  skills: ['Product Strategy', 'Agile / Scrum', 'Data Analysis', 'UX Research', 'Roadmapping', 'SQL'],
  skillCategories: DEFAULT_SKILL_CATEGORIES.map(c => ({ ...c, items: [] })),
  preferences: {
    language: 'en',
    targetCountry: 'France',
    domain: '',
    style: 'Professional',
    colorPalette: 'blue-pro',
    layout: '1-column',
    fontStyle: 'sans-serif',
    spacing: 'standard',
  },
};

// ─── Template card with live scaled preview ───────────────────────────────────

// A4 = 794 × 1123 px. We render it in a container with aspect-ratio 210/297
// and scale the inner div down via CSS transform.
const TEMPLATE_WIDTH = 794;
const PREVIEW_SCALE  = 0.28;  // 794 × 0.28 ≈ 222px display width

function TemplatePreview({ html }: { html: string }) {
  return (
    <div
      className="w-full bg-white overflow-hidden"
      style={{ aspectRatio: '210 / 297', position: 'relative' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: TEMPLATE_WIDTH,
          transformOrigin: 'top left',
          transform: `scale(${PREVIEW_SCALE})`,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function TemplateCard({
  template,
  selected,
  onSelect,
  previewHtml,
}: {
  template: CVTemplate;
  selected: boolean;
  onSelect: () => void;
  previewHtml: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col rounded-2xl border-2 overflow-hidden text-left transition-all duration-150 hover:scale-[1.02] group
        ${selected
          ? 'border-violet-500 shadow-lg shadow-violet-500/20'
          : 'border-gray-100 dark:border-gray-800 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-md'
        }`}
    >
      {/* Live scaled preview */}
      <div className="relative w-full overflow-hidden">
        <TemplatePreview html={previewHtml} />
        {selected && (
          <div className="absolute inset-0 bg-violet-500/10 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center shadow-lg">
              <Check size={16} className="text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="px-3 py-2.5 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{template.name}</p>
          <span className="text-sm flex-shrink-0">{template.flag}</span>
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {template.tags.map(tag => (
            <span key={tag} className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
              {tag}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onSelect(); }}
          className={`mt-2 w-full text-[11px] font-semibold py-1 rounded-lg transition-colors duration-150
            ${selected
              ? 'bg-violet-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 group-hover:bg-violet-100 dark:group-hover:bg-violet-900/40 group-hover:text-violet-700 dark:group-hover:text-violet-300'
            }`}
        >
          {selected ? '✓ Selected' : 'Select'}
        </button>
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  value: TemplateId | null;
  onChange: (id: TemplateId | null) => void;
  targetCountry?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CVTemplateSelector({ value, onChange, targetCountry, open, onOpenChange }: Props) {
  const selectedTemplate = TEMPLATES.find(t => t.id === value);

  // Pre-generate preview HTML once per template (memo'd so it doesn't regenerate on every render)
  const previewMap = useMemo(() => {
    const map: Record<string, string> = {};
    TEMPLATES.forEach(t => {
      try { map[t.id] = t.generateHTML(PREVIEW_DATA); } catch { map[t.id] = ''; }
    });
    return map;
  }, []);

  // Filter: recommended = templates matching country; others = rest
  const recommended = targetCountry
    ? TEMPLATES.filter(t => t.autoFor.includes(targetCountry))
    : [];
  const others = TEMPLATES.filter(t => !recommended.includes(t));

  // If no country match, show all as "recommended"
  const showAll = recommended.length === 0;

  return (
    <>
      {/* ── Trigger ── */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          CV Template
        </label>

        {value && selectedTemplate ? (
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 shadow-sm">
            <div
              className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold shadow-sm"
              style={{ backgroundColor: selectedTemplate.accent }}
            >
              {selectedTemplate.flag}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{selectedTemplate.name}</p>
              <div className="flex gap-1 flex-wrap">
                {selectedTemplate.tags.slice(0, 2).map(t => (
                  <span key={t} className="text-[9px] text-gray-400 dark:text-gray-500">{t}</span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(true)}
              className="flex-shrink-0 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 px-2.5 py-1 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-violet-300 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-950/20 text-violet-700 dark:text-violet-400 text-sm font-semibold hover:bg-violet-100/60 dark:hover:bg-violet-950/40 hover:border-violet-400 transition-all duration-150 w-full justify-center"
          >
            <Layout size={16} />
            Browse Templates
          </button>
        )}
      </div>

      {/* ── Modal ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Choose your CV Template</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {targetCountry && !showAll
                    ? `Recommended for ${targetCountry} · all regions below`
                    : 'All available templates'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Grid */}
            <div className="overflow-y-auto p-6 space-y-6">
              {/* Recommended section */}
              {!showAll && recommended.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                      ✦ Recommended for {targetCountry}
                    </span>
                    <div className="flex-1 h-px bg-violet-100 dark:bg-violet-900/40" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {recommended.map(t => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        selected={value === t.id}
                        previewHtml={previewMap[t.id] ?? ''}
                        onSelect={() => { onChange(t.id as TemplateId); onOpenChange(false); }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Others / all section */}
              {(showAll ? TEMPLATES : others).length > 0 && (
                <div>
                  {!showAll && (
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Other Regions</span>
                      <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {(showAll ? TEMPLATES : others).map(t => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        selected={value === t.id}
                        previewHtml={previewMap[t.id] ?? ''}
                        onSelect={() => { onChange(t.id as TemplateId); onOpenChange(false); }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export type { TemplateId };
