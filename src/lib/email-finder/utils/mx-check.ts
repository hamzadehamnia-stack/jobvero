import { promises as dns } from 'dns';

export async function hasMXRecord(domain: string): Promise<boolean> {
  if (!domain) return false;
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0 && records.some(r => r.exchange && r.exchange.length > 0);
  } catch {
    return false;
  }
}
