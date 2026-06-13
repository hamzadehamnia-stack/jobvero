-- Add job_id column to auto_apply_logs for exact deduplication by Adzuna job ID
ALTER TABLE public.auto_apply_logs
  ADD COLUMN IF NOT EXISTS job_id text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS auto_apply_logs_job_id_idx
  ON public.auto_apply_logs (user_id, job_id)
  WHERE job_id IS NOT NULL;
