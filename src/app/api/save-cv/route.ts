import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverError } from '@/lib/apiError';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, formData, htmlContent } = await req.json();

  const cvTitle =
    title ||
    (formData?.personalInfo?.fullName
      ? `CV — ${formData.personalInfo.fullName}`
      : 'My CV');

  const { data, error } = await supabase
    .from('cvs')
    .insert({
      user_id:      user.id,
      title:        cvTitle,
      content:      formData ?? {},
      form_data:    formData ?? {},
      html_content: htmlContent ?? null,
      template:     formData?.preferences?.template ?? null,
      country:      formData?.preferences?.targetCountry ?? null,
    })
    .select('id')
    .single();

  if (error) return serverError('save-cv', error, 'Save failed');
  return NextResponse.json({ id: data.id });
}
