import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ADZUNA_APP_ID  = process.env.ADZUNA_APP_ID;
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const country = searchParams.get('country') ?? 'gb';
  const { id }  = params;

  const url = `https://api.adzuna.com/v1/api/jobs/${country}/ads/${id}?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[jobs/id] Adzuna error', res.status, body);
      return NextResponse.json({ error: `Adzuna error (${res.status})` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[jobs/id]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 500 },
    );
  }
}
