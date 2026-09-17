-- The Free plan sorts 15 emails a month. Nothing is deleted.
--
-- Reference §1 and §4: every account gets a @getjobvero.com alias, Free
-- included — it is the hook. What Free does not get is unlimited sorting, or
-- the secretary writing the replies. Past 15 in a month the email still
-- arrives, is still stored, and is still visible; it simply carries a reason
-- instead of an analysis.
--
-- The counter joins the two that already exist, in the same table and under the
-- same lock discipline (block e5): a row per counted subject, never a number in
-- memory, because every request can land on a different Vercel instance.
--
-- The tier is passed in, like claim_auto_apply. src/lib/entitlements.ts is the
-- one place that decides what plan an account is on; a second resolver written
-- in SQL is exactly the defect this block removes. The 1-argument version is
-- dropped rather than kept beside it: two doors into one decision is what we
-- are getting rid of.


-- ─── A monthly scope for the counter ─────────────────────────────────────────

alter table public.inbox_classify_counters
  drop constraint if exists inbox_classify_counters_scope_check;

alter table public.inbox_classify_counters
  add constraint inbox_classify_counters_scope_check
  check (scope in ('alias', 'global', 'month'));

comment on column public.inbox_classify_counters.day is
  'The day counted, or the first day of the month for the ''month'' scope.';


-- ─── One classification, or the reason there is none ─────────────────────────

drop function if exists public.claim_inbox_classification(uuid);

create or replace function public.claim_inbox_classification(p_user_id uuid, p_tier text)
returns table(
  allowed      boolean,
  reason       text,
  alias_used   integer,
  alias_limit  integer,
  global_used  integer,
  global_limit integer,
  month_used   integer,
  month_limit  integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_day          date := current_date;
  v_month        date := date_trunc('month', (now() at time zone 'utc'))::date;
  v_limits       jsonb;
  v_alias_limit  integer;
  v_global_limit integer;
  v_month_limit  integer;
  v_alias_count  integer;
  v_global_count integer;
  v_month_count  integer := 0;
begin
  if p_user_id is null then
    raise exception 'inbox_claim_requires_user' using errcode = 'JV010';
  end if;

  if p_tier is null or p_tier not in ('free', 'pro', 'premium') then
    raise exception 'inbox_claim_requires_tier' using errcode = 'JV010';
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

  -- Only Free has a monthly ceiling. A paid plan has the daily alias cap alone.
  if p_tier = 'free' then
    v_month_limit := (v_limits ->> 'inbox_classify_free_per_month')::integer;
    if v_month_limit is null then
      raise exception 'inbox_free_monthly_cap_missing' using errcode = 'JV002';
    end if;
  end if;

  insert into public.inbox_classify_counters (day, scope, subject)
  values (v_day, 'global', 'global')
  on conflict (day, scope, subject) do nothing;

  insert into public.inbox_classify_counters (day, scope, subject)
  values (v_day, 'alias', p_user_id::text)
  on conflict (day, scope, subject) do nothing;

  if v_month_limit is not null then
    insert into public.inbox_classify_counters (day, scope, subject)
    values (v_month, 'month', p_user_id::text)
    on conflict (day, scope, subject) do nothing;
  end if;

  -- Global, then alias, then month: two emails arriving at the same moment take
  -- the same locks in the same order, so one waits for the other and neither
  -- deadlocks. The lock is what stops both from passing a ceiling with room for
  -- one.
  select c.count into v_global_count
    from public.inbox_classify_counters c
   where c.day = v_day and c.scope = 'global' and c.subject = 'global'
     for update;

  select c.count into v_alias_count
    from public.inbox_classify_counters c
   where c.day = v_day and c.scope = 'alias' and c.subject = p_user_id::text
     for update;

  if v_month_limit is not null then
    select c.count into v_month_count
      from public.inbox_classify_counters c
     where c.day = v_month and c.scope = 'month' and c.subject = p_user_id::text
       for update;
  end if;

  if v_global_count >= v_global_limit then
    return query select false, 'global_limit'::text, v_alias_count, v_alias_limit, v_global_count, v_global_limit, v_month_count, v_month_limit;
    return;
  end if;

  if v_alias_count >= v_alias_limit then
    return query select false, 'alias_limit'::text, v_alias_count, v_alias_limit, v_global_count, v_global_limit, v_month_count, v_month_limit;
    return;
  end if;

  if v_month_limit is not null and v_month_count >= v_month_limit then
    return query select false, 'monthly_limit'::text, v_alias_count, v_alias_limit, v_global_count, v_global_limit, v_month_count, v_month_limit;
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

  if v_month_limit is not null then
    update public.inbox_classify_counters c
       set count = c.count + 1
     where c.day = v_month and c.scope = 'month' and c.subject = p_user_id::text
    returning c.count into v_month_count;
  end if;

  return query select true, 'ok'::text, v_alias_count, v_alias_limit, v_global_count, v_global_limit, v_month_count, v_month_limit;
end;
$function$;

revoke all on function public.claim_inbox_classification(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_inbox_classification(uuid, text) to service_role;


-- ─── The mark on an email nobody classified ──────────────────────────────────

alter table public.message_threads
  drop constraint if exists message_threads_ai_skipped_reason_check;
alter table public.message_threads
  add constraint message_threads_ai_skipped_reason_check
  check (ai_skipped_reason is null or ai_skipped_reason in
    ('alias_limit', 'global_limit', 'monthly_limit', 'ai_disabled', 'ai_unavailable'));


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
begin
  if to_regprocedure('public.claim_inbox_classification(uuid)') is not null then
    raise exception 'the one-argument claim still exists: two doors into one decision';
  end if;

  if to_regprocedure('public.claim_inbox_classification(uuid, text)') is null then
    raise exception 'the tier-aware claim is missing';
  end if;

  if has_function_privilege('authenticated', 'public.claim_inbox_classification(uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.claim_inbox_classification(uuid, text)', 'EXECUTE') then
    raise exception 'the classification claim is reachable by a client';
  end if;

  -- A free account must have a monthly ceiling to enforce.
  if (select (value -> 'limits' ->> 'inbox_classify_free_per_month')::integer
        from public.admin_settings where key = 'global') is distinct from 15 then
    raise exception 'admin_settings: the free monthly inbox quota is not 15';
  end if;
end;
$$;
