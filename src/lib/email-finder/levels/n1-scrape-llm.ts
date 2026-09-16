import { JobContext } from '../types';
import { isValidEmailFormat, isBlacklisted, normalizeEmail } from '../utils/email-validate';
import { readJsonObject } from '@/lib/ai/json';
import { callCatalogueModel } from '@/lib/ai/systemCall';
import { createAdminClient } from '@/lib/supabase/admin';
import { safeFetch } from '@/lib/ssrfGuard';

const FETCH_TIMEOUT_MS = 8000;
const LLM_TIMEOUT_MS = 15000;
const MAX_HTML_CHARS = 12000;

interface ExtractResult {
  email: string;
  evidenceUrl: string;
}

async function fetchAndClean(url: string): Promise<string | null> {
  try {
    // safeFetch, not fetch: `url` originates from the request body (jobUrl /
    // companyCareersUrl), so the caller picks the host we connect to. It
    // rejects private, loopback and link-local targets — including cloud
    // metadata at 169.254.169.254 — and re-validates every redirect hop, which
    // the previous `redirect: 'follow'` did not.
    const res = await safeFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JobveroBot/1.0; +https://getjobvero.com)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en;q=0.9,fr;q=0.8',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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

async function extractWithLLM(html: string, ctx: JobContext, userId: string): Promise<string | null> {
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
    // Model and ceiling from ai_action_costs.system_email_finder, step `scrape`.
    // The call is free to the user and lands on a zero-credit system row.
    const { text: content } = await callCatalogueModel(createAdminClient(), {
      action:         'system_email_finder',
      step:           'scrape',
      userId,
      messages:       [{ role: 'user', content: prompt }],
      timeoutMs:      LLM_TIMEOUT_MS,
      responseFormat: { type: 'json_object' },
    });
    if (!content) return null;

    // An answer that cannot be read finds no email — it never invents one.
    const parsed = readJsonObject(content) as { email?: string | null; confidence?: string };
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

export async function tryN1(ctx: JobContext, userId: string): Promise<ExtractResult | null> {
  const urls = buildCandidateUrls(ctx);

  for (const url of urls) {
    const html = await fetchAndClean(url);
    if (!html) continue;

    const email = await extractWithLLM(html, ctx, userId);
    if (email) {
      return { email, evidenceUrl: url };
    }
  }

  return null;
}
