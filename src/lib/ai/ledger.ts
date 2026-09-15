import type { SupabaseClient } from '@supabase/supabase-js';
import type { StreamUsage } from './sse';

export type CallKind = 'model' | 'stt' | 'tts';

/**
 * One upstream call in the ledger: its real cost when the response carried one,
 * else pending on the generation id for the ai-ledger cron, else logged with
 * the reason there is no cost. Never throws: a ledger write that fails is
 * logged, and the user's answer does not depend on it.
 */
export async function recordAiCall(admin: SupabaseClient, call: {
  tag:          string;
  usageId:      string;
  kind:         CallKind;
  model:        string;
  usage:        StreamUsage | null;
  generationId: string | null;
  failure:      string | null;
}): Promise<void> {
  const common  = { p_usage_id: call.usageId, p_kind: call.kind, p_model: call.model };
  const costUsd = call.usage?.costUsd ?? null;

  const { error } =
    call.usage && costUsd !== null
      ? await admin.rpc('record_ai_call', {
          ...common,
          p_prompt_tokens:     call.usage.promptTokens,
          p_completion_tokens: call.usage.completionTokens,
          p_cost_usd:          costUsd,
          p_error:             call.failure,
        })
      : call.generationId
        ? await admin.rpc('record_ai_call_pending', { ...common, p_generation_id: call.generationId, p_error: call.failure })
        : await admin.rpc('record_ai_call', { ...common, p_error: call.failure ?? 'no cost and no generation id in the response' });

  if (error) console.error(`${call.tag} cost logging failed for ${call.usageId}:`, error.message);
}
