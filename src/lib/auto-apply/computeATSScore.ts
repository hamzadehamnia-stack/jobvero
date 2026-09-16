import type { SupabaseClient } from '@supabase/supabase-js';
import { readJsonObject, readScore } from '@/lib/ai/json';
import { callCatalogueModel } from '@/lib/ai/systemCall';

/**
 * Computes an ATS match score (0–100) between a CV text and a job description.
 *
 * The model and the ceiling come from ai_action_costs.system_auto_apply_screening
 * — this used to pin a preview id and 64 tokens in the code, where nothing could
 * see either. The call is free to the user and lands on a zero-credit system
 * row, so screening shows up in cost_system_usd: it happens before any
 * application is decided, and a user must not pay for a job we then skip.
 *
 * Throws when the answer cannot be read: an invented score would decide whether
 * someone applies.
 */
export async function computeATSScore(options: {
  admin:          SupabaseClient;
  userId:         string;
  cvText:         string;
  jobDescription: string;
}): Promise<number> {
  const systemPrompt =
    'You are an expert ATS (Applicant Tracking System) analyst. ' +
    'Analyze the provided CV against the job description. ' +
    'Return ONLY a valid JSON object with exactly one field: ' +
    'overall_score (integer 0-100 representing how well the CV matches the job). ' +
    'No explanation, no markdown, no code fences — pure JSON only.';

  const { text } = await callCatalogueModel(options.admin, {
    action:  'system_auto_apply_screening',
    userId:  options.userId,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `JOB DESCRIPTION:\n${options.jobDescription}\n\nCV TEXT:\n${options.cvText}` },
    ],
    timeoutMs: 20_000,
  });

  const parsed = readJsonObject(text) as Record<string, unknown>;
  return readScore(parsed.overall_score, 'overall_score');
}
