-- Add missing columns to applications (job tracker)
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS notes    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS job_url  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS salary   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';

-- Index for priority filtering
CREATE INDEX IF NOT EXISTS applications_priority_idx
  ON public.applications (user_id, priority);
