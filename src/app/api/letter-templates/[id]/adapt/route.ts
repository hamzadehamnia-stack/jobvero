import { NextResponse } from 'next/server';
import { withAiAction, type AiActionContext } from '@/lib/ai/withAiAction';

export const runtime     = 'nodejs';
export const maxDuration = 90;

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function handler(req: Request, ai: AiActionContext, { params }: RouteContext) {
  const { id } = await params;
  const { supabase, user } = ai;

  // Looked up before anything is charged: a template that is not the user's is
  // a free 404.
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

  const adapted = await ai.complete([
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
  ]);

  await supabase
    .from('letter_templates')
    .update({
      use_count:    (template.use_count ?? 0) + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', id);

  return NextResponse.json({ text: adapted });
}

export const POST = withAiAction<RouteContext>({ feature: 'COVER_LETTER_AI', action: 'letter_adapt' }, handler);
