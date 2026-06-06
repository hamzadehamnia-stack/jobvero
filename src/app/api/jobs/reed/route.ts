// SUSPENDED
import { NextResponse } from 'next/server';

const BASE_URL = 'https://www.reed.co.uk/api/1.0/search';

interface ReedJob {
  jobId:           number;
  jobTitle:        string;
  employerName?:   string;
  locationName?:   string;
  minimumSalary?:  number;
  maximumSalary?:  number;
  currency?:       string;
  jobDescription?: string;
  jobUrl?:         string;
  date?:           string;
  contractType?:   string;
  fullTime?:       boolean;
  partTime?:       boolean;
}

interface ReedResponse {
  results:    ReedJob[];
  totalResults?: number;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&bull;/g, '•')
    .replace(/&#\d+;/g, '')
    .replace(/&\w+;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseSalaryFromText(text: string): string | undefined {
  // £50,000 - £60,000 or £50000-£60000
  const range = text.match(/£([\d,]+)\s*[-–]\s*£([\d,]+)/);
  if (range) {
    const lo = parseInt(range[1].replace(/,/g, ''), 10);
    const hi = parseInt(range[2].replace(/,/g, ''), 10);
    const loK = Math.round(lo / 1000);
    const hiK = Math.round(hi / 1000);
    if (loK === 0 && hiK === 0) return undefined;
    return loK === hiK ? `${loK}k£/yr` : `${loK}k-${hiK}k£/yr`;
  }
  // Single £50,000 (min 4 digits)
  const single = text.match(/£([\d,]{4,})/);
  if (single) {
    const val = parseInt(single[1].replace(/,/g, ''), 10);
    const valK = Math.round(val / 1000);
    if (valK === 0) return undefined;
    return `${valK}k£/yr`;
  }
  return undefined;
}

function mapJob(j: ReedJob) {
  const minK = j.minimumSalary && j.minimumSalary > 0 ? Math.round(j.minimumSalary / 1000) : null;
  const maxK = j.maximumSalary && j.maximumSalary > 0 ? Math.round(j.maximumSalary / 1000) : null;
  const salaryParts: string[] = [];
  if (minK !== null) salaryParts.push(`${minK}k`);
  if (maxK !== null && maxK !== minK) salaryParts.push(`${maxK}k`);

  const cleanDescription = stripHtml(j.jobDescription ?? '');
  const salary = salaryParts.length
    ? salaryParts.join(' – ')
    : parseSalaryFromText(cleanDescription);

  const jobType = j.fullTime ? 'Full-time'
    : j.partTime            ? 'Part-time'
    : j.contractType        ?? undefined;

  return {
    id:          String(j.jobId),
    title:       j.jobTitle,
    company:     j.employerName ?? 'Unknown',
    location:    j.locationName ?? '',
    salary,
    description: cleanDescription,
    url:         j.jobUrl,
    datePosted:  j.date,
    jobType,
  };
}

export async function GET(req: Request) {
  const apiKey = process.env.REED_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Reed is not configured. Missing REED_API_KEY.' },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);

  const what       = searchParams.get('what') ?? '';
  const where      = searchParams.get('where') ?? '';
  const page       = parseInt(searchParams.get('page') ?? '0', 10);
  const permanent  = searchParams.get('permanent') ?? '';
  const fullTime   = searchParams.get('fullTime') ?? '';
  const contract   = searchParams.get('contract') ?? '';
  const datePosted = searchParams.get('datePosted') ?? ''; // e.g. "1", "3", "7", "30"

  if (!what.trim()) {
    return NextResponse.json({ error: 'keywords are required' }, { status: 400 });
  }

  const params = new URLSearchParams({
    keywords:             what.trim(),
    resultsToTake:        '20',
    resultsToSkip:        String(page * 20),
    distanceFromLocation: '10',
    graduate:             'false',
    permanent:            'true',
  });

  if (where.trim()) params.set('location', where.trim());
  // Allow the caller to override permanent (e.g. contract filter)
  if (permanent === 'false') params.set('permanent', 'false');
  if (fullTime)              params.set('fullTime',  fullTime);
  if (contract)              params.set('contract',  contract);

  if (datePosted) {
    const daysAgo = parseInt(datePosted, 10);
    if (!isNaN(daysAgo) && daysAgo >= 0) {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      const yyyy = d.getFullYear();
      const mm   = String(d.getMonth() + 1).padStart(2, '0');
      const dd   = String(d.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      params.set('postedDate', dateStr);
      console.log(`[reed] date filter: "${datePosted}" days → postedDate=${dateStr}`);
    }
  }

  const fullUrl = `${BASE_URL}?${params}`;
  console.log('[reed] → REQUEST', fullUrl);
  console.log('[reed] → PARAMS', Object.fromEntries(params));

  // Basic auth: base64("apikey:") — password is always empty
  const credentials = Buffer.from(`${apiKey}:`).toString('base64');

  try {
    const res = await fetch(fullUrl, {
      headers: {
        Authorization: `Basic ${credentials}`,
        Accept:        'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[reed] ← ERROR', res.status, text);
      return NextResponse.json(
        { error: `Reed API error (${res.status})` },
        { status: res.status },
      );
    }

    const data = await res.json() as ReedResponse;
    const raw = (data.results ?? []).map(mapJob);

    // Cap each employer to 3 results to avoid agency spam
    const employerCount = new Map<string, number>();
    const results = raw.filter(job => {
      const key = job.company.toLowerCase().trim();
      const count = (employerCount.get(key) ?? 0) + 1;
      employerCount.set(key, count);
      return count <= 3;
    });

    console.log('[reed] ← OK', { total: data.totalResults, raw: raw.length, afterDedup: results.length, params: Object.fromEntries(params) });

    return NextResponse.json({ results, count: data.totalResults ?? results.length });
  } catch (err) {
    console.error('[reed]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 },
    );
  }
}
