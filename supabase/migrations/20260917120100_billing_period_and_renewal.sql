-- The billing period, and the renewal that was missing.
--
-- Nothing in this database ever put credits back. A customer paying 39 $ was
-- granted 60 credits once, at signup, and never again: the second month they
-- paid and could do nothing. The defect would only have shown after launch, on
-- someone who had already been charged twice.
--
-- What this adds:
--
--   1. A period. current_period_start / current_period_end on profiles -- the
--      pair Stripe itself uses. Everything "per month" hangs off it.
--   2. A grant, recorded. credit_grants holds one row per (account, grant key),
--      so granting twice for the same period is impossible whatever calls it.
--   3. One entry point. grant_period_credits() is called by the free monthly
--      cycle today and by the Stripe webhook in e9d, with the invoice id as the
--      key. There is no second way to put credits on an account.
--   4. Counters keyed by the period start, not the calendar month, so the
--      quotas reset at the same instant as the credits and never on another
--      date.
--   5. One unit per job. auto_apply_claims makes a second application to the
--      same offer free, whatever races.
--
-- THE RULE: at the start of a period the balance is REPLACED by the plan's
-- allowance. It is never added to. Someone who consumed nothing does not
-- accumulate.
--
-- credit_grants is not a duplicate of stripe_events: that table dedupes webhook
-- DELIVERIES (id, type, received_at) and carries no account, no period and no
-- amount. One dedupes the messenger, the other records the act.


-- ─── 1. The period ───────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists current_period_start timestamptz;

comment on column public.profiles.current_period_start is
  'Start of the billing period in force. Written only by grant_period_credits.';
comment on column public.profiles.current_period_end is
  'End of the billing period in force: the single period end. ai_credits_reset_at is retired and read by nothing.';

-- A user who could set their own period start could grant themselves a fresh
-- allocation whenever they liked. Same lockdown as the Stripe columns.
revoke update (current_period_start) on public.profiles from authenticated, anon;
revoke insert (current_period_start) on public.profiles from authenticated, anon;


-- ─── 2. The grant ledger ─────────────────────────────────────────────────────

create table if not exists public.credit_grants (
  user_id       uuid        not null references auth.users(id) on delete cascade,
  -- 'period:<date>' for the monthly cycle, the Stripe invoice id in e9d.
  grant_key     text        not null,
  granted_at    timestamptz not null default now(),
  plan          text        not null,
  credits       integer     not null check (credits >= 0),
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  primary key (user_id, grant_key)
);

alter table public.credit_grants enable row level security;
revoke all on table public.credit_grants from anon, authenticated;

comment on table public.credit_grants is
  'One row per granted period. The primary key is the idempotency: granting twice for the same key is impossible.';


-- ─── 3. The one way to put credits on an account ─────────────────────────────

create or replace function public.grant_period_credits(
  p_user_id      uuid,
  p_grant_key    text,
  p_period_start timestamptz,
  p_period_end   timestamptz
)
returns table(granted boolean, reason text, credits integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_plan     text;
  v_status   text;
  v_blocked  boolean;
  v_limits   jsonb;
  v_credits  integer;
  v_inserted integer;
begin
  if p_user_id is null or p_grant_key is null or btrim(p_grant_key) = '' then
    raise exception 'grant_requires_user_and_key' using errcode = 'JV010';
  end if;

  if p_period_end <= p_period_start then
    raise exception 'grant_period_is_backwards' using errcode = 'JV010';
  end if;

  select p.subscription_plan, p.subscription_status, coalesce(p.is_blocked, false)
    into v_plan, v_status, v_blocked
    from public.profiles p
   where p.id = p_user_id
     for update;

  if not found then
    raise exception 'profile_not_found' using errcode = 'JV010';
  end if;

  v_plan := coalesce(v_plan, 'free');

  -- A paid plan whose payment is not good gets nothing. Not a downgrade to the
  -- free allowance either: that would quietly reward a failed payment with ten
  -- credits. The period is left untouched, so the moment the payment succeeds
  -- the webhook grants and the account is whole.
  if v_plan in ('pro', 'premium') and coalesce(v_status, '') not in ('active', 'trialing') then
    return query select false, 'payment_not_current'::text, 0;
    return;
  end if;

  if v_blocked then
    return query select false, 'blocked'::text, 0;
    return;
  end if;

  select s.value -> 'limits' into v_limits
    from public.admin_settings s
   where s.key = 'global';

  v_credits := (v_limits ->> (v_plan || '_credits_monthly'))::integer;

  -- A missing allowance is a configuration error, never "grant nothing" and
  -- never "grant everything".
  if v_credits is null then
    raise exception 'credit_allowance_missing_for_plan_%', v_plan using errcode = 'JV002';
  end if;

  -- The key is the idempotency. Two crons, a replayed webhook and a hand-run
  -- repair all collide here, and only the first one through grants.
  insert into public.credit_grants (user_id, grant_key, plan, credits, period_start, period_end)
  values (p_user_id, p_grant_key, v_plan, v_credits, p_period_start, p_period_end)
  on conflict (user_id, grant_key) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return query select false, 'already_granted'::text, 0;
    return;
  end if;

  -- REPLACED, not added: an unused balance does not carry over.
  update public.profiles p
     set ai_credits_remaining = v_credits,
         current_period_start = p_period_start,
         current_period_end   = p_period_end
   where p.id = p_user_id;

  return query select true, 'granted'::text, v_credits;
end;
$function$;

revoke all on function public.grant_period_credits(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_period_credits(uuid, text, timestamptz, timestamptz) to service_role;


-- ─── 4. The monthly cycle ────────────────────────────────────────────────────
--
-- Free accounts renew on their signup anniversary. Paid accounts will renew on
-- the Stripe invoice (e9d); until that is wired they ride the same cycle, and
-- the payment check inside grant_period_credits still applies.
--
-- The next period starts where the last one ended, so the anniversary never
-- drifts. A first period starts at the account's creation date, advanced to the
-- most recent anniversary -- an account dormant for five months gets one
-- period, not five.

create or replace function public.renew_due_periods(p_limit integer default 200)
returns table(user_id uuid, granted boolean, reason text, credits integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_row     record;
  v_start   timestamptz;
  v_end     timestamptz;
  v_result  record;
begin
  for v_row in
    select p.id, p.created_at, p.current_period_end
      from public.profiles p
     where p.current_period_end is null
        or p.current_period_end <= now()
     order by p.current_period_end nulls first
     limit greatest(1, coalesce(p_limit, 200))
     for update skip locked
  loop
    v_start := coalesce(v_row.current_period_end, v_row.created_at, now());

    -- Catch up to the most recent anniversary without granting once per month
    -- missed. Bounded so a corrupt date cannot spin.
    for i in 1..600 loop
      exit when v_start + interval '1 month' > now();
      v_start := v_start + interval '1 month';
    end loop;

    v_end := v_start + interval '1 month';

    select * into v_result
      from public.grant_period_credits(v_row.id, 'period:' || v_start::date, v_start, v_end);

    user_id := v_row.id;
    granted := v_result.granted;
    reason  := v_result.reason;
    credits := v_result.credits;
    return next;
  end loop;
end;
$function$;

revoke all on function public.renew_due_periods(integer) from public, anon, authenticated;
grant execute on function public.renew_due_periods(integer) to service_role;


-- ─── 5. The counters follow the period ───────────────────────────────────────
--
-- Keyed by the period start, the reset is the key moving: a new period means a
-- new row, which starts at zero. Nothing has to be deleted on a schedule, and
-- the quotas cannot reset on a different date from the credits.
--
-- The existing rows were written by tests against calendar months and mean
-- nothing under the new key.

delete from public.auto_apply_counters;
alter table public.auto_apply_counters rename column month to period_start;

delete from public.inbox_classify_counters where scope = 'month';

comment on column public.auto_apply_counters.period_start is
  'The billing period this count belongs to: profiles.current_period_start.';


-- ─── 6. One unit per offer ───────────────────────────────────────────────────
--
-- The per-job idempotency key disappeared with the credit reservation
-- (auto-apply:<jobId> on ai_usage). Two runs at once could each take a unit for
-- the same offer. The claim row restores it, and a second application to an
-- offer already claimed costs nothing.

create table if not exists public.auto_apply_claims (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  period_start date        not null,
  job_id       text        not null,
  claimed_at   timestamptz not null default now(),
  primary key (user_id, period_start, job_id)
);

alter table public.auto_apply_claims enable row level security;
revoke all on table public.auto_apply_claims from anon, authenticated;

comment on table public.auto_apply_claims is
  'One row per offer applied to in a period. The primary key is what stops a second unit being spent on the same job.';


drop function if exists public.claim_auto_apply(uuid, text);

create or replace function public.claim_auto_apply(p_user_id uuid, p_tier text, p_job_id text default null)
returns table(
  allowed boolean,
  reason  text,
  used    integer,
  quota   integer,
  guard   integer
)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_period date;
  v_limits jsonb;
  v_quota  integer;
  v_guard  integer;
  v_count  integer;
  v_new    integer;
begin
  if p_user_id is null then
    raise exception 'auto_apply_claim_requires_user' using errcode = 'JV010';
  end if;

  if p_tier is null or p_tier not in ('free', 'pro', 'premium') then
    raise exception 'auto_apply_claim_requires_tier' using errcode = 'JV010';
  end if;

  -- The period in force. An account with no period yet falls back to the month,
  -- so a claim is never lost while the first renewal is pending.
  select coalesce(p.current_period_start, date_trunc('month', now() at time zone 'utc'))::date
    into v_period
    from public.profiles p
   where p.id = p_user_id;

  if v_period is null then
    raise exception 'profile_not_found' using errcode = 'JV010';
  end if;

  select s.value -> 'limits' into v_limits
    from public.admin_settings s
   where s.key = 'global';

  v_quota := (v_limits -> 'auto_apply_monthly' ->> p_tier)::integer;
  v_guard := (v_limits ->> 'auto_apply_monthly_guard')::integer;

  if v_quota is null or v_guard is null then
    raise exception 'auto_apply_quota_missing' using errcode = 'JV002';
  end if;

  -- The offer first: it is a unique test, and the cheapest possible refusal.
  -- Two runs racing on the same job serialise here, and the loser is told the
  -- job is already taken without a unit moving.
  if p_job_id is not null and btrim(p_job_id) <> '' then
    insert into public.auto_apply_claims (user_id, period_start, job_id)
    values (p_user_id, v_period, p_job_id)
    on conflict (user_id, period_start, job_id) do nothing;

    get diagnostics v_new = row_count;
    if v_new = 0 then
      select c.count into v_count
        from public.auto_apply_counters c
       where c.period_start = v_period and c.user_id = p_user_id;
      return query select false, 'already_applied'::text, coalesce(v_count, 0), v_quota, v_guard;
      return;
    end if;
  end if;

  insert into public.auto_apply_counters (period_start, user_id)
  values (v_period, p_user_id)
  on conflict (period_start, user_id) do nothing;

  select c.count into v_count
    from public.auto_apply_counters c
   where c.period_start = v_period and c.user_id = p_user_id
   for update;

  -- The plan speaks first; the guard is for a loop nobody meant to write.
  if v_count >= v_quota or v_count >= v_guard then
    -- The offer was claimed a moment ago but no unit was spent: release it, or
    -- the job would be unreachable for the rest of the period.
    if p_job_id is not null and btrim(p_job_id) <> '' then
      delete from public.auto_apply_claims c
       where c.user_id = p_user_id and c.period_start = v_period and c.job_id = p_job_id;
    end if;

    return query select false,
      (case when v_count >= v_quota then 'quota_exhausted' else 'guard' end)::text,
      v_count, v_quota, v_guard;
    return;
  end if;

  update public.auto_apply_counters c
     set count = c.count + 1
   where c.period_start = v_period and c.user_id = p_user_id
  returning c.count into v_count;

  return query select true, 'ok'::text, v_count, v_quota, v_guard;
end;
$function$;

revoke all on function public.claim_auto_apply(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_auto_apply(uuid, text, text) to service_role;


create or replace function public.release_auto_apply(p_user_id uuid, p_job_id text default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_period date;
  v_count  integer;
begin
  select coalesce(p.current_period_start, date_trunc('month', now() at time zone 'utc'))::date
    into v_period
    from public.profiles p
   where p.id = p_user_id;

  update public.auto_apply_counters c
     set count = greatest(0, c.count - 1)
   where c.period_start = v_period and c.user_id = p_user_id
  returning c.count into v_count;

  -- The offer becomes available again: the application did not happen.
  if p_job_id is not null and btrim(p_job_id) <> '' then
    delete from public.auto_apply_claims c
     where c.user_id = p_user_id and c.period_start = v_period and c.job_id = p_job_id;
  end if;

  return coalesce(v_count, 0);
end;
$function$;

revoke all on function public.release_auto_apply(uuid, text) from public, anon, authenticated;
grant execute on function public.release_auto_apply(uuid, text) to service_role;


-- ─── 7. The inbox month follows the period too ───────────────────────────────

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
  v_period       date;
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

  -- The same period the credits and the applications use.
  select coalesce(p.current_period_start, date_trunc('month', now() at time zone 'utc'))::date
    into v_period
    from public.profiles p
   where p.id = p_user_id;

  select s.value -> 'limits' into v_limits
    from public.admin_settings s
   where s.key = 'global';

  v_alias_limit  := (v_limits ->> 'inbox_classify_per_alias_per_day')::integer;
  v_global_limit := (v_limits ->> 'inbox_classify_global_per_day')::integer;

  if v_alias_limit is null or v_global_limit is null then
    raise exception 'inbox_caps_missing' using errcode = 'JV002';
  end if;

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
    values (v_period, 'month', p_user_id::text)
    on conflict (day, scope, subject) do nothing;
  end if;

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
     where c.day = v_period and c.scope = 'month' and c.subject = p_user_id::text
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
     where c.day = v_period and c.scope = 'month' and c.subject = p_user_id::text
    returning c.count into v_month_count;
  end if;

  return query select true, 'ok'::text, v_alias_count, v_alias_limit, v_global_count, v_global_limit, v_month_count, v_month_limit;
end;
$function$;

revoke all on function public.claim_inbox_classification(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_inbox_classification(uuid, text) to service_role;


-- ─── 8. Assert the outcome ───────────────────────────────────────────────────

do $$
declare
  v_role text;
  v_priv text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles'
                    and column_name = 'current_period_start') then
    raise exception 'profiles.current_period_start is missing';
  end if;

  -- A client that could write the period could grant itself credits.
  foreach v_role in array array['anon', 'authenticated']
  loop
    foreach v_priv in array array['INSERT', 'UPDATE']
    loop
      if has_column_privilege(v_role, 'public.profiles', 'current_period_start', v_priv)
         or has_column_privilege(v_role, 'public.profiles', 'current_period_end', v_priv) then
        raise exception 'profiles period columns are still writable by % via %', v_role, v_priv;
      end if;
    end loop;
  end loop;

  if to_regclass('public.credit_grants') is null or to_regclass('public.auto_apply_claims') is null then
    raise exception 'the grant ledger or the claim table is missing';
  end if;

  if has_table_privilege('authenticated', 'public.credit_grants', 'SELECT')
     or has_table_privilege('anon', 'public.credit_grants', 'SELECT')
     or has_table_privilege('authenticated', 'public.auto_apply_claims', 'SELECT')
     or has_function_privilege('authenticated', 'public.grant_period_credits(uuid, text, timestamptz, timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.renew_due_periods(integer)', 'EXECUTE') then
    raise exception 'the renewal machinery is reachable by a client';
  end if;

  if to_regprocedure('public.claim_auto_apply(uuid, text)') is not null then
    raise exception 'the job-less claim still exists: an application could skip its offer key';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'auto_apply_counters'
                    and column_name = 'period_start') then
    raise exception 'auto_apply_counters is still keyed by the calendar month';
  end if;
end;
$$;
