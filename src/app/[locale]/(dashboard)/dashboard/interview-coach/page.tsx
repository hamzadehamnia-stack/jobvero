import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import InterviewCoachClient from '@/components/interview-coach/InterviewCoachClient';

const SESSION_LIMITS: Record<string, number> = {
  trial:   2,
  free:    2,
  pro:     8,
  premium: 15,
};

export default async function InterviewCoachPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');

  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_plan, trial_ends_at')
    .eq('id', user.id)
    .single();

  // Count sessions used this calendar month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: sessionsUsed } = await supabase
    .from('interview_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', startOfMonth.toISOString());

  // Determine effective plan
  const plan = profile?.subscription_plan ?? 'trial';
  const trialActive =
    plan === 'trial' &&
    !!profile?.trial_ends_at &&
    new Date(profile.trial_ends_at) > new Date();
  const effectivePlan = trialActive ? 'trial' : plan === 'trial' ? 'free' : plan;
  const sessionLimit = SESSION_LIMITS[effectivePlan] ?? 2;

  return (
    <InterviewCoachClient
      userId={user.id}
      sessionsUsed={sessionsUsed ?? 0}
      sessionLimit={sessionLimit}
      plan={effectivePlan}
    />
  );
}
