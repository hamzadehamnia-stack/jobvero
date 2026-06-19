import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { routing } from './src/i18n/routing';

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
          return request.cookies.getAll();
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

  // Read session from cookies (no network call — reliable right after OAuth callback)
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

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
