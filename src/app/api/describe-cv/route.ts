import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';
import { withFeatureCheck } from '@/lib/subscription/withFeatureCheck';

const MODEL = 'anthropic/claude-sonnet-4-6';

const DESCRIBE_PROMPT = `You are a CV builder AI assistant. A user has described their professional profile in free text.
Extract all information and return a JSON object with exactly this structure:

{
  "personalInfo": {
    "fullName": string,
    "email": string,
    "phone": string,
    "location": string,
    "linkedin": string,
    "portfolio": string
  },
  "workExperience": [
    {
      "id": string ("w1", "w2", ...),
      "company": string,
      "position": string,
      "startDate": string (format "YYYY-MM", use "YYYY-01" if only year known),
      "endDate": string (format "YYYY-MM", empty string if current),
      "current": boolean,
      "description": string (2-4 sentence paragraph summarizing responsibilities and achievements)
    }
  ],
  "education": [
    {
      "id": string ("e1", "e2", ...),
      "school": string,
      "degree": string,
      "field": string,
      "startDate": string (format "YYYY-MM"),
      "endDate": string (format "YYYY-MM"),
      "current": boolean,
      "gpa": string (if mentioned, otherwise "")
    }
  ],
  "skills": string[] (individual skills, tools, languages — max 20),
  "preferences": {
    "language": "en" | "fr" | "es" | "pt" (infer from description language or target country),
    "targetCountry": string (infer from location/companies mentioned, default "USA"),
    "domain": string (infer professional domain if clear, otherwise ""),
    "style": "Professional",
    "colorPalette": "blue-pro",
    "layout": "1-column",
    "fontStyle": "sans-serif",
    "spacing": "standard"
  }
}

Rules:
- Return ONLY valid JSON. No markdown, no explanation, no code fences.
- Use empty string "" for any field not found (never null/undefined).
- Use empty arrays [] for arrays when nothing is mentioned.
- Be generous in extracting info — infer job titles, durations, skills from context clues.
- If years of experience are mentioned without specific dates, estimate plausible start/end dates.
- Extract individual skills mentioned anywhere (programming languages, tools, soft skills).`;

async function handler(req: Request) {
  try {
    const { description } = await req.json();
    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json({ error: 'No description provided' }, { status: 400 });
    }

    const raw = await callOpenRouter(MODEL, [{
      role: 'user',
      content: `${DESCRIBE_PROMPT}\n\nUSER DESCRIPTION:\n"""\n${description.slice(0, 8000)}\n"""`,
    }], 2048);

    const json = raw.trim()
      .replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const data = JSON.parse(json);

    return NextResponse.json({ data });
  } catch (err: unknown) {
    console.error('[/api/describe-cv]', err);
    const message = err instanceof Error ? err.message : 'Failed to process description';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withFeatureCheck('CV_BUILDER_AI', handler);
