CREATE TABLE IF NOT EXISTS public.api_tokens (
  id         text        PRIMARY KEY,
  token      text        NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Only the service role can read/write tokens
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON public.api_tokens
  USING (false);
