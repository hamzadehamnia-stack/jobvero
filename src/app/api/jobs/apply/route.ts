import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withFeatureCheck } from '@/lib/subscription/withFeatureCheck';
import { callOpenRouter } from '@/lib/openrouter';

const MODEL = 'anthropic/claude-sonnet-4.6';

async function handler(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    jobId, jobTitle, company, location, salary, jobDescription, jobUrl,
  } = await req.json() as {
    jobId: string;
    jobTitle: string;
    company: string;
    location: string;
    salary?: string;
    jobDescription: string;
    jobUrl?: string;
  };

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, phone')
    .eq('id', user.id)
    .single();

  const { data: cv } = await supabase
    .from('cvs')
    .select('form_data, title')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const cvSummary = cv?.form_data
    ? JSON.stringify(cv.form_data).slice(0, 1500)
    : '';

  const userName  = profile?.full_name ?? user.email ?? 'Candidat';
  const userEmail = profile?.email ?? user.email ?? '';
  const userPhone = (profile as Record<string, unknown> | null)?.phone as string ?? '';
  const today     = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const coverLetterText = await callOpenRouter(MODEL, [
    {
      role: 'system',
      content: 'Tu es un expert en rédaction de lettres de motivation professionnelles françaises. Retourne UNIQUEMENT le texte brut de la lettre, sans HTML, sans markdown, sans balises, sans explications.',
    },
    {
      role: 'user',
      content: `Tu es un expert en rédaction de lettres de motivation professionnelles françaises.
Rédige une lettre de motivation en français, strictement sur UNE seule page (max 350 mots).

Structure OBLIGATOIRE et dans cet ordre exact:

${userName}
${userEmail}${userPhone ? ` | ${userPhone}` : ''}

[Ville du candidat], le ${today}

${company}
${location || '[Ville]'}

Objet : Candidature au poste de ${jobTitle}

Madame, Monsieur,

[PARAGRAPHE 1 - Accroche: 2-3 phrases. Qui je suis + pourquoi ce poste m'intéresse]

[PARAGRAPHE 2 - Valeur ajoutée: 3-4 phrases. Mes compétences clés adaptées à CE poste spécifique]

[PARAGRAPHE 3 - Motivation: 2-3 phrases. Pourquoi CETTE entreprise + disponibilité]

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

${userName}

RÈGLES STRICTES:
- Rédaction 100% humaine, naturelle, pas de formules robotiques
- Adapte PRÉCISÉMENT au poste et à l'entreprise fournis
- Maximum 350 mots au total
- Pas de crochets dans le résultat final
- Pas de fautes d'orthographe

DONNÉES DU CANDIDAT:
Nom: ${userName}
Email: ${userEmail}
Téléphone: ${userPhone || 'Non renseigné'}
CV: ${cvSummary || 'Non fourni'}

POSTE:
Titre: ${jobTitle}
Entreprise: ${company}
Localisation: ${location || 'Non précisée'}
Description: ${jobDescription.slice(0, 500)}`,
    },
  ], 1024);

  const cleanedText = coverLetterText
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  const escaped = cleanedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const coverLetterHtml = `<div style="font-family:Arial,sans-serif;padding:40px 50px;max-width:700px;color:#1a1a2e;font-size:13px;line-height:1.7;white-space:pre-line;">${escaped}</div>`;

  const { error: insertError } = await supabase.from('job_applications').insert({
    user_id: user.id,
    title: jobTitle,
    company,
    location,
    salary: salary ?? null,
    status: 'applied',
    url: jobUrl ?? null,
    applied_at: new Date().toISOString(),
  });

  if (insertError) {
    console.error('[jobs/apply] insert error:', insertError);
  }

  supabase.from('cover_letters').insert({
    user_id: user.id,
    job_title: jobTitle,
    company_name: company,
    html: coverLetterHtml,
    tone: 'Professional',
    language: 'en',
  }).then(() => null, () => null);

  return NextResponse.json({ coverLetterHtml, saved: !insertError });
}

export const POST = withFeatureCheck('APPLY_WITH_AI', handler);
