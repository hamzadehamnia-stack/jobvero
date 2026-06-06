import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';
import { withFeatureCheck } from '@/lib/subscription/withFeatureCheck';
import type { CVFormData } from '@/components/cv-builder/types';

const MODEL = 'google/gemini-3-flash-preview';

async function handler(req: Request) {
  try {
    const { cvData, jobDescription } = await req.json() as {
      cvData: CVFormData;
      jobDescription: string;
    };

    if (!jobDescription?.trim()) {
      return NextResponse.json({ error: 'jobDescription is required' }, { status: 400 });
    }

    const { personalInfo: p, workExperience: we, education: edu, skills, skillCategories } = cvData;

    const allSkills = [
      ...skills,
      ...skillCategories.flatMap(c => c.items),
    ].filter(Boolean);

    const cvText = [
      p.fullName ? `Candidate: ${p.fullName}` : '',
      we.length > 0
        ? 'Work Experience:\n' + we.map(e =>
            `- ${e.position} at ${e.company}${e.description ? ': ' + e.description : ''}`
          ).join('\n')
        : '',
      edu.length > 0
        ? 'Education:\n' + edu.map(e =>
            `- ${[e.degree, e.field, e.school].filter(Boolean).join(', ')}`
          ).join('\n')
        : '',
      allSkills.length > 0 ? `Skills: ${allSkills.join(', ')}` : '',
    ].filter(Boolean).join('\n\n');

    const prompt = `You are an ATS expert and senior recruiter. Analyze the compatibility between this CV and the job description.

CV:
${cvText}

JOB DESCRIPTION:
${jobDescription.trim()}

Respond with a single JSON object — no markdown, no explanation, no extra text:
{
  "score": <integer 0-100 representing match percentage>,
  "summary": "<2-sentence overall assessment of the match>",
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "presentKeywords": ["<keyword that appears in both CV and JD>"],
  "missingKeywords": ["<important keyword from JD absent in CV>"],
  "suggestions": ["<actionable improvement 1>", "<actionable improvement 2>", "<actionable improvement 3>"],
  "critical": ["<critical disqualifying gap if any>"]
}

Scoring guide: 75-100 strong match, 50-74 partial match, 0-49 weak match.`;

    const raw = (await callOpenRouter(MODEL, [
      { role: 'user', content: prompt },
    ], 1024))
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const result = JSON.parse(raw);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to analyze CV match';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = withFeatureCheck('ATS_SCORE', handler);
