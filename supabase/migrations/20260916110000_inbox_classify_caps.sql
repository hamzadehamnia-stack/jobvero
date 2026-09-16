-- Inbox classification: ceilings in admin_settings, counted in the database.
--
-- Measured on 2026-09-16, one classification with the catalogue's model
-- (anthropic/claude-sonnet-4.6), through the webhook's own prompt:
--   · a two-line rejection (165 chars)                  462 in / 602 out  $0.0104
--   · an interview invitation with a date (831 chars)   672 in / 791 out  $0.0139
--   · a quoted thread of 34,913 chars, cut to 8,000    2749 in / 544 out  $0.0164
-- Around $0.0136 each. The global ceiling of 200 a day is therefore worth about
-- $2.71 a day, $19 a week — and without a ceiling, whoever sends the mail
-- decides the bill.
--
-- Both ceilings live in admin_settings.limits, changeable without a deploy:
-- inbox_classify_per_alias_per_day (25) and inbox_classify_global_per_day
-- (200). per_user_per_day leaves the catalogue: two sources for one rule is one
-- too many.
--
-- The counters are rows, not memory: every request can land on a different
-- Vercel instance, and a counter in memory counts nothing.

-- ─── Ceilings ────────────────────────────────────────────────────────────────

update public.admin_settings
   set value = jsonb_set(
         jsonb_set(value, '{limits,inbox_classify_per_alias_per_day}', '25'::jsonb, true),
         '{limits,inbox_classify_global_per_day}',
         coalesce(value #> '{limits,inbox_classify_global_per_day}', '200'::jsonb),
         true)
 where key = 'global';

update public.ai_action_costs
   set limits = limits - 'per_user_per_day'
 where action = 'system_inbox_classify';


-- ─── Counters ────────────────────────────────────────────────────────────────

create table if not exists public.inbox_classify_counters (
  day     date    not null default current_date,
  scope   text    not null check (scope in ('alias', 'global')),
  subject text    not null,   -- the alias owner's user id, or 'global'
  count   integer not null default 0 check (count >= 0),
  primary key (day, scope, subject)
);

alter table public.inbox_classify_counters enable row level security;
revoke all on table public.inbox_classify_counters from anon, authenticated;

comment on table public.inbox_classify_counters is
  'One row per day and per counted subject. Written only by claim_inbox_classification, under lock.';


-- ─── One classification, or a reason there is none ───────────────────────────

create or replace function public.claim_inbox_classification(p_user_id uuid)
returns table(
  allowed      boolean,
  reason       text,
  alias_used   integer,
  alias_limit  integer,
  global_used  integer,
  global_limit integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_day          date := current_date;
  v_limits       jsonb;
  v_alias_limit  integer;
  v_global_limit integer;
  v_alias_count  integer;
  v_global_count integer;
begin
  if p_user_id is null then
    raise exception 'inbox_claim_requires_user' using errcode = 'JV010';
  end if;

  select s.value -> 'limits' into v_limits
    from public.admin_settings s
   where s.key = 'global';

  v_alias_limit  := (v_limits ->> 'inbox_classify_per_alias_per_day')::integer;
  v_global_limit := (v_limits ->> 'inbox_classify_global_per_day')::integer;

  -- No ceiling configured means no classification: a missing setting must not
  -- read as "no limit".
  if v_alias_limit is null or v_global_limit is null then
    raise exception 'inbox_caps_missing' using errcode = 'JV002';
  end if;

  insert into public.inbox_classify_counters (day, scope, subject)
  values (v_day, 'global', 'global')
  on conflict (day, scope, subject) do nothing;

  insert into public.inbox_classify_counters (day, scope, subject)
  values (v_day, 'alias', p_user_id::text)
  on conflict (day, scope, subject) do nothing;

  -- The global row first, then the alias row: two emails arriving at the same
  -- moment take the same locks in the same order, so one waits for the other
  -- and neither deadlocks. The lock is what stops both from passing a ceiling
  -- that has room for one.
  select c.count into v_global_count
    from public.inbox_classify_counters c
   where c.day = v_day and c.scope = 'global' and c.subject = 'global'
     for update;

  select c.count into v_alias_count
    from public.inbox_classify_counters c
   where c.day = v_day and c.scope = 'alias' and c.subject = p_user_id::text
     for update;

  if v_global_count >= v_global_limit then
    return query select false, 'global_limit'::text, v_alias_count, v_alias_limit, v_global_count, v_global_limit;
    return;
  end if;

  if v_alias_count >= v_alias_limit then
    return query select false, 'alias_limit'::text, v_alias_count, v_alias_limit, v_global_count, v_global_limit;
    return;
  end if;

  update public.inbox_classify_counters c
     set count = c.count + 1
   where c.day = v_day and c.scope = 'global' and c.subject = 'global'
  returning c.count into v_global_count;

  update public.inbox_classify_counters c
     set count = c.count + 1
   where c.day = v_day and c.scope = 'alias' and c.subject = p_user_id::text
  returning c.count into v_alias_count;

  return query select true, 'ok'::text, v_alias_count, v_alias_limit, v_global_count, v_global_limit;
end;
$function$;

revoke all on function public.claim_inbox_classification(uuid) from public, anon, authenticated;
grant execute on function public.claim_inbox_classification(uuid) to service_role;


-- ─── The mark on an email nobody classified ──────────────────────────────────
--
-- The email is kept whatever happens. When it was not classified, the thread
-- says why, so the interface can tell the user rather than leave a silence.

alter table public.message_threads
  add column if not exists ai_skipped_reason text;

alter table public.message_threads
  drop constraint if exists message_threads_ai_skipped_reason_check;
alter table public.message_threads
  add constraint message_threads_ai_skipped_reason_check
  check (ai_skipped_reason is null or ai_skipped_reason in ('alias_limit', 'global_limit', 'ai_disabled', 'ai_unavailable'));


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
declare
  v_limits jsonb := (select value -> 'limits' from public.admin_settings where key = 'global');
begin
  if (v_limits ->> 'inbox_classify_per_alias_per_day')::integer is distinct from 25
     or (v_limits ->> 'inbox_classify_global_per_day')::integer is distinct from 200 then
    raise exception 'admin_settings: the inbox ceilings are not 25 and 200';
  end if;

  if (select limits ? 'per_user_per_day' from public.ai_action_costs where action = 'system_inbox_classify') then
    raise exception 'ai_action_costs: system_inbox_classify still carries per_user_per_day';
  end if;

  if to_regclass('public.inbox_classify_counters') is null then
    raise exception 'inbox_classify_counters is missing';
  end if;

  if has_table_privilege('authenticated', 'public.inbox_classify_counters', 'SELECT')
     or has_table_privilege('anon', 'public.inbox_classify_counters', 'SELECT')
     or has_function_privilege('authenticated', 'public.claim_inbox_classification(uuid)', 'EXECUTE') then
    raise exception 'inbox counters or their function are reachable by a client';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'message_threads' and column_name = 'ai_skipped_reason') then
    raise exception 'message_threads: ai_skipped_reason is missing';
  end if;
end;
$$;
