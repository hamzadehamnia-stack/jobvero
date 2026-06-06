const EMAIL_REGEX_STRICT = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const EMAIL_REGEX_EXTRACT = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const BLACKLIST_KEYWORDS = [
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'mailer-daemon', 'postmaster', 'webmaster',
  'example.com', 'example.org', 'test.com',
];

export function isValidEmailFormat(email: string): boolean {
  if (!email || email.length > 254) return false;
  return EMAIL_REGEX_STRICT.test(email.trim());
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function extractEmails(text: string): string[] {
  if (!text) return [];
  const matches = text.match(EMAIL_REGEX_EXTRACT) ?? [];
  return [...new Set(matches.map(normalizeEmail))].filter(e => !isBlacklisted(e));
}

export function isBlacklisted(email: string): boolean {
  const lower = email.toLowerCase();
  return BLACKLIST_KEYWORDS.some(kw => lower.includes(kw));
}
