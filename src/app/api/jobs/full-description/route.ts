import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getFullDescription } from '@/lib/jobs/getFullDescription';

interface RequestBody {
  jobId?:       string;
  redirectUrl?: string;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as RequestBody;
    if (!body.jobId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await getFullDescription({
      jobId:       body.jobId,
      redirectUrl: body.redirectUrl,
    }, supabase);

    return NextResponse.json({
      description: result?.description ?? null,
      source:      result?.source      ?? null,
    });
  } catch (err) {
    console.error('[full-description]', err);
    return NextResponse.json({ description: null, source: null });
  }
}
