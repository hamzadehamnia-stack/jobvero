import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';
import { createClient } from '@/lib/supabase/server';

const MODEL = 'anthropic/claude-sonnet-4.6';

const EXTRACT_PROMPT = `You are a precision CV parser. Extract ALL information from the provided CV text and return a single JSON object matching exactly this structure. Handle any CV format: chronological, functional, academic, creative, ATS-plain-text.

{
  "personalInfo": {
    "fullName": string (full name as written — preserve accents and capitalization),
    "email": string (lowercase),
    "phone": string (preserve original format with country code if present),
    "location": string (city + country/state if present — not full address),
    "linkedin": string (extract only the profile path or full URL — e.g. "linkedin.com/in/username"),
    "portfolio": string (personal website, GitHub URL, or portfolio URL — not LinkedIn)
  },
  "workExperience": [
    {
      "id": string ("w1", "w2", … — ordered most-recent first),
      "company": string (exact company name as written),
      "position": string (exact job title as written — do not paraphrase or abbreviate),
      "startDate": string ("YYYY-MM" — use "YYYY-01" if only year known; estimate if described as "3 years ago" based on current year),
      "endDate": string ("YYYY-MM" — empty string "" if current or ongoing),
      "current": boolean (true only if role is explicitly marked as current/present/ongoing),
      "description": string (preserve ALL bullet points and responsibilities as a single paragraph; join with ". "; keep original language and terminology)
    }
  ],
  "education": [
    {
      "id": string ("e1", "e2", … — ordered most-recent first),
      "school": string (exact institution name),
      "degree": string (exact degree name: Bachelor, Master, PhD, MBA, BTS, Licence, etc.),
      "field": string (field of study / major / specialization — separate from degree),
      "startDate": string ("YYYY-MM" — "YYYY-01" if only year known),
      "endDate": string ("YYYY-MM" — empty string if current),
      "current": boolean,
      "gpa": string (only if explicitly stated — otherwise empty string "")
    }
  ],
  "skills": string[] (
    Extract every individual skill, tool, technology, framework, language, and certification mentioned ANYWHERE in the CV.
    Rules:
    - One item per skill — never combine ("React, Node.js" → ["React", "Node.js"])
    - Keep exact names: "TypeScript" not "typescript", "React.js" not "reactjs"
    - Include certifications as skills (e.g. "AWS Certified Solutions Architect")
    - Include spoken/written languages only if listed in a Skills or Languages section
    - Maximum 20 items — prioritize technical/hard skills over soft skills
    - Do NOT include generic phrases like "good communicator" or "team player"
  ),
  "preferences": {
    "language": string (detect output language from CV content: "en" | "fr" | "es" | "pt" — default "en"),
    "targetCountry": string (infer from location, company names, or degree institution — default "USA"),
    "style": "Professional"
  }
}

PARSING RULES:
1. Return ONLY valid JSON. No markdown fences, no explanation, no trailing text.
2. Use empty string "" for any missing scalar field. Use [] for missing arrays. Never use null or undefined.
3. Work experience: if multiple roles at the same company, create a separate entry for each.
4. Dates: if a role says "2020 – 2023", use startDate "2020-01" endDate "2023-01". If "Jan 2021 – Mar 2023", use "2021-01" and "2023-03".
5. If the CV contains a Summary, Objective, or Profile section, include it as the description of the first work experience entry prefixed with "[Summary] " — do not create a separate field.
6. Freelance / consulting / self-employed roles: use "Freelance" or "Self-employed" as the company name.
7. Skills from "Certifications" sections: add them to the skills array verbatim.`;

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return result.text;
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function parseViaText(text: string): Promise<unknown> {
  const raw = await callOpenRouter(MODEL, [{
    role: 'user',
    content: `${EXTRACT_PROMPT}\n\nCV TEXT:\n"""\n${text.slice(0, 12000)}\n"""`,
  }], 2048);

  const json = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  return JSON.parse(json);
}

// Uses OpenRouter with Anthropic model — passes the document block through natively
async function parseViaPDFVision(buffer: Buffer): Promise<unknown> {
  const base64 = buffer.toString('base64');

  const raw = await callOpenRouter(MODEL, [{
    role: 'user',
    content: [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64,
        },
      },
      {
        type: 'text',
        text: EXTRACT_PROMPT,
      },
    ],
  }], 2048);

  const json = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  return JSON.parse(json);
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|docx|doc)$/i)) {
      return NextResponse.json({ error: 'Only PDF and Word files are supported' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 5 MB' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    let parsed: unknown;

    if (!isPDF) {
      let text = '';
      try {
        text = await extractTextFromDocx(buffer);
      } catch (err) {
        console.error('[parse-cv] docx error:', err instanceof Error ? err.message : err);
        return NextResponse.json({ error: 'Could not read Word file. Make sure it is a valid .docx document.' }, { status: 422 });
      }
      if (!text.trim()) {
        return NextResponse.json({ error: 'No readable text found in the Word file.' }, { status: 422 });
      }
      try {
        parsed = await parseViaText(text);
      } catch (err) {
        console.error('[parse-cv] text parse error:', err);
        return NextResponse.json({ error: 'AI could not extract CV data. Please try again.' }, { status: 500 });
      }

    } else {
      let text = '';
      try {
        text = await extractTextFromPDF(buffer);
      } catch (err) {
        console.error('[parse-cv] pdf-parse error:', err instanceof Error ? err.message : err);
      }

      const hasEmbeddedText = text.replace(/\s/g, '').length >= 80;

      if (hasEmbeddedText) {
        try {
          parsed = await parseViaText(text);
        } catch (err) {
          console.error('[parse-cv] text parse error:', err);
          return NextResponse.json({ error: 'AI could not extract CV data. Please try again.' }, { status: 500 });
        }
      } else {
        console.log('[parse-cv] no embedded text — using PDF vision');
        try {
          parsed = await parseViaPDFVision(buffer);
        } catch (err) {
          console.error('[parse-cv] vision parse error:', err instanceof Error ? err.message : err);
          return NextResponse.json({
            error: 'Could not extract CV data from this PDF. Try uploading a Word document instead.',
          }, { status: 422 });
        }
      }
    }

    return NextResponse.json({ data: parsed });
  } catch (err: unknown) {
    console.error('[/api/parse-cv]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
