import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import JobsClient from '@/components/jobs/JobsClient';

export default async function JobsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { data: profile } = await supabase
    .from('profiles')
    .select('ai_credits_remaining, target_countries')
    .eq('id', user.id)
    .single();

  return (
    <JobsClient
      initialCredits={profile?.ai_credits_remaining ?? 0}
      initialTargetCountries={(profile?.target_countries as string[] | null) ?? []}
    />
  );
}
