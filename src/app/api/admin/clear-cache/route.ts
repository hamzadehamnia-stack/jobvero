import { NextResponse } from 'next/server';
import { requireAdmin } from '../_guard';
import { createAdminClient } from '@/lib/supabase/admin';

export async function DELETE() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from('ai_job_matches_cache')
      .delete({ count: 'exact' })
      .neq('user_id', '00000000-0000-0000-0000-000000000000'); // delete all rows
    if (error) throw error;
    return NextResponse.json({ deleted: count ?? 0 });
  } catch (err) {
    console.error('[admin/clear-cache]', err);
    const msg = err instanceof Error ? err.message : 'Clear cache failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
