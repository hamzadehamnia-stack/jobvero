import { JobContext } from '../types';
import { isValidEmailFormat, isBlacklisted, normalizeEmail } from '../utils/email-validate';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'deepseek/deepseek-chat';
const FETCH_TIMEOUT_MS = 8000;
const LLM_TIMEOUT_MS = 15000;
const MAX_HTML_CHARS = 12000;

interface ExtractResult {
  email: string;
  evidenceUrl: string;
}

async function fetchAndClean(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JobveroBot/1.0; +https://getjobvero.com)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en;q=0.9,fr;q=0.8',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });

    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('html') && !ct.includes('text')) return null;

    const html = await res.text();

    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, MAX_HTML_CHARS);
  } catch {
    return null;
  }
}

function buildCandidateUrls(ctx: JobContext): string[] {
  const urls = new Set<string>();
  if (ctx.jobUrl) urls.add(ctx.jobUrl);
  if (ctx.companyCareersUrl) urls.add(ctx.companyCareersUrl);
  urls.add(`https://${ctx.companyDomain}/careers`);
  urls.add(`https://${ctx.companyDomain}/jobs`);
  return [...urls].slice(0, 2);
}

async function extractWithLLM(html: string, ctx: JobContext): Promise<string | null> {
  const prompt = `You are extracting recruiter/HR email addresses from a job page HTML.

Company: ${ctx.companyName}
Domain: ${ctx.companyDomain}

Look for emails like careers@, jobs@, recruiting@, recruitment@, hr@, rh@, talent@, rrhh@, recrutement@, karriere@, or any named recruiter email at the company.

Return ONLY a JSON object, no other text:
{"email": "<best email or null>", "confidence": "high|medium|low"}

If no recruiting/HR email is found, return {"email": null, "confidence": "low"}.
Do NOT invent or guess. Only return emails that actually appear in the HTML.

HTML content (truncated):
${html}`;

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://getjobvero.com',
        'X-Title': 'Jobvero',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        response_format: { type: 'json_object' },
        max_tokens: 150,
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn('[N1] OpenRouter non-OK:', res.status);
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as { email?: string | null; confidence?: string };
    if (!parsed.email || typeof parsed.email !== 'string') return null;
    if (parsed.confidence === 'low') return null;

    const email = normalizeEmail(parsed.email);
    if (!isValidEmailFormat(email) || isBlacklisted(email)) return null;

    return email;
  } catch (err) {
    console.warn('[N1] LLM extraction failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function tryN1(ctx: JobContext): Promise<ExtractResult | null> {
  const urls = buildCandidateUrls(ctx);

  for (const url of urls) {
    const html = await fetchAndClean(url);
    if (!html) continue;

    const email = await extractWithLLM(html, ctx);
    if (email) {
      return { email, evidenceUrl: url };
    }
  }

  return null;
}
