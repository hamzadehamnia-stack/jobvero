import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { streamOpenRouter } from '@/lib/openrouter';

const MODEL = 'anthropic/claude-sonnet-4.6';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese',
};

interface ApiMessage {
  role: 'user' | 'assistant';
  content: string;
}

function cvToText(content: Record<string, unknown>): string {
  const parts: string[] = [];

  const pi = content.personalInfo as Record<string, string> | undefined;
  if (pi?.fullName) {
    const lines = [`Name: ${pi.fullName}`];
    if (pi.email)     lines.push(`Email: ${pi.email}`);
    if (pi.phone)     lines.push(`Phone: ${pi.phone}`);
    if (pi.location)  lines.push(`Location: ${pi.location}`);
    if (pi.linkedin)  lines.push(`LinkedIn: ${pi.linkedin}`);
    if (pi.portfolio) lines.push(`Portfolio: ${pi.portfolio}`);
    parts.push(lines.join('\n'));
  }

  const we = content.workExperience as Array<Record<string, unknown>> | undefined;
  if (we?.length) {
    const lines = we.map(e => {
      const period = e.current ? `${e.startDate} – Present` : `${e.startDate} – ${e.endDate}`;
      return `- ${e.position} at ${e.company} (${period})\n  ${e.description ?? ''}`;
    });
    parts.push(`Work Experience:\n${lines.join('\n')}`);
  }

  const edu = content.education as Array<Record<string, unknown>> | undefined;
  if (edu?.length) {
    const lines = edu.map(e => {
      const period = e.current ? `${e.startDate} – Present` : `${e.startDate} – ${e.endDate}`;
      return `- ${e.degree} in ${e.field} at ${e.school} (${period})${e.gpa ? `, GPA: ${e.gpa}` : ''}`;
    });
    parts.push(`Education:\n${lines.join('\n')}`);
  }

  const skills = content.skills as string[] | undefined;
  if (skills?.length) parts.push(`Skills: ${skills.join(', ')}`);

  const cats = content.skillCategories as Array<{ name: string; items: string[] }> | undefined;
  if (cats?.length) {
    const catLines = cats.filter(c => c.items?.length).map(c => `- ${c.name}: ${c.items.join(', ')}`);
    if (catLines.length) parts.push(`Skill Categories:\n${catLines.join('\n')}`);
  }

  return parts.join('\n\n');
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      messages,
      jobDescription,
      interviewType,
      difficulty,
      language,
      questionNumber,
      cvId,
    }: {
      messages: ApiMessage[];
      jobDescription: string;
      interviewType: string;
      difficulty: string;
      language: string;
      questionNumber: number;
      cvId?: string;
    } = await req.json();

    const lang = LANGUAGE_NAMES[language] ?? 'English';

    let cvContent = '';
    if (cvId) {
      const { data: cv } = await supabase
        .from('cvs')
        .select('form_data')
        .eq('id', cvId)
        .eq('user_id', user.id)
        .single();
      if (cv?.form_data) {
        cvContent = cvToText(cv.form_data as Record<string, unknown>);
      }
    }

    let formatRules: string;
    if (questionNumber === 0) {
      formatRules = `Ask the first interview question directly. No preamble, no greeting, no introduction — just the question itself.`;
    } else if (questionNumber < 8) {
      formatRules = `After reviewing the candidate's answer, respond EXACTLY in this format — do not deviate:

FEEDBACK: [2-3 sentences: acknowledge what was good, then suggest one specific improvement]

QUESTION: [Question ${questionNumber + 1} of 8 — your next interview question]`;
    } else {
      formatRules = `After reviewing the candidate's final answer, respond EXACTLY in this format — do not deviate:

FEEDBACK: [2-3 sentences of feedback on the last answer]

FINAL_REPORT:
{"score": <integer 0-100>, "strengths": ["<point>", "<point>", "<point>"], "improvements": ["<area>", "<area>", "<area>"], "tips": ["<tip>", "<tip>", "<tip>"]}

The JSON must be valid and on a single line after FINAL_REPORT:.`;
    }

    const systemPrompt = `You are a professional recruiter conducting a realistic job interview.
${cvContent ? `Candidate CV:\n${cvContent}` : ''}
${jobDescription?.trim() ? `Job offer they are applying for:\n${jobDescription.trim()}` : ''}
Your role: Ask questions specifically tailored to their CV and the job offer. Reference their actual experience, skills, and background. Focus on gaps between their CV and the job requirements. Ask about specific projects or technologies mentioned in their CV. Be a realistic but encouraging recruiter. Ask one question at a time. After each answer give brief constructive feedback (2-3 sentences). This is a ${interviewType} interview for a ${difficulty}-level position.

RESPONSE FORMAT RULES:
${formatRules}

Conduct the interview entirely in ${lang}. Be specific, constructive, and professional.`;

    const apiMessages: ApiMessage[] = questionNumber === 0
      ? [{ role: 'user', content: 'Please begin the interview.' }]
      : messages;

    const stream = await streamOpenRouter(MODEL, [
      { role: 'system', content: systemPrompt },
      ...apiMessages,
    ], 1024);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[/api/interview-coach]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
