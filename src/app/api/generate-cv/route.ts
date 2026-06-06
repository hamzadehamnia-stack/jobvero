import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';
import { withFeatureCheck } from '@/lib/subscription/withFeatureCheck';
import { PALETTE_COLORS, type ColorPalette } from '@/components/cv-builder/types';

const MODEL = 'anthropic/claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are a premium CV/resume designer with deep expertise in international hiring standards, ATS optimization, and typographic design. You produce visually stunning, professionally formatted CVs as clean, self-contained HTML using only inline styles.

━━━ TYPOGRAPHY ━━━

Choose the Google Fonts family based on the target country and always include the <link> import at the very top of your output:
- USA / UK / Canada / Australia / NZ / Ireland → Inter (weights 400,500,600,700,800)
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
- France / Belgium / Switzerland / Luxembourg → Playfair Display (headings) + Source Sans 3 (body)
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet">
- Germany / Austria → IBM Plex Sans (weights 400,600,700)
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap" rel="stylesheet">
- Spain / Portugal / Brazil / Italy → Lato (weights 400,700,900)
  <link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap" rel="stylesheet">

Apply the body font to the outermost div's font-family style.

━━━ LAYOUT RULES ━━━

Single-column (USA / UK / Canada / Australia / NZ / Ireland):
- Full-width container, all sections stacked vertically
- Header: name large (30-32px), title below in accent color, then contact row on one line

Two-column with dark sidebar (France / Belgium / Switzerland / Luxembourg / Germany / Austria / Spain / Portugal / Brazil / Italy):
- Outer: display:flex, width 794px
- Left sidebar: width 210px, background = primary palette color, padding 24px 18px, box-sizing border-box, min-height 1123px
- Right main: flex:1, background #ffffff, padding 32px 28px, box-sizing border-box
- Sidebar contains: photo circle, name, title, divider, Contact, Skills/Compétences, Languages (if data exists)
- Main area contains: summary/accroche, experience, education (and any remaining sections)

━━━ DIMENSIONS & SPACING ━━━

- Outer wrapper: max-width 794px, margin 0 auto, background #ffffff, min-height 1123px, box-sizing border-box
- Line-height: 1.6 body, 1.2 headings
- Section margin-bottom: 22px
- Entry margin-bottom: 14px within a section
- All containers: box-sizing border-box

━━━ HEADER (single-column) ━━━

- h1 for name: font-size 30px, font-weight 800, color = primary, letter-spacing -0.5px, margin 0 0 4px
- Job title div: font-size 12px, font-weight 600, color = accent, letter-spacing 0.2px, margin-bottom 14px
- Contact row: font-size 9.5px, color #6B7280, items separated by " · "
- Thick accent line below header: height 3px, background = accent, margin-bottom 24px

━━━ SIDEBAR HEADER (two-column) ━━━

- Photo placeholder: width 72px, height 72px, border-radius 50%, background rgba(255,255,255,0.12), border 2px solid [accent], margin 0 auto 12px, display flex, align-items center, justify-content center, font-size 22px, font-weight 700, color #fff (show initials)
- Name in sidebar: font-size 13px, font-weight 700, color #ffffff, text-align center, font-family serif/display, line-height 1.3, margin-bottom 3px
- Title in sidebar: font-size 8.5px, color rgba(255,255,255,0.65), text-align center, margin-bottom 16px
- Divider: height 1px, background rgba(255,255,255,0.14), margin-bottom 16px

━━━ SECTION HEADINGS ━━━

Single-column: h2 with font-size 9px, font-weight 700, letter-spacing 2px, text-transform uppercase, color = primary, border-bottom 1.5px solid [accent], padding-bottom 3px, margin 0 0 12px
Sidebar sections: span/div label with font-size 7px, font-weight 700, letter-spacing 2px, text-transform uppercase, color = accent (lighter), margin-bottom 9px
Main area (two-col): same as single-column section headings but color = primary of dark palette

━━━ EXPERIENCE & EDUCATION ENTRIES ━━━

h3 for position/degree: font-size 11px, font-weight 700, color #111827, margin 0 0 1px
Company/school div: font-size 10px, font-weight 600, color = accent, margin-bottom 4px
Date range: font-size 8.5px, color #9CA3AF, display inline or right-aligned via flex justify-content space-between
Description bullets (use • or ▸ per style): font-size 9.5px, color #374151, line-height 1.55
Each bullet line: display flex, gap 5px, margin-bottom 3px
Bullet char: color = accent, font-weight 700, flex-shrink 0

━━━ SKILLS ━━━

Single-column: keyword pill tags — display inline-block, border 1px solid [accent], color = accent text, font-size 9px, padding 2px 8px, border-radius 3px, margin 2px 3px 2px 0
Sidebar (two-col): progress bars — name in muted white (9px), then bar: height 3px, background rgba(255,255,255,0.15), border-radius 2px; fill: background = accent, border-radius 2px, width = pseudo-level %

━━━ CONTENT RULES ━━━

1. SUMMARY: Generate a 2-3 sentence professional summary based ONLY on the actual experience and skills provided. Never use generic fillers. Tailor keywords to the domain and country conventions.
2. JOB TITLE: Use the provided "inferred title" or derive it from the most recent experience position.
3. BULLETS: Transform raw description text into 2-4 polished achievement bullets with action verbs and measurable impact (%, numbers, team size) wherever plausible.
4. OMIT empty sections entirely — no skills section if no skills, no education if no education, no languages if not provided.
5. NEVER hardcode languages ("English — Native") unless the candidate data explicitly includes language information.
6. NEVER repeat content across sections.
7. If domain is provided, weave domain-specific ATS keywords naturally into the summary and bullets.

━━━ COUNTRY CONVENTIONS ━━━

USA / Canada:
- NO photo, NO age, NO marital status, NO nationality
- USA: 1 page maximum; Canada: 2 pages max
- Section order: Summary → Experience → Education → Skills
- All bullets: strong past-tense action verb + measurable impact (%, $, number of users, time saved)
- Skills: use categorized format "Category: skill1, skill2, skill3"
- Location: city and state/province only. No full address.
- Education: show GPA only if provided. No "References available upon request."

UK / Ireland / Australia / New Zealand:
- NO photo, NO age
- Start with Personal Statement (3-4 sentences) instead of "Summary"
- UK: British English spelling (organise, colour, programme, practise)
- 2 pages max
- "References available upon request" optional at very bottom
- Location: city only

France / Belgium / Luxembourg:
- Section in main area: Accroche (3-4 sentences, professional tone), then Expérience Professionnelle, then Formation, then any remaining
- Sidebar: Contact, Compétences, Langues (only if provided)
- Tone: formal, professional French
- 2 pages max, A4

Switzerland:
- Extremely precise dates (month and year always)
- Language skills section in sidebar is mandatory if any data exists
- 2 pages max

Germany / Austria:
- Photo mandatory (always show placeholder initials circle)
- Very structured and precise
- Include Geburtsdatum if provided; otherwise omit
- 2 pages max

Spain / Portugal / Brazil / Italy:
- Photo in sidebar
- Objetivo profesional / Objetivo profissional at top of main area (2-3 sentences)
- Include CEFR language levels if provided
- 2 pages max

━━━ HTML QUALITY ━━━

- Use h1 for candidate name, h2 for section titles (with id attributes), h3 for job titles and degrees
- Section IDs: id="experience", id="education", id="skills", id="summary", id="languages"
- ONLY inline styles — zero <style> tags, zero class attributes, zero external CSS references (except the one Google Fonts <link>)
- NO <html>, <head>, <body>, <script> tags
- All text must be real selectable text — never replace text with images
- Use display:flex for all multi-column layouts
- Use box-sizing:border-box on all container divs
- Dates: "Mon YYYY – Mon YYYY" or "Mon YYYY – Present" format`;

const FRENCH_EUROPE = new Set(['France', 'Belgique', 'Suisse', 'Luxembourg']);
const LATIN_EUROPE  = new Set(['Espagne', 'Portugal', 'Brésil', 'Italie']);
const GERMAN_BLOCK  = new Set(['Allemagne', 'Autriche']);

function isTwoColumn(country: string): boolean {
  return FRENCH_EUROPE.has(country) || LATIN_EUROPE.has(country) || GERMAN_BLOCK.has(country);
}

function getLangName(code: string): string {
  const m: Record<string, string> = { en: 'English', fr: 'French', es: 'Spanish', pt: 'Portuguese' };
  return m[code] ?? 'English';
}

async function handler(req: Request) {
  try {
    const body = await req.json();
    const { personalInfo, workExperience, education, skills, skillCategories, preferences } = body;

    const country    = preferences.targetCountry ?? 'USA';
    const language   = preferences.language ?? 'en';
    const cvLanguage = getLangName(language);
    const twoCol     = isTwoColumn(country);

    const basePalette = PALETTE_COLORS[preferences.colorPalette as ColorPalette] ?? PALETTE_COLORS['blue-pro'];
    const palette     = preferences.customColor
      ? { primary: preferences.customColor, accent: preferences.customColor }
      : basePalette;

    const inferredTitle = (workExperience?.[0]?.position as string | undefined) ?? '';

    const hasCategories = skillCategories?.some((c: { items: string[] }) => c.items.length > 0);
    const skillsText = hasCategories
      ? (skillCategories as { name: string; items: string[] }[])
          .filter(c => c.items.length > 0)
          .map(c => `${c.name}: ${c.items.join(', ')}`)
          .join('\n')
      : ((skills as string[] | undefined)?.join(', ') ?? '');

    const weText = (workExperience as Array<{
      position: string; company: string;
      startDate: string; endDate: string; current: boolean; description: string;
    }>)?.length > 0
      ? workExperience.map((exp: {
          position: string; company: string;
          startDate: string; endDate: string; current: boolean; description: string;
        }, i: number) =>
          `[${i + 1}] ${exp.position} @ ${exp.company}\n` +
          `    ${exp.startDate} → ${exp.current ? 'Present' : exp.endDate}\n` +
          `    ${exp.description?.trim() || '(no description provided)'}`
        ).join('\n\n')
      : '(none provided)';

    const eduText = (education as Array<{
      degree: string; field: string; school: string;
      startDate: string; endDate: string; gpa?: string;
    }>)?.length > 0
      ? education.map((edu: {
          degree: string; field: string; school: string;
          startDate: string; endDate: string; gpa?: string;
        }, i: number) =>
          `[${i + 1}] ${edu.degree}${edu.field ? ` in ${edu.field}` : ''} — ${edu.school}\n` +
          `    ${edu.startDate} → ${edu.endDate}${edu.gpa ? ` | GPA: ${edu.gpa}` : ''}`
        ).join('\n\n')
      : '(none provided)';

    const userPrompt = `Generate a premium ${cvLanguage} CV for the candidate below.

━━━ CANDIDATE DATA ━━━

NAME: ${personalInfo.fullName || '(not provided)'}
EMAIL: ${personalInfo.email || '(not provided)'}
PHONE: ${personalInfo.phone || '(not provided)'}
LOCATION: ${personalInfo.location || '(not provided)'}${personalInfo.linkedin ? `\nLINKEDIN: ${personalInfo.linkedin}` : ''}${personalInfo.portfolio ? `\nWEBSITE/PORTFOLIO: ${personalInfo.portfolio}` : ''}

INFERRED JOB TITLE: ${inferredTitle || '(derive from work experience below)'}
DOMAIN / SECTOR: ${preferences.domain || '(not specified)'}
TARGET COUNTRY: ${country}
OUTPUT LANGUAGE: ${cvLanguage}

WORK EXPERIENCE:
${weText}

EDUCATION:
${eduText}

SKILLS:
${skillsText || '(none provided)'}

━━━ DESIGN SPECIFICATION ━━━

LAYOUT: ${twoCol ? 'Two-column — dark sidebar (left, 210px) + white main area (right)' : 'Single column, clean minimal'}
STYLE: ${preferences.style ?? 'Professional'}
SPACING: ${preferences.spacing ?? 'standard'}
PRIMARY COLOR: ${palette.primary}
ACCENT COLOR:  ${palette.accent}
${twoCol ? `SIDEBAR BACKGROUND: ${palette.primary}` : ''}
${preferences.fontStyle ? `FONT HINT: ${preferences.fontStyle}` : ''}

━━━ OUTPUT INSTRUCTIONS ━━━

1. Start your response with the Google Fonts <link> tag appropriate for ${country}
2. Then output the complete CV as a single <div> with inline styles
3. Outer div: max-width 794px, background #ffffff, min-height 1123px, box-sizing border-box, margin 0 auto
4. Follow all country conventions for ${country} exactly as specified in your system instructions
5. ${twoCol ? 'Use the two-column sidebar layout. Put photo placeholder (showing initials), Contact, Skills in the sidebar. Put Summary/Accroche, Experience, Education in the main area.' : 'Use single-column layout with full-width header, then Summary, Experience, Education, Skills in order.'}
6. Generate a professional 2-3 sentence summary/accroche based on the actual experience data
7. Transform each raw description into 2-4 polished achievement bullets
8. Omit any section whose data is "(none provided)"
9. Return ONLY the HTML — no explanations, no markdown fences`;

    let html = await callOpenRouter(MODEL, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ], 6000);

    html = html.trim().replace(/^```html\s*/i, '').replace(/\s*```$/i, '').trim();

    return NextResponse.json({ html });
  } catch (err: unknown) {
    console.error('CV generation error:', err);
    const msg = err instanceof Error ? err.message : 'Failed to generate CV';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = withFeatureCheck('CV_BUILDER_AI', handler);
