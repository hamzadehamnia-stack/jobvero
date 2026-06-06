import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';

const MODEL = 'anthropic/claude-sonnet-4-6';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: template } = await supabase
    .from('letter_templates')
    .select('content, use_count')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  const { jobTitle, companyName, companyCity, description } = await req.json();
  if (!jobTitle?.trim() || !companyName?.trim()) {
    return NextResponse.json({ error: 'jobTitle and companyName are required' }, { status: 400 });
  }

  const adapted = await callOpenRouter(MODEL, [
    {
      role: 'system',
      content: 'Tu es un expert en lettres de motivation. Réponds uniquement avec la lettre adaptée, sans commentaires ni explications.',
    },
    {
      role: 'user',
      content: `Adapte cette lettre de motivation au nouveau poste. Garde le ton et la structure mais personnalise le contenu pour: ${jobTitle} chez ${companyName}${companyCity ? ` à ${companyCity}` : ''}.
Lettre originale: ${template.content}
Description du nouveau poste: ${description?.trim() || 'Non fournie'}
Réponds uniquement avec la lettre adaptée, max 350 mots.`,
    },
  ], 700);

  await supabase
    .from('letter_templates')
    .update({
      use_count:    (template.use_count ?? 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', id);

  return NextResponse.json({ text: adapted });
}
