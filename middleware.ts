import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './src/i18n/routing';
import { dropMalformedAuthCookies } from './src/lib/supabase/cookies';

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApi    = pathname.startsWith('/api');

  // next-intl must never see an /api request: it would rewrite or redirect it
  // to a locale-prefixed path and break every endpoint. /api is in the matcher
  // only so the is_blocked gate below can cover it.
  const intlResponse = isApi ? null : intlMiddleware(request);

  // Build response (carry over intl headers/cookies)
  let response = intlResponse ?? NextResponse.next({ request });

  // Create Supabase client with cookie passthrough
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return dropMalformedAuthCookies(request.cookies.getAll());
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = intlResponse ?? NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser(), not getSession(). getSession() only decodes the auth cookie --
  // it never verifies the signature -- so a forged cookie carrying any payload
  // would satisfy the `user` checks below and walk past both the dashboard gate
  // and the is_blocked gate. getUser() validates the token against the Supabase
  // auth server, which is the only way to know the session is real.
  //
  // This costs one network call per matched request. That is the documented
  // trade-off and it is the reason Supabase tells you not to trust getSession()
  // in server code.
  //
  // The try/catch is not optional: @supabase/ssr throws while *parsing* a
  // malformed auth cookie (before any signature check), and because this
  // middleware matches every non-API route, an unhandled throw turns into a 500
  // on every page. A user with a corrupted cookie would be locked out of the
  // whole site with no in-app way to recover. Treat any failure as "not signed
  // in" and clear the bad cookie so the next request is clean.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')) {
        response.cookies.set(cookie.name, '', { path: '/', maxAge: 0 });
      }
    }
  }

  const locale      = pathname.split('/')[1] || 'en';
  const isDashboard = /^\/[a-z]{2}\/dashboard(\/|$)/.test(pathname);
  const isBlocked   = /^\/[a-z]{2}\/blocked(\/|$)/.test(pathname);

  // One profile read, reused by every gate below (previously two queries).
  // Only fetched when there is a verified session and a gate actually needs it.
  const needsBlockCheck = !!user && (isApi || isDashboard || isBlocked);
  let userIsBlocked = false;
  if (needsBlockCheck) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_blocked')
      .eq('id', user!.id)
      .maybeSingle();
    userIsBlocked = profile?.is_blocked === true;
  }

  // ── /api ───────────────────────────────────────────────────────────────────
  // The only gate applied here is is_blocked. Authentication itself stays with
  // each route handler: webhooks and the cron job authenticate with a shared
  // secret rather than a user session, so an unauthenticated /api request must
  // be passed through untouched.
  if (isApi) {
    if (userIsBlocked) {
      return NextResponse.json({ error: 'Account blocked', reason: 'blocked' }, { status: 403 });
    }
    return response;
  }

  // ── pages ──────────────────────────────────────────────────────────────────

  // Unauthenticated → redirect to login for dashboard routes
  if (isDashboard && !user) {
    return NextResponse.redirect(new URL(`/${locale}/auth/login`, request.url));
  }

  // Authenticated user on a dashboard route → check is_blocked
  if (user && isDashboard && userIsBlocked) {
    return NextResponse.redirect(new URL(`/${locale}/blocked`, request.url));
  }

  // Authenticated, not blocked, on /blocked → redirect back to dashboard
  if (user && isBlocked && !userIsBlocked) {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  return response;
}

export const config = {
  // /api is included so the is_blocked gate covers API routes; the handler
  // above skips next-intl for those paths.
  matcher: ['/((?!_next|_vercel|.*\\..*).*)'],
};
