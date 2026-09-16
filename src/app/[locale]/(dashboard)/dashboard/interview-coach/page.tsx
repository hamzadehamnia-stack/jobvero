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
    .select('credits, limits')
    .eq('action', 'interview_session')
    .maybeSingle();

  // The languages the recruiter can speak are the voices pinned in the
  // catalogue. Any other language runs the interview in text, and the page says
  // so before it starts — an English voice for a Spanish interview would be
  // worse than no voice at all.
  const limits         = (action?.limits ?? null) as { tts_voices?: Record<string, unknown> | null } | null;
  const voiceLanguages = Object.keys(limits?.tts_voices ?? {});

  return (
    <InterviewCoachClient
      creditsPerInterview={action?.credits ?? null}
      voiceLanguages={voiceLanguages}
    />
  );
}
