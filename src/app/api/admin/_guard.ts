import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'hamzadehamnia@gmail.com';

export async function requireAdmin(): Promise<{ userId: string; email: string } | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return { userId: user.id, email: user.email };
}

export function isAdminEmail(email?: string | null): boolean {
  return email === ADMIN_EMAIL;
}
