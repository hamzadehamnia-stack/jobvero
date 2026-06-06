/**
 * US Resume PDF template — ATS-optimized, 1 page target, text-based.
 * Used when form.preferences.targetCountry === 'USA'.
 */

import type { CVFormData } from './types';
import type { TDocumentDefinitions, Content, Style } from 'pdfmake/interfaces';

// ─── Date helpers ─────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(raw: string): string {
  if (!raw) return '';
  const [year, month] = raw.split('-');
  if (!year) return '';
  if (!month) return year;
  return `${MONTHS[Math.max(0, parseInt(month, 10) - 1)]} ${year}`;
}

function dateRange(start: string, end: string, current?: boolean): string {
  const s = fmtDate(start);
  const e = current ? 'Present' : fmtDate(end);
  if (!s && !e) return '';
  if (!s) return e;
  if (!e) return s;
  return `${s} – ${e}`;
}

// ─── Bullet parser ────────────────────────────────────────────────────────────
// Splits a description string into bullet lines. Handles:
//   • existing bullet chars (•, -, *)
//   • newline-separated sentences
//   • plain paragraph (split into ≤ 4 sentences)

function toBullets(text: string): string[] {
  if (!text.trim()) return [];

  // Already has bullets or newlines
  const lines = text
    .split(/\n|(?=[•\-\*]\s)/)
    .map((l) => l.replace(/^[•\-\*]\s*/, '').trim())
    .filter(Boolean);

  if (lines.length > 1) return lines.slice(0, 5);

  // Plain paragraph — split on sentence boundaries
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);

  return sentences.length > 0 ? sentences : [text.trim()];
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildUSResumePDF(form: CVFormData): TDocumentDefinitions {
  const { personalInfo: p, workExperience, education, skillCategories, skills } = form;

  // Styles
  const styles: Record<string, Style> = {
    name: { fontSize: 20, bold: true, color: '#111827', characterSpacing: 0.3 },
    contact: { fontSize: 8.5, color: '#6b7280' },
    contactSep: { fontSize: 8.5, color: '#d1d5db' },
    sectionTitle: {
      fontSize: 9,
      bold: true,
      color: '#111827',
      characterSpacing: 1.4,
      decoration: 'underline' as const,
      decorationColor: '#2563eb',
    },
    jobTitle: { fontSize: 10.5, bold: true, color: '#111827' },
    company: { fontSize: 9.5, color: '#374151', italics: true },
    dateText: { fontSize: 8.5, color: '#6b7280', alignment: 'right' as const },
    bullet: { fontSize: 9, color: '#374151', lineHeight: 1.45 },
    schoolName: { fontSize: 10, bold: true, color: '#111827' },
    degree: { fontSize: 9, color: '#374151' },
    gpa: { fontSize: 9, color: '#6b7280', italics: true },
    skillCategory: { fontSize: 9, bold: true, color: '#374151' },
    skillItems: { fontSize: 9, color: '#374151' },
  };

  // ── Header ──────────────────────────────────────────────────────────────────
  const contactParts: Content[] = [
    p.email,
    p.phone,
    p.location,
    p.linkedin,
    p.portfolio,
  ]
    .filter(Boolean)
    .flatMap((item, i, arr) => {
      const node: Content = { text: item, style: 'contact' };
      return i < arr.length - 1
        ? [node, { text: '  |  ', style: 'contactSep' }]
        : [node];
    });

  const header: Content[] = [
    { text: p.fullName || 'Your Name', style: 'name', margin: [0, 0, 0, 4] },
    contactParts.length > 0
      ? ({ text: contactParts, margin: [0, 0, 0, 0] } as Content)
      : null,
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 510, y2: 0, lineWidth: 1.5, lineColor: '#2563eb' }],
      margin: [0, 6, 0, 0],
    },
  ].filter(Boolean) as Content[];

  // ── Section heading ─────────────────────────────────────────────────────────
  const section = (title: string): Content => ({
    text: title.toUpperCase(),
    style: 'sectionTitle',
    margin: [0, 12, 0, 4],
  });

  // ── Work experience ─────────────────────────────────────────────────────────
  const expContent: Content[] = workExperience.flatMap((exp, i): Content[] => {
    const bullets = toBullets(exp.description);
    return [
      {
        columns: [
          {
            stack: [
              { text: exp.position || '', style: 'jobTitle' },
              exp.company ? { text: exp.company, style: 'company', margin: [0, 1, 0, 0] } : null,
            ].filter(Boolean) as Content[],
            width: '*',
          },
          {
            text: dateRange(exp.startDate, exp.endDate, exp.current),
            style: 'dateText',
            width: 'auto',
            margin: [8, 2, 0, 0],
          },
        ],
        columnGap: 0,
        margin: [0, 0, 0, 2],
      },
      {
        ul: bullets.map((b) => ({ text: b, style: 'bullet' })),
        margin: [4, 0, 0, i < workExperience.length - 1 ? 8 : 0],
      },
    ];
  });

  // ── Education ───────────────────────────────────────────────────────────────
  const eduContent: Content[] = education.map((edu, i): Content => ({
    stack: [
      {
        columns: [
          {
            stack: [
              { text: edu.school || '', style: 'schoolName' },
              {
                text: [edu.degree, edu.field].filter(Boolean).join(', ') || '',
                style: 'degree',
                margin: [0, 1, 0, 0],
              },
            ].filter(Boolean) as Content[],
            width: '*',
          },
          {
            stack: [
              {
                text: dateRange(edu.startDate, edu.endDate, edu.current),
                style: 'dateText',
              },
              edu.gpa
                ? { text: `GPA: ${edu.gpa}`, style: 'gpa', alignment: 'right' as const }
                : null,
            ].filter(Boolean) as Content[],
            width: 'auto',
            margin: [8, 0, 0, 0],
          },
        ],
        columnGap: 0,
      },
    ],
    margin: [0, 0, 0, i < education.length - 1 ? 6 : 0],
  }));

  // ── Skills ───────────────────────────────────────────────────────────────────
  // Use skillCategories when available, fall back to flat skills array
  const hasCategories = skillCategories.some((c) => c.items.length > 0);

  let skillsContent: Content[] = [];

  if (hasCategories) {
    skillsContent = skillCategories
      .filter((c) => c.items.length > 0)
      .map((cat, i): Content => ({
        columns: [
          { text: `${cat.name}:`, style: 'skillCategory', width: 130 },
          { text: cat.items.join(', '), style: 'skillItems', width: '*' },
        ],
        columnGap: 8,
        margin: [0, 0, 0, i < skillCategories.filter(c => c.items.length > 0).length - 1 ? 3 : 0],
      }));
  } else if (skills.length > 0) {
    // Flat fallback: group into rows of 5
    const chunks: string[][] = [];
    for (let i = 0; i < skills.length; i += 5) chunks.push(skills.slice(i, i + 5));
    skillsContent = chunks.map((chunk): Content => ({
      text: chunk.join('   •   '),
      style: 'skillItems',
      margin: [0, 0, 0, 2],
    }));
  }

  // ── Assemble ─────────────────────────────────────────────────────────────────
  const content: Content[] = [
    ...header,
    ...(workExperience.length > 0 ? [section('Work Experience'), ...expContent] : []),
    ...(education.length > 0 ? [section('Education'), ...eduContent] : []),
    ...((hasCategories || skills.length > 0) ? [section('Technical Skills'), ...skillsContent] : []),
  ];

  return {
    content,
    styles,
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      color: '#111827',
    },
    pageSize: 'LETTER',          // US standard paper size
    pageMargins: [44, 36, 44, 36],
    info: {
      title: p.fullName ? `Resume – ${p.fullName}` : 'Resume',
      author: p.fullName,
      creator: 'Jobvero',
      subject: 'US Resume',
    },
  };
}
