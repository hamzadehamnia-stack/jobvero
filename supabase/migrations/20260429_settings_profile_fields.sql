-- Add extended profile fields for the Settings page

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS job_title            text,
  ADD COLUMN IF NOT EXISTS linkedin_url         text,
  ADD COLUMN IF NOT EXISTS portfolio_url        text,
  ADD COLUMN IF NOT EXISTS target_countries     text[],
  ADD COLUMN IF NOT EXISTS max_salary           text,
  ADD COLUMN IF NOT EXISTS work_types           text[],
  ADD COLUMN IF NOT EXISTS notify_weekly_report boolean DEFAULT true;
