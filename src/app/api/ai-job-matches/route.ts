import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdzunaResult {
  id:           string;
  title:        string;
  company?:     { display_name: string };
  location?:    { display_name: string };
  description?: string;
  redirect_url?: string;
  salary_min?:  number;
  salary_max?:  number;
}

export interface MatchResult {
  id:          string;
  title:       string;
  company:     string;
  location:    string;
  salary:      string | null;
  url:         string | null;
  description: string;
  score:       number;
  reasons:     string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STOP = new Set([
  // English
  'the','and','for','are','not','you','all','can','was','one','our','out',
  'had','him','his','its','may','new','now','own','see','she','two','use',
  'way','who','will','with','have','this','from','they','been','good','much',
  'some','time','very','when','your','just','like','long','make','many','more',
  'only','over','such','take','than','then','them','well','also','back','even',
  // French
  'les','des','une','que','qui','est','dans','sur','par','pour','avec','son',
  'ses','leur','nous','vous','ils','elles','aux','ces','mais','plus','pas',
  'tout','elle','lui','dont','car','cest','être','avoir','faire','plus',
]);

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Tokenise a string into lowercase, meaningful words (≥3 chars, not stop words). */
function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;|/\\()\[\]{}<>:'"!?@#$%^&*+=~`]+/)
    .map(w => w.replace(/[^a-z0-9éèêëàâùûîïôçæœ-]/g, ''))
    .filter(w => w.length >= 3 && !STOP.has(w));
}

/** Extract the most recent job position title from CV work experience. */
function extractCvPrimaryRole(cvContent: unknown): string {
  if (!cvContent || typeof cvContent !== 'object') return '';
  const work = (cvContent as Record<string, unknown>).workExperience as
    Array<Record<string, unknown>> | undefined;
  return (typeof work?.[0]?.position === 'string' ? work[0].position.trim() : '') || '';
}

/** Pull a deduplicated keyword set from CV JSON + config keywords + job title. */
function buildCandidateKeywords(
  cvContent:      unknown,
  configKeywords: string[],
  targetJobTitle: string,
): string[] {
  const kws = new Set<string>();

  // From auto_apply_config keywords (most explicit signal)
  configKeywords.forEach(k => tokenise(k).forEach(t => kws.add(t)));

  // From profile target job title
  tokenise(targetJobTitle).forEach(t => kws.add(t));

  if (cvContent && typeof cvContent === 'object') {
    const cv = cvContent as Record<string, unknown>;

    // Skills flat list
    (cv.skills as string[] | undefined)?.forEach(s => tokenise(s).forEach(t => kws.add(t)));

    // Skill categories
    (cv.skillCategories as Array<{ items: string[] }> | undefined)?.forEach(cat =>
      cat.items?.forEach(item => tokenise(item).forEach(t => kws.add(t))),
    );

    // Work experience positions & descriptions (first 120 chars each)
    (cv.workExperience as Array<Record<string, unknown>> | undefined)?.forEach(w => {
      if (typeof w.position === 'string') tokenise(w.position).forEach(t => kws.add(t));
      if (typeof w.description === 'string')
        tokenise(w.description.slice(0, 120)).forEach(t => kws.add(t));
    });

    // Education fields
    (cv.education as Array<Record<string, unknown>> | undefined)?.forEach(e => {
      if (typeof e.field  === 'string') tokenise(e.field).forEach(t => kws.add(t));
      if (typeof e.degree === 'string') tokenise(e.degree).forEach(t => kws.add(t));
    });
  }

  return [...kws].slice(0, 80); // cap to keep scoring fast
}

/**
 * Pure keyword-overlap score.
 * Base 15 so even 0-overlap jobs aren't shown as 0%.
 * Scales linearly up to 100 as overlap fraction → 1.
 */
function scoreJob(
  jobTitle:   string,
  jobDesc:    string,
  keywords:   string[],
  configKws:  string[],
): { score: number; reasons: string[] } {
  if (keywords.length === 0) return { score: 50, reasons: ['Keyword profile not available'] };

  const haystack = `${jobTitle} ${jobDesc}`.toLowerCase();

  const matched    = keywords.filter(kw => haystack.includes(kw));
  const cfgMatched = configKws.filter(kw => haystack.toLowerCase().includes(kw.toLowerCase()));
  const titleHits  = keywords.filter(kw => jobTitle.toLowerCase().includes(kw));

  const overlapPct = matched.length / keywords.length;
  const score = Math.min(100, Math.round(15 + overlapPct * 85));

  // Build up to 3 human-readable reasons
  const reasons: string[] = [];

  if (titleHits.length > 0) {
    reasons.push(`Job title matches your skills: ${titleHits.slice(0, 3).join(', ')}`);
  }

  const descOnly = matched.filter(k => !titleHits.includes(k));
  if (descOnly.length > 0) {
    reasons.push(`${descOnly.length} of your skills appear in the job description`);
  }

  if (cfgMatched.length > 0) {
    reasons.push(`Matches your search keywords: ${cfgMatched.slice(0, 2).join(', ')}`);
  } else if (reasons.length < 2) {
    reasons.push(`${matched.length} keyword overlap with your CV`);
  }

  if (reasons.length === 0) reasons.push('Broad match in your target field');

  return { score, reasons: reasons.slice(0, 3) };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  console.log('[ai-job-matches] GET called');
  const t0 = Date.now();

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const force = new URL(req.url).searchParams.get('force') === '1';

    // ── Cache check (1-hour TTL) ──────────────────────────────────────────────
    if (!force) {
      try {
        const { data: cached } = await supabase
          .from('ai_job_matches_cache')
          .select('results, cached_at')
          .eq('user_id', user.id)
          .maybeSingle();

        if (cached?.cached_at) {
          const ageMs = Date.now() - new Date(cached.cached_at).getTime();
          if (ageMs < 60 * 60 * 1000) {
            console.log(`[ai-job-matches] cache hit (${Date.now() - t0}ms)`);
            return NextResponse.json({ matches: cached.results, fromCache: true });
          }
        }
      } catch { /* table may not exist yet — continue */ }
    }

    // ── Parallel fetch: profile + CV + auto_apply_config ─────────────────────
    const [profileRes, cvRes, configRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('target_job_title, target_countries, min_salary')
        .eq('id', user.id)
        .single(),
      supabase
        .from('cvs')
        .select('content')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('auto_apply_config')
        .select('keywords, target_countries')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    const profile = profileRes.data;
    const cv      = cvRes.data;
    const config  = configRes.data;

    // Keyword priority: auto_apply_config > profile title > CV primary role > fallback
    const configKeywords: string[] = Array.isArray(config?.keywords) ? config.keywords.filter(Boolean) : [];
    const targetTitle    = profile?.target_job_title?.trim() ?? '';
    const cvRole         = extractCvPrimaryRole(cv?.content);
    const searchKeyword  = configKeywords[0] || targetTitle || cvRole || 'developer';

    console.log(`[ai-job-matches] keyword sources — config: [${configKeywords.join(', ')}] | profile: "${targetTitle}" | cvRole: "${cvRole}" → using: "${searchKeyword}"`);

    // Countries: prefer profile, fall back to config, then default
    const profileCountries: string[] = Array.isArray(profile?.target_countries) && profile.target_countries.length
      ? profile.target_countries : [];
    const configCountries: string[]  = Array.isArray(config?.target_countries) && config.target_countries.length
      ? config.target_countries : [];
    const country = (profileCountries[0] ?? configCountries[0] ?? 'fr');

    const minSalary: number = profile?.min_salary ?? 0;

    // Build keyword set for matching
    const candidateKws = buildCandidateKeywords(cv?.content, configKeywords, searchKeyword);

    console.log(`[ai-job-matches] keyword="${searchKeyword}" country="${country}" cvKws=${candidateKws.length} (${Date.now() - t0}ms)`);

    if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) {
      return NextResponse.json({ error: 'Job search not configured' }, { status: 503 });
    }

    // ── Adzuna search (8-second timeout) ─────────────────────────────────────
    const adzunaParams = new URLSearchParams({
      app_id:           process.env.ADZUNA_APP_ID,
      app_key:          process.env.ADZUNA_APP_KEY,
      results_per_page: '20',
      what:             searchKeyword,
    });
    if (minSalary > 0) adzunaParams.set('salary_min', String(minSalary));

    const adzunaUrl = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${adzunaParams}`;

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 8_000);

    let results: AdzunaResult[] = [];
    try {
      const adzunaRes = await fetch(adzunaUrl, {
        headers: { Accept: 'application/json' },
        signal: ac.signal,
      });
      clearTimeout(timeout);

      if (!adzunaRes.ok) {
        const body = await adzunaRes.text().catch(() => '');
        console.error('[ai-job-matches] Adzuna error:', adzunaRes.status, body.slice(0, 200));
        return NextResponse.json({ error: `Job search failed (${adzunaRes.status})` }, { status: 500 });
      }

      results = ((await adzunaRes.json()).results ?? []) as AdzunaResult[];
    } catch (fetchErr: unknown) {
      clearTimeout(timeout);
      const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      const msg     = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error(`[ai-job-matches] Adzuna fetch ${isAbort ? 'timed out (8s)' : 'failed'}: ${msg}`);
      return NextResponse.json(
        { error: isAbort
            ? 'Job search timed out (Adzuna took > 8 s). Try again in a moment.'
            : `Job search failed: ${msg}` },
        { status: 503 },
      );
    }

    console.log(`[ai-job-matches] Adzuna returned ${results.length} results (${Date.now() - t0}ms)`);

    if (results.length === 0) {
      return NextResponse.json({
        matches:   [],
        fromCache: false,
        message:   `No jobs found for "${searchKeyword}" in ${country.toUpperCase()}. Try updating your target job title or keywords in Settings.`,
      });
    }

    // ── Keyword-match scoring (pure in-memory — instant) ─────────────────────
    const matches: MatchResult[] = results.map(job => {
      const title    = job.title ?? '';
      const company  = job.company?.display_name ?? 'Unknown';
      const location = job.location?.display_name ?? '';
      const desc     = stripHtml(job.description ?? '').slice(0, 800);
      const salary   = job.salary_min
        ? `${job.salary_min.toLocaleString()}${job.salary_max ? ` – ${job.salary_max.toLocaleString()}` : ''} €/yr`
        : null;

      const { score, reasons } = scoreJob(title, desc, candidateKws, configKeywords);

      return { id: job.id, title, company, location, salary, url: job.redirect_url ?? null, description: desc, score, reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

    console.log(`[ai-job-matches] scored & sorted in ${Date.now() - t0}ms, returning ${matches.length} matches`);

    // ── Cache (best-effort) ───────────────────────────────────────────────────
    supabase
      .from('ai_job_matches_cache')
      .upsert({ user_id: user.id, results: matches, cached_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .then(() => null, () => null);

    return NextResponse.json({ matches, fromCache: false });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ai-job-matches] unhandled error:', msg);
    return NextResponse.json({ error: `Internal error: ${msg}` }, { status: 500 });
  }
}
