// ─── OpenRouter streaming: line parsing ───────────────────────────────────────
//
// No imports and no I/O, so the parsing rules are tested directly:
//   node security-tests/aiSse.test.mjs
//
// What OpenRouter documents about its chat-completions stream, and what this
// relies on:
//   - events are `data: <json>` lines, and the stream ends with `data: [DONE]`
//   - comment lines such as `: OPENROUTER PROCESSING` keep the connection
//     alive; per the SSE spec they carry nothing and are ignored
//   - every stream ends with an extra chunk carrying the `usage` object, sent
//     just before [DONE]
//   - an error after the stream has started arrives as a chunk with a
//     top-level `error` and finish_reason "error", not as an HTTP status
//   - the generation id is in the X-Generation-Id response header, read by the
//     caller; chunks carry it too, as `id`

export interface StreamUsage {
  promptTokens:     number | null;
  completionTokens: number | null;
  costUsd:          number | null;
}

export interface StreamError {
  code:    string | null;
  message: string;
}

export type SseEvent =
  | { type: 'ignore' }
  | { type: 'done' }
  | { type: 'malformed'; raw: string }
  | { type: 'chunk'; id: string | null; content: string; usage: StreamUsage | null; error: StreamError | null };

/** Splits a buffer into complete lines, stripping CR, and returns the unterminated rest. */
export function takeLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split('\n');
  const rest  = parts.pop() ?? '';
  return {
    lines: parts.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line)),
    rest,
  };
}

export function parseSseLine(line: string): SseEvent {
  if (line === '' || line.startsWith(':')) return { type: 'ignore' };

  // event:, id: and retry: fields carry nothing this stream uses.
  if (!line.startsWith('data:')) return { type: 'ignore' };

  // "data:x" and "data: x" are both valid SSE.
  const payload = line.slice(5).trimStart();
  if (payload === '[DONE]') return { type: 'done' };

  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return { type: 'malformed', raw: payload.slice(0, 200) };
  }
  if (!isRecord(json)) return { type: 'malformed', raw: payload.slice(0, 200) };

  const choice  = Array.isArray(json.choices) && isRecord(json.choices[0]) ? json.choices[0] : null;
  const delta   = choice && isRecord(choice.delta) ? choice.delta : null;
  const content = delta && typeof delta.content === 'string' ? delta.content : '';

  return {
    type:  'chunk',
    id:    typeof json.id === 'string' ? json.id : null,
    content,
    usage: readUsage(json.usage),
    error: readError(json.error),
  };
}

/**
 * The usage object of a stream chunk or of a non-streaming response; null when
 * absent. A field that is not a valid count or amount reads as null, never as
 * a number that would be written to the ledger.
 */
export function readUsage(raw: unknown): StreamUsage | null {
  if (!isRecord(raw)) return null;
  return {
    promptTokens:     nonNegativeInteger(raw.prompt_tokens),
    completionTokens: nonNegativeInteger(raw.completion_tokens),
    costUsd:          nonNegativeNumber(raw.cost),
  };
}

function readError(raw: unknown): StreamError | null {
  if (!isRecord(raw)) return null;
  return {
    code:    typeof raw.code === 'string' || typeof raw.code === 'number' ? String(raw.code) : null,
    message: typeof raw.message === 'string' ? raw.message : 'unknown upstream error',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
