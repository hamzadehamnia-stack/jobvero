import { NextResponse } from 'next/server';
import { requireAdmin } from '../../_guard';
import { createAdminClient } from '@/lib/supabase/admin';

// PATCH /api/admin/users/[id]  — update plan / credits / blocked
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = params;
  const body   = await req.json() as { plan?: string; credits?: number; blocked?: boolean };

  try {
    const admin = createAdminClient();

    // Build a single profiles patch for plan, credits, and/or blocked
    const patch: Record<string, unknown> = {};
    if (body.plan    !== undefined) patch.subscription_plan    = body.plan;
    if (body.credits !== undefined) patch.ai_credits_remaining = body.credits;
    if (body.blocked !== undefined) patch.is_blocked           = body.blocked;

    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from('profiles').update(patch).eq('id', id);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/users/patch]', err);
    const msg = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/admin/users/[id]  — permanently delete user
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { id } = params;
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/users/delete]', err);
    const msg = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
