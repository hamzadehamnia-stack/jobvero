-- ATS score stored per application log
ALTER TABLE public.auto_apply_logs
  ADD COLUMN IF NOT EXISTS ats_score integer DEFAULT NULL;

-- ATS score mirrored on applications table for UI display
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS ats_score integer DEFAULT NULL;

-- Per-user ATS minimum threshold stored in auto_apply_settings
ALTER TABLE public.auto_apply_settings
  ADD COLUMN IF NOT EXISTS ats_threshold integer NOT NULL DEFAULT 60;
