import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionCharge } from './sessionStream';

// The user's interview, and the session that pays for it. Always looked up
// with the user's id: someone else's interview is simply not found. An
// interview row without a session — one the old client created — is not found
// either.

export interface InterviewSession {
  id:             string;
  jobDescription: string | null;
  interviewType:  string;
  difficulty:     string;
  language:       string;
  charge:         SessionCharge;
  turnsCompleted: number;
}

export async function loadInterviewSession(
  admin:       SupabaseClient,
  userId:      string,
  interviewId: string,
): Promise<InterviewSession | null> {
  const { data: interview, error: interviewError } = await admin
    .from('interview_sessions')
    .select('id, job_description, interview_type, difficulty, language, ai_session_id')
    .eq('id', interviewId)
    .eq('user_id', userId)
    .maybeSingle();
  if (interviewError) throw new Error(`interview read failed: ${interviewError.message}`);
  if (!interview?.ai_session_id) return null;

  const { data: session, error: sessionError } = await admin
    .from('ai_sessions')
    .select('id, usage_id, turns_completed')
    .eq('id', interview.ai_session_id)
    .eq('user_id', userId)
    .eq('action', 'interview_session')
    .maybeSingle();
  if (sessionError) throw new Error(`interview session read failed: ${sessionError.message}`);
  if (!session) return null;

  const { data: usage, error: usageError } = await admin
    .from('ai_usage')
    .select('status')
    .eq('id', session.usage_id)
    .maybeSingle();
  if (usageError) throw new Error(`interview charge read failed: ${usageError.message}`);

  return {
    id:             interview.id,
    jobDescription: interview.job_description,
    interviewType:  interview.interview_type,
    difficulty:     interview.difficulty,
    language:       interview.language,
    charge:         { usageId: session.usage_id, sessionId: session.id, reserved: usage?.status === 'reserved' },
    turnsCompleted: session.turns_completed,
  };
}
