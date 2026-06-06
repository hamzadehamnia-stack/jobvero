import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';
import { withFeatureCheck } from '@/lib/subscription/withFeatureCheck';

const MODEL = 'deepseek/deepseek-v3.2';

async function handler(req: Request) {
  try {
    const body = await req.json();
    const { jobTitle, companyName, jobDescription, tone, language, userName, userEmail } = body;

    const languageMap: Record<string, string> = {
      en: 'English', fr: 'French', es: 'Spanish', pt: 'Portuguese',
    };
    const cvLanguage = languageMap[language] ?? 'English';

    const toneGuide: Record<string, string> = {
      Professional: 'confident, results-oriented, and polished. Use clear business language with strong action verbs. Avoid contractions. Focus on measurable impact and professional achievements.',
      Friendly:     'warm, approachable, and genuine. Show enthusiasm for the role while keeping it professional. Use a conversational tone that feels human and personable.',
      Formal:       'structured, authoritative, and precise. Use formal language, complete sentences, and a traditional letter format. Show respect for the institution.',
    };

    const today = new Date();
    const dateStr = today.toLocaleDateString(
      language === 'fr' ? 'fr-FR' : language === 'es' ? 'es-ES' : language === 'pt' ? 'pt-BR' : 'en-US',
      { year: 'numeric', month: 'long', day: 'numeric' }
    );

    const systemPrompt =
      `You are an expert career coach. Generate a professional cover letter in ${cvLanguage} for a ${tone} application. ` +
      `Use the candidate's profile and the job description to write a compelling, personalized letter. ` +
      `Format: opening paragraph (why this company), body (relevant experience + skills), closing (call to action). ` +
      `Maximum 350 words.`;

    const userPrompt = `Write a cover letter with these details:

CANDIDATE:
- Name: ${userName || 'the applicant'}
${userEmail ? `- Email: ${userEmail}` : ''}

JOB:
- Position: ${jobTitle}
- Company: ${companyName}
- Today's date: ${dateStr}

JOB DESCRIPTION:
"""
${jobDescription}
"""

TONE: ${tone} — ${toneGuide[tone] ?? toneGuide.Professional}

STRICT RULES:
1. Write the ENTIRE letter in ${cvLanguage}
2. Analyze and mirror the job description's language and key requirements
3. Keep it to 3 paragraphs, under 350 words total
4. Make it feel tailored and human — NOT generic
5. Tone must be: ${tone}

Format the output as clean HTML with inline styles. Make it look like a real business letter on white paper:
- Clean sans-serif font (font-family: 'Helvetica Neue', Arial, sans-serif)
- White background, proper padding (40px 48px)
- Sender info at top right (name, email)
- Date below sender
- Company/recipient block on left
- Salutation, 3 body paragraphs, closing, signature
- Font size 13px, line-height 1.7, color #1a1a2e
- Section spacing with margin-bottom
- No page breaks, print-ready

Return ONLY the HTML (no \`\`\`html fences, no explanations). Start directly with the outer div.`;

    let html = await callOpenRouter(MODEL, [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ], 2048);

    html = html.replace(/^```html\n?/i, '').replace(/\n?```$/i, '').trim();

    return NextResponse.json({ html });
  } catch (err: unknown) {
    console.error('Cover letter generation error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    );
  }
}

export const POST = withFeatureCheck('COVER_LETTER_AI', handler);
