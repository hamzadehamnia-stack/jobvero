import { NextResponse } from 'next/server';
import { withAiAction, type AiActionContext } from '@/lib/ai/withAiAction';

export const runtime     = 'nodejs';
export const maxDuration = 180;

async function handler(req: Request, ai: AiActionContext) {
  try {
    const { html, instruction } = await req.json();

    if (!html || !instruction?.trim()) {
      return NextResponse.json({ error: 'Missing content or instruction' }, { status: 400 });
    }

    let modifiedHtml = await ai.complete([
      {
        role: 'system',
        content:
          'You are an expert editor. Modify the following document according to the user\'s instruction. ' +
          'Keep the same language, overall structure, and HTML formatting style. ' +
          'Return only the modified HTML, no explanation, no markdown fences.',
      },
      {
        role: 'user',
        content: `INSTRUCTION: ${instruction}\n\nDOCUMENT HTML:\n${html}`,
      },
    ], { timeoutMs: 150_000 });

    modifiedHtml = modifiedHtml.trim()
      .replace(/^```html\n?/i, '').replace(/\n?```$/i, '').trim();

    return NextResponse.json({ html: modifiedHtml });
  } catch (err: unknown) {
    console.error('Document modification error:', err);
    return NextResponse.json(
      { error: 'Modification failed' },
      { status: 500 },
    );
  }
}

export const POST = withAiAction({ feature: 'MODIFY_DOCUMENT_AI', action: 'cv_transform' }, handler);
