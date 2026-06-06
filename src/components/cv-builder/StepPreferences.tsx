'use client';

import { useState, useEffect, useRef } from 'react';
import type { Preferences, FontStyle } from './types';
import { PALETTE_COLORS } from './types';
import CVTemplateSelector, { type TemplateId } from './CVTemplateSelector';

// ─── Data ─────────────────────────────────────────────────────────────────────

const COUNTRIES = [
  { value: 'USA',         flag: '🇺🇸' },
  { value: 'France',      flag: '🇫🇷' },
  { value: 'Canada',      flag: '🇨🇦' },
  { value: 'Belgium',     flag: '🇧🇪' },
  { value: 'Switzerland', flag: '🇨🇭' },
  { value: 'Luxembourg',  flag: '🇱🇺' },
  { value: 'UK',          flag: '🇬🇧' },
  { value: 'Australia',   flag: '🇦🇺' },
  { value: 'Spain',       flag: '🇪🇸' },
  { value: 'Portugal',    flag: '🇵🇹' },
  { value: 'Germany',     flag: '🇩🇪' },
  { value: 'Netherlands', flag: '🇳🇱' },
];

const FONT_FAMILIES: Record<FontStyle, string> = {
  'serif':      '"Georgia", "Times New Roman", serif',
  'sans-serif': '"Arial", "Helvetica", sans-serif',
  'monospace':  '"Courier New", "Courier", monospace',
};

const FONTS: { id: FontStyle; name: string; desc: string }[] = [
  { id: 'serif',      name: 'Elegant', desc: 'Georgia, Times' },
  { id: 'sans-serif', name: 'Modern',  desc: 'Arial, Helvetica' },
  { id: 'monospace',  name: 'Tech',    desc: 'Courier, Mono' },
];

// ─── StepPreferences ──────────────────────────────────────────────────────────

interface Props {
  data: Preferences;
  onChange: (data: Preferences) => void;
}

export default function StepPreferences({ data, onChange }: Props) {
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const prevCountry = useRef(data.targetCountry);

  useEffect(() => {
    if (prevCountry.current !== data.targetCountry && data.targetCountry) {
      setTemplateModalOpen(true);
    }
    prevCountry.current = data.targetCountry;
  }, [data.targetCountry]);

  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    onChange({ ...data, [key]: value });

  const effectiveColor = data.customColor ?? PALETTE_COLORS[data.colorPalette]?.primary ?? '#7C3AED';

  return (
    <div className="space-y-6">

      {/* ── Target Country ─────────────────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Target Country
          <span className="ml-1.5 text-xs font-normal text-gray-400">adapts CV conventions</span>
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {COUNTRIES.map(({ value, flag }) => (
            <button key={value} type="button"
              onClick={() => set('targetCountry', value)}
              className={`flex items-center gap-1.5 px-2 py-2 rounded-xl border text-xs font-medium transition-all duration-150
                ${data.targetCountry === value
                  ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                }`}>
              <span className="text-base leading-none">{flag}</span>
              <span className="truncate">{value}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── CV Templates ───────────────────────────────────────────────────── */}
      <CVTemplateSelector
        value={(data.template ?? null) as TemplateId | null}
        onChange={(id) => {
          const frTemplates = ['paris-elegant', 'bordeaux-classique'];
          const isFrench = id && frTemplates.includes(id);
          onChange({
            ...data,
            template: id ?? undefined,
            language: isFrench ? 'fr' : data.language,
          });
        }}
        targetCountry={data.targetCountry}
        open={templateModalOpen}
        onOpenChange={setTemplateModalOpen}
      />

      <div className="border-t border-gray-100 dark:border-gray-800" />

      {/* ── Accent Color ───────────────────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Accent Color
        </label>
        <div className="flex items-center gap-4 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 shadow-sm">
          <label className="relative flex-shrink-0 cursor-pointer group" title="Click to pick a color">
            <div
              className="w-12 h-12 rounded-xl shadow-md border-2 border-white dark:border-gray-600 ring-1 ring-black/10 dark:ring-white/10 transition-transform duration-150 group-hover:scale-105"
              style={{ backgroundColor: effectiveColor }}
            />
            <input
              type="color"
              value={effectiveColor}
              onChange={(e) => onChange({ ...data, customColor: e.target.value })}
              className="sr-only"
            />
          </label>

          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Hex color</p>
            <div className="flex items-center gap-1.5 border-b border-gray-200 dark:border-gray-700 focus-within:border-violet-500 transition-colors pb-0.5">
              <span className="text-sm text-gray-400 font-mono select-none">#</span>
              <input
                type="text"
                value={effectiveColor.replace('#', '').toUpperCase()}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                  if (raw.length === 6) onChange({ ...data, customColor: '#' + raw });
                }}
                className="flex-1 text-sm font-mono text-gray-900 dark:text-white bg-transparent focus:outline-none min-w-0"
                maxLength={6}
                spellCheck={false}
              />
            </div>
          </div>

          {data.customColor && (
            <button
              type="button"
              onClick={() => onChange({ ...data, customColor: undefined })}
              className="flex-shrink-0 text-xs font-semibold text-gray-400 hover:text-red-500 dark:hover:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 border border-gray-200 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-800 transition-all duration-150"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Font Style ─────────────────────────────────────────────────────── */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Font Style
        </label>
        <div className="grid grid-cols-3 gap-2">
          {FONTS.map(({ id, name, desc }) => (
            <button key={id} type="button" onClick={() => set('fontStyle', id)}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all duration-150
                ${data.fontStyle === id
                  ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/50'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}>
              <span style={{ fontFamily: FONT_FAMILIES[id] }}
                className={`text-2xl font-bold leading-none ${data.fontStyle === id ? 'text-violet-700 dark:text-violet-300' : 'text-gray-700 dark:text-gray-300'}`}>
                Aa
              </span>
              <div className="text-center">
                <p className={`text-xs font-medium ${data.fontStyle === id ? 'text-violet-700 dark:text-violet-300' : 'text-gray-700 dark:text-gray-300'}`}>{name}</p>
                <p className="text-[10px] text-gray-400">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
