-- ─── message_threads ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message_threads (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id               text,
  job_title            text        NOT NULL DEFAULT '',
  company_name         text        NOT NULL DEFAULT '',
  employer_email       text        NOT NULL DEFAULT '',
  subject              text        NOT NULL DEFAULT '',
  last_message_preview text,
  unread_count         int         NOT NULL DEFAULT 0,
  last_message_at      timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_threads_user_id_idx
  ON message_threads (user_id, last_message_at DESC);

ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mt_select" ON message_threads FOR SELECT  USING (auth.uid() = user_id);
CREATE POLICY "mt_insert" ON message_threads FOR INSERT  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "mt_update" ON message_threads FOR UPDATE  USING (auth.uid() = user_id);
CREATE POLICY "mt_delete" ON message_threads FOR DELETE  USING (auth.uid() = user_id);

-- ─── messages ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid        NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  direction   text        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_email  text        NOT NULL DEFAULT '',
  to_email    text,
  subject     text,
  body        text        NOT NULL DEFAULT '',
  read        boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_thread_id_idx
  ON messages (thread_id, created_at ASC);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "msg_select" ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM message_threads WHERE message_threads.id = messages.thread_id AND message_threads.user_id = auth.uid())
);
CREATE POLICY "msg_insert" ON messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM message_threads WHERE message_threads.id = messages.thread_id AND message_threads.user_id = auth.uid())
);
CREATE POLICY "msg_update" ON messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM message_threads WHERE message_threads.id = messages.thread_id AND message_threads.user_id = auth.uid())
);

-- Enable realtime for both tables
ALTER PUBLICATION supabase_realtime ADD TABLE message_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
