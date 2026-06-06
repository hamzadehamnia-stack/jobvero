'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { HexColorPicker } from 'react-colorful';
import { X } from 'lucide-react';

/* ── helpers ─────────────────────────────────────────────── */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

function isValidHex(h: string) {
  return /^#[0-9a-f]{6}$/i.test(h.trim());
}

const STORAGE_KEY = 'cv-builder-recent-colors';
const MAX_RECENT = 6;

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRecent(color: string, prev: string[]): string[] {
  const next = [color, ...prev.filter((c) => c !== color)].slice(0, MAX_RECENT);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  return next;
}

/* ── component ───────────────────────────────────────────── */
interface Props {
  value: string;          // always a valid #rrggbb
  onChange: (hex: string) => void;
  onClose: () => void;
}

export default function ColorPickerPopover({ value, onChange, onClose }: Props) {
  const [hex, setHex]         = useState(value);
  const [hexInput, setHexInput] = useState(value.replace('#', ''));
  const [recent, setRecent]   = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setRecent(loadRecent()); }, []);

  /* sync incoming value (e.g. preset clicked while popover open) */
  useEffect(() => {
    setHex(value);
    setHexInput(value.replace('#', ''));
  }, [value]);

  /* close on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const commit = useCallback((color: string) => {
    setHex(color);
    setHexInput(color.replace('#', ''));
    onChange(color);
    setRecent((prev) => saveRecent(color, prev));
  }, [onChange]);

  /* picker drag — update live but save recent only on mouseup */
  const handlePickerChange = (color: string) => {
    setHex(color);
    setHexInput(color.replace('#', ''));
    onChange(color);  // real-time preview
  };

  const handlePickerMouseUp = () => {
    setRecent((prev) => saveRecent(hex, prev));
  };

  const handleHexInput = (raw: string) => {
    setHexInput(raw);
    const full = '#' + raw;
    if (isValidHex(full)) commit(full);
  };

  const handleRgbInput = (channel: 'r' | 'g' | 'b', val: string) => {
    const n = Math.min(255, Math.max(0, parseInt(val) || 0));
    const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };
    rgb[channel] = n;
    const h = '#' + [rgb.r, rgb.g, rgb.b].map((v) => v.toString(16).padStart(2, '0')).join('');
    commit(h);
  };

  const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };

  return (
    <div
      ref={ref}
      className="absolute z-50 mt-2 left-0 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 w-64"
      style={{ top: '100%' }}
    >
      {/* close */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        <X size={14} />
      </button>

      {/* HexColorPicker — hue slider + saturation/brightness square */}
      <div
        className="rounded-xl overflow-hidden"
        onMouseUp={handlePickerMouseUp}
      >
        <HexColorPicker color={hex} onChange={handlePickerChange} style={{ width: '100%', height: 180 }} />
      </div>

      {/* Hex input */}
      <div className="mt-3 flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-lg flex-shrink-0 border border-gray-200 dark:border-gray-600 shadow-inner"
          style={{ backgroundColor: hex }}
        />
        <div className="flex items-center flex-1 min-w-0 bg-gray-100 dark:bg-gray-800 rounded-lg px-2.5 py-1.5 gap-1">
          <span className="text-gray-400 text-sm font-mono">#</span>
          <input
            type="text"
            maxLength={6}
            value={hexInput}
            onChange={(e) => handleHexInput(e.target.value)}
            className="flex-1 min-w-0 bg-transparent text-sm font-mono text-gray-900 dark:text-white focus:outline-none uppercase tracking-widest"
            spellCheck={false}
          />
        </div>
      </div>

      {/* RGB inputs */}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {(['r', 'g', 'b'] as const).map((ch) => (
          <div key={ch} className="flex flex-col items-center gap-0.5">
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-lg px-2 py-1.5">
              <input
                type="number"
                min={0}
                max={255}
                value={rgb[ch]}
                onChange={(e) => handleRgbInput(ch, e.target.value)}
                className="w-full bg-transparent text-xs text-center font-mono text-gray-900 dark:text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <span className="text-[10px] font-semibold text-gray-400 uppercase">{ch}</span>
          </div>
        ))}
      </div>

      {/* Recent colors */}
      {recent.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Recent</p>
          <div className="flex gap-1.5 flex-wrap">
            {recent.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => commit(c)}
                className={`w-6 h-6 rounded-md border-2 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-violet-500
                  ${c === hex ? 'border-violet-500' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
