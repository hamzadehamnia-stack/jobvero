import { NextResponse } from 'next/server';
import { isAiRefusal, withAiAction, type AiActionContext } from '@/lib/ai/withAiAction';
import { readJsonObject, readScore } from '@/lib/ai/json';

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
      overall_score:    readScore(parsed.overall_score,    'overall_score'),
      keywords_score:   readScore(parsed.keywords_score,   'keywords_score'),
      skills_score:     readScore(parsed.skills_score,     'skills_score'),
      experience_score: readScore(parsed.experience_score, 'experience_score'),
      education_score:  readScore(parsed.education_score,  'education_score'),
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
