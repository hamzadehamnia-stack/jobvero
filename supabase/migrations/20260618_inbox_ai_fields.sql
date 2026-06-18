-- ─── Inbox AI enrichment fields on message_threads ───────────────────────────
-- Added for per-thread AI analysis: category, summary, label, draft reply, chips, etc.

ALTER TABLE public.message_threads
  ADD COLUMN IF NOT EXISTS ai_category        text        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_summary         text        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_label           text        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_confidence      integer     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_draft           text        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_chips           jsonb       DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_detected_event  jsonb       DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source             text        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_date        timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS auto_status_updated boolean    DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_processed_at    timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS follow_up_config   jsonb       DEFAULT NULL;

-- ─── Catch-up: attachments column on messages ────────────────────────────────
-- This column exists in the live DB (used by compose/reply routes) but had no
-- migration file. Adding here so schema reconstruction from migrations is complete.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT NULL;
