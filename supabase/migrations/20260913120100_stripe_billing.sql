-- Stripe billing and AI credit accounting — schema only.
--
-- Step 1 of Docs/stripe-jobvero-brief.md: §3.1, §3.2, §3.3, §4 (admin_settings),
-- §10.3 and §10.5. No functions, no routes. reserve/settle/refund (§10.6) and
-- the entitlements module come in a later migration.


-- ─── profiles: Stripe columns (§3.1) ─────────────────────────────────────────
--
-- subscription_status carries no CHECK constraint on purpose. Stripe emits more
-- statuses than the four the app cares about (trialing, unpaid,
-- incomplete_expired, paused), and a constraint would make the webhook's write
-- fail on the first one it did not anticipate — which the webhook must answer
-- with 200, so the row would silently stay stale.
--
-- No separate index on stripe_customer_id: the UNIQUE constraint already builds
-- one, and a second would only cost writes.

alter table public.profiles
  add column if not exists stripe_customer_id     text unique,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status    text,
  add column if not exists current_period_end     timestamptz,
  add column if not exists cancel_at_period_end   boolean not null default false;

-- The existing CHECK predates the Starter tier and would reject the webhook's
-- write of subscription_plan = 'starter'. trial and free stay allowed: existing
-- rows hold 'trial', and the current code still reads both.
alter table public.profiles
  drop constraint if exists profiles_subscription_plan_check;

alter table public.profiles
  add constraint profiles_subscription_plan_check
  check (subscription_plan in ('trial', 'free', 'starter', 'pro', 'premium'));


-- ─── profiles: write lockdown on the Stripe columns (§3.2) ───────────────────
--
-- Without this a signed-in user could PATCH their own row to
-- subscription_status = 'active' — the same hole the column-level lockdown of
-- 10 September closed for subscription_plan and ai_credits_remaining.
--
-- A column-level REVOKE is a no-op against a table-level grant: if
-- authenticated still holds UPDATE on the whole of profiles, the statement
-- below succeeds and changes nothing. That lockdown was applied directly to the
-- database (migration harden_profiles_write_access, not in this repo), so the
-- assertion that follows checks the outcome instead of trusting it.
--
-- It checks INSERT as well as UPDATE. RLS decides which rows a user may write,
-- never which columns: profiles_insert_own only requires id = auth.uid(), and
-- the profile row is created by client-side upserts, not by a trigger on
-- auth.users. An INSERT grant on these columns lets a user create — or delete
-- and re-create — their own row with subscription_plan = 'premium'.
--
-- The column list is the five Stripe columns plus the six that
-- harden_profiles_write_access names as read-only for clients.

revoke update (
  stripe_customer_id, stripe_subscription_id, subscription_status,
  current_period_end, cancel_at_period_end
) on public.profiles from authenticated, anon;

do $$
declare
  v_role text;
  v_col  text;
  v_priv text;
begin
  foreach v_role in array array['anon', 'authenticated']
  loop
    foreach v_col in array array[
      'stripe_customer_id', 'stripe_subscription_id', 'subscription_status',
      'current_period_end', 'cancel_at_period_end',
      'subscription_plan', 'trial_ends_at', 'subscription_started_at',
      'ai_credits_remaining', 'ai_credits_reset_at', 'is_blocked'
    ]
    loop
      foreach v_priv in array array['INSERT', 'UPDATE']
      loop
        if has_column_privilege(v_role, 'public.profiles', v_col, v_priv) then
          raise exception
            'profiles.% is still writable by % via % — a table-level grant is likely overriding the column-level lockdown',
            v_col, v_role, v_priv;
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;


-- ─── stripe_events: webhook idempotency (§3.3) ───────────────────────────────
--
-- Stripe redelivers events. The webhook inserts event.id first and stops on a
-- unique violation, so a replayed invoice.paid cannot credit twice.
--
-- Service role only, with the never-matching policy used by api_tokens,
-- admin_settings and api_rate_limits.

create table if not exists public.stripe_events (
  id          text        primary key,
  type        text        not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;

drop policy if exists "service role only" on public.stripe_events;
create policy "service role only" on public.stripe_events
  using (false) with check (false);


-- ─── ai_action_costs: price of each AI action, in credits (§10.3) ────────────
--
-- One credit is one application, roughly $0.13 of real AI cost. The model and
-- the token/input ceilings live here so they can change without a redeploy.
-- Readable by signed-in users so the UI can show the cost; writable by the
-- service role only.

create table if not exists public.ai_action_costs (
  action          text        primary key,
  credits         integer     not null check (credits > 0),
  model           text        not null,
  max_tokens      integer     not null check (max_tokens > 0),
  max_input_chars integer     not null check (max_input_chars > 0),
  enabled         boolean     not null default true,
  updated_at      timestamptz not null default now()
);

alter table public.ai_action_costs enable row level security;

drop policy if exists ai_action_costs_read on public.ai_action_costs;
create policy ai_action_costs_read on public.ai_action_costs
  for select to authenticated using (true);

-- Models match what the routes call today. ats_score uses
-- google/gemini-3-flash-preview (src/app/api/ats-score/route.ts), not the
-- gemini-flash-1.5 the brief listed.
insert into public.ai_action_costs (action, credits, model, max_tokens, max_input_chars) values
  ('application',       1, 'anthropic/claude-sonnet-4.6',   4000, 20000),
  ('cover_letter',      1, 'deepseek/deepseek-v3.2',        2000, 15000),
  ('cv_generation',     1, 'anthropic/claude-sonnet-4.6',   4000, 20000),
  ('ats_score',         1, 'google/gemini-3-flash-preview', 1500, 20000),
  ('interview_session', 7, 'anthropic/claude-sonnet-4.6',   8000, 30000),
  ('chat',              1, 'deepseek/deepseek-v3.2',        2000, 10000)
on conflict (action) do nothing;


-- ─── ai_usage: credit ledger and audit trail (§10.5) ─────────────────────────
--
-- One row per charged AI call: reserved before the upstream request, then
-- settled with the real cost or refunded. unique (user_id, idempotency_key) is
-- what stops a retried request on a flaky connection from charging twice.
--
-- Users read their own history and nothing else. No write policy: rows are
-- written by the SECURITY DEFINER functions of the next migration.

create table if not exists public.ai_usage (
  id                uuid          primary key default gen_random_uuid(),
  user_id           uuid          not null references auth.users(id) on delete cascade,
  idempotency_key   text          not null,
  action            text          not null,
  credits_charged   integer       not null,
  status            text          not null default 'reserved'
                                  check (status in ('reserved', 'settled', 'refunded')),
  model             text,
  prompt_tokens     integer,
  completion_tokens integer,
  cost_usd          numeric(12,6),
  error             text,
  created_at        timestamptz   not null default now(),
  settled_at        timestamptz,
  unique (user_id, idempotency_key)
);

create index if not exists ai_usage_user_created_idx
  on public.ai_usage (user_id, created_at desc);

-- Partial: only reservations that were never settled or refunded, which is
-- what a cleanup job has to find.
create index if not exists ai_usage_status_idx
  on public.ai_usage (status) where status = 'reserved';

alter table public.ai_usage enable row level security;

drop policy if exists ai_usage_read_own on public.ai_usage;
create policy ai_usage_read_own on public.ai_usage
  for select to authenticated using (user_id = auth.uid());


-- ─── admin_settings: per-tier limits for the new grid (§4, §10.4, §10.12) ────
--
-- Merged into the existing 'global' row rather than overwriting it: the admin
-- dashboard edits this row, and live values must survive. The merge is
-- `new || existing`, so a key that already exists keeps its current value and
-- re-running the migration changes nothing.
--
-- null = not decided yet. The brief gives credit quotas for starter, pro and
-- premium, but no auto-apply or interview limits for starter, trial and free,
-- and no credit quota for free.
--
-- trial_credits is not set here: harden_profiles_insert_access runs first,
-- sets it to 10, and its trigger reads it on every insert into profiles.

do $$
begin
  update public.admin_settings
     set value = jsonb_set(
           value,
           '{limits}',
           jsonb_build_object(
             'starter_credits_monthly',    29,
             'pro_credits_monthly',        57,
             'premium_credits_monthly',    111,
             'free_credits_monthly',       null,
             'starter_auto_apply_monthly', null,
             'starter_interviews_monthly', null,
             'trial_auto_apply_monthly',   null,
             'trial_interviews_monthly',   null,
             'free_auto_apply_monthly',    null,
             'free_interviews_monthly',    null
           ) || coalesce(value -> 'limits', '{}'::jsonb)
         ),
         updated_at = now()
   where key = 'global';

  if not found then
    raise exception 'admin_settings has no ''global'' row — expected the seed from 20260514_admin_settings.sql';
  end if;
end;
$$;
