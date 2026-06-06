CREATE TABLE IF NOT EXISTS public.ai_job_matches_cache (
  id        uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id   uuid          REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  results   jsonb         DEFAULT '[]',
  cached_at timestamptz   DEFAULT now()
);

ALTER TABLE public.ai_job_matches_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_job_matches: users manage own"
  ON public.ai_job_matches_cache
  FOR ALL
  USING (auth.uid() = user_id);
