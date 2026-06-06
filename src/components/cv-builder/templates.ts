import type { CVFormData, WorkExperience, Education, SkillCategory } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TemplateId =
  | 'paris-elegant'
  | 'bordeaux-classique'
  | 'american-classic'
  | 'new-york-modern'
  | 'london-executive';

export interface CVTemplate {
  id: TemplateId;
  name: string;
  country: string;
  flag: string;
  tags: string[];
  autoFor: string[];
  accent: string;
  generateHTML: (data: CVFormData) => string;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const esc = (s: string | undefined | null): string =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fmt(d: string, lang = 'en'): string {
  if (!d) return '';
  const [y, m] = d.split('-');
  if (!m) return y;
  const en = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fr = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `${(lang === 'fr' ? fr : en)[parseInt(m) - 1]} ${y}`;
}

function dateRange(exp: WorkExperience, lang = 'en'): string {
  const now = lang === 'fr' ? "Aujourd'hui" : 'Present';
  return `${fmt(exp.startDate, lang)} – ${exp.current ? now : fmt(exp.endDate, lang)}`;
}

function eduRange(ed: Education, lang = 'en'): string {
  const now = lang === 'fr' ? "Auj." : 'Present';
  return `${fmt(ed.startDate, lang)} – ${ed.current ? now : fmt(ed.endDate, lang)}`;
}

function bullets(text: string, color: string, size = '10px'): string {
  if (!text.trim()) return '';
  const lines = text
    .split(/\n/)
    .map(l => l.replace(/^[-•*]\s*/, '').trim())
    .filter(l => l.length > 2);
  const items = lines.length > 0 ? lines : text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 3);
  if (items.length === 0) return `<div style="font-size:${size};color:#374151;line-height:1.55;">${esc(text)}</div>`;
  return items
    .map(l =>
      `<div style="display:flex;gap:5px;margin-bottom:3px;font-size:${size};line-height:1.5;">` +
      `<span style="color:${color};font-weight:700;flex-shrink:0;margin-top:1px;">•</span>` +
      `<span style="color:#374151;">${esc(l)}</span></div>`
    )
    .join('');
}

function initials(name: string): string {
  return (name || 'U')
    .split(' ')
    .map(w => w[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Skill bar at a pseudo-level derived from index (alternates 80-95%)
function skillLevel(i: number): number {
  return [85, 90, 75, 95, 80, 88, 70, 92][i % 8];
}

// ─── Template 1: Paris Élégant ────────────────────────────────────────────────

function parisElegant(data: CVFormData): string {
  const { personalInfo: p, workExperience: we, education: edu, skills } = data;
  const NAVY = '#1a2744';
  const BLUE = '#4a6fa5';
  const initText = esc(initials(p.fullName));
  const jobTitle = we.length > 0 ? esc(we[0].position) : '';

  const secSidebar = (t: string) =>
    `<div style="font-size:7.5px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:${BLUE};margin-bottom:10px;">${t}</div>`;

  const secMain = (t: string) =>
    `<div style="font-family:'Playfair Display',Georgia,serif;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;` +
    `color:${NAVY};border-bottom:2px solid ${BLUE};padding-bottom:4px;margin:0 0 14px;">${t}</div>`;

  const weItems = we.map((exp, idx) => `
    <div style="margin-bottom:16px;${idx > 0 ? 'padding-top:14px;border-top:1px solid #f0f0f0;' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:11.5px;color:#1a1a2e;">${esc(exp.position)}</div>
        <div style="font-size:8.5px;color:${BLUE};white-space:nowrap;margin-left:8px;">${dateRange(exp, 'fr')}</div>
      </div>
      <div style="font-size:10px;color:${BLUE};font-weight:600;margin-bottom:6px;">${esc(exp.company)}</div>
      ${bullets(exp.description, BLUE, '9.5px')}
    </div>`).join('');

  const eduItems = edu.map(ed => `
    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:1px;">
        <div style="font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:11px;color:#1a1a2e;">${esc(ed.degree)}${ed.field ? ` — ${esc(ed.field)}` : ''}</div>
        <div style="font-size:8.5px;color:${BLUE};white-space:nowrap;margin-left:8px;">${eduRange(ed, 'fr')}</div>
      </div>
      <div style="font-size:10px;color:#555;">${esc(ed.school)}</div>
    </div>`).join('');

  const skillItems = skills.slice(0, 10).map((s, i) => `
    <div style="margin-bottom:8px;">
      <div style="font-size:9.5px;color:rgba(255,255,255,0.78);margin-bottom:3px;">${esc(s)}</div>
      <div style="height:3px;background:rgba(255,255,255,0.12);border-radius:2px;">
        <div style="height:3px;background:${BLUE};border-radius:2px;width:${skillLevel(i)}%;"></div>
      </div>
    </div>`).join('');

  const contactItems = [
    p.email    && `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="color:${BLUE};font-size:10px;">✉</span><span style="color:rgba(255,255,255,0.72);font-size:9px;word-break:break-all;">${esc(p.email)}</span></div>`,
    p.phone    && `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="color:${BLUE};font-size:10px;">☎</span><span style="color:rgba(255,255,255,0.72);font-size:9px;">${esc(p.phone)}</span></div>`,
    p.location && `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="color:${BLUE};font-size:10px;">📍</span><span style="color:rgba(255,255,255,0.72);font-size:9px;">${esc(p.location)}</span></div>`,
    p.linkedin && `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="color:${BLUE};font-size:10px;">in</span><span style="color:rgba(255,255,255,0.55);font-size:8.5px;word-break:break-all;">${esc(p.linkedin)}</span></div>`,
  ].filter(Boolean).join('');

  return `<div style="font-family:'Source Sans 3',Arial,sans-serif;max-width:794px;margin:0 auto;background:#fff;display:flex;min-height:1123px;box-sizing:border-box;">

  <!-- Sidebar -->
  <div style="width:220px;flex-shrink:0;background:${NAVY};padding:32px 20px;box-sizing:border-box;">
    <!-- Photo / Initials -->
    <div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.1);border:2.5px solid ${BLUE};margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',Georgia,serif;font-size:26px;font-weight:700;color:#fff;">
      ${initText}
    </div>
    <!-- Name + Title -->
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-family:'Playfair Display',Georgia,serif;font-size:14px;font-weight:700;color:#fff;line-height:1.3;">${esc(p.fullName)}</div>
      ${jobTitle ? `<div style="font-size:9.5px;color:rgba(255,255,255,0.6);margin-top:5px;">${jobTitle}</div>` : ''}
    </div>
    <!-- Divider -->
    <div style="height:1px;background:rgba(255,255,255,0.12);margin-bottom:18px;"></div>
    <!-- Contact -->
    ${contactItems ? `<div style="margin-bottom:20px;">${secSidebar('Contact')}${contactItems}</div>` : ''}
    <!-- Skills -->
    ${skills.length > 0 ? `<div style="margin-bottom:20px;">${secSidebar('Compétences')}${skillItems}</div>` : ''}
    <!-- Languages -->
    <div style="margin-bottom:20px;">
      ${secSidebar('Langues')}
      <div style="font-size:9.5px;color:rgba(255,255,255,0.75);margin-bottom:5px;">Français — Natif</div>
      <div style="font-size:9.5px;color:rgba(255,255,255,0.75);">Anglais — Courant</div>
    </div>
    <!-- Interests -->
    <div>
      ${secSidebar("Centres d'intérêt")}
      <div style="font-size:9.5px;color:rgba(255,255,255,0.65);line-height:2;">
        <div>Voyages</div><div>Lecture</div><div>Sport</div>
      </div>
    </div>
  </div>

  <!-- Main -->
  <div style="flex:1;padding:36px 30px;box-sizing:border-box;min-width:0;">
    <!-- Header in main -->
    <div style="margin-bottom:28px;">
      <h1 style="font-family:'Playfair Display',Georgia,serif;font-size:28px;font-weight:900;color:${NAVY};margin:0 0 5px;letter-spacing:-0.5px;">${esc(p.fullName)}</h1>
      ${jobTitle ? `<div style="font-size:13px;color:${BLUE};font-weight:600;letter-spacing:0.3px;">${jobTitle}</div>` : ''}
    </div>
    ${we.length > 0 ? `<div style="margin-bottom:26px;">${secMain('Expérience Professionnelle')}${weItems}</div>` : ''}
    ${edu.length > 0 ? `<div>${secMain('Formation')}${eduItems}</div>` : ''}
  </div>

</div>`;
}

// ─── Template 2: Bordeaux Classique ──────────────────────────────────────────

function bordeauxClassique(data: CVFormData): string {
  const { personalInfo: p, workExperience: we, education: edu, skills } = data;
  const BURGUNDY = '#8b1a1a';
  const CREAM = '#f9f5f0';

  const secSidebar = (t: string) =>
    `<div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${BURGUNDY};border-bottom:1.5px solid ${BURGUNDY};padding-bottom:3px;margin:0 0 10px;">${t}</div>`;

  const secMain = (t: string) =>
    `<div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:12px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${BURGUNDY};margin-bottom:12px;display:flex;align-items:center;gap:10px;">` +
    `<span>${t}</span><div style="flex:1;height:1px;background:#e8dede;"></div></div>`;

  const weItems = we.map(exp => `
    <div style="margin-bottom:14px;padding-left:0;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
        <div style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:700;font-size:12px;color:#1a1a2e;">${esc(exp.position)}</div>
        <span style="background:${BURGUNDY};color:#fff;font-size:7.5px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;margin-left:8px;">${dateRange(exp, 'fr')}</span>
      </div>
      <div style="font-size:10px;color:${BURGUNDY};font-weight:600;margin-bottom:5px;">${esc(exp.company)}</div>
      ${bullets(exp.description, BURGUNDY, '9.5px')}
    </div>`).join('');

  const eduItems = edu.map(ed => `
    <div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:1px;">
        <div style="font-family:'Cormorant Garamond',Georgia,serif;font-weight:700;font-size:12px;color:#1a1a2e;">${esc(ed.degree)}${ed.field ? ` — ${esc(ed.field)}` : ''}</div>
        <span style="background:${BURGUNDY};color:#fff;font-size:7.5px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;margin-left:8px;">${eduRange(ed, 'fr')}</span>
      </div>
      <div style="font-size:10px;color:#555;">${esc(ed.school)}</div>
    </div>`).join('');

  const skillDots = (level: number) =>
    Array.from({ length: 5 }, (_, i) =>
      `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:3px;background:${i < level ? BURGUNDY : '#ddd'};"></span>`
    ).join('');

  return `<div style="font-family:'DM Sans',Arial,sans-serif;max-width:794px;margin:0 auto;background:#fff;min-height:1123px;box-sizing:border-box;">

  <!-- Full-width Burgundy Header -->
  <div style="background:${BURGUNDY};padding:26px 36px;display:flex;align-items:center;justify-content:space-between;">
    <div style="display:flex;align-items:center;gap:18px;">
      <div style="width:74px;height:74px;border-radius:50%;background:rgba(255,255,255,0.15);border:2.5px solid rgba(255,255,255,0.45);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;font-weight:700;color:#fff;">
        ${esc(initials(p.fullName))}
      </div>
      <div>
        <h1 style="font-family:'Cormorant Garamond',Georgia,serif;margin:0 0 4px;font-size:26px;font-weight:700;color:#fff;letter-spacing:0.5px;">${esc(p.fullName)}</h1>
        ${we.length > 0 ? `<div style="font-size:11px;color:rgba(255,255,255,0.8);font-weight:400;">${esc(we[0].position)}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right;">
      ${p.email    ? `<div style="color:rgba(255,255,255,0.78);font-size:9.5px;margin-bottom:3px;">${esc(p.email)}</div>` : ''}
      ${p.phone    ? `<div style="color:rgba(255,255,255,0.78);font-size:9.5px;margin-bottom:3px;">${esc(p.phone)}</div>` : ''}
      ${p.location ? `<div style="color:rgba(255,255,255,0.78);font-size:9.5px;margin-bottom:3px;">${esc(p.location)}</div>` : ''}
      ${p.linkedin ? `<div style="color:rgba(255,255,255,0.55);font-size:9px;">${esc(p.linkedin)}</div>` : ''}
    </div>
  </div>

  <!-- Body: cream sidebar + white main -->
  <div style="display:flex;align-items:stretch;">
    <!-- Sidebar -->
    <div style="width:200px;flex-shrink:0;background:${CREAM};padding:24px 18px;box-sizing:border-box;border-right:1px solid #e8dede;">
      ${skills.length > 0 ? `
      <div style="margin-bottom:22px;">
        ${secSidebar('Compétences')}
        ${skills.slice(0, 8).map((s, i) => `
          <div style="margin-bottom:8px;">
            <div style="font-size:9.5px;color:#3a2020;margin-bottom:3px;">${esc(s)}</div>
            <div>${skillDots(Math.max(2, 5 - (i % 3)))}</div>
          </div>`).join('')}
      </div>` : ''}
      <div style="margin-bottom:22px;">
        ${secSidebar('Langues')}
        <div style="margin-bottom:8px;">
          <div style="font-size:9.5px;color:#3a2020;margin-bottom:3px;">Français</div>
          <span style="background:${BURGUNDY};color:#fff;font-size:8px;font-weight:600;padding:1.5px 7px;border-radius:8px;">Natif</span>
        </div>
        <div>
          <div style="font-size:9.5px;color:#3a2020;margin-bottom:3px;">Anglais</div>
          <span style="background:#5d3a3a;color:#fff;font-size:8px;font-weight:600;padding:1.5px 7px;border-radius:8px;">Courant</span>
        </div>
      </div>
      <div>
        ${secSidebar("Centres d'intérêt")}
        <div style="font-size:9.5px;color:#5a3a3a;line-height:2;">
          <div>Voyages</div><div>Littérature</div><div>Sport</div>
        </div>
      </div>
    </div>
    <!-- Main -->
    <div style="flex:1;padding:26px 28px;box-sizing:border-box;min-width:0;">
      ${we.length > 0 ? `<div style="margin-bottom:24px;">${secMain('Expériences Professionnelles')}${weItems}</div>` : ''}
      ${edu.length > 0 ? `<div>${secMain('Formation')}${eduItems}</div>` : ''}
    </div>
  </div>
</div>`;
}

// ─── Template 3: American Classic ────────────────────────────────────────────

function americanClassic(data: CVFormData): string {
  const { personalInfo: p, workExperience: we, education: edu, skills, skillCategories } = data;
  const hasCategories = skillCategories?.some((c: SkillCategory) => c.items.length > 0);

  const sec = (t: string) =>
    `<div style="font-family:'Libre Baskerville',Georgia,serif;font-size:9px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;` +
    `color:#1a1a2e;border-bottom:2px solid #1a1a2e;padding-bottom:4px;margin:0 0 12px;">${t}</div>`;

  const weItems = we.map(exp => `
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <div style="font-family:'Libre Baskerville',Georgia,serif;font-weight:700;font-size:11.5px;color:#1a1a2e;">${esc(exp.position)}</div>
        <div style="font-size:9px;color:#555;white-space:nowrap;margin-left:8px;">${dateRange(exp)}</div>
      </div>
      <div style="font-style:italic;font-size:10.5px;color:#333;margin-bottom:5px;">${esc(exp.company)}${p.location ? ` · ${esc(p.location)}` : ''}</div>
      ${bullets(exp.description, '#1a1a2e', '10px')}
    </div>`).join('');

  const skillsBlock = hasCategories
    ? (skillCategories ?? [])
        .filter((c: SkillCategory) => c.items.length > 0)
        .map((c: SkillCategory) =>
          `<div style="margin-bottom:5px;font-size:10.5px;">` +
          `<strong style="color:#1a1a2e;font-family:'Libre Baskerville',Georgia,serif;">${esc(c.name)}:</strong> ` +
          `<span style="color:#333;">${esc(c.items.join(', '))}</span></div>`
        ).join('')
    : skills.map(s =>
        `<span style="display:inline-block;border:1px solid #1a1a2e;color:#1a1a2e;font-size:9.5px;font-weight:600;padding:2px 9px;border-radius:3px;margin:2px 3px 2px 0;">${esc(s)}</span>`
      ).join('');

  // Education + Languages 2-col layout
  const eduCol = edu.length > 0 ? `
    <div style="flex:1;padding-right:20px;">
      ${sec('Education')}
      ${edu.map(ed => `
        <div style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <div style="font-family:'Libre Baskerville',Georgia,serif;font-weight:700;font-size:11px;color:#1a1a2e;">${esc(ed.degree)}${ed.field ? `, ${esc(ed.field)}` : ''}</div>
            <div style="font-size:9px;color:#555;white-space:nowrap;margin-left:8px;">${eduRange(ed)}</div>
          </div>
          <div style="font-style:italic;font-size:10px;color:#444;">${esc(ed.school)}</div>
        </div>`).join('')}
    </div>` : '';

  const langCol = `
    <div style="width:160px;flex-shrink:0;border-left:1px solid #e5e7eb;padding-left:20px;">
      ${sec('Languages')}
      <div style="font-size:10px;color:#333;line-height:2;">
        <div>English — Native</div>
        <div>French — Intermediate</div>
      </div>
    </div>`;

  const contactRow = [p.email, p.phone, p.location, p.linkedin].filter(Boolean).map(esc).join(' &nbsp;|&nbsp; ');

  return `<div style="font-family:'Nunito Sans',Arial,sans-serif;max-width:794px;margin:0 auto;background:#fff;padding:44px 52px;box-sizing:border-box;min-height:1123px;">

  <!-- Centered header -->
  <div style="text-align:center;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #1a1a2e;">
    <h1 style="font-family:'Libre Baskerville',Georgia,serif;margin:0 0 8px;font-size:30px;font-weight:700;color:#1a1a2e;letter-spacing:2px;">${esc(p.fullName.toUpperCase())}</h1>
    ${we.length > 0 ? `<div style="font-size:11px;color:#555;font-style:italic;margin-bottom:6px;">${esc(we[0].position)}</div>` : ''}
    ${contactRow ? `<div style="font-size:10px;color:#555;">${contactRow}</div>` : ''}
  </div>

  ${we.length > 0 ? `
  <div style="margin-bottom:20px;">
    ${sec('Professional Summary')}
    <p style="font-size:10.5px;color:#333;line-height:1.65;margin:0;">
      Experienced ${esc(we[0].position)} with a proven track record of delivering results at ${esc(we[0].company)}.
      ${skills.length > 0 ? `Skilled in ${esc(skills.slice(0, 3).join(', '))}.` : ''}
      Committed to continuous improvement and driving measurable business impact.
    </p>
  </div>` : ''}

  ${we.length > 0 ? `<div style="margin-bottom:20px;">${sec('Professional Experience')}${weItems}</div>` : ''}

  ${(edu.length > 0 || true) ? `
  <div style="display:flex;margin-bottom:20px;">
    ${eduCol}
    ${langCol}
  </div>` : ''}

  ${(skills.length > 0 || hasCategories) ? `<div>${sec('Skills')}${skillsBlock}</div>` : ''}
</div>`;
}

// ─── Template 4: New York Modern ─────────────────────────────────────────────

function newYorkModern(data: CVFormData): string {
  const { personalInfo: p, workExperience: we, education: edu, skills, skillCategories } = data;
  const BLACK = '#0f0f0f';
  const BLUE = '#3b82f6';
  const hasCategories = skillCategories?.some((c: SkillCategory) => c.items.length > 0);

  const secSidebar = (t: string) =>
    `<div style="font-family:'Syne',Arial,sans-serif;font-size:7.5px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${BLUE};margin-bottom:10px;">${t}</div>`;

  const secMain = (t: string) =>
    `<div style="font-family:'Syne',Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;` +
    `color:#1f2937;padding-bottom:4px;margin:0 0 12px;border-bottom:2px solid #e5e7eb;">${t}</div>`;

  const contactPills = [
    p.email    && `<span style="background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.8);font-size:8.5px;padding:3px 9px;border-radius:12px;">${esc(p.email)}</span>`,
    p.phone    && `<span style="background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.8);font-size:8.5px;padding:3px 9px;border-radius:12px;">${esc(p.phone)}</span>`,
    p.location && `<span style="background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.8);font-size:8.5px;padding:3px 9px;border-radius:12px;">📍 ${esc(p.location)}</span>`,
  ].filter(Boolean).join('');

  const weItems = we.map((exp, i) => `
    <div style="margin-bottom:14px;padding-left:16px;position:relative;">
      <div style="position:absolute;left:0;top:4px;width:7px;height:7px;border-radius:50%;background:${BLUE};border:2px solid #e5e7eb;"></div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <div style="font-family:'Syne',Arial,sans-serif;font-weight:700;font-size:11.5px;color:#111827;">${esc(exp.position)}</div>
        <div style="font-size:9px;color:#9CA3AF;white-space:nowrap;margin-left:8px;">${dateRange(exp)}</div>
      </div>
      <div style="font-size:10px;color:${BLUE};font-weight:600;margin-bottom:5px;">${esc(exp.company)}</div>
      ${bullets(exp.description, BLUE, '10px')}
    </div>`).join('');

  const skillBars = skills.slice(0, 8).map((s, i) => `
    <div style="margin-bottom:8px;">
      <div style="font-size:9.5px;color:#374151;margin-bottom:3px;">${esc(s)}</div>
      <div style="height:3px;background:#e5e7eb;border-radius:2px;">
        <div style="height:3px;background:${BLUE};border-radius:2px;width:${skillLevel(i)}%;"></div>
      </div>
    </div>`).join('');

  const competencyTags = (hasCategories ? (skillCategories ?? []).flatMap((c: SkillCategory) => c.items) : skills).slice(0, 12)
    .map(s => `<span style="display:inline-block;background:#eff6ff;color:${BLUE};border:1px solid #bfdbfe;font-size:9px;font-weight:600;padding:2px 8px;border-radius:4px;margin:2px 2px 2px 0;">${esc(s)}</span>`)
    .join('');

  return `<div style="font-family:'Space Grotesk',Arial,sans-serif;max-width:794px;margin:0 auto;background:#fff;min-height:1123px;box-sizing:border-box;">

  <!-- Black header -->
  <div style="background:${BLACK};padding:24px 32px;display:flex;align-items:center;justify-content:space-between;">
    <div>
      <h1 style="font-family:'Syne',Arial,sans-serif;margin:0 0 4px;font-size:28px;font-weight:800;color:#fff;letter-spacing:-1px;">${esc(p.fullName)}</h1>
      ${we.length > 0 ? `<div style="font-size:11px;color:rgba(255,255,255,0.6);">${esc(we[0].position)}</div>` : ''}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:flex-end;max-width:300px;">
      ${contactPills}
    </div>
  </div>
  <!-- Blue accent bar -->
  <div style="height:4px;background:${BLUE};"></div>

  <!-- Body -->
  <div style="display:flex;align-items:stretch;">
    <!-- Sidebar -->
    <div style="width:200px;flex-shrink:0;padding:22px 18px;border-right:1px solid #f3f4f6;box-sizing:border-box;">
      ${skills.length > 0 ? `<div style="margin-bottom:22px;">${secSidebar('Skills')}${skillBars}</div>` : ''}
      <div style="margin-bottom:22px;">
        ${secSidebar('Languages')}
        <div style="margin-bottom:6px;">
          <div style="font-size:9.5px;color:#374151;margin-bottom:2px;">English</div>
          <div style="height:2px;background:#e5e7eb;border-radius:1px;"><div style="height:2px;background:${BLUE};width:95%;border-radius:1px;"></div></div>
        </div>
        <div>
          <div style="font-size:9.5px;color:#374151;margin-bottom:2px;">French</div>
          <div style="height:2px;background:#e5e7eb;border-radius:1px;"><div style="height:2px;background:${BLUE};width:70%;border-radius:1px;"></div></div>
        </div>
      </div>
      ${edu.length > 0 ? `
      <div>
        ${secSidebar('Education')}
        ${edu.map(ed => `
          <div style="margin-bottom:10px;">
            <div style="font-family:'Syne',Arial,sans-serif;font-weight:700;font-size:10.5px;color:#111827;">${esc(ed.degree)}</div>
            ${ed.field ? `<div style="font-size:9px;color:${BLUE};">${esc(ed.field)}</div>` : ''}
            <div style="font-size:9px;color:#6B7280;">${esc(ed.school)}</div>
            <div style="font-size:8.5px;color:#9CA3AF;">${eduRange(ed)}</div>
          </div>`).join('')}
      </div>` : ''}
    </div>
    <!-- Main -->
    <div style="flex:1;padding:22px 24px;box-sizing:border-box;min-width:0;">
      ${we.length > 0 ? `
      <div style="margin-bottom:6px;padding:10px 14px;border-left:3px solid ${BLUE};background:#eff6ff;border-radius:0 6px 6px 0;margin-bottom:20px;">
        <p style="font-size:10px;color:#1e40af;line-height:1.6;margin:0;font-style:italic;">
          ${we.length > 0 ? `Experienced ${esc(we[0].position)} with expertise in ${esc(skills.slice(0, 3).join(', '))}. Committed to delivering impactful results.` : ''}
        </p>
      </div>` : ''}
      ${we.length > 0 ? `<div style="margin-bottom:22px;">${secMain('Experience')}${weItems}</div>` : ''}
      ${(skills.length > 0 || hasCategories) ? `
      <div>
        ${secMain('Competencies')}
        <div>${competencyTags}</div>
      </div>` : ''}
    </div>
  </div>
</div>`;
}

// ─── Template 5: London Executive ────────────────────────────────────────────

function londonExecutive(data: CVFormData): string {
  const { personalInfo: p, workExperience: we, education: edu, skills } = data;
  const NAVY = '#1b3a5c';
  const ACCENT = '#4a7fa5';

  const secMain = (t: string) =>
    `<div style="font-family:'EB Garamond',Georgia,serif;font-size:10.5px;font-weight:700;letter-spacing:1px;text-transform:uppercase;` +
    `color:${NAVY};border-bottom:2px solid ${NAVY};padding-bottom:4px;margin:0 0 12px;">${t}</div>`;

  const secAside = (t: string) =>
    `<div style="font-family:'EB Garamond',Georgia,serif;font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;` +
    `color:${NAVY};border-bottom:1.5px solid ${ACCENT};padding-bottom:3px;margin:0 0 10px;">${t}</div>`;

  const statement = we.length > 0
    ? `A dedicated ${esc(we[0].position)} with extensive experience${skills.length > 0 ? ` and demonstrable expertise in ${esc(skills.slice(0, 3).join(', '))}` : ''}. A results-driven professional committed to excellence and organisational success.`
    : 'An experienced professional committed to excellence and success through strategic thinking and collaborative leadership.';

  const weItems = we.map(exp => `
    <div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
        <div style="font-family:'EB Garamond',Georgia,serif;font-weight:700;font-size:12px;color:#1a1a2e;">${esc(exp.position)}</div>
        <div style="font-size:9px;color:${ACCENT};font-style:italic;white-space:nowrap;margin-left:8px;">${dateRange(exp)}</div>
      </div>
      <div style="font-size:10.5px;color:${NAVY};font-weight:600;margin-bottom:5px;">${esc(exp.company)}</div>
      ${bullets(exp.description, NAVY, '10px')}
    </div>`).join('');

  const achievements = we.flatMap(e =>
    (e.description || '').split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(l => l.length > 5)
  ).slice(0, 4);

  const skillDotRow = (s: string, i: number) =>
    `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">` +
    `<div style="width:5px;height:5px;border-radius:50%;background:${NAVY};flex-shrink:0;"></div>` +
    `<span style="font-size:10px;color:#374151;">${esc(s)}</span></div>`;

  const contactItems = [
    p.email    && `<span style="font-size:9.5px;color:#555;">✉ ${esc(p.email)}</span>`,
    p.phone    && `<span style="font-size:9.5px;color:#555;">☎ ${esc(p.phone)}</span>`,
    p.location && `<span style="font-size:9.5px;color:#555;">📍 ${esc(p.location)}</span>`,
    p.linkedin && `<span style="font-size:9px;color:${ACCENT};">${esc(p.linkedin)}</span>`,
  ].filter(Boolean).join('<span style="color:#ccc;margin:0 8px;">|</span>');

  return `<div style="font-family:'Mulish',Arial,sans-serif;max-width:794px;margin:0 auto;background:#fff;min-height:1123px;box-sizing:border-box;">

  <!-- Header: 2-column with 3px bottom border -->
  <div style="padding:28px 36px 22px;border-bottom:3px solid ${NAVY};">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <h1 style="font-family:'EB Garamond',Georgia,serif;margin:0 0 4px;font-size:30px;font-weight:700;color:${NAVY};letter-spacing:0.5px;">${esc(p.fullName)}</h1>
        ${we.length > 0 ? `<div style="font-size:13px;color:${ACCENT};font-weight:600;">${esc(we[0].position)}</div>` : ''}
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;gap:3px;">
        ${p.email    ? `<span style="font-size:9.5px;color:#555;">✉ ${esc(p.email)}</span>` : ''}
        ${p.phone    ? `<span style="font-size:9.5px;color:#555;">☎ ${esc(p.phone)}</span>` : ''}
        ${p.location ? `<span style="font-size:9.5px;color:#555;">📍 ${esc(p.location)}</span>` : ''}
        ${p.linkedin ? `<span style="font-size:9px;color:${ACCENT};">${esc(p.linkedin)}</span>` : ''}
      </div>
    </div>
  </div>

  <!-- Personal Statement -->
  <div style="margin:0 36px;border-left:4px solid ${ACCENT};background:#f8fafc;padding:12px 18px;">
    <p style="font-family:'EB Garamond',Georgia,serif;font-size:11.5px;color:#374151;line-height:1.7;margin:0;font-style:italic;">${statement}</p>
  </div>

  <!-- Main + Aside -->
  <div style="display:flex;align-items:stretch;margin-top:4px;">
    <!-- Main (Experience + Education + Achievements) -->
    <div style="flex:1;padding:22px 22px 22px 36px;border-right:1px solid #f0f0f0;box-sizing:border-box;min-width:0;">
      ${we.length > 0 ? `<div style="margin-bottom:22px;">${secMain('Experience')}${weItems}</div>` : ''}
      ${edu.length > 0 ? `
      <div style="margin-bottom:22px;">
        ${secMain('Education')}
        ${edu.map(ed => `
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:1px;">
              <div style="font-family:'EB Garamond',Georgia,serif;font-weight:700;font-size:12px;color:#1a1a2e;">${esc(ed.degree)}${ed.field ? `, ${esc(ed.field)}` : ''}</div>
              <div style="font-size:9px;color:${ACCENT};white-space:nowrap;margin-left:8px;">${eduRange(ed)}</div>
            </div>
            <div style="font-size:10.5px;color:${NAVY};">${esc(ed.school)}</div>
          </div>`).join('')}
      </div>` : ''}
      ${achievements.length > 0 ? `
      <div>
        ${secMain('Key Achievements')}
        ${achievements.map(a => `
          <div style="display:flex;gap:8px;margin-bottom:6px;font-size:10px;color:#374151;line-height:1.5;">
            <span style="color:${ACCENT};font-size:12px;flex-shrink:0;margin-top:-1px;">★</span>
            <span>${esc(a)}</span>
          </div>`).join('')}
      </div>` : ''}
    </div>
    <!-- Aside -->
    <div style="width:210px;flex-shrink:0;padding:22px 22px 22px 18px;box-sizing:border-box;">
      ${skills.length > 0 ? `
      <div style="margin-bottom:22px;">
        ${secAside('Core Skills')}
        ${skills.slice(0, 10).map(skillDotRow).join('')}
      </div>` : ''}
      <div style="margin-bottom:22px;">
        ${secAside('Languages')}
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
          <div style="width:5px;height:5px;border-radius:50%;background:${NAVY};flex-shrink:0;"></div>
          <span style="font-size:10px;color:#374151;">English — Native</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="width:5px;height:5px;border-radius:50%;background:${NAVY};flex-shrink:0;"></div>
          <span style="font-size:10px;color:#374151;">French — Intermediate</span>
        </div>
      </div>
      <div>
        ${secAside('References')}
        <p style="font-size:9.5px;color:#6B7280;font-style:italic;line-height:1.6;">Available upon request</p>
      </div>
    </div>
  </div>
</div>`;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const TEMPLATES: CVTemplate[] = [
  {
    id: 'paris-elegant',
    name: 'Paris Élégant',
    country: 'France',
    flag: '🇫🇷',
    tags: ['Photo', 'Sidebar', 'Navy'],
    autoFor: ['France', 'Belgium', 'Luxembourg', 'Switzerland'],
    accent: '#4a6fa5',
    generateHTML: parisElegant,
  },
  {
    id: 'bordeaux-classique',
    name: 'Bordeaux Classique',
    country: 'France',
    flag: '🇫🇷',
    tags: ['Photo', '2 Colonnes', 'Classique'],
    autoFor: ['France', 'Belgium', 'Luxembourg'],
    accent: '#8b1a1a',
    generateHTML: bordeauxClassique,
  },
  {
    id: 'american-classic',
    name: 'American Classic',
    country: 'USA',
    flag: '🇺🇸',
    tags: ['No Photo', '1 Column', 'ATS-Friendly'],
    autoFor: ['USA', 'Canada', 'Australia', 'New Zealand', 'Ireland'],
    accent: '#1a1a2e',
    generateHTML: americanClassic,
  },
  {
    id: 'new-york-modern',
    name: 'New York Modern',
    country: 'USA',
    flag: '🇺🇸',
    tags: ['No Photo', 'Dark Header', 'Sidebar'],
    autoFor: ['USA', 'Canada', 'Australia', 'New Zealand', 'Ireland'],
    accent: '#3b82f6',
    generateHTML: newYorkModern,
  },
  {
    id: 'london-executive',
    name: 'London Executive',
    country: 'UK',
    flag: '🇬🇧',
    tags: ['No Photo', '2 Columns', 'Statement'],
    autoFor: ['UK'],
    accent: '#1b3a5c',
    generateHTML: londonExecutive,
  },
];

export function getTemplate(id: string): CVTemplate | undefined {
  return TEMPLATES.find(t => t.id === id);
}

export function getTemplatesForCountry(country: string): CVTemplate[] {
  if (!country) return TEMPLATES;
  const matched = TEMPLATES.filter(t => t.autoFor.includes(country));
  return matched.length > 0 ? TEMPLATES : TEMPLATES; // show all if no match
}
