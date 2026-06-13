import type { SupabaseClient } from '@supabase/supabase-js';
import { logApplicationEvent } from '@/lib/applicationEvents';
import { callOpenRouter } from '@/lib/openrouter';
import { findRecruiterEmail } from '@/lib/email-finder';
import type { JobContext, CountryCode } from '@/lib/email-finder';
import { Resend } from 'resend';
import { getAutoApplyMonthlyLimit } from '@/lib/subscription/features';
import { getEffectiveTier, toFeatureTierKey } from '@/lib/subscription/access';
import { FEATURES } from '@/lib/subscription/features';
import { renderRecapEmail } from './renderRecapEmail';
import { emailTranslations } from '@/emails/translations';
import type { Locale } from '@/emails/translations';
import { adaptCVForJob } from './adaptCVForJob';
import { htmlToPdfBuffer } from '@/lib/htmlToPdfBuffer';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SkippedReason =
  | 'no_access'
  | 'not_configured'
  | 'paused'
  | 'daily_limit'
  | 'monthly_limit'
  | 'no_email_alias'
  | 'no_cv'
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

const MODEL  = 'anthropic/claude-sonnet-4.6';
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

function coverLetterToHtml(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const body = paragraphs.map(p => `<p style="margin: 0 0 16px 0;">${p.replace(/\n/g, '<br>')}</p>`).join('');
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1a1a1a; max-width: 600px;">${body}<p style="margin-top: 32px; font-size: 12px; color: #888;"><em>Sent via Jobvero — getjobvero.com</em></p></div>`;
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
    .select('full_name, email_alias, subscription_plan, trial_ends_at, preferred_language')
    .eq('id', userId)
    .single();

  const tierKey      = toFeatureTierKey(getEffectiveTier(profile?.subscription_plan ?? null, profile?.trial_ends_at ?? null));
  const tierConfig   = FEATURES.AUTO_APPLY[tierKey];
  if (!tierConfig.access) return empty('no_access', 'Auto Apply requires Pro or Premium');

  const isPremium = tierKey === 'premium';

  // ── 3. Profile prerequisites ───────────────────────────────────────────────
  if (!profile?.email_alias) return empty('no_email_alias', 'User email alias not configured');

  const userName      = profile.full_name || 'the applicant';
  const userFromEmail = `${profile.email_alias}@getjobvero.com`;

  // ── 4. CV ──────────────────────────────────────────────────────────────────
  const { data: cv } = await supabase
    .from('cvs')
    .select('form_data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const cvRawContent = (cv?.form_data ?? null) as Record<string, unknown> | null;
  if (!cvRawContent) return empty('no_cv', 'Please create and save your CV in the CV Builder first.');
  const cvText = JSON.stringify(cvRawContent).slice(0, 3000);

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

  // ── 8. Monthly quota check ─────────────────────────────────────────────────
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const { count: sentThisMonth } = await supabase
    .from('auto_apply_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'applied')
    .gte('applied_at', startOfMonth.toISOString());

  const monthlyLimit     = getAutoApplyMonthlyLimit(tierKey);
  const remainingMonthly = monthlyLimit - (sentThisMonth ?? 0);
  if (remainingMonthly <= 0) return empty('monthly_limit', 'Monthly auto-apply limit reached');

  const remaining = Math.min(remainingToday, remainingMonthly);

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

    // ── Premium: tailor CV + generate PDF ────────────────────────────────────
    let tailoredHtml: string | null = null;
    let cvTailored = false;
    if (isPremium && cvRawContent) {
      try {
        tailoredHtml = await Promise.race([
          adaptCVForJob({
            cvContent:      cvRawContent,
            jobTitle:       title,
            company,
            jobDescription: job.description ?? '',
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
    if (tailoredHtml) {
      try {
        const buf = await Promise.race([
          htmlToPdfBuffer(tailoredHtml),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 18_000),
          ),
        ]);
        pdfAttachment = { filename: pdfFilename, content: buf };
      } catch (e) {
        console.error('[runAutoApplyForUser] PDF generation failed (non-fatal):', e);
      }
    }

    // ── Cover letter ──────────────────────────────────────────────────────────
    let coverLetter = '';
    try {
      const fullDesc = job.description ? stripHtml(job.description).slice(0, 800) : desc;
      const coverLetterUserPrompt = isPremium && cvTailored
        ? `Write a targeted cover letter for ${userName} applying to ${title} at ${company}.\nCV data: ${cvText || 'not provided'}\nJob description: ${fullDesc}\nRequirements:\n- Up to 200 words, professional and confident\n- Open by addressing the exact role (${title})\n- Mention 2-3 specific skills or requirements from the job description\n- Reference something specific about ${company} in the closing line\n- End with a clear call to action\nReturn plain text only, no HTML, no markdown.`
        : `Write a cover letter for ${userName} applying to ${title} at ${company}.\nCV data: ${cvText || 'not provided'}\nJob description: ${desc}\nKeep under 180 words. Be specific and confident.`;

      coverLetter = await callOpenRouter(MODEL, [
        { role: 'system', content: 'You are a career coach. Write a concise professional cover letter. Return plain text only, no HTML, no markdown.' },
        { role: 'user',   content: coverLetterUserPrompt },
      ], isPremium ? 700 : 600);
    } catch (e) {
      console.error('[runAutoApplyForUser] Cover letter failed:', e);
      jobs.push({ title, company, location, status: 'failed', reason: 'cover_letter_failed' });
      continue;
    }

    let resendEmailId: string | null = null;
    try {
      const resendResponse = await resend.emails.send({
        from:    `${userName} <${userFromEmail}>`,
        to:      recruiterResult.email,
        subject: `Application for ${title}`,
        html:    coverLetterToHtml(coverLetter),
        headers: { 'X-Jobvero-Source': recruiterResult.source, 'X-Jobvero-Confidence': recruiterResult.confidence },
        tags:    [{ name: 'source', value: recruiterResult.source }, { name: 'confidence', value: recruiterResult.confidence }],
        ...(pdfAttachment ? { attachments: [{ filename: pdfAttachment.filename, content: pdfAttachment.content }] } : {}),
      });
      if (resendResponse.error) throw new Error(resendResponse.error.message);
      resendEmailId = resendResponse.data?.id ?? null;
    } catch (e) {
      console.error('[runAutoApplyForUser] Resend failed:', e);
      await supabase.from('applications').insert({
        user_id: userId, job_title: title, company_name: company, location,
        notes: desc, job_url: job.redirect_url ?? null, job_source: 'auto-apply',
        status: 'send_failed', application_type: 'auto', send_status: 'failed',
        recruiter_email: recruiterResult.email, email_source: recruiterResult.source, email_confidence: recruiterResult.confidence,
      }).then(() => null, () => null);
      jobs.push({ title, company, location, status: 'failed', reason: 'resend_failed' });
      continue;
    }

    await supabase.from('auto_apply_logs').insert({
      user_id: userId, job_title: title, company, location, status: 'applied', cover_letter: coverLetter,
      cv_tailored: cvTailored, job_id: job.id,
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
        const remainingAfter = Math.max(0, remainingMonthly - appliedCount);
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
