import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getFullDescription } from '@/lib/jobs/getFullDescription';

interface RequestBody {
  jobId?:        string;
  redirectUrl?:  string;
  title?:        string;
  company?:      string;
  location?:     string;
  salary?:       string;
  contractType?: string;
  sector?:       string;
  excerpt?:      string;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as RequestBody;
    if (!body.jobId || !body.title || !body.company) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await getFullDescription({
      jobId:        body.jobId,
      redirectUrl:  body.redirectUrl,
      title:        body.title,
      company:      body.company,
      location:     body.location,
      salary:       body.salary,
      contractType: body.contractType,
      sector:       body.sector,
      excerpt:      body.excerpt ?? '',
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
