import type { SupabaseClient } from '@supabase/supabase-js';
import type { ORMessage } from '@/lib/openrouter';
import { recordAiCall } from './ledger';
import { streamOpenRouterMetered, UpstreamError, type StreamSummary } from './openrouterMetered';
import { AiRefusalError } from './refusal';

// ─── Session turns ────────────────────────────────────────────────────────────
//
// One streamed model call inside a session (chat, interview), billed by the
// streaming rules decided for step 2d:
//   · the session's credit is settled at the first content chunk. Only a call
//     that fails before any content is refunded, and only while the session is
//     still unpaid; a client that leaves mid-stream is not refunded;
//   · the call's cost is recorded when the stream is over, from the usage block
//     of the last SSE chunk, or left pending on the generation id for the
//     ai-ledger cron;
//   · a turn that completed advances the session's turn counter. One cut short
//     does not, nor one its route rejects (onComplete answering false), so
//     asking again replays the same turn;
//   · a turn given an endReason ends the session once it has advanced: an
//     interview after its report. A session that has ended no longer advances.

export interface SessionCharge {
  usageId:   string;
  sessionId: string;
  /** The session's credit is still reserved: this call settles it, or refunds it. */
  reserved:  boolean;
}

export async function streamSessionTurn(options: {
  admin:         SupabaseClient;
  tag:           string;
  charge:        SessionCharge;
  model:         string;
  maxTokens:     number;
  messages:      ORMessage[];
  clientSignal?: AbortSignal;
  /** The whole answer, once the stream completed. Answering false keeps the turn open. */
  onComplete?:   (text: string) => Promise<boolean>;
  /** Ends the session with this reason once the turn has completed and advanced. */
  endReason?:    string;
}): Promise<ReadableStream<Uint8Array>> {
  const { admin, tag, charge, model } = options;

  const refund = async (reason: string): Promise<void> => {
    const { error } = await admin.rpc('refund_ai_usage', { p_usage_id: charge.usageId, p_error: reason.slice(0, 500) });
    if (error) console.error(`${tag} refund failed for ${charge.usageId}:`, error.message);
  };

  try {
    return await streamOpenRouterMetered({
      model,
      messages:     options.messages,
      maxTokens:    options.maxTokens,
      clientSignal: options.clientSignal,
      lifecycle: {
        async onFirstContent() {
          if (!charge.reserved) return;
          const { error } = await admin.rpc('settle_ai_usage', { p_usage_id: charge.usageId });
          // Left reserved, the credit goes back through the stale-reservation
          // cron and the user keeps the session for free. Rare, and loud.
          if (error) console.error(`${tag} settle failed for ${charge.usageId}:`, error.message);
        },

        async onEnd(summary: StreamSummary) {
          await recordAiCall(admin, {
            tag,
            usageId:      charge.usageId,
            kind:         'model',
            model,
            usage:        summary.usage,
            generationId: summary.generationId,
            failure:      summary.error?.message ?? (summary.clientAborted ? 'client left mid-stream' : null),
          });

          if (!summary.contentSeen) {
            if (charge.reserved) await refund(summary.error?.message ?? 'no content before the stream ended');
            return;
          }

          if (summary.error || summary.clientAborted) return;

          if (options.onComplete) {
            let accepted = false;
            try {
              accepted = await options.onComplete(summary.text);
            } catch (err) {
              console.error(`${tag} completing the turn failed:`, err);
            }
            if (!accepted) return;
          }

          const { error } = await admin.rpc('advance_ai_session_turn', { p_session_id: charge.sessionId });
          if (error) console.error(`${tag} turn not advanced for ${charge.sessionId}:`, error.message);

          if (options.endReason) {
            const { error: endError } = await admin.rpc('end_ai_session', {
              p_session_id: charge.sessionId,
              p_reason:     options.endReason,
            });
            if (endError) console.error(`${tag} session ${charge.sessionId} not ended:`, endError.message);
          }
        },
      },
    });
  } catch (err) {
    // Refused before any stream existed: no lifecycle call has happened.
    const upstream = err instanceof UpstreamError ? err : new UpstreamError(String(err), null, null);
    console.error(`${tag} upstream failed:`, upstream.message);
    await recordAiCall(admin, {
      tag,
      usageId:      charge.usageId,
      kind:         'model',
      model,
      usage:        null,
      generationId: upstream.generationId,
      failure:      upstream.message,
    });
    if (charge.reserved) await refund(upstream.message);
    throw new AiRefusalError({ status: 502, body: { error: 'AI temporarily unavailable', reason: 'ai_unavailable' } });
  }
}
