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
    .gt('expires_at', new Date().toISOString())
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
