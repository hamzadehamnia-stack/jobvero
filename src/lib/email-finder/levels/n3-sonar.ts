import { JobContext } from '../types';
import { isValidEmailFormat, isBlacklisted, normalizeEmail } from '../utils/email-validate';
import { readJsonObject } from '@/lib/ai/json';
import { callCatalogueModel } from '@/lib/ai/systemCall';
import { createAdminClient } from '@/lib/supabase/admin';

const TIMEOUT_MS = 20000;

interface SonarResult {
  email: string;
  evidenceUrl: string;
}

export async function tryN3(ctx: JobContext, userId: string): Promise<SonarResult | null> {
  const prompt = `Find the official HR or recruiting email address at "${ctx.companyName}" (domain: ${ctx.companyDomain}).

Search the company's website, LinkedIn, and other public sources. Look for emails like careers@, jobs@, recruiting@, hr@, or named recruiter emails.

Return ONLY a JSON object (no markdown, no extra text):
{"email": "<the email or null>", "source_url": "<URL where you found it or null>", "confidence": "high|medium|low"}

Do NOT guess or fabricate. If you cannot find a verified email from a public source, return {"email": null, "source_url": null, "confidence": "low"}.`;

  try {
    // Model and ceiling from ai_action_costs.system_email_finder, step `search`.
    const { text: content } = await callCatalogueModel(createAdminClient(), {
      action:    'system_email_finder',
      step:      'search',
      userId,
      messages:  [{ role: 'user', content: prompt }],
      timeoutMs: TIMEOUT_MS,
    });
    if (!content) return null;

    let parsed: { email?: string | null; source_url?: string | null; confidence?: string };
    try {
      parsed = readJsonObject(content) as typeof parsed;
    } catch {
      // Sonar answers with citations around its JSON often enough to be worth
      // one last look for the field itself — but only for an address that is
      // written there, never one rebuilt from pieces.
      const match = content.match(/"email"\s*:\s*"([^"]+)"/);
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
