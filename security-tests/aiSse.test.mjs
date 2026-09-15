// Regression test for src/lib/ai/sse.ts, the OpenRouter stream parser.
//
// Run it:  node security-tests/aiSse.test.mjs
//
// Imports the real module (pure, no imports; Node 24 strips the types). The
// payloads follow OpenRouter's streaming documentation: keep-alive comments,
// the usage chunk sent just before [DONE], and mid-stream errors as chunks.
//
// Guarded: the number of checks that ran must equal EXPECTED_CHECKS.

import { isDeepStrictEqual } from 'node:util';
import { parseSseLine, readUsage, takeLines } from '../src/lib/ai/sse.ts';

const EXPECTED_CHECKS = 14;

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  if (isDeepStrictEqual(actual, expected)) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}\n        got  ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`);
  }
}

console.log('\nOpenRouter SSE parsing');

check('a keep-alive comment is ignored', parseSseLine(': OPENROUTER PROCESSING'), { type: 'ignore' });
check('a blank line is ignored', parseSseLine(''), { type: 'ignore' });
check('a non-data field is ignored', parseSseLine('event: message'), { type: 'ignore' });
check('[DONE] ends the stream', parseSseLine('data: [DONE]'), { type: 'done' });

check('a content chunk yields its id and text',
  parseSseLine('data: {"id":"gen-abc123","choices":[{"index":0,"delta":{"content":"Hello"}}]}'),
  { type: 'chunk', id: 'gen-abc123', content: 'Hello', usage: null, error: null });

check('"data:" without a space is valid SSE',
  parseSseLine('data:{"id":"gen-1","choices":[{"delta":{"content":"x"}}]}'),
  { type: 'chunk', id: 'gen-1', content: 'x', usage: null, error: null });

check('the usage chunk yields tokens and cost',
  parseSseLine('data: {"id":"gen-abc123","choices":[{"index":0,"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":120,"completion_tokens":48,"total_tokens":168,"cost":0.00216}}'),
  { type: 'chunk', id: 'gen-abc123', content: '', usage: { promptTokens: 120, completionTokens: 48, costUsd: 0.00216 }, error: null });

check('invalid usage fields read as null, never as a number',
  readUsage({ prompt_tokens: -5, completion_tokens: 3.5, cost: '0.01' }),
  { promptTokens: null, completionTokens: null, costUsd: null });

check('a mid-stream error arrives as a chunk with a top-level error',
  parseSseLine('data: {"id":"cmpl-abc123","error":{"code":"server_error","message":"Provider disconnected"},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}'),
  { type: 'chunk', id: 'cmpl-abc123', content: '', usage: null, error: { code: 'server_error', message: 'Provider disconnected' } });

check('malformed JSON is reported, not thrown',
  parseSseLine('data: {"id":'), { type: 'malformed', raw: '{"id":' });

check('a JSON value that is not an object is malformed',
  parseSseLine('data: [1,2]'), { type: 'malformed', raw: '[1,2]' });

check('lines are split, CR stripped, and the partial line kept',
  takeLines('data: a\r\ndata: b\ndata: c'),
  { lines: ['data: a', 'data: b'], rest: 'data: c' });

check('no usage object reads as null', readUsage(undefined), null);

check('a usage-only chunk without choices has empty content',
  parseSseLine('data: {"id":"gen-2","usage":{"prompt_tokens":1,"completion_tokens":2,"cost":0.1}}'),
  { type: 'chunk', id: 'gen-2', content: '', usage: { promptTokens: 1, completionTokens: 2, costUsd: 0.1 }, error: null });


// ─── Report ───────────────────────────────────────────────────────────────────

const ran = passed + failed;
if (ran !== EXPECTED_CHECKS) {
  failed++;
  console.log(`  FAIL  REPORT expected ${EXPECTED_CHECKS} checks, ran ${ran}`);
}

console.log(failed ? `\n${failed} FAILED, ${passed} ok` : `\nall ${passed} checks passed`);
process.exit(failed ? 1 : 0);
