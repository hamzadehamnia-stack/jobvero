import { createAdminClient } from '@/lib/supabase/admin';
import { fetchGenerationCost } from '@/lib/ai/openrouterMetered';
import { timingSafeCompare } from '@/lib/timingSafe';

// ─── AI ledger maintenance ────────────────────────────────────────────────────
//
// Two jobs the request path must never wait for. Runs every 5 minutes
// (vercel.json).
//
//   1. refund_stale_ai_reservations(): charges that never settled because the
//      request died between the reservation and the settlement. Anything
//      reserved for more than 15 minutes is refunded.
//
//   2. Deferred costs: calls recorded as 'pending' because their usage never
//      arrived — a stream the client left, a response without a cost. Each is
//      claimed (the claim books its next attempt, so overlapping runs never
//      fetch the same row) and its cost read from
//      GET https://openrouter.ai/api/v1/generation?id=…, field data.total_cost.
//      Not ready yet means nothing to do: the next attempt is already booked.
//
// If the ledger functions are not in the database yet — the code was deployed
// before the migrations were applied — the run logs it and answers 200. A
// deployment-order mistake is not an incident, and must not fail every 5
// minutes.

export const runtime     = 'nodejs';
export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

const CLAIM_BATCH = 50;

// PostgREST answers PGRST202 for a function missing from its schema cache;
// 42883 is Postgres's own undefined_function.
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

interface ClaimedCall {
  call_id:       number;
  generation_id: string;
  attempt:       number;
}

function functionMissing(error: { code?: string } | null): boolean {
  return error !== null && MISSING_FUNCTION_CODES.has(error.code ?? '');
}

export async function GET(request: Request) {
  // Constant-time comparison, as in cron/auto-apply: this route runs with the
  // service role.
  const authHeader = request.headers.get('Authorization');
  const expected   = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!timingSafeCompare(authHeader, expected)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // ── 1. Stale reservations ─────────────────────────────────────────────────
  const { data: refunded, error: refundError } = await admin.rpc('refund_stale_ai_reservations');

  if (functionMissing(refundError)) {
    console.warn('[cron/ai-ledger] refund_stale_ai_reservations is not deployed — apply the AI credit migrations. Skipping this run.');
    return Response.json({ skipped: 'ledger functions not deployed' });
  }
  if (refundError) console.error('[cron/ai-ledger] stale refund failed:', refundError.message);

  // ── 2. Deferred costs ─────────────────────────────────────────────────────
  const { data: claimed, error: claimError } = await admin.rpc('claim_pending_ai_call_costs', { p_limit: CLAIM_BATCH });

  if (functionMissing(claimError)) {
    console.warn('[cron/ai-ledger] claim_pending_ai_call_costs is not deployed — apply the deferred cost migration. Skipping deferred costs.');
    return Response.json({
      refundedReservations: refundError ? null : refunded,
      costs:                { skipped: 'deferred cost functions not deployed' },
    });
  }
  if (claimError) console.error('[cron/ai-ledger] claim failed:', claimError.message);

  const costs = { claimed: 0, completed: 0, notReady: 0, failed: 0 };

  for (const call of (claimed ?? []) as ClaimedCall[]) {
    costs.claimed++;
    try {
      const generation = await fetchGenerationCost(call.generation_id);

      if (generation === null) {
        costs.notReady++;
        continue;
      }

      const { error } = await admin.rpc('complete_ai_call_cost', {
        p_call_id:           call.call_id,
        p_prompt_tokens:     generation.promptTokens,
        p_completion_tokens: generation.completionTokens,
        p_cost_usd:          generation.costUsd,
      });

      if (error) {
        costs.failed++;
        console.error(`[cron/ai-ledger] completing call ${call.call_id} failed:`, error.message);
      } else {
        costs.completed++;
      }
    } catch (err) {
      costs.failed++;
      console.warn(`[cron/ai-ledger] generation ${call.generation_id}:`, err);
    }
  }

  return Response.json({
    refundedReservations: refundError ? null : refunded,
    costs,
  });
}
