import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ATSScoreClient from '@/components/ats-score/ATSScoreClient';

interface Props {
  params: { locale: string };
}

export default async function ATSScorePage({ params: { locale } }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('ai_credits_remaining')
    .eq('id', user.id)
    .single();

  return (
    <ATSScoreClient initialCredits={profile?.ai_credits_remaining ?? 0} />
  );
}
