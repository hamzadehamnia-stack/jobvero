import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { jobTitle, companyName, htmlContent, language, tone } = await req.json();

  // Link to the user's most recently saved CV if one exists
  const { data: latestCV } = await supabase
    .from('cvs')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from('cover_letters')
    .insert({
      user_id:      user.id,
      job_title:    jobTitle   ?? '',
      company_name: companyName ?? '',
      content:      htmlContent ?? '',
      language:     language   ?? 'en',
      tone:         tone       ?? 'Professional',
      cv_id:        latestCV?.id ?? null,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
