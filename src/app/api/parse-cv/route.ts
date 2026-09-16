import { NextResponse } from 'next/server';
import { isAiRefusal, withAiAction, type AiActionContext } from '@/lib/ai/withAiAction';
import { readJsonObject } from '@/lib/ai/json';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';

export const runtime     = 'nodejs';
export const maxDuration = 120;

const TIMEOUT_MS = 100_000;

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

async function readPdf(buffer: Buffer): Promise<{ text: string; pages: number }> {
  const pdfParse = require('pdf-parse') as (data: Uint8Array) => Promise<{ text: string; numpages: number }>;
  // A plain Uint8Array copy, never the Buffer itself: the pdf.js 1.10 inside
  // pdf-parse misreads Node Buffers — a pooled Buffer is read from the wrong
  // offset ("bad XRef entry"), and some files fail even at offset 0 ("Invalid
  // number"). The copy also leaves the Buffer intact for the vision path.
  const result = await pdfParse(new Uint8Array(buffer));
  return { text: result.text, pages: result.numpages };
}

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

const parseJson = (raw: string): unknown => readJsonObject(raw);

// The CV text gets what the catalogue's max_input_chars leaves after the
// prompt, so a long CV is cut rather than refused.
async function parseViaText(ai: AiActionContext, text: string): Promise<unknown> {
  const before = `${EXTRACT_PROMPT}\n\nCV TEXT:\n"""\n`;
  const after  = '\n"""';
  const room   = Math.max(0, ai.action.maxInputChars - before.length - after.length);

  const raw = await ai.complete([{
    role:    'user',
    content: `${before}${text.slice(0, room)}${after}`,
  }], { timeoutMs: TIMEOUT_MS });

  return parseJson(raw);
}

// Uses OpenRouter with Anthropic model — passes the document block through
// natively. max_input_chars counts only the text part: the document itself is
// bounded by the page count, checked before this runs.
async function parseViaPDFVision(ai: AiActionContext, buffer: Buffer): Promise<unknown> {
  const raw = await ai.complete([{
    role: 'user',
    content: [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: buffer.toString('base64'),
        },
      },
      {
        type: 'text',
        text: EXTRACT_PROMPT,
      },
    ],
  }], { timeoutMs: TIMEOUT_MS });

  return parseJson(raw);
}

// Everything up to the model call is free: a file refused here costs nothing.
async function handler(req: Request, ai: AiActionContext) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    // Both the declared type and the extension have to be acceptable. The
    // previous condition was `!allowedTypes.includes(type) && !name.match(...)`,
    // an OR in disguise: either check passing was enough, so any content at all
    // got through under the name "cv.pdf".
    const extensionOk = /\.(pdf|docx|doc)$/i.test(file.name);
    const typeOk      = allowedTypes.includes(file.type) || file.type === '';
    if (!extensionOk || !typeOk) {
      return NextResponse.json({ error: 'Only PDF and Word files are supported' }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 5 MB' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Content sniffing, because neither the filename nor the browser-supplied
    // Content-Type is evidence of anything. A PDF starts with %PDF-, and .docx
    // is a zip so it starts with PK. This is what decides which parser runs.
    const magic     = buffer.subarray(0, 4);
    const looksPDF  = magic.toString('latin1', 0, 4) === '%PDF';
    const looksZip  = magic[0] === 0x50 && magic[1] === 0x4b; // PK — .docx
    const looksDoc  = magic.readUInt32BE(0) === 0xd0cf11e0;   // legacy .doc (OLE2)

    if (!looksPDF && !looksZip && !looksDoc) {
      return NextResponse.json(
        { error: 'That file is not a readable PDF or Word document.' },
        { status: 400 },
      );
    }

    const isPDF = looksPDF;

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
        parsed = await parseViaText(ai, text);
      } catch (err) {
        if (isAiRefusal(err)) throw err;
        console.error('[parse-cv] text parse error:', err);
        return NextResponse.json({ error: 'AI could not extract CV data. Please try again.' }, { status: 500 });
      }

    } else {
      // What a PDF costs grows with its pages, capped by the catalogue, and the
      // count is only known once the file is parsed. A PDF that cannot be parsed
      // cannot be counted, so it is refused — before anything is charged.
      const maxPages = ai.action.limits.max_pdf_pages;
      if (typeof maxPages !== 'number' || !Number.isInteger(maxPages) || maxPages < 1) {
        console.error('[parse-cv] ai_action_costs.limits.max_pdf_pages is missing or invalid:', maxPages);
        return NextResponse.json({ error: 'CV import is temporarily unavailable' }, { status: 503 });
      }

      let pdf: { text: string; pages: number };
      try {
        pdf = await readPdf(buffer);
      } catch (err) {
        console.error('[parse-cv] pdf-parse error:', err instanceof Error ? err.message : err);
        pdf = { text: '', pages: Number.NaN };
      }

      if (!Number.isInteger(pdf.pages) || pdf.pages < 1) {
        return NextResponse.json(
          { error: 'Could not read this PDF. Try uploading a Word document instead.' },
          { status: 422 },
        );
      }

      if (pdf.pages > maxPages) {
        return NextResponse.json(
          { error: `The PDF has ${pdf.pages} pages; a CV can have at most ${maxPages}.`, reason: 'too_many_pages' },
          { status: 413 },
        );
      }

      const hasEmbeddedText = pdf.text.replace(/\s/g, '').length >= 80;

      if (hasEmbeddedText) {
        try {
          parsed = await parseViaText(ai, pdf.text);
        } catch (err) {
          if (isAiRefusal(err)) throw err;
          console.error('[parse-cv] text parse error:', err);
          return NextResponse.json({ error: 'AI could not extract CV data. Please try again.' }, { status: 500 });
        }
      } else {
        console.log('[parse-cv] no embedded text — using PDF vision');
        try {
          parsed = await parseViaPDFVision(ai, buffer);
        } catch (err) {
          if (isAiRefusal(err)) throw err;
          console.error('[parse-cv] vision parse error:', err instanceof Error ? err.message : err);
          return NextResponse.json({
            error: 'Could not extract CV data from this PDF. Try uploading a Word document instead.',
          }, { status: 422 });
        }
      }
    }

    return NextResponse.json({ data: parsed });
  } catch (err: unknown) {
    if (isAiRefusal(err)) throw err; // answered by withAiAction: a refusal is not an error
    console.error('[/api/parse-cv]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withAiAction(
  { feature: 'CV_BUILDER_AI', action: 'cv_import', rateLimit: RATE_LIMITS.PARSE_CV },
  handler,
);
