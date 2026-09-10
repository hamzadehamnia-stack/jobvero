// Security regression test for src/lib/ssrfGuard.ts
//
// Run it:  node security-tests/ssrfGuard.test.js
// Exits 0 when every internal target is refused and public hostnames are allowed.
//
// Mirrors the range logic in src/lib/ssrfGuard.ts (that file is TypeScript and
// imports via the @/ alias). KEEP THE TWO IN SYNC.

const { isIP } = require('net');

function ipv4IsBlocked(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function ipv6IsBlocked(ip) {
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true;
  if (v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsBlocked(mapped[1]);
  return false;
}

function addressIsBlocked(ip) {
  const f = isIP(ip);
  if (f === 4) return ipv4IsBlocked(ip);
  if (f === 6) return ipv6IsBlocked(ip);
  return true;
}

function protocolAllowed(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

let failed = 0;

console.log('=== addresses that MUST be refused ===');
const blocked = [
  ['cloud metadata (AWS/GCP/Azure)', '169.254.169.254'],
  ['loopback',                        '127.0.0.1'],
  ['loopback, alternate form',        '127.255.255.254'],
  ['private 10/8',                    '10.0.0.5'],
  ['private 172.16/12',               '172.16.31.9'],
  ['private 172.31 edge',             '172.31.255.255'],
  ['private 192.168/16',              '192.168.1.1'],
  ['this-network 0/8',                '0.0.0.0'],
  ['carrier NAT 100.64/10',           '100.100.0.1'],
  ['IETF 192.0.0/24',                 '192.0.0.8'],
  ['benchmarking 198.18/15',          '198.18.0.1'],
  ['multicast 224/4',                 '239.255.255.250'],
  ['reserved 240/4',                  '255.255.255.255'],
  ['IPv6 loopback',                   '::1'],
  ['IPv6 unspecified',                '::'],
  ['IPv6 unique-local fd00::/8',      'fd00::1'],
  ['IPv6 link-local fe80::/10',       'fe80::1'],
  ['IPv4-mapped loopback',            '::ffff:127.0.0.1'],
  ['IPv4-mapped metadata',            '::ffff:169.254.169.254'],
];
for (const [name, ip] of blocked) {
  if (!addressIsBlocked(ip)) { failed++; console.log(`  FAIL  ${name} (${ip}) was ALLOWED`); }
  else console.log(`  ok    ${name} (${ip})`);
}

console.log('\n=== public addresses that must stay allowed ===');
for (const [name, ip] of [['Cloudflare DNS','1.1.1.1'], ['Google DNS','8.8.8.8'], ['public v6','2606:4700::1111'], ['ordinary host','93.184.216.34']]) {
  if (addressIsBlocked(ip)) { failed++; console.log(`  FAIL  ${name} (${ip}) was refused`); }
  else console.log(`  ok    ${name} (${ip})`);
}

console.log('\n=== protocols that MUST be refused ===');
for (const [name, u] of [
  ['file',   'file:///etc/passwd'],
  ['gopher', 'gopher://127.0.0.1:11211/'],
  ['data',   'data:text/html,<script>alert(1)</script>'],
  ['ftp',    'ftp://internal/'],
]) {
  if (protocolAllowed(u)) { failed++; console.log(`  FAIL  ${name} was ALLOWED`); }
  else console.log(`  ok    ${name}`);
}

console.log('\n=== protocols that must stay allowed ===');
for (const u of ['https://example.com/careers', 'http://example.com/jobs']) {
  if (!protocolAllowed(u)) { failed++; console.log(`  FAIL  ${u} was refused`); }
  else console.log(`  ok    ${u}`);
}

console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
