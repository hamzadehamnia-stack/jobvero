import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';
import { withFeatureCheck } from '@/lib/subscription/withFeatureCheck';

const MODEL = 'anthropic/claude-sonnet-4.6';

const DESCRIBE_PROMPT = `You are a CV builder AI assistant. A user has described their professional profile in free text — it may be a rough paragraph, bullet points, a structured narrative, or a mix. Extract all information and return a JSON object with exactly this structure.

{
  "personalInfo": {
    "fullName": string (extract if mentioned, otherwise ""),
    "email": string (extract if mentioned, otherwise ""),
    "phone": string (extract if mentioned, otherwise ""),
    "location": string (city + country if determinable, otherwise ""),
    "linkedin": string (extract if mentioned, otherwise ""),
    "portfolio": string (extract if mentioned, otherwise "")
  },
  "workExperience": [
    {
      "id": string ("w1", "w2", ... ordered most-recent first),
      "company": string (exact name if given; "Freelance" if self-employed; infer from context if clear),
      "position": string (job title — infer from context if not stated explicitly),
      "startDate": string ("YYYY-MM" — estimate from context: "3 years ago" → current year minus 3; "since 2019" → "2019-01"),
      "endDate": string ("YYYY-MM" — empty string if current),
      "current": boolean,
      "description": string (3-5 sentences capturing responsibilities, technologies used, and achievements — write in professional past tense for past roles)
    }
  ],
  "education": [
    {
      "id": string ("e1", "e2", ...),
      "school": string,
      "degree": string,
      "field": string,
      "startDate": string ("YYYY-MM"),
      "endDate": string ("YYYY-MM"),
      "current": boolean,
      "gpa": string (only if explicitly mentioned)
    }
  ],
  "skills": string[] (
    Extract every skill, tool, technology, framework, programming language, and certification mentioned.
    - Split compound mentions: "React and Node.js" → ["React", "Node.js"]
    - Keep technical names exact: "TypeScript", "PostgreSQL", "AWS", "Figma"
    - Include soft skills only if explicitly named (e.g. "project management", "team leadership")
    - Do NOT include generic phrases ("good communicator", "hard worker")
    - Maximum 20 — prioritize technical/hard skills
  ),
  "preferences": {
    "language": string ("en" | "fr" | "es" | "pt" — detect from the description language; if target country is France/Belgium/Switzerland → "fr"; Spain/Latin America → "es"; Brazil/Portugal → "pt"; default "en"),
    "targetCountry": string (infer from: location mentioned, company names, country references — default "USA"),
    "domain": string (infer professional domain: "Software Engineering", "Marketing", "Finance", "Healthcare", "Design", "Sales", "Data Science", "Product Management", etc. — leave "" if truly unclear),
    "style": "Professional",
    "colorPalette": "blue-pro",
    "layout": "1-column",
    "fontStyle": "sans-serif",
    "spacing": "standard"
  }
}

EXTRACTION RULES:
1. Return ONLY valid JSON. No markdown, no explanation, no code fences.
2. Use empty string "" for missing scalar fields. Use [] for empty arrays. Never null or undefined.
3. Be generous — infer job titles, dates, and company names from context clues.
4. If the user mentions "X years of experience" without dates, set endDate to current year and startDate to current year minus X.
5. If multiple jobs are implied but not clearly separated, create separate entries based on context clues (company name change, date reference, "then I moved to").
6. For internships or academic projects mentioned as work experience, include them with position = "Intern" or "Student Project" and note the institution as company.
7. Generate the description field with professional language — do not copy the user's raw informal text verbatim; rewrite it in CV-appropriate tone.`;

async function handler(req: Request) {
  try {
    const { description } = await req.json();
    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json({ error: 'No description provided' }, { status: 400 });
    }

    const raw = await callOpenRouter(MODEL, [{
      role: 'user',
      content: `${DESCRIBE_PROMPT}\n\nUSER DESCRIPTION:\n"""\n${description.slice(0, 8000)}\n"""`,
    }], 3000);

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
