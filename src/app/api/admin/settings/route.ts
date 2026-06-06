import { NextResponse } from 'next/server';
import { requireAdmin } from '../_guard';
import { createAdminClient } from '@/lib/supabase/admin';

const DEFAULT_SETTINGS = {
  features: {
    cv_builder:      true,
    cover_letter:    true,
    auto_apply:      true,
    interview_coach: true,
    ai_matches:      true,
    ats_score:       true,
  },
  limits: {
    pro_auto_apply_monthly:     50,
    pro_interviews_monthly:     10,
    premium_auto_apply_monthly: 200,
    premium_interviews_monthly: 50,
  },
};

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('admin_settings')
      .select('value')
      .eq('key', 'global')
      .single();
    return NextResponse.json(data?.value ?? DEFAULT_SETTINGS);
  } catch {
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

export async function PUT(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  try {
    const admin   = createAdminClient();
    const payload = await req.json();
    await admin.from('admin_settings').upsert({ key: 'global', value: payload }, { onConflict: 'key' });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/settings]', err);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }
}
