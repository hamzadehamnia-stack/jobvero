-- AI credits, step 2a: catalogue v2, sessions, per-call ledger, privileges.
--
-- Schema only. reserve / settle / refund and the session counters come in the
-- next migration (step 2b). Nothing in the application reads the new tables
-- yet, so applying this changes no live behaviour — except section 8, which
-- narrows what the live interview client may write to exactly what it writes.


-- ─── 1. ai_action_costs: free system actions, per-action limits ──────────────
--
-- credits >= 0, because system_ actions (inbox classification, email finder,
-- auto-apply screening) are logged against the real user_id with nothing
-- charged. The second CHECK ties the two together: an action is free if and
-- only if it is a system_ action. A user-facing action priced at 0 would be
-- unlimited AI — exactly what "premium = unlimited" was, and it is refused at
-- the schema level rather than trusted to review.
--
-- limits holds the per-action ceilings the SQL functions enforce (session
-- counters, cost cap, input sizes), so they can be tuned without a redeploy
-- and are read from the same row as the price.

alter table public.ai_action_costs
  drop constraint if exists ai_action_costs_credits_check;

alter table public.ai_action_costs
  add constraint ai_action_costs_credits_check check (credits >= 0);

alter table public.ai_action_costs
  add column if not exists limits jsonb not null default '{}'::jsonb;

alter table public.ai_action_costs
  drop constraint if exists ai_action_costs_free_iff_system;

alter table public.ai_action_costs
  add constraint ai_action_costs_free_iff_system
  check ((action like 'system\_%') = (credits = 0));


-- ─── 2. Catalogue v2 ─────────────────────────────────────────────────────────
--
-- One row per real cost profile, not per route (decision D3). Worst cases use
-- the most expensive regional OpenRouter price and 3.5 characters per token;
-- one credit is a budget of $0.13 of real cost.
--
--   cv_generation      generate-cv                                   ~$0.16  2
--   cv_transform       modify-cv-data, translate-cv, describe-cv,
--                      modify-document                               ~$0.11  1
--   cv_import          parse-cv (text, or PDF capped at 5 pages)     ~$0.05  1
--   application        jobs/apply, letter-templates/[id]/adapt       ~$0.03  1
--   interview_session  interview-coach + speech-to-text + TTS,
--                      bounded by limits below                        ~$0.77+ 7
--   chat               one conversation, up to 20 messages            ~$0.14  1
--   quick_write        generate-cover-letter, rewrite-bullet         ~$0.005 1
--   match_score        ats-score, cv-match-score                     ~$0.011 1
--   auto_apply         one automatic application: adapted CV + email ~$0.07  1
--
-- auto_apply is a ninth row, not one of the eight: its model (Sonnet 4.5) and
-- output ceiling (4000) differ from `application`. The monthly figure in its
-- limits is a guard rail; the credit quota is the real limit.
--
-- System rows are free and logged. Their `model` is the primary model of the
-- flow; secondary calls (Perplexity Sonar in the email finder, DeepSeek for the
-- job description) keep their model pinned in code and are logged per call.
--
-- interview_session: whisper-1 is $0.006 per minute (OpenAI's pricing page),
-- and OpenRouter returns the real cost in the transcription response.
-- tts_estimated_cost_usd is a deliberately high placeholder, not a price —
-- gpt-4o-mini-tts pricing could not be verified. Real costs are logged per call
-- and the figure is revised after a week (brief §10.10). max_cost_usd stops the
-- session whatever the counters say.
--
-- system_inbox_classify: per_user_per_day caps classifications per alias. The
-- global daily cap is in admin_settings (section 3). Past either cap the email
-- is stored without AI classification; mail to an alias that does not exist is
-- rejected before any AI call (step 2e).
--
-- Model ids are copied from the code as they are and are NOT yet verified:
-- claude-sonnet-4-6 and claude-sonnet-4.6 cannot both be valid. Step 2e checks
-- every id against GET https://openrouter.ai/api/v1/models and adds a test.

-- Retired from the step-1 seed: cover_letter is absorbed by quick_write, and
-- ats_score is renamed match_score (it now also covers cv-match-score).
-- ai_usage has no rows yet, so nothing references them.
delete from public.ai_action_costs where action in ('cover_letter', 'ats_score');

insert into public.ai_action_costs (action, credits, model, max_tokens, max_input_chars, limits) values
  ('cv_generation',     2, 'anthropic/claude-sonnet-4.6',   8000, 30000, '{}'),
  ('cv_transform',      1, 'anthropic/claude-sonnet-4.6',   5000, 30000, '{}'),
  ('cv_import',         1, 'anthropic/claude-sonnet-4.6',   2048, 12000, '{"max_pdf_pages": 5}'),
  ('application',       1, 'anthropic/claude-sonnet-4.6',   1024, 12000, '{}'),
  ('interview_session', 7, 'anthropic/claude-sonnet-4.6',   1024, 30000, '{
     "model_calls": 11, "stt_calls": 12, "tts_calls": 12,
     "minutes": 60, "max_cost_usd": 1.20,
     "max_cv_chars": 6000, "max_job_description_chars": 4000,
     "max_answer_chars": 2000, "max_audio_seconds": 120, "max_tts_chars": 1500,
     "tts_estimated_cost_usd": 0.05
   }'),
  ('chat',              1, 'deepseek/deepseek-v3.2',        2048, 24000, '{"model_calls": 20}'),
  ('quick_write',       1, 'deepseek/deepseek-v3.2',        2048, 15000, '{}'),
  ('match_score',       1, 'google/gemini-3-flash-preview', 1024, 20000, '{}'),
  ('auto_apply',        1, 'anthropic/claude-sonnet-4-5',   4000,  5500, '{"monthly_applications_guard": 150}'),
  ('system_auto_apply_screening', 0, 'google/gemini-3-flash-preview',   64,  8000, '{}'),
  ('system_inbox_classify',       0, 'anthropic/claude-sonnet-4-6',   1200,  8000, '{"per_user_per_day": 25}'),
  ('system_email_finder',         0, 'deepseek/deepseek-chat',         300, 12000, '{}')
on conflict (action) do update set
  credits         = excluded.credits,
  model           = excluded.model,
  max_tokens      = excluded.max_tokens,
  max_input_chars = excluded.max_input_chars,
  limits          = excluded.limits,
  updated_at      = now();


-- ─── 3. admin_settings: global inbox classification cap ──────────────────────
--
-- 200 a day across every alias: at ~$0.03 a classification, a ceiling of about
-- $180 a month. It lives in admin_settings so it can be raised from the
-- database, without a redeploy, once there are customers to justify it.
-- Set explicitly — a product decision, not a default to merge around.

do $$
begin
  update public.admin_settings
     set value      = jsonb_set(value, '{limits,inbox_classify_global_per_day}', to_jsonb(200), true),
         updated_at = now()
   where key = 'global';

  if not found then
    raise exception 'admin_settings has no ''global'' row — expected the seed from 20260514_admin_settings.sql';
  end if;
end;
$$;


-- ─── 4. ai_usage: integrity ──────────────────────────────────────────────────
--
-- action now references the catalogue, so a typo in a route cannot open a
-- ledger row for an action that has no price. ON DELETE RESTRICT: a catalogue
-- row with history cannot be dropped out from under it.
--
-- cost_estimated is true when any part of the row's cost is a placeholder
-- (text-to-speech today), so the weekly margin review can tell measured cost
-- from guessed cost.

alter table public.ai_usage
  drop constraint if exists ai_usage_credits_charged_check;

alter table public.ai_usage
  add constraint ai_usage_credits_charged_check check (credits_charged >= 0);

alter table public.ai_usage
  drop constraint if exists ai_usage_action_fkey;

alter table public.ai_usage
  add constraint ai_usage_action_fkey
  foreign key (action) references public.ai_action_costs(action) on delete restrict;

alter table public.ai_usage
  add column if not exists cost_estimated boolean not null default false;


-- ─── 5. ai_usage_calls: one row per upstream call ────────────────────────────
--
-- A session is one ai_usage row (one charge) but up to 35 upstream calls. The
-- per-call rows are what lets the TTS placeholder be replaced by a measured
-- figure, and what shows which part of a session actually costs money.
-- Service role only: no policy, no client privilege.

create table if not exists public.ai_usage_calls (
  id                bigint        generated always as identity primary key,
  usage_id          uuid          not null references public.ai_usage(id) on delete cascade,
  kind              text          not null check (kind in ('model', 'stt', 'tts')),
  model             text          not null,
  prompt_tokens     integer,
  completion_tokens integer,
  cost_usd          numeric(12,6),
  cost_estimated    boolean       not null default false,
  error             text,
  created_at        timestamptz   not null default now()
);

create index if not exists ai_usage_calls_usage_idx
  on public.ai_usage_calls (usage_id);

alter table public.ai_usage_calls enable row level security;


-- ─── 6. ai_sessions: server-side counters for interview and chat ─────────────
--
-- Not columns on interview_sessions: that table is written by the live client
-- (section 8), so counters there would be client-writable until step 2e ships.
-- This table is service-role-writable from the moment it exists, and serves
-- chat as well — there is no conversation entity anywhere else (ChatClient
-- deletes from a chat_messages table that does not exist).
--
-- One session = one ai_usage row = one charge. The counters are incremented
-- atomically by the functions of step 2b, against the ceilings in
-- ai_action_costs.limits; the running cost is ai_usage.cost_usd.

create table if not exists public.ai_sessions (
  id              uuid          primary key default gen_random_uuid(),
  user_id         uuid          not null references auth.users(id) on delete cascade,
  action          text          not null references public.ai_action_costs(action) on delete restrict
                                check (action in ('interview_session', 'chat')),
  usage_id        uuid          not null unique references public.ai_usage(id) on delete cascade,
  model_calls     integer       not null default 0 check (model_calls >= 0),
  stt_calls       integer       not null default 0 check (stt_calls >= 0),
  tts_calls       integer       not null default 0 check (tts_calls >= 0),
  turns_completed integer       not null default 0 check (turns_completed >= 0),
  expires_at      timestamptz,
  ended_at        timestamptz,
  end_reason      text          check (end_reason in (
                                  'completed', 'call_limit', 'cost_limit', 'expired', 'first_turn_failed'
                                )),
  created_at      timestamptz   not null default now()
);

create index if not exists ai_sessions_user_created_idx
  on public.ai_sessions (user_id, created_at desc);

alter table public.ai_sessions enable row level security;

-- Users can read their own sessions (remaining messages, turns left); nothing
-- else.
drop policy if exists ai_sessions_read_own on public.ai_sessions;
create policy ai_sessions_read_own on public.ai_sessions
  for select to authenticated using (user_id = auth.uid());

-- Link from the existing UX table. Nullable: the live client keeps inserting
-- rows without it until step 2e ships, and section 8 gives it no privilege on
-- this column. The server trusts ai_sessions, never this column.
alter table public.interview_sessions
  add column if not exists ai_session_id uuid unique
  references public.ai_sessions(id) on delete set null;


-- ─── 7. Client privileges on the billing tables ──────────────────────────────
--
-- Supabase's default grants give anon and authenticated every privilege on a
-- new table. RLS blocks the rows, but not TRUNCATE, and none of these writes
-- has a client use. Reads stay where a policy exists: the catalogue (to show a
-- price), the user's own ledger and sessions.

revoke all on public.stripe_events   from anon, authenticated;
revoke all on public.ai_action_costs from anon, authenticated;
revoke all on public.ai_usage        from anon, authenticated;
revoke all on public.ai_usage_calls  from anon, authenticated;
revoke all on public.ai_sessions     from anon, authenticated;

grant select on public.ai_action_costs to authenticated;
grant select on public.ai_usage        to authenticated;
grant select on public.ai_sessions     to authenticated;


-- ─── 8. interview_sessions: narrow the live client to what it writes ─────────
--
-- Today a single policy, "interview_sessions: users manage own", covers ALL
-- commands, and anon and authenticated hold every privilege. A user can delete
-- their sessions or rewrite created_at, and the monthly SESSION_LIMITS count —
-- which reads this table — resets.
--
-- The complete lockdown (no client write at all) needs the server route of
-- step 2e: the live client still inserts the row and saves the report. What
-- can be closed without breaking it is closed now:
--
--   INSERT  user_id, job_description, interview_type, difficulty, language —
--           the five columns InterviewCoachClient.tsx inserts. created_at takes
--           its default and can no longer be backdated.
--   UPDATE  score, feedback_json — the report save.
--   DELETE  none. No client code deletes a session.
--   anon    nothing.
--
-- Still open until 2e: a client can call /api/interview-coach without creating
-- a session at all. That is the hole ai_sessions closes.

drop policy if exists "interview_sessions: users manage own" on public.interview_sessions;
drop policy if exists "Users can view own sessions"          on public.interview_sessions;
drop policy if exists "Users can insert own sessions"        on public.interview_sessions;
drop policy if exists "Users can update own sessions"        on public.interview_sessions;
drop policy if exists interview_sessions_select_own          on public.interview_sessions;
drop policy if exists interview_sessions_insert_own          on public.interview_sessions;
drop policy if exists interview_sessions_update_own          on public.interview_sessions;

create policy interview_sessions_select_own on public.interview_sessions
  for select to authenticated using (auth.uid() = user_id);

create policy interview_sessions_insert_own on public.interview_sessions
  for insert to authenticated with check (auth.uid() = user_id);

create policy interview_sessions_update_own on public.interview_sessions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.interview_sessions from anon, authenticated;

grant select on public.interview_sessions to authenticated;

grant insert (user_id, job_description, interview_type, difficulty, language)
  on public.interview_sessions to authenticated;

grant update (score, feedback_json)
  on public.interview_sessions to authenticated;


-- ─── 9. Assert the outcome ───────────────────────────────────────────────────

do $$
declare
  v_table text;
  v_role  text;
  v_priv  text;
  v_col   text;
begin
  -- Billing tables: no client write of any kind, no anon read.
  foreach v_table in array array['stripe_events', 'ai_action_costs', 'ai_usage', 'ai_usage_calls', 'ai_sessions']
  loop
    foreach v_role in array array['anon', 'authenticated']
    loop
      foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
      loop
        if has_table_privilege(v_role, ('public.' || v_table)::regclass, v_priv) then
          raise exception '%: % still holds %', v_table, v_role, v_priv;
        end if;
      end loop;
    end loop;

    if has_table_privilege('anon', ('public.' || v_table)::regclass, 'SELECT') then
      raise exception '%: anon still holds SELECT', v_table;
    end if;
  end loop;

  foreach v_table in array array['stripe_events', 'ai_usage_calls']
  loop
    if has_table_privilege('authenticated', ('public.' || v_table)::regclass, 'SELECT') then
      raise exception '%: authenticated holds SELECT on a service-role-only table', v_table;
    end if;
  end loop;

  -- Catalogue.
  if exists (select 1 from public.ai_action_costs where (action like 'system\_%') <> (credits = 0)) then
    raise exception 'ai_action_costs: a system action is charged, or a user action is free';
  end if;

  if (select count(*) from public.ai_action_costs) <> 12 then
    raise exception 'ai_action_costs: expected 12 actions, found %', (select count(*) from public.ai_action_costs);
  end if;

  if (select limits ? 'global_per_day' from public.ai_action_costs where action = 'system_inbox_classify') then
    raise exception 'ai_action_costs: the global inbox cap belongs in admin_settings, not in the catalogue';
  end if;

  if (select value -> 'limits' ->> 'inbox_classify_global_per_day'
        from public.admin_settings where key = 'global') is distinct from '200' then
    raise exception 'admin_settings: limits.inbox_classify_global_per_day is not 200';
  end if;

  -- interview_sessions: exactly what the live client writes, nothing more.
  foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
  loop
    if has_table_privilege('anon', 'public.interview_sessions', v_priv) then
      raise exception 'interview_sessions: anon still holds %', v_priv;
    end if;
  end loop;

  foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
  loop
    if has_table_privilege('authenticated', 'public.interview_sessions', v_priv) then
      raise exception 'interview_sessions: authenticated still holds table-level %', v_priv;
    end if;
  end loop;

  for v_col in
    select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'interview_sessions'
  loop
    if has_column_privilege('authenticated', 'public.interview_sessions', v_col, 'INSERT')
       is distinct from (v_col in ('user_id', 'job_description', 'interview_type', 'difficulty', 'language')) then
      raise exception 'interview_sessions.%: INSERT grant does not match the client insert', v_col;
    end if;

    if has_column_privilege('authenticated', 'public.interview_sessions', v_col, 'UPDATE')
       is distinct from (v_col in ('score', 'feedback_json')) then
      raise exception 'interview_sessions.%: UPDATE grant does not match the client report save', v_col;
    end if;
  end loop;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'interview_sessions' and cmd in ('DELETE', 'ALL')
  ) then
    raise exception 'interview_sessions: a DELETE or ALL policy still exists';
  end if;
end;
$$;
