import { JobContext } from '../types';
import { extractEmails, isBlacklisted } from '../utils/email-validate';

const HR_KEYWORDS = [
  'hr', 'recruit', 'careers', 'career', 'jobs', 'job', 'talent', 'hiring',
  'rh', 'emploi', 'recrutement', 'carriere',
  'rrhh', 'empleo', 'reclutamiento', 'carreras',
  'recrutamento', 'emprego', 'carreiras',
  'karriere', 'bewerbung', 'personal',
];

export async function tryN0(ctx: JobContext): Promise<string | null> {
  const candidates: string[] = [];

  if (ctx.apiSource === 'france_travail' && ctx.rawApiPayload) {
    const payload = ctx.rawApiPayload as { contact?: { courriel?: string } };
    if (payload.contact?.courriel && !isBlacklisted(payload.contact.courriel)) {
      return payload.contact.courriel.toLowerCase().trim();
    }
  }

  if (ctx.rawApiPayload) {
    try {
      const flat = JSON.stringify(ctx.rawApiPayload);
      candidates.push(...extractEmails(flat));
    } catch {
      // ignore
    }
  }

  if (ctx.jobDescriptionHtml) {
    candidates.push(...extractEmails(ctx.jobDescriptionHtml));
  }

  if (candidates.length === 0) return null;

  const domainLower = ctx.companyDomain.toLowerCase();
  const scored = [...new Set(candidates)]
    .map(email => {
      const lower = email.toLowerCase();
      const localPart = lower.split('@')[0];
      let score = 0;
      if (HR_KEYWORDS.some(kw => localPart.includes(kw))) score += 10;
      if (lower.endsWith(`@${domainLower}`)) score += 5;
      return { email, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score > 0 ? scored[0].email : null;
}
