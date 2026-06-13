import { NextResponse } from 'next/server';
import { callOpenRouter } from '@/lib/openrouter';
import { withFeatureCheck } from '@/lib/subscription/withFeatureCheck';

const MODEL = 'anthropic/claude-sonnet-4.6';

async function handler(req: Request) {
  try {
    const { formData, instruction } = await req.json();

    if (!formData || !instruction?.trim()) {
      return NextResponse.json({ error: 'Missing formData or instruction' }, { status: 400 });
    }

    const raw = await callOpenRouter(MODEL, [
      {
        role: 'system',
        content: `You are a precision CV data editor. You receive structured CV data as JSON and a natural-language instruction. Apply the instruction surgically.

STRICT RULES:
1. Return ONLY valid JSON — no markdown fences, no explanation, no code comments.
2. Preserve the EXACT top-level structure: every key that exists in the input must exist in the output with the same type.
3. Arrays (workExperience, education, skills): preserve ALL existing items unless the instruction explicitly says to remove one. When adding a new entry, generate a short unique id ("w3", "e2", etc.) and use empty strings "" for fields not mentioned.
4. Boolean fields (current): always return true or false — never a string "true"/"false".
5. Date fields: always use "YYYY-MM" format. If the instruction gives a year only, use "YYYY-01".
6. NEVER fabricate data — only use information explicitly stated in the instruction.
7. If the instruction targets a specific role (e.g. "the first job", "my job at Acme"), modify only that entry. Leave all others unchanged.
8. Skills array: if adding skills, append to the existing array. If removing, filter by exact match. Never reorder unless explicitly asked.
9. If the instruction is ambiguous, make the minimal change that satisfies the most obvious interpretation.
10. The output JSON must be directly parseable with JSON.parse() — no trailing commas, no comments.`,
      },
      {
        role: 'user',
        content: `INSTRUCTION: ${instruction}\n\nCV DATA (JSON):\n${JSON.stringify(formData, null, 2)}`,
      },
    ], 5000);

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
