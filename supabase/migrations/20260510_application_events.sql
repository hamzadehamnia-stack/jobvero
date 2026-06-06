CREATE TABLE IF NOT EXISTS application_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid        NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type      text        NOT NULL,
  description     text        NOT NULL,
  event_data      jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ae_application_idx ON application_events (application_id, created_at);
CREATE INDEX IF NOT EXISTS ae_user_idx        ON application_events (user_id);

ALTER TABLE application_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_all" ON application_events
  FOR ALL USING (auth.uid() = user_id);
