import { NextResponse } from 'next/server';

const ADZUNA_APP_ID  = process.env.ADZUNA_APP_ID;
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;

export async function GET(req: Request) {
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
    return NextResponse.json(
      { error: 'Job search is not configured. Missing ADZUNA_APP_ID or ADZUNA_APP_KEY.' },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);

  const what        = searchParams.get('what') ?? '';
  const where       = searchParams.get('where') ?? '';
  const country     = searchParams.get('country') ?? 'fr';
  const page        = searchParams.get('page') ?? '1';

  const salaryMin   = searchParams.get('salary_min');
  const fullTime    = searchParams.get('full_time');
  const partTime    = searchParams.get('part_time');
  const contract    = searchParams.get('contract');
  const permanent   = searchParams.get('permanent');
  const maxDaysOld  = searchParams.get('max_days_old');
  const sortBy      = searchParams.get('sort_by');

  const params = new URLSearchParams({
    app_id:           ADZUNA_APP_ID,
    app_key:          ADZUNA_APP_KEY,
    results_per_page: '20',
  });

  if (what)       params.set('what',         what);
  if (where)      params.set('where',        where);
  if (salaryMin)  params.set('salary_min',   salaryMin);
  if (fullTime)   params.set('full_time',    fullTime);
  if (partTime)   params.set('part_time',    partTime);
  if (contract)   params.set('contract',     contract);
  if (permanent)  params.set('permanent',    permanent);
  if (maxDaysOld) params.set('max_days_old', maxDaysOld);
  if (sortBy)     params.set('sort_by',      sortBy);

  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[jobs/search] Adzuna error', res.status, body);
      return NextResponse.json(
        { error: `Adzuna API error (${res.status})` },
        { status: res.status },
      );
    }

    const data = await res.json();
    const r0 = data.results?.[0];
    if (r0) {
      console.log('[ADZUNA ID]', r0.id, '| adref:', r0.adref);
      console.log('[ADZUNA COMPANY]', JSON.stringify(r0.company));
      console.log('[ADZUNA LOGO]', 'logo:', r0.logo, '| company_logo:', r0.company_logo, '| logo_url:', r0.company?.logo_url);
      console.log('[ADZUNA URL]', r0.redirect_url);
      console.log('[ADZUNA DESC LEN]', r0.description?.length, '| first 300:', r0.description?.slice(0, 300));
      console.log('[ADZUNA ALL KEYS]', Object.keys(r0).join(', '));
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[jobs/search]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 },
    );
  }
}
