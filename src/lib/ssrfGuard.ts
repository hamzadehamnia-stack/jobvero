import { lookup } from 'dns/promises';
import { isIP } from 'net';

// ─── SSRF guard ───────────────────────────────────────────────────────────────
//
// For server-side fetches whose URL comes from user input. The email finder
// scrapes `jobUrl` and `companyCareersUrl`, both of which arrive in an API
// request body (job.url in JobsClient.tsx), so an authenticated user chooses
// exactly which host our server connects to.
//
// Without this guard, `jobUrl: "http://169.254.169.254/latest/meta-data/"`
// makes the server fetch the cloud instance metadata endpoint and hand the
// response to an LLM whose output is returned to the caller. The same trick
// reaches anything else the deployment can route to that the internet cannot.
//
// Two things have to be checked, not one:
//   1. the hostname must not resolve to a private / loopback / link-local
//      address — checking the literal string is not enough, since a name the
//      attacker controls can resolve wherever they like (DNS rebinding aside,
//      a plain A record pointing at 127.0.0.1 is enough);
//   2. every redirect hop must be re-checked, because a public URL is free to
//      redirect to an internal one. Hence redirect: 'manual' below.

const MAX_REDIRECTS = 3;

function ipv4IsBlocked(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;

  if (a === 0)   return true;                       // 0.0.0.0/8   this network
  if (a === 10)  return true;                       // 10/8        private
  if (a === 127) return true;                       // 127/8       loopback
  if (a === 169 && b === 254) return true;          // 169.254/16  link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12   private
  if (a === 192 && b === 168) return true;          // 192.168/16  private
  if (a === 192 && b === 0)   return true;          // 192.0.0/24  IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true;// 100.64/10   carrier NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a >= 224) return true;                        // 224/4 multicast, 240/4 reserved
  return false;
}

function ipv6IsBlocked(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;       // unspecified, loopback
  if (v.startsWith('fc') || v.startsWith('fd')) return true; // fc00::/7 unique local
  if (v.startsWith('fe8') || v.startsWith('fe9') ||
      v.startsWith('fea') || v.startsWith('feb')) return true; // fe80::/10 link-local
  // IPv4-mapped (::ffff:a.b.c.d) — judge the embedded v4 address
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsBlocked(mapped[1]);
  return false;
}

function addressIsBlocked(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return ipv4IsBlocked(ip);
  if (family === 6) return ipv6IsBlocked(ip);
  return true; // unparseable — refuse
}

/**
 * Throws unless `rawUrl` is an http(s) URL whose host resolves to a public address.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('ssrf-guard: malformed URL');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    // Blocks file:, ftp:, gopher:, data: and friends.
    throw new Error(`ssrf-guard: refused protocol ${url.protocol}`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  // An IP literal is judged directly; a name is resolved first, because the
  // name is attacker-chosen and can point anywhere.
  if (isIP(host)) {
    if (addressIsBlocked(host)) throw new Error('ssrf-guard: refused private address');
    return url;
  }

  let resolved: { address: string }[];
  try {
    resolved = await lookup(host, { all: true });
  } catch {
    throw new Error('ssrf-guard: host does not resolve');
  }

  if (resolved.length === 0) throw new Error('ssrf-guard: host does not resolve');
  // Every answer must be public: one private record is enough to refuse.
  for (const { address } of resolved) {
    if (addressIsBlocked(address)) throw new Error('ssrf-guard: refused private address');
  }

  return url;
}

/**
 * fetch() for user-supplied URLs. Validates the target and every redirect hop.
 * Redirects are followed manually so an allowed public URL cannot bounce the
 * request into the internal network.
 */
export async function safeFetch(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, { ...init, redirect: 'manual' });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      current = new URL(location, url).toString();
      continue;
    }

    return res;
  }

  throw new Error('ssrf-guard: too many redirects');
}
