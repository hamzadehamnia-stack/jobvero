-- Admin settings table (feature flags, tier limits)
-- Only admin service role can read/write this table

create table if not exists public.admin_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Restrict to the service role.
--
-- This previously read `disable row level security`, with a comment claiming
-- that made the table service-role-only. It does the opposite: PostgREST
-- exposes every table in the `public` schema, and Supabase grants anon and
-- authenticated access to them, so RLS *disabled* means the table is readable
-- AND writable by anyone holding the public anon key — which ships in the
-- browser bundle. This table holds the feature flags and the per-tier limits,
-- so that is a direct paywall and feature-gate bypass.
--
-- RLS enabled with a policy that never matches is the pattern that actually
-- achieves the stated intent: normal clients get nothing, while the service
-- role bypasses RLS by design. It is the same shape already used by
-- api_tokens and recruiter_contacts_cache in this repo.
alter table public.admin_settings enable row level security;

drop policy if exists "service role only" on public.admin_settings;
create policy "service role only" on public.admin_settings
  using (false) with check (false);

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
