import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateEmailAlias, generateJobveroId } from '@/lib/userIdentity';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check if already provisioned (idempotent)
    const { data: existing } = await supabase
      .from('profiles')
      .select('email_alias, jobvero_id')
      .eq('id', user.id)
      .single();

    if (existing?.email_alias && existing?.jobvero_id) {
      return NextResponse.json({
        email_alias: existing.email_alias,
        jobvero_id:  existing.jobvero_id,
      });
    }

    const body = await req.json().catch(() => ({})) as { name?: string };
    const name  = (body.name ?? (user.user_metadata?.full_name as string | undefined) ?? '').trim();
    const parts = name.split(/\s+/);
    const firstName = parts[0]              ?? '';
    const lastName  = parts.slice(1).join('') ?? '';

    const alias = existing?.email_alias ?? await generateEmailAlias(firstName, lastName, supabase);
    const jvId  = existing?.jobvero_id  ?? await generateJobveroId(supabase);

    await supabase.from('profiles').upsert({
      id:          user.id,
      full_name:   name || null,
      email:       user.email,
      email_alias: alias,
      jobvero_id:  jvId,
    }, { onConflict: 'id' });

    console.log(`[auth/signup] provisioned identity for ${user.id}: alias=${alias} jvId=${jvId}`);
    return NextResponse.json({ email_alias: alias, jobvero_id: jvId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[auth/signup] error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
