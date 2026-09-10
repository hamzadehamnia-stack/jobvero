import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Waitlist signups are stored in Postgres (see 20260909_waitlist.sql).
//
// This route used to readFileSync/writeFileSync data/waitlist.json under
// process.cwd(). That cannot work on Vercel — the deployment filesystem is
// read-only outside /tmp — so every production signup returned 500 while
// working fine locally. It also meant a public, unauthenticated endpoint
// appended caller-supplied email addresses to a file tracked in git.
//
// The service-role client is used deliberately: the table denies all access
// under RLS, so the list cannot be read back through PostgREST with the anon
// key, and the endpoint can insert without exposing a readable table.

const MAX_EMAIL_LENGTH = 254; // RFC 5321 limit — bounds what we accept and store

export async function POST(req: NextRequest) {
  const body  = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email || email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    console.error('[waitlist] admin client unavailable:', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  const { error } = await supabase.from('waitlist').insert({ email });

  if (error) {
    // 23505 = unique_violation. The unique index on email is what enforces
    // "already registered" now, instead of a read-then-write that could race.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'already_registered' }, { status: 409 });
    }
    console.error('[waitlist] insert failed:', error.message);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
