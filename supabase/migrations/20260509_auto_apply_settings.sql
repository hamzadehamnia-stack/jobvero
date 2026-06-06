-- Extended auto-apply settings (new table alongside legacy auto_apply_config)

CREATE TABLE IF NOT EXISTS auto_apply_settings (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active         boolean     NOT NULL DEFAULT false,
  keywords          text[]      NOT NULL DEFAULT '{}',
  excluded_keywords text[]      NOT NULL DEFAULT '{}',
  target_countries  text[]      NOT NULL DEFAULT '{fr}',
  locations         text[]      NOT NULL DEFAULT '{}',
  contract_types    text[]      NOT NULL DEFAULT '{}',
  min_salary        integer     NOT NULL DEFAULT 0,
  remote_only       boolean     NOT NULL DEFAULT false,
  experience_level  text        NOT NULL DEFAULT 'any',
  daily_limit       integer     NOT NULL DEFAULT 5,
  monthly_limit     integer     NOT NULL DEFAULT 50,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS auto_apply_settings_user_idx ON auto_apply_settings (user_id);

ALTER TABLE auto_apply_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_all" ON auto_apply_settings
  FOR ALL USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER auto_apply_settings_updated_at
  BEFORE UPDATE ON auto_apply_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
