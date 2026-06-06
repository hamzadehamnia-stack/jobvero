import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';
import { withFeatureCheck } from '@/lib/subscription/withFeatureCheck';

const MODEL = 'google/gemini-3-flash-preview';

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

async function handler(req: Request) {
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

    let raw = await callOpenRouter(MODEL, [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `JOB DESCRIPTION:\n${jobDescription}\n\nCV TEXT:\n${cvText}` },
    ], 1024);

    raw = raw.replace(/^```json\n?/i, '').replace(/^```\n?/i, '').replace(/\n?```$/i, '').trim();

    const result: ATSResult = JSON.parse(raw);

    result.overall_score    = Math.max(0, Math.min(100, Math.round(result.overall_score)));
    result.keywords_score   = Math.max(0, Math.min(100, Math.round(result.keywords_score)));
    result.skills_score     = Math.max(0, Math.min(100, Math.round(result.skills_score)));
    result.experience_score = Math.max(0, Math.min(100, Math.round(result.experience_score)));
    result.education_score  = Math.max(0, Math.min(100, Math.round(result.education_score)));

    return NextResponse.json({ result });
  } catch (err: unknown) {
    console.error('ATS score error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 },
    );
  }
}

export const POST = withFeatureCheck('ATS_SCORE', handler);
