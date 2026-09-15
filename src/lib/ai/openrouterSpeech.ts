import { openRouterHeaders } from '@/lib/openrouter';
import { UpstreamError } from './openrouterMetered';
import { readUsage, type StreamUsage } from './sse';

// ─── Metered OpenRouter speech calls ──────────────────────────────────────────
//
// Speech-to-text and text-to-speech through OpenRouter's audio endpoints,
// returning what billing needs besides the result: the generation id, and the
// cost when the response carries one. The models are pinned in the catalogue
// (ai_action_costs.limits.models of interview_session). Measured on 2026-09-15:
//   · transcriptions accept response_format json or verbose_json only, and
//     return their cost in usage;
//   · speech is raw PCM unless response_format asks for MP3, which a browser
//     plays directly.

const TRANSCRIPTIONS_URL = 'https://openrouter.ai/api/v1/audio/transcriptions';
const SPEECH_URL         = 'https://openrouter.ai/api/v1/audio/speech';

// The JSON headers without their Content-Type: a multipart body sets its own.
function multipartHeaders(): Record<string, string> {
  const headers = openRouterHeaders();
  delete headers['Content-Type'];
  return headers;
}

export interface MeteredTranscript {
  text:         string;
  generationId: string | null;
  usage:        StreamUsage | null;
}

export async function transcribeMetered(options: {
  model:     string;
  audio:     Blob;
  filename:  string;
  language:  string;
  timeoutMs: number;
}): Promise<MeteredTranscript> {
  const form = new FormData();
  form.append('file', options.audio, options.filename);
  form.append('model', options.model);
  form.append('response_format', 'json');
  form.append('language', options.language);

  let res: Response;
  try {
    res = await fetch(TRANSCRIPTIONS_URL, {
      method:  'POST',
      headers: multipartHeaders(),
      body:    form,
      signal:  AbortSignal.timeout(options.timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(`transcription request failed: ${String(err)}`, null, null);
  }

  const generationId = res.headers.get('x-generation-id');

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new UpstreamError(`OpenRouter transcription ${res.status}: ${detail.slice(0, 300)}`, res.status, generationId);
  }

  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    throw new UpstreamError(`unreadable transcription: ${String(err)}`, res.status, generationId);
  }
  if (typeof json.text !== 'string') {
    throw new UpstreamError('no text in the transcription', res.status, generationId);
  }

  return { text: json.text, generationId, usage: readUsage(json.usage) };
}

export interface MeteredSpeech {
  audio:        Buffer;
  mimeType:     string;
  generationId: string | null;
}

export async function synthesizeMetered(options: {
  model:     string;
  voice:     string;
  input:     string;
  timeoutMs: number;
}): Promise<MeteredSpeech> {
  let res: Response;
  try {
    res = await fetch(SPEECH_URL, {
      method:  'POST',
      headers: openRouterHeaders(),
      body:    JSON.stringify({ model: options.model, voice: options.voice, input: options.input, response_format: 'mp3' }),
      signal:  AbortSignal.timeout(options.timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(`speech request failed: ${String(err)}`, null, null);
  }

  const generationId = res.headers.get('x-generation-id');

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new UpstreamError(`OpenRouter speech ${res.status}: ${detail.slice(0, 300)}`, res.status, generationId);
  }

  const mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  if (mimeType !== 'audio/mpeg') {
    throw new UpstreamError(`speech came back as ${mimeType || 'nothing'}, not MP3`, res.status, generationId);
  }

  let audio: Buffer;
  try {
    audio = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    throw new UpstreamError(`unreadable speech: ${String(err)}`, res.status, generationId);
  }
  if (audio.length === 0) throw new UpstreamError('empty speech', res.status, generationId);

  return { audio, mimeType, generationId };
}
