import { callOpenRouter } from '@/lib/openrouter';

const MODEL = 'google/gemini-3-flash-preview';

/**
 * Computes an ATS match score (0–100) between a CV text and a job description.
 * Uses Gemini Flash for speed and low cost. Called only for Premium users.
 */
export async function computeATSScore(cvText: string, jobDescription: string): Promise<number> {
  const systemPrompt =
    'You are an expert ATS (Applicant Tracking System) analyst. ' +
    'Analyze the provided CV against the job description. ' +
    'Return ONLY a valid JSON object with exactly one field: ' +
    'overall_score (integer 0-100 representing how well the CV matches the job). ' +
    'No explanation, no markdown, no code fences — pure JSON only.';

  let raw = await callOpenRouter(MODEL, [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: `JOB DESCRIPTION:\n${jobDescription}\n\nCV TEXT:\n${cvText}` },
  ], 64);

  raw = raw.replace(/^```json\n?/i, '').replace(/^```\n?/i, '').replace(/\n?```$/i, '').trim();
  const parsed = JSON.parse(raw) as { overall_score: number };
  return Math.max(0, Math.min(100, Math.round(Number(parsed.overall_score))));
}
