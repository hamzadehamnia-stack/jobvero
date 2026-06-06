import { NextResponse } from 'next/server';
import { requireAdmin } from '../_guard';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const { title, message } = await req.json() as { title?: string; message?: string };
  if (!title?.trim() || !message?.trim()) {
    return NextResponse.json({ error: 'title and message are required' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    // Fetch all profile IDs
    const { data: profiles } = await admin.from('profiles').select('id');
    const ids = (profiles ?? []).map(p => p.id as string);
    if (!ids.length) return NextResponse.json({ sent: 0 });

    // Batch-insert notifications in chunks of 500
    const CHUNK = 500;
    let sent = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK).map(user_id => ({
        user_id,
        type:    'admin_broadcast' as string,
        title:   title.trim(),
        message: message.trim(),
        read:    false,
      }));
      await admin.from('notifications').insert(chunk);
      sent += chunk.length;
    }

    return NextResponse.json({ sent });
  } catch (err) {
    console.error('[admin/notify-all]', err);
    const msg = err instanceof Error ? err.message : 'Notify failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
