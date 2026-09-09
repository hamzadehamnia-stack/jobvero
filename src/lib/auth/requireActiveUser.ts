import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// Authenticate a route handler and reject blocked accounts.
//
// is_blocked used to be enforced only in middleware.ts, whose matcher is
// `/((?!api|_next|_vercel|.*\..*).*)` — it excludes /api entirely. A banned
// user was redirected to /blocked in the UI while keeping full access to every
// API route: sending applications, generating documents, reading the inbox.
// The ban was cosmetic.
//
// Routes gated by withFeatureCheck get this check through canUseFeature.
// Everything else should call this helper instead of doing its own
// `getUser()` + null check.
//
// Usage:
//   const auth = await requireActiveUser();
//   if (auth instanceof NextResponse) return auth;
//   const { user, supabase } = auth;

export interface ActiveUser {
  user:     User;
  supabase: SupabaseClient;
}

export async function requireActiveUser(): Promise<ActiveUser | NextResponse> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_blocked')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.is_blocked === true) {
    return NextResponse.json({ error: 'Account blocked', reason: 'blocked' }, { status: 403 });
  }

  return { user, supabase };
}
