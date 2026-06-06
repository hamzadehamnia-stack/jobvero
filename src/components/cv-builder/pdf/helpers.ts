import type { WorkExperience, Education } from '../types';

const EN_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FR_MONTHS = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

export function fmt(d: string, lang = 'en'): string {
  if (!d) return '';
  const [y, m] = d.split('-');
  if (!m) return y;
  return `${(lang === 'fr' ? FR_MONTHS : EN_MONTHS)[parseInt(m) - 1]} ${y}`;
}

export function dateRange(exp: WorkExperience, lang = 'en'): string {
  const now = lang === 'fr' ? "Auj." : 'Present';
  return `${fmt(exp.startDate, lang)} – ${exp.current ? now : fmt(exp.endDate, lang)}`;
}

export function eduRange(ed: Education, lang = 'en'): string {
  const now = lang === 'fr' ? 'Auj.' : 'Present';
  return `${fmt(ed.startDate, lang)} – ${ed.current ? now : fmt(ed.endDate, lang)}`;
}

export function initials(name: string): string {
  return (name || 'U')
    .split(' ')
    .map(w => w[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function skillLevel(i: number): number {
  return [85, 90, 75, 95, 80, 88, 70, 92][i % 8];
}

export function parseBullets(text: string): string[] {
  if (!text?.trim()) return [];
  const lines = text
    .split(/\n/)
    .map(l => l.replace(/^[-•*]\s*/, '').trim())
    .filter(l => l.length > 2);
  if (lines.length > 0) return lines;
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 3);
}
