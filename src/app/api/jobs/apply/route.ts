import { NextResponse } from 'next/server';
import { withAiAction, type AiActionContext } from '@/lib/ai/withAiAction';

export const runtime     = 'nodejs';
export const maxDuration = 90;

// The languages a letter can be written in, with the locale its date is
// formatted in. English is the default: the letter follows the user, and a
// customer who never asked for French must never receive one.
const LANGUAGES: Record<string, { name: string; locale: string }> = {
  en: { name: 'English',    locale: 'en-US' },
  fr: { name: 'French',     locale: 'fr-FR' },
  es: { name: 'Spanish',    locale: 'es-ES' },
  pt: { name: 'Portuguese', locale: 'pt-PT' },
};

// A cover letter for one job offer, saved with the user's letters. The route
// records no application: tracking an offer belongs to the job tracker, which
// itself calls this route for offers it already holds.
async function handler(req: Request, ai: AiActionContext) {
  const { supabase, user } = ai;

  const { jobTitle, company, location, jobDescription, language } = await req.json() as {
    jobTitle:       string;
    company:        string;
    location:       string;
    jobDescription: string;
    language?:      string;
  };

  const lang = typeof language === 'string' && language in LANGUAGES ? language : 'en';
  const cfg  = LANGUAGES[lang];

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
  const today     = new Date().toLocaleDateString(cfg.locale, { day: 'numeric', month: 'long', year: 'numeric' });

  const coverLetterText = await ai.complete([
    {
      role: 'system',
      content: `You are an expert cover letter writer. Write the entire letter in ${cfg.name}, and in no other language. Return ONLY the raw text of the letter: no HTML, no markdown, no tags, no explanation, no translation.`,
    },
    {
      role: 'user',
      content: `Write a cover letter in ${cfg.name} for the job below. One page at most, 350 words maximum.

Follow the letter-writing conventions of ${cfg.name}: its usual opening and closing formulas, its way of labelling a subject line, and its date format. Keep this order:

${userName}
${userEmail}${userPhone ? ` | ${userPhone}` : ''}

[the candidate's city], ${today}

${company}
${location || '[city]'}

[subject line, in ${cfg.name}: application for the position of ${jobTitle}]

[opening salutation, in ${cfg.name}]

[PARAGRAPH 1 — hook: 2-3 sentences. Who the candidate is, and why this role interests them]

[PARAGRAPH 2 — value: 3-4 sentences. The candidate's key skills, matched to THIS specific role]

[PARAGRAPH 3 — motivation: 2-3 sentences. Why THIS company, and availability]

[closing formula, in ${cfg.name}]

${userName}

STRICT RULES:
- Natural, human writing. No robotic formulas.
- Tailor it PRECISELY to the role and the company given below.
- 350 words maximum.
- No square brackets in the final text — replace every placeholder with real content.
- No spelling mistakes.
- Every word of the letter is in ${cfg.name}.

CANDIDATE:
Name: ${userName}
Email: ${userEmail}
Phone: ${userPhone || 'not provided'}
CV: ${cvSummary || 'not provided'}

POSITION:
Title: ${jobTitle}
Company: ${company}
Location: ${location || 'not specified'}
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
    language:     lang,
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
