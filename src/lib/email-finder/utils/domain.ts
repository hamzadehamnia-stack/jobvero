export function extractRootDomain(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    let host = u.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);

    const parts = host.split('.');
    if (parts.length <= 2) return host;

    const compoundTlds = ['co.uk', 'co.nz', 'com.au', 'com.br', 'com.mx', 'co.za'];
    const lastTwo = parts.slice(-2).join('.');
    if (compoundTlds.includes(lastTwo) && parts.length >= 3) {
      return parts.slice(-3).join('.');
    }

    return parts.slice(-2).join('.');
  } catch {
    return null;
  }
}

export function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(domain);
}
