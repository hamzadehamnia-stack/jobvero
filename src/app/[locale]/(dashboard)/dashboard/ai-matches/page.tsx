import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AIJobMatchesClient from '@/components/ai-job-matches/AIJobMatchesClient';
import type { MatchResult } from '@/app/api/ai-job-matches/route';

export default async function AIJobMatchesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const [{ data: profile }, { data: cv }, { data: cached }] = await Promise.all([
    supabase
      .from('profiles')
      .select('target_job_title, target_countries, min_salary, full_name')
      .eq('id', user.id)
      .single(),
    supabase
      .from('cvs')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('ai_job_matches_cache')
      .select('results, cached_at')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const hasProfile = !!profile?.target_job_title?.trim();
  const hasCv      = !!cv;

  const cacheAgeMs = cached?.cached_at
    ? Date.now() - new Date(cached.cached_at).getTime()
    : Infinity;
  const initialMatches: MatchResult[] =
    cached && cacheAgeMs < 60 * 60 * 1000 ? (cached.results as MatchResult[]) ?? [] : [];

  return (
    <AIJobMatchesClient
      userId={user.id}
      hasProfile={hasProfile}
      hasCv={hasCv}
      initialMatches={initialMatches}
      cachedAt={cached?.cached_at ?? null}
    />
  );
}
