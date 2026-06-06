CREATE TABLE IF NOT EXISTS public.interview_sessions (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_description  text,
  interview_type   text NOT NULL,
  difficulty       text NOT NULL,
  language         text NOT NULL DEFAULT 'en',
  score            integer,
  feedback_json    jsonb,
  created_at       timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS interview_sessions_user_id_idx   ON public.interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS interview_sessions_created_at_idx ON public.interview_sessions(created_at);

ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions"   ON public.interview_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON public.interview_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.interview_sessions FOR UPDATE USING (auth.uid() = user_id);
