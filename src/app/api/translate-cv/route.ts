import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';

const MODEL = 'anthropic/claude-sonnet-4-6';

export async function POST(req: Request) {
  try {
    const { workExperience, education, skills } = await req.json();

    const prompt = `You are a professional French CV translator. Translate the CV content below to natural, formal French.

STRICT RULES:
1. Translate: job titles (position), job descriptions, degree names, field of study, and skills
2. Keep UNCHANGED (proper nouns): company names, university/school names, person names, city names, country names, brand names, programming languages (JavaScript, Python…), software names (React, Docker…), acronyms (CEO, CTO, API, SQL…)
3. Job descriptions → rewrite as concise French bullet points, each starting with a past participle action verb (Développé, Conçu, Géré, Analysé, Optimisé, Dirigé, Mis en place, Collaboré, Réduit, Augmenté…)
4. Degree equivalents: Bachelor/BS/BA → Licence, Master's/MS/MA → Master, PhD/Doctorate → Doctorat, MBA → MBA, Associate → BTS/DUT (use best French equivalent)
5. Skills: translate generic skills (Problem Solving → Résolution de problèmes, Leadership → Leadership, Project Management → Gestion de projet); keep technical terms as-is
6. Return ONLY a raw JSON object — no markdown, no code fences, no explanation

INPUT JSON:
${JSON.stringify({ workExperience, education, skills })}

Return a JSON object with exactly this structure (keep all original fields, only change the values listed above):
{
  "workExperience": [array with same ids, company, startDate, endDate, current — but position and description translated],
  "education": [array with same ids, school, startDate, endDate, current, gpa — but degree and field translated],
  "skills": [array of French skill strings]
}`;

    const raw = await callOpenRouter(MODEL, [
      { role: 'user', content: prompt },
    ], 3000);

    const cleaned = raw.trim()
      .replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const translated = JSON.parse(cleaned);

    return NextResponse.json({ translated });
  } catch (err) {
    console.error('CV translation error:', err);
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}
