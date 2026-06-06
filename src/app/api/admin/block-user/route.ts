import { NextResponse } from 'next/server';
import { requireAdmin } from '../_guard';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { userId, isBlocked } = await req.json() as { userId: string; isBlocked: boolean };

  if (!userId || typeof isBlocked !== 'boolean') {
    return NextResponse.json({ error: 'userId and isBlocked are required' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from('profiles')
      .update({ is_blocked: isBlocked })
      .eq('id', userId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/block-user]', err);
    const msg = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
