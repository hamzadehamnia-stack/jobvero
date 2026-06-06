-- Email finder cascade tables + applications columns for auto-apply email tracking

-- 1. Extend applications table with email finder + Resend tracking fields
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS recruiter_email   text,
  ADD COLUMN IF NOT EXISTS email_source      text,   -- api_n0 | scrape_n1 | pattern_n2 | sonar_n3 | cache
  ADD COLUMN IF NOT EXISTS email_confidence  text,   -- high | medium | low
  ADD COLUMN IF NOT EXISTS resend_email_id   text,
  ADD COLUMN IF NOT EXISTS delivered_at      timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at        timestamptz,
  ADD COLUMN IF NOT EXISTS bounce_reason     text,
  ADD COLUMN IF NOT EXISTS opened_at         timestamptz;

-- Update status check to include email tracking statuses
ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_status_check;

ALTER TABLE applications
  ADD CONSTRAINT applications_status_check
  CHECK (status IN (
    'saved', 'applied', 'interview', 'offer', 'rejected',
    'delivered', 'bounced', 'complained',
    'no_email_found', 'send_failed'
  ));

CREATE INDEX IF NOT EXISTS applications_resend_email_id_idx ON applications (resend_email_id)
  WHERE resend_email_id IS NOT NULL;

-- 2. Recruiter contacts cache (shared across users, keyed by company_domain)
CREATE TABLE IF NOT EXISTS recruiter_contacts_cache (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_domain  text        NOT NULL UNIQUE,
  company_name    text,
  email           text        NOT NULL,
  source          text        NOT NULL,   -- api_n0 | scrape_n1 | pattern_n2 | sonar_n3
  confidence      text        NOT NULL DEFAULT 'medium',  -- high | medium | low
  evidence_url    text,
  hit_count       integer     NOT NULL DEFAULT 1,
  last_used_at    timestamptz,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recruiter_cache_domain_idx    ON recruiter_contacts_cache (company_domain);
CREATE INDEX IF NOT EXISTS recruiter_cache_expires_idx   ON recruiter_contacts_cache (expires_at);
CREATE INDEX IF NOT EXISTS recruiter_cache_confidence_idx ON recruiter_contacts_cache (confidence);

ALTER TABLE recruiter_contacts_cache ENABLE ROW LEVEL SECURITY;

-- Service role only — no user-facing access needed
CREATE POLICY "service_role_only_cache" ON recruiter_contacts_cache
  FOR ALL USING (false);

-- 3. Email lookup audit log (one row per findRecruiterEmail call)
CREATE TABLE IF NOT EXISTS email_lookup_logs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id              text,
  company_domain      text        NOT NULL,
  level_succeeded     integer,    -- 0=N0,1=N1,2=N2,3=N3, null=not found, -1=cache
  email_found         text,
  cache_hit           boolean     NOT NULL DEFAULT false,
  latency_ms          integer,
  cost_estimate_usd   numeric(10,6) NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_lookup_logs_user_idx    ON email_lookup_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS email_lookup_logs_domain_idx  ON email_lookup_logs (company_domain);

ALTER TABLE email_lookup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_lookup_logs" ON email_lookup_logs
  FOR SELECT USING (auth.uid() = user_id);

-- 4. Resend webhook events log
CREATE TABLE IF NOT EXISTS resend_webhook_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type       text        NOT NULL,
  resend_email_id  text        NOT NULL,
  application_id   uuid        REFERENCES applications(id) ON DELETE SET NULL,
  payload          jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resend_events_email_id_idx ON resend_webhook_events (resend_email_id);
CREATE INDEX IF NOT EXISTS resend_events_app_id_idx   ON resend_webhook_events (application_id)
  WHERE application_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS resend_events_type_idx     ON resend_webhook_events (event_type);

ALTER TABLE resend_webhook_events ENABLE ROW LEVEL SECURITY;

-- Webhook events are written by service role; users can read their own via application_id join
CREATE POLICY "service_role_insert_webhook_events" ON resend_webhook_events
  FOR ALL USING (false);
