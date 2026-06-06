-- Single source of truth for all job applications

CREATE TABLE IF NOT EXISTS applications (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Job details (from search engine or manual entry)
  job_id           text,
  job_title        text        NOT NULL DEFAULT '',
  company_name     text        NOT NULL DEFAULT '',
  company_email    text,
  location         text,
  salary           text,
  contract_type    text,
  job_description  text,
  job_source       text,
  job_url          text,

  -- Application metadata
  application_type text        NOT NULL DEFAULT 'manual',  -- 'manual' | 'auto'
  cover_letter     text,
  status           text        NOT NULL DEFAULT 'saved'
                               CHECK (status IN ('saved','applied','interview','offer','rejected')),
  notes            text,

  -- Email / thread linkage
  thread_id        uuid        REFERENCES message_threads(id) ON DELETE SET NULL,
  send_method      text,       -- 'jobvero_email' | 'pending'
  send_status      text        NOT NULL DEFAULT 'pending', -- 'sent' | 'pending' | 'no_email' | 'failed'
  sent_at          timestamptz,

  -- Date tracking
  interview_date   date,
  follow_up_date   date,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS applications_user_status_idx ON applications (user_id, status);
CREATE INDEX IF NOT EXISTS applications_user_created_idx ON applications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS applications_thread_id_idx    ON applications (thread_id);

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apps_select" ON applications FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "apps_insert" ON applications FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "apps_update" ON applications FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "apps_delete" ON applications FOR DELETE  USING (auth.uid() = user_id);

-- updated_at trigger (function may already exist from previous migrations)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enable realtime for sidebar badge
ALTER PUBLICATION supabase_realtime ADD TABLE applications;
