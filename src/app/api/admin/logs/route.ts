import { NextResponse } from 'next/server';
import { requireAdmin } from '../_guard';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/admin/logs?type=applications|auto-apply|registrations
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'applications';

  try {
    const admin = createAdminClient();

    if (type === 'applications') {
      const { data } = await admin
        .from('applications')
        .select('id, user_id, job_title, company_name, status, send_status, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      return NextResponse.json({ logs: data ?? [] });
    }

    if (type === 'auto-apply') {
      const { data } = await admin
        .from('auto_apply_logs')
        .select('id, user_id, job_title, company, status, applied_at')
        .order('applied_at', { ascending: false })
        .limit(50);
      return NextResponse.json({ logs: data ?? [] });
    }

    if (type === 'registrations') {
      const { data: { users } } = await admin.auth.admin.listUsers({ page: 1, perPage: 50 });
      const sorted = [...users].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 50);
      const { data: profiles } = await admin.from('profiles').select('id, subscription_plan').in('id', sorted.map(u => u.id));
      const planMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.subscription_plan as string]));
      const logs = sorted.map(u => ({
        id:        u.id,
        email:     u.email ?? '',
        name:      (u.user_metadata?.full_name as string) || (u.email ?? '').split('@')[0],
        plan:      planMap[u.id] ?? 'free',
        createdAt: u.created_at,
      }));
      return NextResponse.json({ logs });
    }

    if (type === 'support') {
      const { data, error } = await admin
        .from('support_messages')
        .select('id, user_id, user_email, user_name, subject, message, status, reply_text, replied_at, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) console.warn('[admin/logs] support_messages error:', error.message);
      return NextResponse.json({ logs: data ?? [] });
    }

    return NextResponse.json({ logs: [] });
  } catch (err) {
    console.error('[admin/logs]', err);
    const msg = err instanceof Error ? err.message : 'Logs failed';
    return NextResponse.json({ error: msg }, { status: msg.includes('SERVICE_ROLE') ? 503 : 500 });
  }
}
