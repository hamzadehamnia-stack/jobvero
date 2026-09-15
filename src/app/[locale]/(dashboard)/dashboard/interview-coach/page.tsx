import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import InterviewCoachClient from '@/components/interview-coach/InterviewCoachClient';

// Interviews are bounded by credits alone (decision of 2026-09-15): no monthly
// session cap. What an interview costs is the catalogue's number, the one the
// server charges, shown before it starts.
export default async function InterviewCoachPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { data: action } = await supabase
    .from('ai_action_costs')
    .select('credits')
    .eq('action', 'interview_session')
    .maybeSingle();

  return <InterviewCoachClient creditsPerInterview={action?.credits ?? null} />;
}
