-- Add cv_tailored flag to auto_apply_logs
ALTER TABLE auto_apply_logs
  ADD COLUMN IF NOT EXISTS cv_tailored boolean NOT NULL DEFAULT false;
