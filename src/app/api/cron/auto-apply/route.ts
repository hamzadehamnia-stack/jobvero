import { createClient } from '@supabase/supabase-js';
import { runAutoApplyForUser } from '@/lib/auto-apply/runForUser';
import { timingSafeCompare } from '@/lib/timingSafe';

// Allow up to 5 minutes — batch may process many users sequentially
export const maxDuration = 300;

export async function GET(request: Request) {
  // ── Auth: verify Vercel cron secret ──────────────────────────────────────
  // Constant-time: `!==` short-circuits at the first differing byte, so
  // response timing leaks the secret one character at a time. This endpoint
  // runs auto-apply for every active user with a service-role client, so it is
  // the last one that should be brute-forceable.
  const authHeader = request.headers.get('Authorization');
  const expected   = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (!timingSafeCompare(authHeader, expected)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Admin client (bypasses RLS — required since there is no user session) ──
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── Fetch all users with Auto Apply active ────────────────────────────────
  const { data: activeSettings, error } = await adminSupabase
    .from('auto_apply_settings')
    .select('user_id')
    .eq('is_active', true);

  if (error) {
    console.error('[cron/auto-apply] Failed to fetch active settings:', error);
    return Response.json({ error: 'Failed to fetch active users' }, { status: 500 });
  }

  const userIds = (activeSettings ?? []).map(s => s.user_id as string);
  console.log(`[cron/auto-apply] Running for ${userIds.length} active user(s)`);

  // ── Run for each user, isolated — one failure does not stop the batch ──────
  const results = await Promise.all(
    userIds.map(async userId => {
      try {
        const result = await runAutoApplyForUser(userId, adminSupabase);
        return { userId, ...result };
      } catch (err) {
        console.error(`[cron/auto-apply] Uncaught error for user ${userId}:`, err);
        return { userId, applied: 0, failed: 0, skipped: 0, jobs: [], error: String(err) };
      }
    }),
  );

  const totalApplied = results.reduce((sum, r) => sum + r.applied, 0);
  const totalFailed  = results.reduce((sum, r) => sum + r.failed,  0);

  console.log(`[cron/auto-apply] Done. applied=${totalApplied} failed=${totalFailed} users=${userIds.length}`);

  // Housekeeping: rate-limit buckets are never read once their window closes,
  // but the rows stay behind — one per identity per route per window. Piggy-
  // backing on the existing daily cron avoids introducing a second schedule.
  // Never fatal: a failed purge must not turn a successful auto-apply run into
  // an error response, it just means the table is purged tomorrow instead.
  let purged: number | null = null;
  try {
    const { data, error } = await adminSupabase.rpc('purge_expired_rate_limits');
    if (error) {
      console.warn('[cron/auto-apply] rate-limit purge failed:', error.message);
    } else {
      purged = typeof data === 'number' ? data : null;
      console.log(`[cron/auto-apply] purged ${purged ?? '?'} expired rate-limit rows`);
    }
  } catch (err) {
    console.warn('[cron/auto-apply] rate-limit purge threw:', err);
  }

  return Response.json({
    ran:     userIds.length,
    purgedRateLimitRows: purged,
    applied: totalApplied,
    failed:  totalFailed,
    results: results.map(r => ({
      userId:        r.userId,
      applied:       r.applied,
      failed:        r.failed,
      skipped:       r.skipped,
      skippedReason: 'skippedReason' in r ? r.skippedReason : undefined,
      error:         'error' in r ? r.error : undefined,
    })),
  });
}
