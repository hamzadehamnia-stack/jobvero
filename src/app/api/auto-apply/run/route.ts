import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { logApplicationEvent } from '@/lib/applicationEvents';
import { callOpenRouter } from '@/lib/openrouter';
import { findRecruiterEmail } from '@/lib/email-finder';
import type { JobContext, CountryCode } from '@/lib/email-finder';
import { Resend } from 'resend';

const MODEL = 'anthropic/claude-sonnet-4-6';
const resend = new Resend(process.env.RESEND_API_KEY);

// Mapping Adzuna country code → Jobvero CountryCode
const ADZUNA_COUNTRY_MAP: Record<string, CountryCode> = {
  us: 'us', gb: 'uk', fr: 'fr', de: 'de', es: 'es', br: 'br',
  mx: 'mx', ca: 'ca', au: 'au', nz: 'nz', nl: 'nl',
};

interface AdzunaResult {
  id: string;
  title: string;
  company?: { display_name: string };
  location?: { display_name: string };
  description?: string;
  redirect_url?: string;
  salary_min?: number;
  salary_max?: number;
  contract_time?: string;
  contract_type?: string;
}

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

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: config } = await supabase
      .from('auto_apply_config')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!config) {
      return NextResponse.json({ error: 'Auto Apply not configured' }, { status: 400 });
    }

    const keywords: string[]  = Array.isArray(config.keywords) && config.keywords.length
      ? config.keywords
      : ['developer'];
    const countries: string[] = Array.isArray(config.target_countries) && config.target_countries.length
      ? config.target_countries
      : ['fr'];
    const maxPerDay:     number = config.max_per_day  ?? 3;
    const minSalary:     number = config.min_salary   ?? 0;
    const contractType:  string = config.contract_type ?? 'all';

    if (!process.env.ADZUNA_APP_ID || !process.env.ADZUNA_APP_KEY) {
      return NextResponse.json({ error: 'Job search not configured' }, { status: 503 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email service not configured' }, { status: 503 });
    }

    // Récupérer CV + profile (avec email_alias maintenant)
    const [{ data: cv }, { data: profile }] = await Promise.all([
      supabase.from('cvs').select('content').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('profiles').select('full_name, email_alias').eq('id', user.id).single(),
    ]);

    if (!profile?.email_alias) {
      return NextResponse.json({ error: 'User email alias not configured. Please set one in Settings.' }, { status: 400 });
    }

    const cvText    = cv?.content ? JSON.stringify(cv.content).slice(0, 3000) : '';
    const userName  = profile?.full_name ?? user.email ?? 'the applicant';
    const userFromEmail = `${profile.email_alias}@getjobvero.com`;

    // Quota quotidien
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count: todayCount } = await supabase
      .from('auto_apply_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('applied_at', today.toISOString());

    const remaining = maxPerDay - (todayCount ?? 0);
    if (remaining <= 0) {
      return NextResponse.json({ applied: 0, failed: 0, jobs: [], message: 'Daily limit reached' });
    }

    // Anti-doublon sur 30 jours
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentLogs } = await supabase
      .from('auto_apply_logs')
      .select('job_title, company')
      .eq('user_id', user.id)
      .gte('applied_at', since30d);

    const appliedSet = new Set((recentLogs ?? []).map(l => `${l.job_title}|${l.company}`));

    const keyword = keywords[0];
    const country = countries[0];

    const searchWhat = contractType === 'Remote' ? `${keyword} remote` : keyword;
    const adzunaParams = new URLSearchParams({
      app_id:           process.env.ADZUNA_APP_ID,
      app_key:          process.env.ADZUNA_APP_KEY,
      results_per_page: String(Math.min(remaining * 4, 20)),
      what:             searchWhat,
    });
    if (minSalary > 0)                  adzunaParams.set('salary_min', String(minSalary));
    if (contractType === 'CDI')         adzunaParams.set('permanent', '1');
    if (contractType === 'CDD')         adzunaParams.set('contract',  '1');

    const adzunaRes = await fetch(
      `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${adzunaParams}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!adzunaRes.ok) {
      return NextResponse.json({ error: 'Job search failed' }, { status: 500 });
    }

    const adzunaData = await adzunaRes.json();
    const results = (adzunaData.results ?? []) as AdzunaResult[];

    const appliedJobs: { title: string; company: string; location: string; status: string; reason?: string }[] = [];
    let appliedCount = 0;
    const countryCode: CountryCode = ADZUNA_COUNTRY_MAP[country] ?? 'us';

    for (const job of results) {
      if (appliedCount >= remaining) break;

      const title    = job.title;
      const company  = job.company?.display_name ?? 'Unknown';
      const location = job.location?.display_name ?? '';
      const desc     = stripHtml(job.description ?? '').slice(0, 600);

      if (appliedSet.has(`${title}|${company}`)) continue;

      // 1. Deviner le domaine de l'entreprise
      const companyDomain = guessDomain(company);
      if (!companyDomain) {
        appliedJobs.push({ title, company, location, status: 'skipped', reason: 'no_company_domain' });
        continue;
      }

      // 2. Trouver l'email du recruteur via la cascade
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

      const recruiterResult = await findRecruiterEmail(jobCtx, user.id);

      if (!recruiterResult) {
        // Email non trouvé : on log dans applications mais on n'envoie pas
        await supabase.from('applications').insert({
          user_id:          user.id,
          job_title:        title,
          company_name:     company,
          location,
          notes:            desc,
          job_url:          job.redirect_url ?? null,
          job_source:       'auto-apply',
          status:           'no_email_found',
          application_type: 'auto',
          send_status:      'skipped',
        }).then(() => null, () => null);

        appliedJobs.push({ title, company, location, status: 'skipped', reason: 'no_email_found' });
        continue;
      }

      // 3. Générer la cover letter
      let coverLetter = '';
      try {
        coverLetter = await callOpenRouter(MODEL, [
          {
            role: 'system',
            content: 'You are a career coach. Write a concise professional cover letter. Return plain text only, no HTML, no markdown.',
          },
          {
            role: 'user',
            content: `Write a cover letter for ${userName} applying to ${title} at ${company}.
CV data: ${cvText || 'not provided'}
Job description: ${desc}
Keep under 180 words. Be specific and confident.`,
          },
        ], 600);
      } catch (e) {
        console.error('[auto-apply] Cover letter failed:', e);
        appliedJobs.push({ title, company, location, status: 'failed', reason: 'cover_letter_failed' });
        continue;
      }

      // 4. Envoyer l'email via Resend depuis l'alias du user
      let resendEmailId: string | null = null;
      try {
        const resendResponse = await resend.emails.send({
          from: `${userName} <${userFromEmail}>`,
          to: recruiterResult.email,
          subject: `Application for ${title}`,
          html: coverLetterToHtml(coverLetter),
          headers: {
            'X-Jobvero-Source': recruiterResult.source,
            'X-Jobvero-Confidence': recruiterResult.confidence,
          },
          tags: [
            { name: 'source', value: recruiterResult.source },
            { name: 'confidence', value: recruiterResult.confidence },
          ],
        });

        if (resendResponse.error) {
          console.error('[auto-apply] Resend error:', resendResponse.error);
          throw new Error(resendResponse.error.message);
        }
        resendEmailId = resendResponse.data?.id ?? null;
      } catch (e) {
        console.error('[auto-apply] Resend failed:', e);
        await supabase.from('applications').insert({
          user_id:          user.id,
          job_title:        title,
          company_name:     company,
          location,
          notes:            desc,
          job_url:          job.redirect_url ?? null,
          job_source:       'auto-apply',
          status:           'send_failed',
          application_type: 'auto',
          send_status:      'failed',
          recruiter_email:  recruiterResult.email,
          email_source:     recruiterResult.source,
          email_confidence: recruiterResult.confidence,
        }).then(() => null, () => null);

        appliedJobs.push({ title, company, location, status: 'failed', reason: 'resend_failed' });
        continue;
      }

      // 5. Log dans auto_apply_logs
      await supabase.from('auto_apply_logs').insert({
        user_id:      user.id,
        job_title:    title,
        company,
        location,
        status:       'applied',
        cover_letter: coverLetter,
      }).then(() => null, () => null);

      // 6. Insert dans applications avec tous les champs cascade + Resend
      const { data: appRow } = await supabase.from('applications').insert({
        user_id:          user.id,
        job_title:        title,
        company_name:     company,
        location,
        notes:            desc,
        job_url:          job.redirect_url ?? null,
        job_source:       'auto-apply',
        status:           'applied',
        application_type: 'auto',
        send_status:      'sent',
        sent_at:          new Date().toISOString(),
        recruiter_email:  recruiterResult.email,
        email_source:     recruiterResult.source,
        email_confidence: recruiterResult.confidence,
        resend_email_id:  resendEmailId,
      }).select('id').single();

      if (appRow?.id) {
        await logApplicationEvent(supabase, appRow.id, user.id, 'created',
          `Auto-apply: ${title} at ${company}`);
        await logApplicationEvent(supabase, appRow.id, user.id, 'sent',
          `Sent to ${recruiterResult.email} (via ${recruiterResult.source})`);
      }

      appliedCount++;
      appliedJobs.push({ title, company, location, status: 'applied' });
    }

    const applied = appliedJobs.filter(j => j.status === 'applied').length;
    const failed  = appliedJobs.filter(j => j.status === 'failed').length;
    const skipped = appliedJobs.filter(j => j.status === 'skipped').length;

    return NextResponse.json({ applied, failed, skipped, jobs: appliedJobs });
  } catch (err) {
    console.error('[auto-apply/run]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
