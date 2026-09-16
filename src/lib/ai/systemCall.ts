import type { SupabaseClient } from '@supabase/supabase-js';
import { openRouterHeaders, type ORMessage } from '@/lib/openrouter';

// ─── The catalogue's own way to call a model ──────────────────────────────────
//
// withAiAction covers a request a user pays for. This covers the rest: the
// calls made on a user's behalf by machinery they did not click — auto-apply's
// steps, the email finder, the inbox classifier. They were the ones that had
// drifted, each with its own fetch and its own model id written in the code,
// invisible to the catalogue, to the model guard and to the ledger.
//
// Here there is one way in. The model and the ceiling come from
// ai_action_costs — the action's own, or the step's, for an action whose work
// happens in several stages (limits.models.cv, limits.max_tokens.cv). The cost
// goes on a ledger row either way:
//   · usageId given — the call belongs to something already reserved, such as
//     one auto-apply application, and its cost joins that row. Refund the row
//     and the cost stays, which is what a failure should cost the house;
//   · no usageId — the call is free to the user, and gets its own system row
//     at zero credits, so it lands in cost_system_usd.

export interface CatalogueCallResult {
  text:             string;
  model:            string;
  promptTokens:     number | null;
  completionTokens: number | null;
  costUsd:          number | null;
  /** true when the model stopped because it ran out of room. */
  truncated:        boolean;
}

interface CatalogueAction {
  model:         string;
  maxTokens:     number;
  maxInputChars: number;
  limits:        Record<string, unknown>;
}

function stepValue<T>(limits: Record<string, unknown>, key: string, step: string | undefined, kind: 'string' | 'number'): T | null {
  if (!step) return null;
  const map = limits[key];
  if (typeof map !== 'object' || map === null) return null;
  const value = (map as Record<string, unknown>)[step];
  if (kind === 'string') return typeof value === 'string' && value !== '' ? (value as T) : null;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? (value as T) : null;
}

export async function readCatalogueAction(admin: SupabaseClient, action: string): Promise<CatalogueAction> {
  const { data, error } = await admin
    .from('ai_action_costs')
    .select('model, max_tokens, max_input_chars, limits, enabled')
    .eq('action', action)
    .maybeSingle();

  if (error) throw new Error(`catalogue read failed for ${action}: ${error.message}`);
  if (!data) throw new Error(`catalogue has no action ${action}`);
  if (!data.enabled) throw new Error(`action ${action} is disabled in the catalogue`);
  if (typeof data.model !== 'string' || typeof data.max_tokens !== 'number' || typeof data.max_input_chars !== 'number') {
    throw new Error(`catalogue row for ${action} is incomplete`);
  }

  return {
    model:         data.model,
    maxTokens:     data.max_tokens,
    maxInputChars: data.max_input_chars,
    limits:        (data.limits ?? {}) as Record<string, unknown>,
  };
}

export async function callCatalogueModel(admin: SupabaseClient, options: {
  /** The action in ai_action_costs this call belongs to. */
  action:          string;
  /** The step inside that action, when it has several (limits.models.<step>). */
  step?:           string;
  /** Whose call this is. Required: a cost with no owner cannot be explained. */
  userId:          string;
  /** The reserved usage row this cost belongs to; absent means a free system call. */
  usageId?:        string | null;
  messages:        ORMessage[];
  timeoutMs?:      number;
  responseFormat?: { type: string };
}): Promise<CatalogueCallResult> {
  const { action, step, userId, usageId, messages } = options;
  const config = await readCatalogueAction(admin, action);

  const model     = stepValue<string>(config.limits, 'models',     step, 'string') ?? config.model;
  const maxTokens = stepValue<number>(config.limits, 'max_tokens', step, 'number') ?? config.maxTokens;

  let text         = '';
  let promptTokens: number | null = null;
  let completionTokens: number | null = null;
  let costUsd: number | null = null;
  let truncated    = false;
  let failure: string | null = null;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method:  'POST',
      headers: openRouterHeaders(),
      body: JSON.stringify({
        model,
        messages,
        max_tokens:  maxTokens,
        temperature: 0.2,
        usage:       { include: true },
        ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenRouter ${res.status}: ${detail.slice(0, 200)}`);
    }

    const data = await res.json() as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?:   { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    };

    text             = data.choices?.[0]?.message?.content ?? '';
    truncated        = data.choices?.[0]?.finish_reason === 'length';
    promptTokens     = typeof data.usage?.prompt_tokens     === 'number' ? data.usage.prompt_tokens     : null;
    completionTokens = typeof data.usage?.completion_tokens === 'number' ? data.usage.completion_tokens : null;
    costUsd          = typeof data.usage?.cost              === 'number' ? data.usage.cost              : null;

    // A ceiling reached is a fact worth a line: it is how a cut answer is
    // noticed before a user reports something odd.
    if (truncated) console.warn(`[ai/${action}${step ? `.${step}` : ''}] the answer hit its ${maxTokens}-token ceiling and was cut`);
  } catch (err) {
    failure = String(err).slice(0, 300);
    throw err;
  } finally {
    // The call is logged whether it worked or not: a failed call is still billed
    // by OpenRouter, and an unexplained cost is worse than a bad one.
    const logged = usageId
      ? await admin.rpc('record_ai_call', {
          p_usage_id:          usageId,
          p_kind:              'model',
          p_model:             model,
          p_prompt_tokens:     promptTokens,
          p_completion_tokens: completionTokens,
          p_cost_usd:          costUsd,
          p_cost_estimated:    false,
          p_error:             failure,
        })
      : await admin.rpc('log_system_ai_usage', {
          p_user_id:           userId,
          p_action:            action,
          p_model:             model,
          p_prompt_tokens:     promptTokens,
          p_completion_tokens: completionTokens,
          p_cost_usd:          costUsd,
          p_cost_estimated:    false,
          p_error:             failure,
        });

    if (logged.error) console.error(`[ai/${action}] cost not logged for ${userId}:`, logged.error.message);
  }

  return { text, model, promptTokens, completionTokens, costUsd, truncated };
}
