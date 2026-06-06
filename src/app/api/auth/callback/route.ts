import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code   = searchParams.get('code');
  const next   = searchParams.get('next') ?? '/';
  const intent = searchParams.get('intent'); // 'login' | 'signup' | null

  const locale = next.split('/')[1] || 'en';

  if (!code) {
    return NextResponse.redirect(`${origin}/${locale}/auth/login?error=oauth_failed`);
  }

  // Step 1 — Exchange code for session
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.user) {
    return NextResponse.redirect(`${origin}/${locale}/auth/login?error=oauth_failed`);
  }

  const user = data.user;

  // Step 2 — Detect brand-new accounts (created within last 10 seconds)
  const isNewUser = (Date.now() - new Date(user.created_at).getTime()) < 10_000;

  // Step 3 — If intent is login but user is new: delete account and reject
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

  // Step 4 — Normal flow
  return NextResponse.redirect(`${origin}${next}`);
}
