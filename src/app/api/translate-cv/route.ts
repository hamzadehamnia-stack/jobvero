import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';
import { withFeatureCheck } from '@/lib/subscription/withFeatureCheck';

const MODEL = 'anthropic/claude-sonnet-4.6';

const LANG_CONFIG: Record<string, {
  name: string;
  degreeMap: string;
  bulletVerbs: string;
  keepUnchanged: string;
}> = {
  fr: {
    name: 'French',
    degreeMap: 'Bachelor/BS/BA → Licence, Master\'s/MS/MA → Master, PhD/Doctorate → Doctorat, MBA → MBA, Associate → BTS/DUT, Engineer degree → Diplôme d\'ingénieur',
    bulletVerbs: 'Développé, Conçu, Géré, Analysé, Optimisé, Dirigé, Mis en place, Collaboré, Réduit, Augmenté, Supervisé, Coordonné, Implémenté, Automatisé, Livré',
    keepUnchanged: 'company names, university/school names, person names, city names, country names, brand names, programming languages (JavaScript, Python, TypeScript…), software/framework names (React, Docker, AWS…), acronyms (CEO, CTO, API, SQL, SaaS…), version numbers',
  },
  es: {
    name: 'Spanish',
    degreeMap: 'Bachelor/BS/BA → Licenciatura/Grado, Master\'s/MS/MA → Máster/Maestría, PhD/Doctorate → Doctorado, MBA → MBA, Associate → Técnico Superior',
    bulletVerbs: 'Desarrollé, Diseñé, Gestioné, Analicé, Optimicé, Dirigí, Implementé, Colaboré, Reduje, Aumenté, Supervisé, Coordiné, Automaticé, Entregué, Lideré',
    keepUnchanged: 'company names, university/school names, person names, city names, country names, brand names, programming languages, software/framework names, acronyms',
  },
  pt: {
    name: 'Portuguese',
    degreeMap: 'Bachelor/BS/BA → Bacharelado/Licenciatura, Master\'s/MS/MA → Mestrado, PhD/Doctorate → Doutorado, MBA → MBA, Associate → Tecnólogo/Técnico',
    bulletVerbs: 'Desenvolvi, Projetei, Gerenciei, Analisei, Otimizei, Dirigi, Implementei, Colaborei, Reduzi, Aumentei, Supervisionei, Coordenei, Automatizei, Entreguei, Liderei',
    keepUnchanged: 'company names, university/school names, person names, city names, country names, brand names, programming languages, software/framework names, acronyms',
  },
};

async function handler(req: Request) {
  try {
    const { workExperience, education, skills, targetLanguage } = await req.json();
    const lang = targetLanguage && LANG_CONFIG[targetLanguage] ? targetLanguage : 'fr';
    const cfg  = LANG_CONFIG[lang];

    const systemPrompt = `You are a professional CV translator specializing in ${cfg.name}. Your job is to translate CV content accurately while preserving all formatting, structure, and proper nouns.

TRANSLATION RULES:
1. Translate: job titles (position field), job descriptions, degree names, field of study, and generic skill names
2. Keep UNCHANGED: ${cfg.keepUnchanged}
3. Job descriptions: rewrite as concise ${cfg.name} bullet-point sentences, each starting with a past participle action verb. Use these verbs: ${cfg.bulletVerbs}
4. Degree equivalents: ${cfg.degreeMap}
5. Skills: translate generic skill names (e.g. "Project Management", "Problem Solving", "Leadership"); keep all technical terms as-is
6. Maintain professional tone and register throughout
7. Preserve the exact meaning — do not add or remove information

OUTPUT CONTRACT:
- Return ONLY a raw JSON object — no markdown fences, no explanation, no leading/trailing text
- Preserve every field name and array structure exactly as provided
- Only the VALUES of: position, description (workExperience), degree, field (education), and generic skill strings should change`;

    const userPrompt = `Translate this CV data to ${cfg.name}.

INPUT JSON:
${JSON.stringify({ workExperience, education, skills }, null, 2)}

Return a JSON object with exactly this structure (same field names, same array lengths, only values translated per the rules):
{
  "workExperience": [array — same ids, company, startDate, endDate, current — position and description translated],
  "education": [array — same ids, school, startDate, endDate, current, gpa — degree and field translated],
  "skills": [array of translated skill strings]
}`;

    const raw = await callOpenRouter(MODEL, [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ], 4000);

    const cleaned    = raw.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const translated = JSON.parse(cleaned);

    return NextResponse.json({ translated });
  } catch (err) {
    console.error('CV translation error:', err);
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}

export const POST = withFeatureCheck('CV_BUILDER_AI', handler);
