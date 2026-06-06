import { NextResponse } from 'next/server';

const BASE_URL = 'https://jsearch.p.rapidapi.com/search';

interface JSearchRequiredExperience {
  no_experience_required?:       boolean;
  required_experience_in_months?: number;
  experience_mentioned?:         boolean;
}

interface JSearchRequiredEducation {
  postgraduate_degree?:  boolean;
  college_degree?:       boolean;
  bachelors_degree?:     boolean;
  associate_degree?:     boolean;
  high_school?:          boolean;
}

interface JSearchJob {
  job_id:                      string;
  job_title:                   string;
  employer_name?:              string;
  employer_logo?:              string;
  job_city?:                   string;
  job_state?:                  string;
  job_country?:                string;
  job_description?:            string;
  job_apply_link?:             string;
  job_posted_at_datetime_utc?: string;
  job_employment_type?:        string;
  job_min_salary?:             number;
  job_max_salary?:             number;
  job_salary_currency?:        string;
  job_is_remote?:              boolean;
  job_required_skills?:        string[] | null;
  job_required_experience?:    JSearchRequiredExperience;
  job_required_education?:     JSearchRequiredEducation;
  job_onet_normalized_occupation_category?: string;
}

interface JSearchResponse {
  data:        JSearchJob[];
  status:      string;
  parameters?: Record<string, unknown>;
}

function mapJob(j: JSearchJob) {
  const locationParts = [j.job_city, j.job_state, j.job_country].filter(Boolean);

  let salary: string | undefined;
  if (j.job_min_salary || j.job_max_salary) {
    const currency = j.job_salary_currency ?? '';
    const parts: string[] = [];
    if (j.job_min_salary) parts.push(`${Math.round(j.job_min_salary / 1000)}k`);
    if (j.job_max_salary) parts.push(`${Math.round(j.job_max_salary / 1000)}k`);
    salary = `${currency} ${parts.join(' – ')}`.trim();
  }

  let experience: string | undefined;
  const exp = j.job_required_experience;
  if (exp) {
    if (exp.no_experience_required) {
      experience = 'No experience required';
    } else if (exp.required_experience_in_months) {
      const yrs = Math.ceil(exp.required_experience_in_months / 12);
      experience = `${yrs}+ year${yrs > 1 ? 's' : ''}`;
    } else if (exp.experience_mentioned) {
      experience = 'Experience required';
    }
  }

  let education: string | undefined;
  const edu = j.job_required_education;
  if (edu) {
    if (edu.postgraduate_degree)               education = "Master's / PhD";
    else if (edu.college_degree || edu.bachelors_degree) education = "Bachelor's degree";
    else if (edu.associate_degree)             education = "Associate degree";
    else if (edu.high_school)                  education = "High school diploma";
  }

  const skills = j.job_required_skills?.filter(Boolean).slice(0, 12) ?? undefined;
  const remoteType = j.job_is_remote ? 'Remote' : undefined;

  return {
    id:          j.job_id,
    title:       j.job_title,
    company:     j.employer_name ?? 'Unknown',
    location:    locationParts.join(', '),
    salary,
    description: j.job_description ?? '',
    url:         j.job_apply_link,
    datePosted:  j.job_posted_at_datetime_utc,
    jobType:     j.job_employment_type,
    logo:        j.employer_logo ?? null,
    experience:  experience ?? null,
    education:   education ?? null,
    skills:      skills?.length ? skills : null,
    remoteType:  remoteType ?? null,
    category:    j.job_onet_normalized_occupation_category ?? null,
  };
}

export async function GET(req: Request) {
  const apiKey = process.env.JSEARCH_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'JSearch is not configured. Missing JSEARCH_API_KEY.' },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);

  const what            = searchParams.get('what') ?? '';
  const where           = searchParams.get('where') ?? '';
  const country         = searchParams.get('country') ?? '';
  const page            = searchParams.get('page') ?? '1';
  const datePosted      = searchParams.get('date_posted') ?? '';
  const employmentTypes = searchParams.get('employment_types') ?? '';
  const remoteOnly      = searchParams.get('remote_only') ?? '';

  if (!what.trim()) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 });
  }

  const query = where.trim() ? `${what.trim()} in ${where.trim()}` : what.trim();

  const params = new URLSearchParams({
    query,
    page,
    num_pages: '1',
  });

  if (country)         params.set('country',          country);
  if (datePosted)      params.set('date_posted',       datePosted);
  if (employmentTypes) params.set('employment_types',  employmentTypes);
  if (remoteOnly)      params.set('remote_jobs_only',  remoteOnly);

  try {
    const res = await fetch(`${BASE_URL}?${params}`, {
      headers: {
        'x-rapidapi-host': 'jsearch.p.rapidapi.com',
        'x-rapidapi-key':  apiKey,
        Accept:            'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[jsearch] API error', res.status, text);
      return NextResponse.json(
        { error: `JSearch API error (${res.status})` },
        { status: res.status },
      );
    }

    const data = await res.json() as JSearchResponse;
    const results = (data.data ?? []).map(mapJob);

    return NextResponse.json({ results, count: results.length });
  } catch (err) {
    console.error('[jsearch]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 },
    );
  }
}
