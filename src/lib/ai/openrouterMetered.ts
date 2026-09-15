import { openRouterHeaders, type ORMessage } from '@/lib/openrouter';
import { parseSseLine, readUsage, takeLines, type StreamError, type StreamUsage } from './sse';

// ─── Metered OpenRouter calls ─────────────────────────────────────────────────
//
// The calls of lib/openrouter.ts, returning what billing needs besides the
// text: the generation id and the usage block. lib/openrouter.ts stays for the
// routes not yet migrated, and goes with the last of them (step 2e).
//
// The generation id is read from the X-Generation-Id response header, which
// OpenRouter documents on every endpoint, so it is known before the first
// chunk; a chunk's own `id` is the fallback.

const CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

// A provider that accepts a stream and then produces nothing would hold the
// function until its maximum duration. No content by this deadline counts as a
// failure before content, which is refunded.
const DEFAULT_FIRST_CONTENT_TIMEOUT_MS = 30_000;

export class UpstreamError extends Error {
  readonly status:       number | null;
  readonly generationId: string | null;

  constructor(message: string, status: number | null, generationId: string | null) {
    super(message);
    this.name         = 'UpstreamError';
    this.status       = status;
    this.generationId = generationId;
  }
}


// ─── Non-streaming ────────────────────────────────────────────────────────────

export interface MeteredCompletion {
  text:         string;
  generationId: string | null;
  usage:        StreamUsage | null;
}

/**
 * One non-streaming completion. OpenRouter keeps generating — and billing — a
 * non-streaming request even when the caller stops waiting, so the timeout
 * bounds this function, not the cost. When the headers arrived first, the
 * generation id still lets the cost be recovered later.
 */
export async function callOpenRouterMetered(options: {
  model:     string;
  messages:  ORMessage[];
  maxTokens: number;
  timeoutMs: number;
}): Promise<MeteredCompletion> {
  let res: Response;
  try {
    res = await fetch(CHAT_COMPLETIONS_URL, {
      method:  'POST',
      headers: openRouterHeaders(),
      body:    JSON.stringify({ model: options.model, messages: options.messages, max_tokens: options.maxTokens }),
      signal:  AbortSignal.timeout(options.timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(`request failed: ${String(err)}`, null, null);
  }

  const headerGenerationId = res.headers.get('x-generation-id');

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new UpstreamError(`OpenRouter ${res.status}: ${detail.slice(0, 300)}`, res.status, headerGenerationId);
  }

  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    throw new UpstreamError(`unreadable response: ${String(err)}`, res.status, headerGenerationId);
  }

  const generationId = headerGenerationId ?? (typeof json.id === 'string' ? json.id : null);
  const choices      = Array.isArray(json.choices) ? (json.choices as Array<{ message?: { content?: unknown } }>) : [];
  const text         = choices[0]?.message?.content;

  if (json.error != null || typeof text !== 'string' || text.length === 0) {
    const detail = json.error != null ? `: ${JSON.stringify(json.error).slice(0, 300)}` : '';
    throw new UpstreamError(`no completion in the response${detail}`, res.status, generationId);
  }

  return { text, generationId, usage: readUsage(json.usage) };
}


// ─── Streaming ────────────────────────────────────────────────────────────────

export interface StreamSummary {
  generationId:  string | null;
  /** At least one content chunk was forwarded: onFirstContent had succeeded. */
  contentSeen:   boolean;
  /** The usage chunk, when it arrived. */
  usage:         StreamUsage | null;
  /** The client went away and the upstream request was aborted. */
  clientAborted: boolean;
  /** An upstream error, the first-content timeout, or a failed onFirstContent. */
  error:         StreamError | null;
  /** Everything forwarded to the client, in order: the whole answer when the stream completed. */
  text:          string;
}

export interface StreamLifecycle {
  /**
   * The first content chunk, before it is forwarded. The cost is real from here,
   * so this is where the credit is settled. If it throws, nothing is forwarded
   * and the upstream request is aborted.
   */
  onFirstContent(generationId: string | null): Promise<void>;
  /** Once, when the stream is over: completed, abandoned by the client, or failed. */
  onEnd(summary: StreamSummary): Promise<void>;
}

type AbortReason = 'client' | 'timeout' | 'internal';

/**
 * One streaming completion. Throws UpstreamError when the request is refused
 * before any stream exists — no lifecycle call has happened, the caller
 * refunds. Otherwise returns the text stream and reports through the lifecycle.
 *
 * When the client disconnects, the upstream request is aborted: OpenRouter
 * documents that, for providers supporting cancellation, this stops processing
 * and billing.
 */
export async function streamOpenRouterMetered(options: {
  model:                  string;
  messages:               ORMessage[];
  maxTokens:              number;
  lifecycle:              StreamLifecycle;
  clientSignal?:          AbortSignal;
  firstContentTimeoutMs?: number;
}): Promise<ReadableStream<Uint8Array>> {
  const upstream = new AbortController();
  const abort: { reason: AbortReason | null } = { reason: null };

  const abortWith = (reason: AbortReason) => {
    if (abort.reason === null) abort.reason = reason;
    upstream.abort();
  };

  const onClientAbort = () => abortWith('client');
  options.clientSignal?.addEventListener('abort', onClientAbort, { once: true });

  const firstContentTimer = setTimeout(
    () => abortWith('timeout'),
    options.firstContentTimeoutMs ?? DEFAULT_FIRST_CONTENT_TIMEOUT_MS,
  );

  const release = () => {
    clearTimeout(firstContentTimer);
    options.clientSignal?.removeEventListener('abort', onClientAbort);
  };

  let res: Response;
  try {
    res = await fetch(CHAT_COMPLETIONS_URL, {
      method:  'POST',
      headers: openRouterHeaders(),
      body:    JSON.stringify({
        model:      options.model,
        messages:   options.messages,
        max_tokens: options.maxTokens,
        stream:     true,
      }),
      signal:  upstream.signal,
    });
  } catch (err) {
    release();
    throw new UpstreamError(`stream request failed: ${abort.reason ?? String(err)}`, null, null);
  }

  let generationId = res.headers.get('x-generation-id');

  if (!res.ok || !res.body) {
    release();
    const detail = await res.text().catch(() => '');
    throw new UpstreamError(`OpenRouter stream ${res.status}: ${detail.slice(0, 300)}`, res.status, generationId);
  }

  const body    = res.body;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      let buffer      = '';
      let contentSeen = false;
      let usage: StreamUsage | null = null;
      let error: StreamError | null = null;
      let text = '';

      try {
        reading: while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const { lines, rest } = takeLines(buffer);
          buffer = rest;

          for (const line of lines) {
            const event = parseSseLine(line);
            if (event.type === 'done') break reading;
            if (event.type !== 'chunk') continue;

            generationId = generationId ?? event.id;
            if (event.usage) usage = event.usage;
            if (event.error) {
              error = event.error;
              break reading;
            }
            if (event.content.length === 0) continue;

            if (!contentSeen) {
              clearTimeout(firstContentTimer);
              await options.lifecycle.onFirstContent(generationId);
              contentSeen = true;
            }
            text += event.content;
            controller.enqueue(encoder.encode(event.content));
          }
        }
      } catch (err) {
        if (abort.reason === null) {
          error = { code: null, message: String(err) };
          abortWith('internal');
        }
      } finally {
        release();

        if (abort.reason === 'timeout' && !contentSeen && error === null) {
          error = { code: 'timeout', message: 'no content before the first-content deadline' };
        }

        try {
          await options.lifecycle.onEnd({
            generationId,
            contentSeen,
            usage,
            clientAborted: abort.reason === 'client',
            error,
            text,
          });
        } catch (err) {
          console.error('[openrouter/stream] onEnd failed:', err);
        }

        try {
          controller.close();
        } catch {
          // The client already cancelled the stream.
        }
      }
    },

    cancel() {
      // The client went away. start() sees the abort, then reports it.
      abortWith('client');
    },
  });
}
