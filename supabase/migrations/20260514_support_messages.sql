-- Support tickets submitted via the dashboard support form

CREATE TABLE IF NOT EXISTS support_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email  text        NOT NULL DEFAULT '',
  user_name   text        NOT NULL DEFAULT '',
  subject     text        NOT NULL DEFAULT '',
  message     text        NOT NULL DEFAULT '',
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'replied')),
  reply_text  text,
  replied_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_user_id_idx    ON support_messages (user_id);
CREATE INDEX IF NOT EXISTS support_messages_status_idx     ON support_messages (status);
CREATE INDEX IF NOT EXISTS support_messages_created_at_idx ON support_messages (created_at DESC);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Users can only read their own tickets
CREATE POLICY "sm_select" ON support_messages FOR SELECT USING (auth.uid() = user_id);
-- Users can insert their own tickets
CREATE POLICY "sm_insert" ON support_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Admin (service role) bypasses RLS for updates/reads
