import { NextResponse } from 'next/server';
import { withAiAction, type AiActionContext } from '@/lib/ai/withAiAction';

export const runtime     = 'nodejs';
export const maxDuration = 90;

// A cover letter for one job offer, saved with the user's letters. The route
// records no application: tracking an offer belongs to the job tracker, which
// itself calls this route for offers it already holds.
async function handler(req: Request, ai: AiActionContext) {
  const { supabase, user } = ai;

  const { jobTitle, company, location, jobDescription } = await req.json() as {
    jobTitle:       string;
    company:        string;
    location:       string;
    jobDescription: string;
  };

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone')
    .eq('id', user.id)
    .single();

  const { data: cv } = await supabase
    .from('cvs')
    .select('id, form_data')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const cvSummary = cv?.form_data
    ? JSON.stringify(cv.form_data).slice(0, 1500)
    : '';

  const userName  = profile?.full_name ?? user.email ?? 'Candidat';
  const userEmail = user.email ?? '';
  const userPhone = profile?.phone ?? '';
  const today     = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const coverLetterText = await ai.complete([
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
  ]);

  const cleanedText = coverLetterText
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  const escaped = cleanedText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const coverLetterHtml = `<div style="font-family:Arial,sans-serif;padding:40px 50px;max-width:700px;color:#1a1a2e;font-size:13px;line-height:1.7;white-space:pre-line;">${escaped}</div>`;

  // The letter is what the user pays for. It is saved before the answer, and a
  // failed save fails the request: the credit is refunded rather than charged
  // for a letter the user could not find again.
  const { error: saveError } = await supabase.from('cover_letters').insert({
    user_id:      user.id,
    job_title:    jobTitle,
    company_name: company,
    content:      coverLetterHtml,
    language:     'fr',
    tone:         'Professional',
    cv_id:        cv?.id ?? null,
  });

  if (saveError) {
    console.error('[jobs/apply] cover letter save failed:', saveError.message);
    return NextResponse.json({ error: 'Could not save the cover letter' }, { status: 500 });
  }

  return NextResponse.json({ coverLetterHtml });
}

export const POST = withAiAction({ feature: 'APPLY_WITH_AI', action: 'application' }, handler);
