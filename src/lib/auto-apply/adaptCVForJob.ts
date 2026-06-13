import { callOpenRouter } from '@/lib/openrouter';

export interface AdaptCVOptions {
  cvContent:       Record<string, unknown>;
  jobTitle:        string;
  company:         string;
  jobDescription:  string;
  accentColor?:    string;
}

const SYSTEM_PROMPT = `You are an expert ATS-optimised CV writer.

OUTPUT CONTRACT
- Return ONLY a complete, self-contained HTML document. No markdown fences, no commentary.
- The HTML must be printable to A4 (794 × 1123 px) with zero external dependencies except Google Fonts.

VISUAL SPEC
- Font: Inter from Google Fonts (weights 400, 600, 700).
- Header background: the accent color passed in the user message; white text.
- Single-column layout; generous whitespace; section headings in small-caps.
- ATS-safe: no tables, no columns, no text boxes, no images. Plain semantic HTML + inline/embedded CSS only.

TAILORING PROCESS — follow exactly, in order:
Step 1 (INTERNAL — do NOT output): Extract the top 8 ATS keywords from the job description (titles, skills, tools, methodologies).
Step 2: Rewrite the summary/profile section (3 sentences max). Open with the exact job title from the posting. Weave in ≥ 4 of the 8 keywords naturally.
Step 3: For each work experience entry, rewrite ONLY the first bullet point to reflect the most relevant keyword from that role's context. Leave all other bullets unchanged.
Step 4: Reorder the skills list so the 8 ATS keywords appear first, then remaining skills alphabetically.

ABSOLUTE CONSTRAINTS
- Never invent a skill, tool, company, date, title, or achievement the candidate did not already have.
- Never remove existing content — only reorder or lightly reword.
- Preserve every contact field, every date, every job entry exactly as provided.`;

export async function adaptCVForJob(opts: AdaptCVOptions): Promise<string> {
  const { cvContent, jobTitle, company, jobDescription, accentColor = '#6d28d9' } = opts;

  const userMessage = `TARGET ROLE: ${jobTitle} at ${company}
ACCENT COLOR: ${accentColor}
JOB DESCRIPTION:
${jobDescription.slice(0, 1500)}
CANDIDATE CV DATA (JSON):
${JSON.stringify(cvContent, null, 2).slice(0, 4000)}`;

  const raw = await callOpenRouter(
    'anthropic/claude-sonnet-4-5',
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userMessage },
    ],
    4000,
  );

  // Strip any accidental markdown code fences
  return raw
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/,       '')
    .replace(/\s*```$/,       '')
    .trim();
}
