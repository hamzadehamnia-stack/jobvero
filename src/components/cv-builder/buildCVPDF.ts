/**
 * Builds a pdfmake TDocumentDefinitions object from CVFormData.
 * Call this client-side only (pdfmake bundles fonts via vfs).
 *
 * Usage:
 *   const pdfMake  = (await import('pdfmake/build/pdfmake')).default;
 *   const pdfFonts = (await import('pdfmake/build/vfs_fonts')).default;
 *   pdfMake.vfs = pdfFonts.pdfMake?.vfs ?? (pdfFonts as any);
 *   const blob = await getPDFBlob(pdfMake, buildCVPDF(form));
 */

import type { CVFormData } from './types';
import type { TDocumentDefinitions, Content, Style } from 'pdfmake/interfaces';

// ─── Themes ───────────────────────────────────────────────────────────────────

const THEMES = {
  Professional: { accent: '#2563eb', header: '#1e293b', muted: '#64748b', tagBg: '#eff6ff', tagText: '#1d4ed8', rule: '#bfdbfe' },
  Modern:       { accent: '#7c3aed', header: '#0f172a', muted: '#6b7280', tagBg: '#f5f3ff', tagText: '#6d28d9', rule: '#ddd6fe' },
  Creative:     { accent: '#059669', header: '#111827', muted: '#6b7280', tagBg: '#ecfdf5', tagText: '#065f46', rule: '#a7f3d0' },
} as const;

// ─── Date helpers ─────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(raw: string): string {
  if (!raw) return '';
  const [year, month] = raw.split('-');
  if (!year) return '';
  if (!month) return year;
  const m = parseInt(month, 10);
  return `${MONTHS[Math.max(0, m - 1)]} ${year}`;
}

function dateRange(start: string, end: string, current?: boolean): string {
  const s = fmtDate(start);
  const e = current ? 'Present' : fmtDate(end);
  if (!s && !e) return '';
  if (!s) return e;
  if (!e) return s;
  return `${s} – ${e}`;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildCVPDF(form: CVFormData): TDocumentDefinitions {
  const style = form.preferences.style ?? 'Professional';
  const t = THEMES[style] ?? THEMES.Professional;

  const { personalInfo: p, workExperience, education, skills } = form;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const styles: Record<string, Style> = {
    name: {
      fontSize: 24,
      bold: true,
      color: t.header,
      lineHeight: 1.1,
    },
    contactText: {
      fontSize: 8.5,
      color: t.muted,
      lineHeight: 1.4,
    },
    contactLink: {
      fontSize: 8.5,
      color: t.accent,
      lineHeight: 1.4,
    },
    sectionTitle: {
      fontSize: 8.5,
      bold: true,
      color: t.accent,
      characterSpacing: 1.5,
    },
    entryTitle: {
      fontSize: 10.5,
      bold: true,
      color: t.header,
      lineHeight: 1.2,
    },
    entryDate: {
      fontSize: 8,
      color: t.muted,
      alignment: 'right' as const,
      lineHeight: 1.2,
    },
    entrySub: {
      fontSize: 9,
      color: t.muted,
      lineHeight: 1.3,
      italics: true,
    },
    entryBody: {
      fontSize: 9,
      color: '#374151',
      lineHeight: 1.5,
    },
    skillTag: {
      fontSize: 8.5,
      color: t.tagText,
      background: t.tagBg,
    },
  };

  // ── Contact info row ────────────────────────────────────────────────────────

  const contactParts: Content[] = [
    p.email    && { text: p.email,     style: 'contactText' },
    p.phone    && { text: p.phone,     style: 'contactText' },
    p.location && { text: p.location,  style: 'contactText' },
    p.linkedin && { text: p.linkedin,  style: 'contactLink' },
    p.portfolio && { text: p.portfolio, style: 'contactLink' },
  ].filter(Boolean) as Content[];

  // Intersperse with separator dots
  const contactRow: Content[] = [];
  contactParts.forEach((c, i) => {
    contactRow.push(c);
    if (i < contactParts.length - 1) {
      contactRow.push({ text: '  ·  ', color: t.muted, fontSize: 8.5 });
    }
  });

  // ── Section rule ────────────────────────────────────────────────────────────
  const rule = (): Content => ({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.75, lineColor: t.rule }],
    margin: [0, 3, 0, 6],
  });

  // ── Section heading ─────────────────────────────────────────────────────────
  const sectionHeading = (title: string): Content => ({
    stack: [
      { text: title.toUpperCase(), style: 'sectionTitle' },
      rule(),
    ],
    margin: [0, 12, 0, 0],
  });

  // ── Work experience entries ─────────────────────────────────────────────────
  const experienceContent: Content[] = workExperience.map((exp, i): Content => ({
    stack: [
      {
        columns: [
          { text: exp.position || '', style: 'entryTitle', width: '*' },
          { text: dateRange(exp.startDate, exp.endDate, exp.current), style: 'entryDate', width: 'auto' },
        ],
        columnGap: 8,
      },
      exp.company ? { text: exp.company, style: 'entrySub', margin: [0, 1, 0, 2] } : null,
      exp.description ? { text: exp.description, style: 'entryBody' } : null,
    ].filter(Boolean) as Content[],
    margin: [0, 0, 0, i < workExperience.length - 1 ? 8 : 0],
  }));

  // ── Education entries ───────────────────────────────────────────────────────
  const educationContent: Content[] = education.map((edu, i): Content => ({
    stack: [
      {
        columns: [
          {
            text: [edu.degree, edu.field].filter(Boolean).join(', ') || edu.school || '',
            style: 'entryTitle',
            width: '*',
          },
          {
            text: dateRange(edu.startDate, edu.endDate, edu.current),
            style: 'entryDate',
            width: 'auto',
          },
        ],
        columnGap: 8,
      },
      edu.school ? { text: edu.school, style: 'entrySub', margin: [0, 1, 0, 0] } : null,
    ].filter(Boolean) as Content[],
    margin: [0, 0, 0, i < education.length - 1 ? 6 : 0],
  }));

  // ── Skills grid ─────────────────────────────────────────────────────────────
  // pdfmake doesn't support inline wrapping tags natively, so render as
  // a table row that wraps: columns of skill tags 4 per row.
  const skillRows: Content[][] = [];
  const COLS = 3;
  for (let i = 0; i < skills.length; i += COLS) {
    const row: Content[] = skills.slice(i, i + COLS).map(
      (skill): Content => ({
        text: skill,
        style: 'skillTag',
        margin: [0, 2, 4, 2],
      }),
    );
    // Pad to full row
    while (row.length < COLS) row.push({ text: '' });
    skillRows.push(row);
  }

  const skillsTable: Content | null = skillRows.length > 0
    ? {
        table: {
          widths: Array(COLS).fill('*'),
          body: skillRows,
        },
        layout: 'noBorders',
        margin: [0, 2, 0, 0],
      }
    : null;

  // ── Assemble document ───────────────────────────────────────────────────────
  const content: Content[] = [
    // Header
    { text: p.fullName || 'Your Name', style: 'name', margin: [0, 0, 0, 4] },
    contactRow.length > 0
      ? { text: contactRow, margin: [0, 0, 0, 12] }
      : null,
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: t.accent }],
      margin: [0, 0, 0, 0],
    },

    // Work experience
    workExperience.length > 0 ? sectionHeading('Work Experience') : null,
    ...experienceContent,

    // Education
    education.length > 0 ? sectionHeading('Education') : null,
    ...educationContent,

    // Skills
    skills.length > 0 ? sectionHeading('Skills') : null,
    skillsTable,
  ].filter(Boolean) as Content[];

  return {
    content,
    styles,
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      color: t.header,
    },
    pageSize: 'A4',
    pageMargins: [44, 40, 44, 40],
    info: {
      title: p.fullName ? `CV – ${p.fullName}` : 'CV',
      author: p.fullName,
      creator: 'Jobvero',
    },
  };
}
