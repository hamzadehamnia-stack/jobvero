import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user?.email) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { otpCode } = body as { otpCode?: string };

  if (!otpCode || otpCode.length !== 8) {
    return NextResponse.json({ error: 'Invalid OTP code.' }, { status: 400 });
  }

  // Verify OTP before any destructive action
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email: user.email,
    token: otpCode,
    type: 'email',
  });

  if (verifyError) {
    return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Account deletion is not configured. Please contact support.' },
      { status: 501 }
    );
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
