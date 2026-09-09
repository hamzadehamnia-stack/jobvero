// Drop Supabase auth cookies whose value cannot be decoded.
//
// @supabase/ssr stores the session as `base64-<base64url payload>`. Its reader
// throws a plain Error ("Invalid Base64-URL character") the moment that payload
// is malformed -- before any signature check, and from inside an async listener
// the caller cannot wrap in try/catch. Because middleware.ts runs on every
// non-API route, that throw becomes a 500 on every page: a user with one
// corrupted cookie is locked out of the entire site with no in-app way back.
//
// Filtering at the cookie-reading boundary fixes it once for every consumer --
// middleware, server components and route handlers all go through one of the
// two getAll() implementations that call this.
//
// A dropped cookie simply means "not signed in", which is the correct reading:
// a value we cannot decode is a value we cannot trust.

const BASE64_PREFIX  = 'base64-';
const BASE64URL_ONLY = /^[A-Za-z0-9_-]*$/;

function isAuthCookieName(name: string): boolean {
  // Covers the chunked variants too: sb-<ref>-auth-token.0, .1, …
  return name.startsWith('sb-') && name.includes('-auth-token');
}

export function dropMalformedAuthCookies<T extends { name: string; value: string }>(
  cookies: T[],
): T[] {
  return cookies.filter((cookie) => {
    if (!isAuthCookieName(cookie.name)) return true;
    // Legacy non-base64 encodings are left alone — this only judges the format
    // it can actually validate.
    if (!cookie.value.startsWith(BASE64_PREFIX)) return true;
    return BASE64URL_ONLY.test(cookie.value.slice(BASE64_PREFIX.length));
  });
}
