import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateEmailAlias, generateJobveroId } from '@/lib/userIdentity';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST(req: Request) {
  const secret = req.headers.get('x-admin-secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Fetch all profiles missing alias or jobvero_id
    const { data: profiles, error } = await admin
      .from('profiles')
      .select('id, full_name, email_alias, jobvero_id')
      .or('email_alias.is.null,jobvero_id.is.null');

    if (error) throw new Error(`profiles fetch failed: ${error.message}`);
    if (!profiles?.length) return NextResponse.json({ updated: 0, message: 'Nothing to backfill' });

    let updated = 0;
    const errors: string[] = [];

    for (const profile of profiles) {
      try {
        const name   = (profile.full_name as string | null) ?? '';
        const parts  = name.trim().split(/\s+/);
        const first  = parts[0]              ?? '';
        const last   = parts.slice(1).join('') ?? '';

        const alias = (profile.email_alias as string | null) ?? await generateEmailAlias(first, last, admin);
        const jvId  = (profile.jobvero_id  as string | null) ?? await generateJobveroId(admin);

        const { error: updateErr } = await admin
          .from('profiles')
          .update({ email_alias: alias, jobvero_id: jvId })
          .eq('id', profile.id);

        if (updateErr) {
          errors.push(`${profile.id}: ${updateErr.message}`);
        } else {
          updated++;
          console.log(`[backfill] ${profile.id} → alias=${alias} jvId=${jvId}`);
        }
      } catch (e) {
        errors.push(`${profile.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({ updated, total: profiles.length, errors: errors.length ? errors : undefined });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[backfill-identity] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
