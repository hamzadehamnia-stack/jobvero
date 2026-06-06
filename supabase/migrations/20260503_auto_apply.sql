-- Auto Apply configuration per user
CREATE TABLE IF NOT EXISTS public.auto_apply_config (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active        boolean NOT NULL DEFAULT false,
  keywords         text[]  NOT NULL DEFAULT '{}',
  target_countries text[]  NOT NULL DEFAULT '{}',
  min_salary       integer NOT NULL DEFAULT 0,
  contract_type    text    NOT NULL DEFAULT 'all',
  max_per_day      integer NOT NULL DEFAULT 3,
  created_at       timestamptz DEFAULT now() NOT NULL,
  updated_at       timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id)
);

-- Log of every auto-apply attempt
CREATE TABLE IF NOT EXISTS public.auto_apply_logs (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_title    text NOT NULL,
  company      text NOT NULL DEFAULT '',
  location     text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'applied',  -- applied | failed | skipped
  cover_letter text,
  applied_at   timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS auto_apply_config_user_id_idx ON public.auto_apply_config (user_id);
CREATE INDEX IF NOT EXISTS auto_apply_logs_user_id_idx   ON public.auto_apply_logs (user_id);
CREATE INDEX IF NOT EXISTS auto_apply_logs_applied_at_idx ON public.auto_apply_logs (applied_at DESC);

ALTER TABLE public.auto_apply_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_apply_logs   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own config" ON public.auto_apply_config
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own logs" ON public.auto_apply_logs
  FOR ALL USING (auth.uid() = user_id);
