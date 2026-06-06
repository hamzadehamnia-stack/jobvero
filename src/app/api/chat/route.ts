import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { JOBVERO_SYSTEM_PROMPT } from '@/lib/prompts/assistant';
import { withFeatureCheck } from '@/lib/subscription/withFeatureCheck';
import { streamOpenRouter } from '@/lib/openrouter';
import type { CVFormData, WorkExperience, Education } from '@/components/cv-builder/types';

const MODEL = 'deepseek/deepseek-v3.2';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ─── CV → readable text ───────────────────────────────────────────────────────

function formatCvContext(data: CVFormData): string {
  const lines: string[] = ['=== USER CV ===', ''];

  const p = data.personalInfo;
  lines.push('PERSONAL INFO');
  if (p.fullName)   lines.push(`Name:     ${p.fullName}`);
  if (p.email)      lines.push(`Email:    ${p.email}`);
  if (p.phone)      lines.push(`Phone:    ${p.phone}`);
  if (p.location)   lines.push(`Location: ${p.location}`);
  if (p.linkedin)   lines.push(`LinkedIn: ${p.linkedin}`);
  if (p.portfolio)  lines.push(`Portfolio: ${p.portfolio}`);
  lines.push('');

  if (data.workExperience?.length) {
    lines.push('WORK EXPERIENCE');
    data.workExperience.forEach((w: WorkExperience, i: number) => {
      const period = w.current ? `${w.startDate} – Present` : `${w.startDate} – ${w.endDate}`;
      lines.push(`[${i + 1}] ${w.position} @ ${w.company} (${period})`);
      if (w.description) lines.push(`    ${w.description.trim()}`);
    });
    lines.push('');
  }

  if (data.education?.length) {
    lines.push('EDUCATION');
    data.education.forEach((e: Education, i: number) => {
      lines.push(`[${i + 1}] ${e.degree} in ${e.field} — ${e.school} (${e.startDate} – ${e.endDate})`);
    });
    lines.push('');
  }

  if (data.skills?.length) {
    lines.push('SKILLS');
    lines.push(data.skills.join(', '));
    lines.push('');
  }

  const pref = data.preferences;
  if (pref) {
    lines.push('PREFERENCES');
    if (pref.targetCountry) lines.push(`Target country: ${pref.targetCountry}`);
    if (pref.language)      lines.push(`CV language:    ${pref.language}`);
    if (pref.style)         lines.push(`CV style:       ${pref.style}`);
  }

  return lines.join('\n');
}

// ─── Route ────────────────────────────────────────────────────────────────────

async function chatHandler(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { messages }: { messages: Message[] } = await req.json();
    if (!messages?.length) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    // Fetch the user's most recent CV
    const { data: cvRow } = await supabase
      .from('cvs')
      .select('form_data, title, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let cvContext: string | null = null;
    if (cvRow?.form_data) {
      try { cvContext = formatCvContext(cvRow.form_data as CVFormData); } catch { /* skip */ }
    }

    // Build system message
    const systemContent = cvContext
      ? `${JOBVERO_SYSTEM_PROMPT}\n\nHere is the current user's CV. Reference it when they ask about their CV, experience, or job applications. If they ask generic questions, don't force-mention the CV.\n\n${cvContext}`
      : JOBVERO_SYSTEM_PROMPT;

    const orMessages = [
      { role: 'system' as const, content: systemContent },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const stream = await streamOpenRouter(MODEL, orMessages, 2048);

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullText = '';

    // Wrap the stream to capture full text for DB save
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            fullText += chunk;
            controller.enqueue(encoder.encode(chunk));
          }
        } finally {
          controller.close();

          if (fullText) {
            const lastUser = messages[messages.length - 1];
            await supabase.from('chat_messages').insert([
              { user_id: user.id, role: lastUser.role,  content: lastUser.content },
              { user_id: user.id, role: 'assistant',    content: fullText },
            ]);
          }
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[/api/chat]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withFeatureCheck('AI_ASSISTANT_CHAT', chatHandler);
