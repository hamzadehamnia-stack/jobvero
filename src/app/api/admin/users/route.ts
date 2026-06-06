import { NextResponse } from 'next/server';
import { requireAdmin } from '../_guard';
import { createAdminClient } from '@/lib/supabase/admin';

function countByUser(rows: { user_id: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.user_id] = (out[r.user_id] ?? 0) + 1;
  return out;
}

// GET /api/admin/users?page=1&search=&plan=
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const page    = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const perPage = 20;
  const search  = (searchParams.get('search') ?? '').toLowerCase();
  const plan    = searchParams.get('plan') ?? '';

  try {
    const admin = createAdminClient();

    // Fetch all auth users via service-role Admin API
    const { data: authData, error: authError } = await admin.auth.admin.listUsers({
      page: 1, perPage: 10_000,
    });
    if (authError) {
      console.error('[admin/users] auth.admin.listUsers error:', authError.message, authError);
      return NextResponse.json(
        { error: `Auth API error: ${authError.message}. Make sure SUPABASE_SERVICE_ROLE_KEY is the service_role JWT (starts with "eyJ"), not the publishable/anon key.` },
        { status: 502 },
      );
    }
    const authUsers = authData?.users ?? [];
    console.log(`[admin/users] fetched ${authUsers.length} auth users`);

    // Get all profiles (service role bypasses RLS)
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, subscription_plan, ai_credits_remaining, avatar_url, is_blocked');
    if (profilesError) {
      console.error('[admin/users] profiles error:', profilesError.message, profilesError);
      return NextResponse.json({ error: `Profiles error: ${profilesError.message}` }, { status: 502 });
    }
    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));
    console.log(`[admin/users] fetched ${profiles?.length ?? 0} profiles`);

    // Filter
    let filtered = authUsers;
    if (search) {
      filtered = filtered.filter(u =>
        (u.email ?? '').toLowerCase().includes(search) ||
        ((u.user_metadata?.full_name as string) ?? '').toLowerCase().includes(search)
      );
    }
    if (plan) {
      filtered = filtered.filter(u => (profileMap[u.id]?.subscription_plan ?? 'free') === plan);
    }

    const total = filtered.length;

    // Paginate
    const paged    = filtered.slice((page - 1) * perPage, page * perPage);
    const pagedIds = paged.map(u => u.id);

    // Count per-user CVs, letters, apps (errors are non-fatal — default to 0)
    const [cvData, letData, appData] = await Promise.all([
      admin.from('cvs').select('user_id').in('user_id', pagedIds),
      admin.from('cover_letters').select('user_id').in('user_id', pagedIds),
      admin.from('applications').select('user_id').in('user_id', pagedIds),
    ]);
    if (cvData.error)  console.warn('[admin/users] cvs count error:',  cvData.error.message);
    if (letData.error) console.warn('[admin/users] letters count error:', letData.error.message);
    if (appData.error) console.warn('[admin/users] apps count error:',  appData.error.message);

    const cvCounts  = countByUser(cvData.data  ?? []);
    const letCounts = countByUser(letData.data ?? []);
    const appCounts = countByUser(appData.data ?? []);

    const users = paged.map(u => ({
      id:          u.id,
      email:       u.email ?? '',
      name:        (u.user_metadata?.full_name as string) || (u.email ?? '').split('@')[0] || 'Unknown',
      avatarUrl:   (profileMap[u.id]?.avatar_url as string | null) ?? (u.user_metadata?.avatar_url as string | null) ?? null,
      plan:        (profileMap[u.id]?.subscription_plan as string) ?? 'free',
      aiCredits:   (profileMap[u.id]?.ai_credits_remaining as number) ?? 0,
      cvCount:     cvCounts[u.id]  ?? 0,
      letterCount: letCounts[u.id] ?? 0,
      appCount:    appCounts[u.id] ?? 0,
      createdAt:   u.created_at,
      blocked:     (profileMap[u.id]?.is_blocked as boolean) ?? false,
    }));

    return NextResponse.json({ users, total, page, perPage });
  } catch (err) {
    console.error('[admin/users] unhandled error:', err);
    const msg = err instanceof Error ? err.message : 'Users failed';
    return NextResponse.json(
      { error: msg },
      { status: msg.includes('SERVICE_ROLE') ? 503 : 500 },
    );
  }
}
