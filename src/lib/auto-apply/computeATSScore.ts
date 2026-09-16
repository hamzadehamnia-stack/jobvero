import { callOpenRouter } from '@/lib/openrouter';
import { readJsonObject, readScore } from '@/lib/ai/json';

// The model was google/gemini-3-flash-preview — a preview id, against the rule
// that nothing we bill runs on one, and the same family that broke the ATS
// score. It is now the stable id the catalogue pins for the same work.
//
// The ceiling was 64 tokens. Measured on 2026-09-16, the model spends 61 of
// them before writing any JSON and the answer comes back cut off and empty:
// this function threw on every call. 256 leaves room, as
// ai_action_costs.system_auto_apply_screening now says.
//
// This call still does not go through the catalogue or the credit ledger —
// wiring auto-apply to both is the work of its own block.
const MODEL      = 'google/gemini-3.8-flash';
const MAX_TOKENS = 256;

/**
 * Computes an ATS match score (0–100) between a CV text and a job description.
 * Throws when the model's answer cannot be read: an invented score would be
 * taken for a real one and decide whether a user applies.
 */
export async function computeATSScore(cvText: string, jobDescription: string): Promise<number> {
  const systemPrompt =
    'You are an expert ATS (Applicant Tracking System) analyst. ' +
    'Analyze the provided CV against the job description. ' +
    'Return ONLY a valid JSON object with exactly one field: ' +
    'overall_score (integer 0-100 representing how well the CV matches the job). ' +
    'No explanation, no markdown, no code fences — pure JSON only.';

  const raw = await callOpenRouter(MODEL, [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: `JOB DESCRIPTION:\n${jobDescription}\n\nCV TEXT:\n${cvText}` },
  ], MAX_TOKENS);

  const parsed = readJsonObject(raw) as Record<string, unknown>;
  return readScore(parsed.overall_score, 'overall_score');
}
