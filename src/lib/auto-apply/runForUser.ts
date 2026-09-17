import type { SupabaseClient } from '@supabase/supabase-js';
import { logApplicationEvent } from '@/lib/applicationEvents';
import { callCatalogueModel } from '@/lib/ai/systemCall';
import { createAdminClient } from '@/lib/supabase/admin';
import { findRecruiterEmail } from '@/lib/email-finder';
import type { JobContext, CountryCode } from '@/lib/email-finder';
import { Resend } from 'resend';
import { checkFeatureAccess, resolveTier, type EntitlementProfile, type Tier } from '@/lib/entitlements';
import { renderRecapEmail } from './renderRecapEmail';
import { emailTranslations } from '@/emails/translations';
import type { Locale } from '@/emails/translations';
import { adaptCVForJob } from './adaptCVForJob';
import { getFullDescription } from '@/lib/jobs/getFullDescription';
import { htmlToPdfBuffer } from '@/lib/htmlToPdfBuffer';
import { computeATSScore } from './computeATSScore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SkippedReason =
  | 'no_access'
  | 'not_configured'
  | 'paused'
  | 'daily_limit'
  | 'monthly_limit'
  | 'no_email_alias'
  | 'no_cv'
  | 'quota_exhausted'
  | 'env_not_configured';

export interface JobResult {
  title:       string;
  company:     string;
  location:    string;
  status:      string;
  reason?:     string;
  jobUrl?:     string;
  cvTailored?: boolean;
}

export interface AutoApplyResult {
  applied:        number;
  failed:         number;
  skipped:        number;
  jobs:           JobResult[];
  skippedReason?: SkippedReason;
  message?:       string;
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface AdzunaResult {
  id:             string;
  title:          string;
  company?:       { display_name: string };
  location?:      { display_name: string };
  description?:   string;
  redirect_url?:  string;
  salary_min?:    number;
  salary_max?:    number;
  contract_time?: string;
  contract_type?: string;
}

const ADZUNA_COUNTRY_MAP: Record<string, CountryCode> = {
  us: 'us', gb: 'uk', fr: 'fr', de: 'de', es: 'es', br: 'br',
  mx: 'mx', ca: 'ca', au: 'au', nz: 'nz', nl: 'nl',
};

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function slugifyCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|sa|sas|gmbh|corp|corporation|company|co)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function guessDomain(companyName: string): string | null {
  const slug = slugifyCompany(companyName);
  if (!slug || slug.length < 2) return null;
  return `${slug}.com`;
}

function bodyToHtml(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const body = paragraphs.map(p => `<p style="margin: 0 0 16px 0;">${p.replace(/\n/g, '<br>')}</p>`).join('');
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1a1a1a; max-width: 600px;">${body}</div>`;
}

// Model and ceiling from ai_action_costs.auto_apply, step `email`; the cost
// goes on the application's own reserved row.
async function generateEmailBody(
  admin:         SupabaseClient,
  userId:        string,
  usageId:       string,
  title:         string,
  company:       string,
  candidateName: string,
  cvSummary:     string,
): Promise<string> {
  const { text } = await callCatalogueModel(admin, {
    action:  'auto_apply',
    step:    'email',
    userId,
    usageId,
    messages: [
      {
        role: 'system',
        content:
          'Write a short, professional job application email body (3-4 sentences max). ' +
          'The candidate is applying for the position. Express genuine interest, mention ' +
          '1-2 relevant strengths from the CV, and note the CV is attached. Professional ' +
          'but warm tone. NO subject line, NO greeting placeholder like [Name] — write it ' +
          'ready to send. Sign with the candidate\'s name. Do NOT mention any tool, ' +
          'automation, or AI. Write as if the candidate wrote it personally.',
      },
      {
        role: 'user',
        content: `Candidate name: ${candidateName}\nApplying for: ${title} at ${company}\nCV summary: ${cvSummary}`,
      },
    ],
    timeoutMs: 20_000,
  });
  return text;
}

// ─── What an application costs ────────────────────────────────────────────────
//
// Not a credit. Reference §3: an automatic application spends one unit of its
// own monthly quota, and the two counters never eat each other. They used to:
// one credit per application meant a Premium customer's 210 applications would
// have eaten 210 of their 150 credits, so the quota was arithmetically
// impossible to reach and the plan promised something it could not deliver.
//
// The unit is claimed under lock (claim_auto_apply) once the recruiter's
// address is known — before that nothing is committed — and given back
// (release_auto_apply) if anything between the claim and the send fails.
//
// What the attempt already cost us is NOT given back. It stays on a zero-credit
// system row opened for this application, so a failed application shows as
// absorbed cost in cost_system_usd of ai_margin_weekly rather than vanishing.

export interface ApplicationCharge {
  /** The zero-credit ai_usage row this application's model calls hang on. */
  usageId: string;
  /** Applications used this month, after this one, and the plan's quota. */
  used:    number;
  quota:   number;
}

export type QuotaRefusal = {
  refused: 'quota_exhausted' | 'guard' | 'error';
  used:    number;
  quota:   number;
};

export async function claimApplication(
  admin:  SupabaseClient,
  userId: string,
  tier:   Tier,
): Promise<ApplicationCharge | QuotaRefusal> {
  const { data, error } = await admin.rpc('claim_auto_apply', { p_user_id: userId, p_tier: tier });

  if (error) {
    console.error(`[auto-apply] quota claim failed for ${userId}:`, error.message);
    return { refused: 'error', used: 0, quota: 0 };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    { allowed?: boolean; reason?: string; used?: number; quota?: number } | null;

  const used  = Number(row?.used  ?? 0);
  const quota = Number(row?.quota ?? 0);

  if (row?.allowed !== true) {
    return { refused: row?.reason === 'guard' ? 'guard' : 'quota_exhausted', used, quota };
  }

  // One ai_usage row per application, opened at zero credits and already
  // settled: every step's cost lands on it, and it reads as system cost.
  const { data: usageId, error: openError } = await admin.rpc('open_system_ai_usage', {
    p_user_id: userId,
    p_action:  'system_auto_apply',
  });

  if (openError || typeof usageId !== 'string') {
    // Rather than spend a unit on an application whose cost we could not
    // record, the unit goes straight back.
    await releaseApplication(admin, userId);
    console.error(`[auto-apply] cost row could not be opened for ${userId}:`, openError?.message ?? 'no id returned');
    return { refused: 'error', used, quota };
  }

  return { usageId: String(usageId), used, quota };
}

export async function releaseApplication(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin.rpc('release_auto_apply', { p_user_id: userId });
  if (error) console.error(`[auto-apply] quota release failed for ${userId}:`, error.message);
}

// ─── Measuring what an application actually costs ─────────────────────────────
//
// Docs/jobvero-plans-reference.md §5 carries one estimated line: about $0.040
// for an automatic application, extrapolated from CV generation and never
// measured, because nobody had ever run one end to end.
//
// This runs the paid steps of a real application — screening, CV rewrite, email
// body, contact hunt — against a real job description, and stops before the
// send. Nothing is emailed, no application row, no thread, no quota unit. Every
// call lands on the ledger, so the cost is read from ai_usage_calls rather than
// guessed.
//
// Reachable only through the route's test seam, which is dead code outside
// development.

export interface MeasuredStep {
  step:   string;
  ok:     boolean;
  detail?: string;
}

export interface MeasuredApplication {
  /** The zero-credit row the CV and email steps hang on. */
  usageId: string;
  steps:   MeasuredStep[];
}

export async function measureApplication(opts: {
  admin:         SupabaseClient;
  userId:        string;
  candidateName: string;
  cvContent:     Record<string, unknown>;
  cvText:        string;
  job: {
    id:          string;
    title:       string;
    company:     string;
    description: string;
    url?:        string;
  };
}): Promise<MeasuredApplication> {
  const { admin, userId, candidateName, cvContent, cvText, job } = opts;
  const steps: MeasuredStep[] = [];

  const { data: usageId, error: openError } = await admin.rpc('open_system_ai_usage', {
    p_user_id: userId,
    p_action:  'system_auto_apply',
  });
  if (openError || typeof usageId !== 'string') {
    throw new Error(`cost row could not be opened: ${openError?.message ?? 'no id returned'}`);
  }

  const record = async (step: string, run: () => Promise<unknown>) => {
    try {
      const value = await run();
      steps.push({ step, ok: true, detail: typeof value === 'string' ? `${value.length} chars` : String(value) });
    } catch (e) {
      // A step that fails still cost what it cost: it is recorded, not hidden.
      steps.push({ step, ok: false, detail: String(e).slice(0, 200) });
    }
  };

  // 1. Screening — free to the user, on its own system row.
  await record('screening', () =>
    computeATSScore({ admin, userId, cvText: cvText.slice(0, 4000), jobDescription: job.description.slice(0, 2000) }));

  // 2. The CV rewritten for this job.
  await record('cv', () =>
    adaptCVForJob({
      admin,
      userId,
      usageId:        String(usageId),
      cvContent,
      jobTitle:       job.title,
      company:        job.company,
      jobDescription: job.description,
    }));

  // 3. The message that carries it.
  await record('email', () =>
    generateEmailBody(admin, userId, String(usageId), job.title, job.company, candidateName, cvText));

  // 4. The recruiter's address: real lookups, its own system rows.
  await record('contact', async () => {
    const domain = guessDomain(job.company);
    if (!domain) return 'no company domain';
    const found = await findRecruiterEmail({
      jobId:              job.id,
      jobTitle:           job.title,
      jobDescriptionHtml: job.description,
      jobUrl:             job.url,
      companyName:        job.company,
      companyDomain:      domain,
      country:            'us',
      rawApiPayload:      {},
      // No apiSource: this job came from a measurement, not from a job board,
      // and inventing a source would put a lie in the email-finder's cache.
    } as JobContext, userId);
    return found ? `found via ${found.source}` : 'no address found';
  });

  return { usageId: String(usageId), steps };
}

// ─── Main engine ──────────────────────────────────────────────────────────────

/**
 * Runs one auto-apply batch for a given user.
 * Works without a user session — uses the passed userId and any Supabase client
 * (session-based for manual trigger, admin/service-role for cron).
 */
export async function runAutoApplyForUser(
  userId: string,
  supabase: SupabaseClient,
): Promise<AutoApplyResult> {
  const empty = (skippedReason: SkippedReason, message?: string): AutoApplyResult =>
    ({ applied: 0, failed: 0, skipped: 0, jobs: [], skippedReason, message });

  // Credits, model calls and their ledger rows go through the service role:
  // this runs both from a user's click and from the cron, which has no session.
  const admin = createAdminClient();

  // ── 1. Load settings ───────────────────────────────────────────────────────
  const { data: config } = await supabase
    .from('auto_apply_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!config) return empty('not_configured', 'Auto Apply not configured');
  if (!config.is_active) return empty('paused', 'Auto Apply is paused');

  // ── 2. Tier check (required: cron bypasses withFeatureCheck) ──────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email_alias, subscription_plan, subscription_status, is_blocked, ai_credits_remaining, preferred_language')
    .eq('id', userId)
    .single();

  // The one table decides. The cron calls this with no session, so the check
  // has to happen here as well as on the route.
  const access = checkFeatureAccess(resolveTier((profile ?? null) as EntitlementProfile | null), 'AUTO_APPLY');
  if (!access.allowed) return empty('no_access', 'Automatic applications are part of Pro and Premium.');

  const tier: Tier = access.tier;
  const isPremium  = tier === 'premium';
  const atsThreshold: number = typeof config.ats_threshold === 'number' ? config.ats_threshold : 70;

  // ── 3. Profile prerequisites ───────────────────────────────────────────────
  if (!profile?.email_alias) return empty('no_email_alias', 'User email alias not configured');

  const userName      = profile.full_name || 'the applicant';
  const userFromEmail = `${profile.email_alias}@getjobvero.com`;

  // ── 4. CV ──────────────────────────────────────────────────────────────────
  const { data: cv } = await supabase
    .from('cvs')
    .select('form_data, html_content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const cvRawContent = (cv?.form_data ?? null) as Record<string, unknown> | null;
  if (!cvRawContent) return empty('no_cv', 'Please create and save your CV in the CV Builder first.');
  const cvText = JSON.stringify(cvRawContent).slice(0, 3000);
  const cvHtmlContent = typeof cv?.html_content === 'string' ? cv.html_content : null;
  // For ATS scoring we want clean prose text — only possible when html_content exists
  const cvTextForATS = cvHtmlContent ? stripHtml(cvHtmlContent).slice(0, 4000) : null;

  // ── 5. Env checks ──────────────────────────────────────────────────────────
  if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY || !process.env.RESEND_API_KEY) {
    return empty('env_not_configured', 'Required environment variables are missing');
  }

  // ── 6. Config fields ───────────────────────────────────────────────────────
  const keywords: string[]       = Array.isArray(config.keywords) && config.keywords.length ? config.keywords : ['developer'];
  const countries: string[]      = Array.isArray(config.target_countries) && config.target_countries.length ? config.target_countries : ['us'];
  const maxPerDay: number        = config.daily_limit   ?? 3;
  const minSalary: number        = config.min_salary    ?? 0;
  const contractTypes: string[]  = Array.isArray(config.contract_types)    ? config.contract_types    : [];
  const excludedKws: string[]    = Array.isArray(config.excluded_keywords)  ? config.excluded_keywords : [];
  const locations: string[]      = Array.isArray(config.locations)          ? config.locations         : [];
  const remoteOnly: boolean      = config.remote_only      ?? false;
  const experienceLevel: string  = config.experience_level ?? 'any';

  // ── 7. Daily quota check ───────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count: todayCount } = await supabase
    .from('auto_apply_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('applied_at', today.toISOString());

  const remainingToday = maxPerDay - (todayCount ?? 0);
  if (remainingToday <= 0) return empty('daily_limit', 'Daily auto-apply limit reached');

  // ── 8. The month's quota ───────────────────────────────────────────────────
  //
  // Not counted here. claim_auto_apply counts it in the database, under lock,
  // one unit per application at the moment it is committed — the only place
  // that can be right when two runs happen at once. This loop stops when the
  // claim refuses, and the refusal carries the numbers to show.
  const remaining = remainingToday;
  let quotaUsed  = 0;
  let quotaTotal = 0;

  // ── 9. 30-day dedup sets ──────────────────────────────────────────────────
  // Two complementary checks:
  //   • appliedJobIds  — exact Adzuna job ID match (most reliable)
  //   • appliedCompanyKeys — normalised "company|title" for jobs without stored ID
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentLogs } = await supabase
    .from('auto_apply_logs')
    .select('job_title, company, job_id')
    .eq('user_id', userId)
    .gte('applied_at', since30d);

  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const appliedJobIds    = new Set<string>();
  const appliedCompanyKeys = new Set<string>();
  for (const l of recentLogs ?? []) {
    if (l.job_id)  appliedJobIds.add(l.job_id);
    appliedCompanyKeys.add(`${normalise(l.company)}|${normalise(l.job_title)}`);
  }

  // ── 10. Adzuna contract-type params ────────────────────────────────────────
  const wantsPermanent = contractTypes.some(t => ['CDI', 'Permanent', 'Full-time'].includes(t));
  const wantsContract  = contractTypes.some(t => ['CDD', 'Contract', 'Freelance', 'Intérim'].includes(t));
  const wantsFullTime  = contractTypes.some(t => t === 'Full-time');
  const wantsPartTime  = contractTypes.some(t => t === 'Part-time');
  const adzunaContractFilter: Record<string, string> = {};
  if (wantsPermanent && !wantsContract)  adzunaContractFilter.permanent = '1';
  if (wantsContract  && !wantsPermanent) adzunaContractFilter.contract  = '1';
  if (wantsFullTime  && !wantsPartTime)  adzunaContractFilter.full_time = '1';
  if (wantsPartTime  && !wantsFullTime)  adzunaContractFilter.part_time = '1';

  // ── 11. Fan-out: keyword × country (cap: 3 × 2) ───────────────────────────
  const kws      = keywords.slice(0, 3);
  const ctrs     = countries.slice(0, 2);
  const location = locations.length ? locations[0] : null;
  const perQuery = Math.max(5, Math.ceil((remaining * 4) / (kws.length * ctrs.length)));

  const fetchPromises = kws.flatMap(kw =>
    ctrs.map(async ctr => {
      let what = remoteOnly ? `${kw} remote` : kw;
      if (experienceLevel === 'entry')  what = `${what} junior`;
      if (experienceLevel === 'senior') what = `${what} senior`;

      const p = new URLSearchParams({
        app_id:           process.env.ADZUNA_APP_ID!,
        app_key:          process.env.ADZUNA_APP_KEY!,
        results_per_page: String(Math.min(perQuery, 20)),
        what,
      });
      if (location)      p.set('where', location);
      if (minSalary > 0) p.set('salary_min', String(minSalary));
      Object.entries(adzunaContractFilter).forEach(([k, v]) => p.set(k, v));

      const res = await fetch(
        `https://api.adzuna.com/v1/api/jobs/${ctr}/search/1?${p}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!res.ok) return [] as AdzunaResult[];
      const data = await res.json();
      return (data.results ?? []) as AdzunaResult[];
    }),
  );

  const fetchedPages = await Promise.all(fetchPromises);

  // ── 12. Merge & dedupe ─────────────────────────────────────────────────────
  const seenIds = new Set<string>();
  const merged: AdzunaResult[] = [];
  for (const page of fetchedPages) {
    for (const job of page) {
      if (!seenIds.has(job.id)) { seenIds.add(job.id); merged.push(job); }
    }
  }

  // ── 13. Post-fetch filters ─────────────────────────────────────────────────
  const excludedPatterns = excludedKws.map(kw =>
    new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  );

  const filtered = merged.filter(job => {
    const title = job.title ?? '';
    const desc  = stripHtml(job.description ?? '');
    const text  = `${title} ${desc}`.toLowerCase();

    if (excludedPatterns.some(re => re.test(title) || re.test(desc))) return false;

    if (contractTypes.length) {
      const cTime = job.contract_time ?? '';
      const cType = job.contract_type ?? '';
      const matches = contractTypes.some(t => {
        switch (t) {
          case 'CDI': case 'Permanent':   return cType === 'permanent';
          case 'CDD': case 'Intérim': case 'Freelance': case 'Contract': return cType === 'contract';
          case 'Full-time':  return cTime === 'full_time';
          case 'Part-time':  return cTime === 'part_time';
          default:           return true;
        }
      });
      if (!matches) return false;
    }

    if (experienceLevel === 'entry') {
      if (/\b(senior|sr\.|lead|principal|staff|head|director|vp|vice president|chief|cto|ceo|coo)\b/i.test(title)) return false;
    }
    if (experienceLevel === 'mid') {
      if (/\b(intern|internship|junior|jr\.|trainee|apprentice|graduate program)\b/i.test(title)) return false;
      if (/\b(director|vp|vice president|chief|cto|ceo|coo|managing partner)\b/i.test(title)) return false;
    }
    if (experienceLevel === 'senior') {
      if (!/\b(senior|sr\.|lead|principal|staff|head|director|vp|architect|manager|expert)\b/i.test(title)) return false;
    }
    if (remoteOnly && !/\b(remote|télétravail|distributed|anywhere)\b/i.test(text)) return false;

    return true;
  });

  const candidates = filtered.slice(0, remaining * 4);

  // ── 14. Application loop ───────────────────────────────────────────────────
  const nameParts = (profile.full_name ?? 'applicant')
    .toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean);
  const pdfFilename = nameParts.join('-') + '-CV.pdf';

  const primaryCountry = countries[0] ?? 'us';
  const countryCode: CountryCode = ADZUNA_COUNTRY_MAP[primaryCountry] ?? 'us';

  const jobs: JobResult[] = [];
  let appliedCount = 0;

  for (const job of candidates) {
    if (appliedCount >= remaining) break;

    const title    = job.title;
    const company  = job.company?.display_name ?? 'Unknown';
    const location = job.location?.display_name ?? '';
    const desc     = stripHtml(job.description ?? '').slice(0, 600);

    // Dedup: skip if already applied in the last 30 days (by job ID or normalised title+company)
    const companyKey = `${normalise(company)}|${normalise(title)}`;
    if (appliedJobIds.has(job.id) || appliedCompanyKeys.has(companyKey)) continue;

    const companyDomain = guessDomain(company);
    if (!companyDomain) {
      jobs.push({ title, company, location, status: 'skipped', reason: 'no_company_domain' });
      continue;
    }

    // ── Premium: ATS score pre-filter ────────────────────────────────────────
    // Run before recruiter lookup to avoid wasting email-finder credits on poor matches.
    let atsScore: number | null = null;
    if (isPremium) {
      if (!cvTextForATS) {
        console.warn('[runAutoApplyForUser] ATS check skipped: CV has no html_content');
      } else {
        try {
          const jobDescForATS = stripHtml(job.description ?? '').slice(0, 2000);
          const score = await Promise.race([
            // Screening happens before any application is decided, so it is
            // never charged to the user: its cost lands on a system row.
            computeATSScore({ admin, userId, cvText: cvTextForATS, jobDescription: jobDescForATS }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 15_000),
            ),
          ]);
          atsScore = score;
          if (score < atsThreshold) {
            console.log(`[ATS SKIP] score=${score}, threshold=${atsThreshold}, job="${title}" @ ${company}`);
            jobs.push({ title, company, location, status: 'skipped', reason: 'ats_score_too_low' });
            continue;
          }
        } catch (e) {
          console.error('[runAutoApplyForUser] ATS score failed (non-fatal, proceeding):', e);
        }
      }
    }

    const jobCtx: JobContext = {
      jobId: job.id,
      jobTitle: title,
      jobDescriptionHtml: job.description,
      jobUrl: job.redirect_url,
      companyName: company,
      companyDomain,
      country: countryCode,
      rawApiPayload: job,
      apiSource: 'adzuna',
    };

    const recruiterResult = await findRecruiterEmail(jobCtx, userId);

    if (!recruiterResult) {
      await supabase.from('applications').insert({
        user_id: userId, job_title: title, company_name: company, location,
        notes: desc, job_url: job.redirect_url ?? null, job_source: 'auto-apply',
        status: 'no_email_found', application_type: 'auto', send_status: 'skipped',
      }).then(() => null, () => null);
      jobs.push({ title, company, location, status: 'skipped', reason: 'no_email_found' });
      continue;
    }

    // ── The quota: one unit per application, taken here ──────────────────────
    const claim = await claimApplication(admin, userId, tier);
    if ('refused' in claim) {
      // The month is spent, or the guard caught a loop. No later job will fare
      // better, so the run stops rather than repeating the refusal for every
      // candidate.
      console.warn(`[runAutoApplyForUser] quota refused (${claim.refused}, ${claim.used}/${claim.quota}) — stopping this run`);
      jobs.push({ title, company, location, status: 'skipped', reason: claim.refused });
      quotaUsed  = claim.used;
      quotaTotal = claim.quota;
      break;
    }
    const charge = claim;
    quotaUsed  = claim.used;
    quotaTotal = claim.quota;

    // ── Full description (cache → scrape; the Adzuna excerpt otherwise) ──────
    const descResult = await getFullDescription({
      jobId:       job.id,
      redirectUrl: job.redirect_url,
    }).catch(() => null);
    const richDesc = descResult?.description ?? stripHtml(job.description ?? '').slice(0, 2000);

    // ── Premium: tailor CV + generate PDF ────────────────────────────────────
    let tailoredHtml: string | null = null;
    let cvTailored = false;
    if (isPremium && cvRawContent) {
      try {
        tailoredHtml = await Promise.race([
          adaptCVForJob({
            admin,
            userId,
            usageId:        charge.usageId,
            cvContent:      cvRawContent,
            jobTitle:       title,
            company,
            jobDescription: richDesc,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 20_000),
          ),
        ]);
        cvTailored = true;
      } catch (e) {
        console.error('[runAutoApplyForUser] CV tailoring failed (non-fatal):', e);
      }
    }

    let pdfAttachment: { filename: string; content: Buffer } | null = null;
    const htmlForPdf = tailoredHtml ?? cvHtmlContent;
    if (htmlForPdf) {
      try {
        const buf = await Promise.race([
          htmlToPdfBuffer(htmlForPdf),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 18_000),
          ),
        ]);
        pdfAttachment = { filename: pdfFilename, content: buf };
      } catch (e) {
        console.error('[runAutoApplyForUser] PDF generation failed (non-fatal):', e);
      }
    }

    // ── Email body (short AI message, ~3-4 sentences) ────────────────────────
    let emailBody = '';
    try {
      emailBody = await Promise.race([
        generateEmailBody(admin, userId, charge.usageId, title, company, userName, cvText),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 15_000),
        ),
      ]);
    } catch (e) {
      console.error('[runAutoApplyForUser] Email body generation failed:', e);
      // Nothing was sent: the quota unit goes back, and the calls already made
      // stay on the row as cost the house absorbed.
      await releaseApplication(admin, userId);
      jobs.push({ title, company, location, status: 'failed', reason: 'email_body_failed' });
      continue;
    }

    // Create thread BEFORE email so replyTo can use reply+{threadId}@ format
    let threadId: string | null = null;
    try {
      const { data: newThread } = await supabase.from('message_threads').insert({
        user_id:                userId,
        job_title:              title,
        company_name:           company,
        employer_email:         recruiterResult.email,
        subject:                `Application for ${title} - ${userName}`,
        last_message_preview:   emailBody.slice(0, 120),
        last_message_at:        new Date().toISOString(),
        last_message_direction: 'outbound',
        unread_count:           0,
      }).select('id').single();
      threadId = (newThread?.id as string) ?? null;
    } catch (e) {
      console.error('[runAutoApplyForUser] thread create failed (non-fatal):', e);
    }

    let resendEmailId: string | null = null;
    try {
      const resendResponse = await resend.emails.send({
        from:    `${userName} <${userFromEmail}>`,
        to:      recruiterResult.email,
        replyTo: threadId ? `reply+${threadId}@getjobvero.com` : userFromEmail,
        subject: `Application for ${title} - ${userName}`,
        html:    bodyToHtml(emailBody),
        headers: { 'X-Jobvero-Source': recruiterResult.source, 'X-Jobvero-Confidence': recruiterResult.confidence },
        tags:    [{ name: 'source', value: recruiterResult.source }, { name: 'confidence', value: recruiterResult.confidence }],
        ...(pdfAttachment ? { attachments: [{ filename: pdfAttachment.filename, content: pdfAttachment.content }] } : {}),
      });
      if (resendResponse.error) throw new Error(resendResponse.error.message);
      resendEmailId = resendResponse.data?.id ?? null;
      if (threadId) {
        await supabase.from('messages').insert({
          thread_id:  threadId,
          direction:  'outbound',
          from_email: userFromEmail,
          to_email:   recruiterResult.email,
          body:       emailBody,
          read:       true,
        }).then(() => null, () => null);
      }
    } catch (e) {
      console.error('[runAutoApplyForUser] Resend failed:', e);
      await releaseApplication(admin, userId);
      await supabase.from('applications').insert({
        user_id: userId, job_title: title, company_name: company, location,
        notes: desc, job_url: job.redirect_url ?? null, job_source: 'auto-apply',
        status: 'send_failed', application_type: 'auto', send_status: 'failed',
        recruiter_email: recruiterResult.email, email_source: recruiterResult.source, email_confidence: recruiterResult.confidence,
      }).then(() => null, () => null);
      jobs.push({ title, company, location, status: 'failed', reason: 'resend_failed' });
      continue;
    }

    // The email is gone: this is what the quota unit was for. Nothing to settle
    // — the cost row was opened settled, at zero credits.

    await supabase.from('auto_apply_logs').insert({
      user_id: userId, job_title: title, company, location, status: 'applied', cover_letter: emailBody,
      cv_tailored: cvTailored, job_id: job.id, ats_score: atsScore,
    }).then(() => null, () => null);

    // Keep in-memory dedup sets current so within-run duplicates are also blocked
    appliedJobIds.add(job.id);
    appliedCompanyKeys.add(`${normalise(company)}|${normalise(title)}`);

    const { data: appRow } = await supabase.from('applications').insert({
      user_id: userId, job_title: title, company_name: company, location,
      notes: desc, job_url: job.redirect_url ?? null, job_source: 'auto-apply',
      status: 'applied', application_type: 'auto', send_status: 'sent',
      sent_at: new Date().toISOString(),
      recruiter_email: recruiterResult.email, email_source: recruiterResult.source,
      email_confidence: recruiterResult.confidence, resend_email_id: resendEmailId,
      ats_score: atsScore, thread_id: threadId,
    }).select('id').single();

    if (appRow?.id) {
      await logApplicationEvent(supabase, appRow.id, userId, 'created', `Auto-apply: ${title} at ${company}`);
      await logApplicationEvent(supabase, appRow.id, userId, 'sent',    `Sent to ${recruiterResult.email} (via ${recruiterResult.source})`);
    }

    appliedCount++;
    jobs.push({ title, company, location, status: 'applied', jobUrl: job.redirect_url ?? undefined, cvTailored });
  }

  // ── 15. Recap email ────────────────────────────────────────────────────────
  if (appliedCount > 0) {
    try {
      // Resolve the user's account email
      // Session-based client (manual trigger): getUser() works.
      // Admin/service-role client (cron): no session — fall back to auth.admin API.
      let userAccountEmail: string | null = null;
      const { data: { user: sessionUser } } = await supabase.auth.getUser();
      if (sessionUser?.email) {
        userAccountEmail = sessionUser.email;
      } else {
        const { data: adminData } = await (supabase.auth as { admin: { getUserById: (id: string) => Promise<{ data: { user: { email: string } | null } }> } }).admin.getUserById(userId);
        userAccountEmail = adminData?.user?.email ?? null;
      }

      if (userAccountEmail) {
        const VALID_LOCALES: Locale[] = ['en', 'fr', 'es', 'pt'];
        const locale: Locale = VALID_LOCALES.includes(profile?.preferred_language as Locale)
          ? (profile!.preferred_language as Locale)
          : 'en';

        const appliedJobs = jobs.filter(j => j.status === 'applied');
        const remainingAfter = Math.max(0, quotaTotal - quotaUsed);
        const dashboardUrl = `https://getjobvero.com/${locale}/dashboard/auto-apply`;
        const t = emailTranslations.autoApplyRecap[locale];

        const html = await renderRecapEmail({
          locale,
          appliedCount,
          jobs: appliedJobs.map(j => ({ title: j.title, company: j.company, location: j.location, jobUrl: j.jobUrl, cvTailored: j.cvTailored })),
          remainingQuota: remainingAfter,
          dashboardUrl,
        });

        await resend.emails.send({
          from:    'Jobvero <noreply@getjobvero.com>',
          to:      userAccountEmail,
          subject: t.subject,
          html,
        });

        console.log(`[runAutoApplyForUser] Recap sent to ${userAccountEmail} (${appliedCount} applied)`);
      }
    } catch (err) {
      console.error('[runAutoApplyForUser] Recap email failed (non-fatal):', err);
    }
  }

  return {
    applied: jobs.filter(j => j.status === 'applied').length,
    failed:  jobs.filter(j => j.status === 'failed').length,
    skipped: jobs.filter(j => j.status === 'skipped').length,
    jobs,
  };
}
