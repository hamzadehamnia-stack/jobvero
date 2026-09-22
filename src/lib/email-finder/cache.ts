import { createClient } from '@supabase/supabase-js';
import { JobContext, Confidence, LookupSource, CachedRecruiter } from './types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function getCached(companyDomain: string): Promise<CachedRecruiter | null> {
  const { data } = await supabase
    .from('recruiter_contacts_cache')
    .select('*')
    .eq('company_domain', companyDomain.toLowerCase())
    // 'now' is evaluated by Postgres, not here. expires_at is written by the
    // database (DEFAULT now() + 90 days), so comparing it to this machine's
    // clock asks two clocks to agree — and measured at the same instant, this
    // one runs 6 seconds ahead of Supabase. Six seconds decides nothing for a
    // 90-day cache, but the same shape cost a cancelled customer their credits
    // elsewhere, so the pattern goes rather than the symptom.
    .gt('expires_at', 'now')
    .order('hit_count', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) {
    supabase
      .from('recruiter_contacts_cache')
      .update({ hit_count: data.hit_count + 1, last_used_at: new Date().toISOString() })
      .eq('id', data.id)
      .then(() => {});
  }
  return data as CachedRecruiter | null;
}

export async function setCached(
  ctx: JobContext,
  email: string,
  source: Exclude<LookupSource, 'cache'>,
  confidence: Confidence,
  evidenceUrl?: string | null
): Promise<void> {
  const { error } = await supabase.from('recruiter_contacts_cache').upsert(
    {
      company_domain: ctx.companyDomain.toLowerCase(),
      company_name: ctx.companyName,
      email: email.toLowerCase(),
      source,
      confidence,
      evidence_url: evidenceUrl ?? null,
    },
    { onConflict: 'company_domain' }
  );
  if (error) console.warn('[cache.setCached]', error.message);
}
