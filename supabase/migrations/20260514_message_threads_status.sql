-- Add status-based folder system to message_threads

ALTER TABLE public.message_threads
  ADD COLUMN IF NOT EXISTS status          text    NOT NULL DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS original_folder text    NOT NULL DEFAULT 'inbox';

-- Backfill status from existing boolean columns
UPDATE public.message_threads SET status = 'trash'    WHERE deleted  = true;
UPDATE public.message_threads SET status = 'archived' WHERE archived = true AND deleted = false;
UPDATE public.message_threads SET status = 'sent'
  WHERE last_message_direction = 'outbound'
    AND archived = false AND deleted = false;

CREATE INDEX IF NOT EXISTS message_threads_status_idx
  ON public.message_threads (user_id, status, last_message_at DESC);
