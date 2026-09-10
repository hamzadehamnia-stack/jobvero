import { timingSafeEqual } from 'crypto';

// Constant-time comparison for shared secrets.
//
// `a !== b` on strings short-circuits at the first differing byte, so response
// time reveals how many leading characters were correct and the secret can be
// recovered byte by byte with enough requests. Anywhere a caller-supplied
// header is checked against an environment secret, use this instead.
//
// The length check comes first on purpose: timingSafeEqual throws on
// mismatched lengths, and the length of a shared secret is not the part worth
// hiding. A missing or empty expected value never matches — a misconfigured
// deployment must fail closed, not open.

export function timingSafeCompare(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
