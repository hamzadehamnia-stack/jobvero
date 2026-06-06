const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';

function headers(): Record<string, string> {
  return {
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://getjobvero.com',
    'X-Title': 'Jobvero',
  };
}

export interface ORMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | unknown[];
}

/** Non-streaming call — returns the full text response. */
export async function callOpenRouter(
  model: string,
  messages: ORMessage[],
  max_tokens = 1000,
): Promise<string> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ model, messages, max_tokens }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenRouter ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from OpenRouter');
  return text;
}

/** Streaming call — returns a ReadableStream that emits raw text chunks. */
export async function streamOpenRouter(
  model: string,
  messages: ORMessage[],
  max_tokens = 2048,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ model, messages, max_tokens, stream: true }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenRouter stream ${res.status}: ${JSON.stringify(err)}`);
  }

  if (!res.body) throw new Error('No response body from OpenRouter');

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = res.body!.getReader();
      let buffer = '';
      let fullText = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const payload = trimmed.slice(6);
            if (payload === '[DONE]') continue;
            try {
              const parsed = JSON.parse(payload) as {
                choices?: { delta?: { content?: string } }[];
              };
              const chunk = parsed.choices?.[0]?.delta?.content;
              if (chunk) {
                fullText += chunk;
                controller.enqueue(encoder.encode(chunk));
              }
            } catch {
              // skip malformed SSE chunk
            }
          }
        }
      } finally {
        controller.close();
      }

      // Expose the full assembled text so callers can save it after streaming
      (controller as unknown as { __fullText: string }).__fullText = fullText;
    },
  });
}
