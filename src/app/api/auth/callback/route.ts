import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  // Cookie fallback: Supabase strips custom query params during OAuth redirect,
  // so next/intent are stored in short-lived cookies before signInWithOAuth.
  const cookieStore = cookies();
  const next   = searchParams.get('next')   ?? cookieStore.get('oauth_next')?.value   ?? '/en/dashboard';
  const intent = searchParams.get('intent') ?? cookieStore.get('oauth_intent')?.value ?? null;

  const locale = next.split('/')[1] || 'en';

  if (!code) {
    return NextResponse.redirect(`${origin}/${locale}/auth/login?error=oauth_failed`);
  }

  // Step 1 — Create the response first; Supabase session cookies are written
  // directly onto it (not onto the cookieStore) via the setAll callback.
  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Step 2 — Exchange code for session (writes cookies onto response)
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.user) {
    return NextResponse.redirect(`${origin}/${locale}/auth/login?error=oauth_failed`);
  }

  const user = data.user;

  // Step 3 — Recovery flow: recovery_sent_at is set and recent (< 15 min)
  const isRecovery = !!user.recovery_sent_at &&
    Date.now() - new Date(user.recovery_sent_at).getTime() < 15 * 60 * 1000;
  if (isRecovery) {
    const metaLocale = (user.user_metadata?.locale ?? user.user_metadata?.language) as string | undefined;
    const recoveryLocale = ['en', 'fr', 'es', 'pt'].includes(metaLocale ?? '') ? metaLocale! : locale;
    const recoveryResponse = NextResponse.redirect(`${origin}/${recoveryLocale}/auth/reset-password`);
    response.cookies.getAll().forEach(c => recoveryResponse.cookies.set(c.name, c.value));
    return recoveryResponse;
  }

  // Step 4 — Detect brand-new accounts (created within last 10 seconds)
  const isNewUser = (Date.now() - new Date(user.created_at).getTime()) < 10_000;

  // Step 5 — If intent is login but user is new: delete account and reject
  if (intent === 'login' && isNewUser) {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    await supabaseAdmin.auth.admin.deleteUser(user.id);
    await supabase.auth.signOut();

    return NextResponse.redirect(`${origin}/${locale}/auth/login?error=no_account`);
  }

  // Step 6 — Normal flow: clear the oauth helper cookies and return
  response.cookies.set('oauth_next',   '', { path: '/', maxAge: 0 });
  response.cookies.set('oauth_intent', '', { path: '/', maxAge: 0 });
  return response;
}
