import { NextResponse } from 'next/server';
import { isAiRefusal, withAiAction, type AiActionContext } from '@/lib/ai/withAiAction';

export const runtime     = 'nodejs';
export const maxDuration = 90;

export interface ATSResult {
  overall_score: number;
  keywords_score: number;
  skills_score: number;
  experience_score: number;
  education_score: number;
  missing_keywords: string[];
  strong_points: string[];
  recommendations: string[];
}

// The answer as JSON, however the model wrapped it: a code fence, a sentence
// before it, a word after it. Only what lies between the first { and the last }
// is parsed. A model told "pure JSON only" still adds prose now and then, and
// that is not worth a 500 on a call the user already paid for.
function readJsonObject(text: string): unknown {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start   = cleaned.indexOf('{');
  const end     = cleaned.lastIndexOf('}');
  if (start === -1 || end < start) throw new Error('no JSON object in the answer');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// A score the model did not give is not a zero: it is an answer we refuse,
// which refunds the credit rather than showing an invented number.
function score(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('a score is missing from the answer');
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function handler(req: Request, ai: AiActionContext) {
  try {
    const { cvText, jobDescription } = await req.json();

    if (!cvText?.trim() || !jobDescription?.trim()) {
      return NextResponse.json({ error: 'Missing CV text or job description' }, { status: 400 });
    }

    const systemPrompt =
      'You are an expert ATS (Applicant Tracking System) analyst. ' +
      'Analyze the provided CV against the job description. ' +
      'Return ONLY a valid JSON object with exactly these fields: ' +
      'overall_score (integer 0-100), ' +
      'keywords_score (integer 0-100), ' +
      'skills_score (integer 0-100), ' +
      'experience_score (integer 0-100), ' +
      'education_score (integer 0-100), ' +
      'missing_keywords (array of strings, max 12 important keywords from job description not found in CV), ' +
      'strong_points (array of strings, max 10 keywords/skills from job description found in CV), ' +
      'recommendations (array of 3-5 actionable string tips to improve the CV for this role). ' +
      'No explanation, no markdown, no code fences — pure JSON only.';

    const raw = await ai.complete([
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `JOB DESCRIPTION:\n${jobDescription}\n\nCV TEXT:\n${cvText}` },
    ]);

    const parsed = readJsonObject(raw) as ATSResult;

    const result: ATSResult = {
      ...parsed,
      overall_score:    score(parsed.overall_score),
      keywords_score:   score(parsed.keywords_score),
      skills_score:     score(parsed.skills_score),
      experience_score: score(parsed.experience_score),
      education_score:  score(parsed.education_score),
    };

    return NextResponse.json({ result });
  } catch (err: unknown) {
    if (isAiRefusal(err)) throw err; // answered by withAiAction: a refusal is not an error
    console.error('ATS score error:', err);
    return NextResponse.json(
      { error: 'Analysis failed' },
      { status: 500 },
    );
  }
}

export const POST = withAiAction({ feature: 'ATS_SCORE', action: 'match_score' }, handler);
