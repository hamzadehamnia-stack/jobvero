import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';
import { createClient } from '@/lib/supabase/server';

const MODEL = 'anthropic/claude-sonnet-4-6';

const EXTRACT_PROMPT = `You are a CV parser. Extract all information from this CV and return a JSON object matching exactly this structure:

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
      "id": string (short unique id: "w1", "w2" …),
      "company": string,
      "position": string,
      "startDate": string (format "YYYY-MM" — use "YYYY-01" if only year known),
      "endDate": string (format "YYYY-MM", empty string if current),
      "current": boolean,
      "description": string (combine bullet points into 2-4 sentence paragraph)
    }
  ],
  "education": [
    {
      "id": string (short unique id: "e1", "e2" …),
      "school": string,
      "degree": string,
      "field": string,
      "startDate": string (format "YYYY-MM"),
      "endDate": string (format "YYYY-MM", empty string if current),
      "current": boolean
    }
  ],
  "skills": string[] (individual skill/tool/language strings, max 20),
  "preferences": {
    "language": "en",
    "targetCountry": "USA",
    "style": "Professional"
  }
}

Rules:
- Return ONLY valid JSON. No markdown, no explanation, no code fences.
- Use empty string "" for any field not found (never null/undefined).
- Extract individual skills/tools, not full sentences.
- Always use the default preferences shown above.`;

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
