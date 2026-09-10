import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverError } from '@/lib/apiError';

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: user.email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    return serverError('account/delete-otp/send', error, 'Could not send the code');
  }

  return NextResponse.json({
    success: true,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}
