import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { withFeatureCheck } from '@/lib/subscription/withFeatureCheck';
import { runAutoApplyForUser } from '@/lib/auto-apply/runForUser';

async function handler() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const result = await runAutoApplyForUser(user.id, supabase);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[auto-apply/run]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withFeatureCheck('AUTO_APPLY', handler);
