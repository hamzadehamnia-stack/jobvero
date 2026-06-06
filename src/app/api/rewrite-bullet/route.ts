import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';
import { withFeatureCheck } from '@/lib/subscription/withFeatureCheck';

const MODEL = 'deepseek/deepseek-v3.2';

function countryStyle(targetCountry: string, language: string): string {
  const isFrench =
    language === 'fr' ||
    ['France', 'Belgique', 'Suisse', 'Luxembourg'].includes(targetCountry);
  if (isFrench) {
    return 'Use French. Start each version with an action verb in infinitive form (ex: Développer, Réduire, Gérer, Piloter). Tone: professional French CV.';
  }
  if (['Espagne', 'Spain'].includes(targetCountry) || language === 'es') {
    return 'Use Spanish. Start with an action verb in infinitive (ex: Desarrollar, Reducir, Gestionar). Tone: professional Spanish CV.';
  }
  if (['Portugal', 'Brazil', 'Brasil'].includes(targetCountry) || language === 'pt') {
    return 'Use Portuguese. Start with an action verb in infinitive (ex: Desenvolver, Reduzir, Gerenciar). Tone: professional PT CV.';
  }
  return 'Use English. Start with a strong past-tense action verb (ex: Led, Built, Reduced, Delivered, Increased, Streamlined). ATS-optimized with metrics.';
}

async function handler(req: Request) {
  try {
    const { bullet, jobTitle, company, targetCountry, language } = await req.json() as {
      bullet: string;
      jobTitle?: string;
      company?: string;
      targetCountry?: string;
      language?: string;
    };

    if (!bullet?.trim()) {
      return NextResponse.json({ error: 'bullet is required' }, { status: 400 });
    }

    const style = countryStyle(targetCountry ?? 'USA', language ?? 'en');

    const prompt = `You are an expert CV writer. Rewrite the following CV bullet point in exactly 3 improved versions.

Original bullet: "${bullet.trim()}"
${jobTitle ? `Role: ${jobTitle}` : ''}${company ? `\nCompany: ${company}` : ''}
Target country: ${targetCountry ?? 'USA'}

Style rules:
- ${style}
- Max 120 characters per version
- Add plausible quantified impact where missing (%, time saved, users, revenue, team size)
- Each version takes a different angle: impact focus, scope/scale focus, initiative/ownership focus
- No bullet character prefix — return plain text only
- No quotes around the versions

Return EXACTLY 3 versions separated by ||| with absolutely no other text or line breaks.

Format: version1|||version2|||version3`;

    const raw = await callOpenRouter(MODEL, [
      { role: 'user', content: prompt },
    ], 512);

    const versions = raw
      .trim()
      .split('|||')
      .map(v => v.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);

    if (versions.length < 3) {
      throw new Error('Model did not return 3 versions');
    }

    return NextResponse.json({ versions: versions.slice(0, 3) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to rewrite bullet';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = withFeatureCheck('MODIFY_DOCUMENT_AI', handler);
