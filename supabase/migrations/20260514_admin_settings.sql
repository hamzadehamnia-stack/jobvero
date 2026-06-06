-- Admin settings table (feature flags, tier limits)
-- Only admin service role can read/write this table

create table if not exists public.admin_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Disable RLS — only accessible via service role key
alter table public.admin_settings disable row level security;

-- Seed default settings row
insert into public.admin_settings (key, value)
values (
  'global',
  '{
    "features": {
      "cv_builder":      true,
      "cover_letter":    true,
      "auto_apply":      true,
      "interview_coach": true,
      "ai_matches":      true,
      "ats_score":       true
    },
    "limits": {
      "pro_auto_apply_monthly":     50,
      "pro_interviews_monthly":     10,
      "premium_auto_apply_monthly": 200,
      "premium_interviews_monthly": 50
    }
  }'::jsonb
) on conflict (key) do nothing;
