// Security regression test for the rate limiter.
//
// Run it:  node security-tests/rateLimit.test.js
//
// Two halves, and it is worth being precise about what each one proves.
//
// 1. Key derivation and the 429 shape, mirrored from src/lib/rateLimit.ts.
//    KEEP IN SYNC with that file.
//
// 2. The fixed-window algorithm from check_rate_limit (20260910_api_rate_limits.sql),
//    re-implemented here against a fake clock. This proves the ALGORITHM is
//    right -- window reset, boundary behaviour, multi-window precedence. It
//    does NOT prove the PL/pgSQL is right: the SQL still needs to be exercised
//    against a real Postgres once the migration is applied.

const { createHash, createHmac } = require('crypto');

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { failed++; console.log(`  FAIL  ${name}\n        got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`); }
  else console.log(`  ok    ${name}`);
}

// ─── 1. Key derivation ────────────────────────────────────────────────────────

function clientIp(headers) {
  const fwd = headers['x-forwarded-for'];
  if (fwd) { const first = fwd.split(',')[0]?.trim(); if (first) return first; }
  return headers['x-real-ip']?.trim() || null;
}

function hashIp(ip, salt) {
  if (salt) return createHmac('sha256', salt).update(ip).digest('hex').slice(0, 32);
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

function rateLimitKey(routeName, userId, headers, salt) {
  if (userId) return `${routeName}:u:${userId}`;
  const ip = clientIp(headers);
  if (!ip) return null;
  return `${routeName}:ip:${hashIp(ip, salt)}`;
}

console.log('=== key derivation ===');
check('user id wins over IP',
  rateLimitKey('parse-cv', 'abc-123', { 'x-forwarded-for': '1.2.3.4' }, 's'),
  'parse-cv:u:abc-123');
check('falls back to hashed IP',
  rateLimitKey('waitlist', null, { 'x-forwarded-for': '1.2.3.4' }, 's'),
  `waitlist:ip:${hashIp('1.2.3.4', 's')}`);
check('takes the left-most forwarded entry',
  rateLimitKey('waitlist', null, { 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' }, 's'),
  `waitlist:ip:${hashIp('1.2.3.4', 's')}`);
check('x-real-ip is the fallback header',
  rateLimitKey('waitlist', null, { 'x-real-ip': '9.9.9.9' }, 's'),
  `waitlist:ip:${hashIp('9.9.9.9', 's')}`);
check('no identity at all yields null',
  rateLimitKey('waitlist', null, {}, 's'),
  null);

console.log('\n=== IP is never stored in the clear ===');
const key = rateLimitKey('waitlist', null, { 'x-forwarded-for': '203.0.113.7' }, 'pepper');
check('raw address absent from the key', key.includes('203.0.113.7'), false);
check('salt changes the digest',
  hashIp('203.0.113.7', 'pepper') === hashIp('203.0.113.7', 'other'), false);
check('unsalted digest differs from salted',
  hashIp('203.0.113.7', null) === hashIp('203.0.113.7', 'pepper'), false);

console.log('\n=== route isolation ===');
check('same user, different routes -> different buckets',
  rateLimitKey('parse-cv', 'u1', {}, 's') === rateLimitKey('support', 'u1', {}, 's'), false);

// ─── 2. Fixed-window algorithm, mirrored from check_rate_limit ────────────────

function makeLimiter(windows) {
  const buckets = new Map();          // bucket_key -> { start, hits }
  return function hit(key, now) {
    let allowed = true;
    let retry = 0;
    for (const { seconds, max } of windows) {
      const k = `${key}:${seconds}`;
      const b = buckets.get(k);
      if (!b || b.start <= now - seconds) {
        buckets.set(k, { start: now, hits: 1 });
      } else {
        b.hits += 1;
      }
      const cur = buckets.get(k);
      if (cur.hits > max) {
        allowed = false;
        retry = Math.max(retry, Math.ceil(cur.start + seconds - now));
      }
    }
    return { allowed, retryAfter: Math.max(retry, 1) };
  };
}

console.log('\n=== fixed-window algorithm ===');
{
  const hit = makeLimiter([{ seconds: 3600, max: 3 }]);
  check('1st under limit',  hit('k', 0).allowed, true);
  check('2nd under limit',  hit('k', 0).allowed, true);
  check('3rd at limit',     hit('k', 0).allowed, true);
  check('4th denied',       hit('k', 0).allowed, false);
  check('retryAfter is the remaining window', hit('k', 0).retryAfter, 3600);
  check('still denied late in the window', hit('k', 3599).allowed, false);
  check('allowed again once the window rolls', hit('k', 3601).allowed, true);
}

console.log('\n=== daily ceiling overrides a fresh hourly window ===');
{
  // The case that motivated the daily cap: hourly keeps resetting, daily does not.
  const hit = makeLimiter([{ seconds: 3600, max: 100 }, { seconds: 86400, max: 200 }]);
  let lastAllowed = 0;
  for (let i = 0; i < 400; i++) {
    // One hit per 36s: 100/hour exactly, so the hourly window never trips.
    const r = hit('k', i * 36);
    if (r.allowed) lastAllowed = i + 1;
  }
  check('daily cap stops it at 200 despite hourly resets', lastAllowed, 200);
}

console.log('\n=== independent identities do not share a budget ===');
{
  const hit = makeLimiter([{ seconds: 3600, max: 2 }]);
  hit('user-a', 0); hit('user-a', 0);
  check('user-a exhausted', hit('user-a', 0).allowed, false);
  check('user-b unaffected', hit('user-b', 0).allowed, true);
}

// ─── 3. 429 response shape ────────────────────────────────────────────────────

console.log('\n=== 429 response ===');
{
  const retryAfter = 42.7;
  const header = String(Math.max(1, Math.ceil(retryAfter)));
  check('Retry-After is a whole number of seconds', header, '43');
  check('never advertises 0', String(Math.max(1, Math.ceil(0.2))), '1');
}

console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : failed + ' CHECK(S) FAILED'}`);
process.exit(failed === 0 ? 0 : 1);
