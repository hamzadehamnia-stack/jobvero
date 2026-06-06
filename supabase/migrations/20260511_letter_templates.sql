CREATE TABLE IF NOT EXISTS letter_templates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  category     text        NOT NULL DEFAULT 'Autre',
  content      text        NOT NULL DEFAULT '',
  use_count    int         NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lt_user_idx ON letter_templates (user_id);

ALTER TABLE letter_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_all" ON letter_templates FOR ALL USING (auth.uid() = user_id);
