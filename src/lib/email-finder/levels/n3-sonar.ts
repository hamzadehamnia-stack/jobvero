import { JobContext } from '../types';
import { isValidEmailFormat, isBlacklisted, normalizeEmail } from '../utils/email-validate';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'perplexity/sonar';
const TIMEOUT_MS = 20000;

interface SonarResult {
  email: string;
  evidenceUrl: string;
}

export async function tryN3(ctx: JobContext): Promise<SonarResult | null> {
  const prompt = `Find the official HR or recruiting email address at "${ctx.companyName}" (domain: ${ctx.companyDomain}).

Search the company's website, LinkedIn, and other public sources. Look for emails like careers@, jobs@, recruiting@, hr@, or named recruiter emails.

Return ONLY a JSON object (no markdown, no extra text):
{"email": "<the email or null>", "source_url": "<URL where you found it or null>", "confidence": "high|medium|low"}

Do NOT guess or fabricate. If you cannot find a verified email from a public source, return {"email": null, "source_url": null, "confidence": "low"}.`;

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
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn('[N3] Sonar non-OK:', res.status);
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const cleaned = content.replace(/```json|```/g, '').trim();

    let parsed: { email?: string | null; source_url?: string | null; confidence?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/"email"\s*:\s*"([^"]+)"/);
      if (!match) return null;
      parsed = { email: match[1], source_url: null, confidence: 'medium' };
    }

    if (!parsed.email || typeof parsed.email !== 'string') return null;
    if (parsed.confidence === 'low') return null;

    const email = normalizeEmail(parsed.email);
    if (!isValidEmailFormat(email) || isBlacklisted(email)) return null;

    return {
      email,
      evidenceUrl: parsed.source_url ?? '',
    };
  } catch (err) {
    console.warn('[N3] Sonar failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
