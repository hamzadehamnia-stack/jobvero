import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';
import { withFeatureCheck } from '@/lib/subscription/withFeatureCheck';

const MODEL = 'anthropic/claude-sonnet-4.6';

async function handler(req: Request) {
  try {
    const { html, instruction } = await req.json();

    if (!html || !instruction?.trim()) {
      return NextResponse.json({ error: 'Missing content or instruction' }, { status: 400 });
    }

    let modifiedHtml = await callOpenRouter(MODEL, [
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
    ], 2048);

    modifiedHtml = modifiedHtml.trim()
      .replace(/^```html\n?/i, '').replace(/\n?```$/i, '').trim();

    return NextResponse.json({ html: modifiedHtml });
  } catch (err: unknown) {
    console.error('Document modification error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Modification failed' },
      { status: 500 },
    );
  }
}

export const POST = withFeatureCheck('MODIFY_DOCUMENT_AI', handler);
