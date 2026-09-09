import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './src/i18n/routing';
import { dropMalformedAuthCookies } from './src/lib/supabase/cookies';

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  // Run next-intl locale routing first
  const intlResponse = intlMiddleware(request);

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

  const pathname  = request.nextUrl.pathname;
  const locale    = pathname.split('/')[1] || 'en';
  const isDashboard = /^\/[a-z]{2}\/dashboard(\/|$)/.test(pathname);
  const isBlocked   = /^\/[a-z]{2}\/blocked(\/|$)/.test(pathname);

  // Unauthenticated → redirect to login for dashboard routes
  if (isDashboard && !user) {
    return NextResponse.redirect(new URL(`/${locale}/auth/login`, request.url));
  }

  // Authenticated user on a dashboard route → check is_blocked
  if (user && isDashboard) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_blocked')
      .eq('id', user.id)
      .single();

    if (profile?.is_blocked) {
      return NextResponse.redirect(new URL(`/${locale}/blocked`, request.url));
    }
  }

  // Authenticated, not blocked, on /blocked → redirect back to dashboard
  if (user && isBlocked) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_blocked')
      .eq('id', user.id)
      .single();

    if (!profile?.is_blocked) {
      return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
