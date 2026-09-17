import { createAdminClient } from '@/lib/supabase/admin';
import { timingSafeCompare } from '@/lib/timingSafe';

// ─── The monthly renewal ──────────────────────────────────────────────────────
//
// Nothing in this project ever put credits back. An account was granted its
// allowance once, at signup, and never again — so the second month a paying
// customer could do nothing. Runs daily (vercel.json).
//
// It calls renew_due_periods(), which for every account whose period has ended:
//   · works out the next period from where the last one ended, so the
//     anniversary never drifts and a dormant account gets one period, not one
//     per month missed;
//   · REPLACES the balance with the plan's allowance — credits never carry over;
//   · refuses a paid plan whose payment is not current, leaving the period
//     untouched so the Stripe webhook can grant the moment it succeeds.
//
// Granting is idempotent in the database: credit_grants holds one row per
// (account, period), so two crons, a replayed webhook and a hand-run repair all
// collide on the primary key and only the first one through grants. This route
// needs no lock of its own.
//
// Paid accounts ride this same cycle until Stripe is wired (block e9d), which
// will call grant_period_credits() with the invoice id as the key.

export const runtime     = 'nodejs';
export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

const TAG        = '[cron/period-renewal]';
const BATCH_SIZE = 200;

// PostgREST answers PGRST202 for a function missing from its schema cache;
// 42883 is Postgres's own undefined_function. A deployment that ran before its
// migrations is a mistake to log, not an incident to fail on every night.
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

interface RenewalRow {
  user_id: string;
  granted: boolean;
  reason:  string;
  credits: number;
}

export async function GET(request: Request) {
  // Constant-time: `!==` short-circuits at the first differing byte, so response
  // timing leaks the secret one character at a time.
  const authHeader = request.headers.get('Authorization');
  const expected   = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!timingSafeCompare(authHeader, expected)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc('renew_due_periods', { p_limit: BATCH_SIZE });

  if (error) {
    if (MISSING_FUNCTION_CODES.has(error.code ?? '')) {
      console.error(`${TAG} renew_due_periods is not in the database yet — apply the migrations`);
      return Response.json({ ok: true, skipped: 'function_missing' });
    }
    console.error(`${TAG} renewal failed:`, error.message);
    return Response.json({ error: 'Renewal failed' }, { status: 500 });
  }

  const rows    = (data ?? []) as RenewalRow[];
  const granted = rows.filter((r) => r.granted);
  const refused = rows.filter((r) => !r.granted);

  // A refusal is worth a line each: "payment_not_current" is a customer who
  // will notice, and a run that refuses everything is a configuration fault.
  for (const row of refused) {
    console.warn(`${TAG} no grant for ${row.user_id}: ${row.reason}`);
  }

  console.log(`${TAG} ${granted.length} renewed, ${refused.length} refused, ${rows.length} examined`);

  return Response.json({
    ok:       true,
    examined: rows.length,
    granted:  granted.length,
    refused:  refused.length,
    reasons:  refused.reduce<Record<string, number>>((acc, r) => {
      acc[r.reason] = (acc[r.reason] ?? 0) + 1;
      return acc;
    }, {}),
  });
}
