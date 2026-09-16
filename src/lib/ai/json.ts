// ─── Reading JSON a model wrote ───────────────────────────────────────────────
//
// A model told "pure JSON only" still opens with a sentence, wraps the object
// in a code fence, or adds a word at the end. Every route that parses a model's
// answer goes through here, so that habit costs nobody a failed request.
//
// What this does NOT do is invent. When there is no object, or it does not
// parse — the answer was cut off at the token ceiling, say — this throws, the
// route answers an error and the credit goes back. A half-read CV or a made-up
// score would be worse than a refusal: the user would keep it.

export function readJsonObject(text: string): unknown {
  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();

  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end < start) {
    throw new Error('no JSON object in the answer (it may have been cut off)');
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

/** An integer the model was asked for, inside its range; throws when it is missing. */
export function readScore(value: unknown, field: string, max = 100): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`${field} is missing from the answer`);
  return Math.max(0, Math.min(max, Math.round(n)));
}
