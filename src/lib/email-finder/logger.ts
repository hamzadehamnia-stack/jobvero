import { createClient } from '@supabase/supabase-js';
import { LookupLogEntry } from './types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function logLookup(payload: LookupLogEntry): Promise<void> {
  const { error } = await supabase.from('email_lookup_logs').insert({
    user_id: payload.userId,
    job_id: payload.jobId,
    company_domain: payload.companyDomain,
    level_succeeded: payload.levelSucceeded,
    email_found: payload.emailFound,
    cache_hit: payload.cacheHit,
    latency_ms: payload.latencyMs,
    cost_estimate_usd: payload.costEstimateUsd,
  });
  if (error) console.warn('[logger.logLookup]', error.message);
}
