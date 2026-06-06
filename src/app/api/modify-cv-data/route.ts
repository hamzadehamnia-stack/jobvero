import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';
import { withFeatureCheck } from '@/lib/subscription/withFeatureCheck';

const MODEL = 'anthropic/claude-sonnet-4-6';

async function handler(req: Request) {
  try {
    const { formData, instruction } = await req.json();

    if (!formData || !instruction?.trim()) {
      return NextResponse.json({ error: 'Missing formData or instruction' }, { status: 400 });
    }

    const raw = await callOpenRouter(MODEL, [
      {
        role: 'system',
        content:
          'You are an expert CV editor. You receive a CV as structured JSON data and a modification instruction. ' +
          'Apply the instruction by updating only the relevant fields in the JSON. ' +
          'Never change the structure, keys, or types — only update values. ' +
          'Return ONLY valid JSON with the exact same structure. No explanation, no markdown fences.',
      },
      {
        role: 'user',
        content: `INSTRUCTION: ${instruction}\n\nCV DATA (JSON):\n${JSON.stringify(formData, null, 2)}`,
      },
    ], 4096);

    let cleaned = raw.trim()
      .replace(/^```json\n?/i, '').replace(/^```\n?/i, '').replace(/\n?```$/i, '').trim();

    const modified = JSON.parse(cleaned);
    return NextResponse.json({ formData: modified });
  } catch (err: unknown) {
    console.error('CV data modification error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Modification failed' },
      { status: 500 },
    );
  }
}

export const POST = withFeatureCheck('MODIFY_DOCUMENT_AI', handler);
