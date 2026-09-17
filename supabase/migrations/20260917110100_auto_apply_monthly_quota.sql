-- An automatic application spends its own quota, not an AI credit.
--
-- Docs/jobvero-plans-reference.md §3: the two counters never eat each other.
-- Until now an application reserved one credit through reserve_ai_credits, so a
-- Premium customer's 210 applications would have eaten 210 of their 150 credits
-- — the quota was arithmetically impossible to reach.
--
-- What replaces it is the same shape as claim_inbox_classification (block e5):
-- a row per month and per user, taken under lock. Two applications racing for
-- the last unit cannot both have it, and the count never goes negative. The
-- counter is a row and not a number in memory because every request can land on
-- a different Vercel instance, and a counter in memory counts nothing.
--
-- The plan's quota speaks first; the guard is a second, higher ceiling that
-- only a runaway loop should ever meet (250, above Premium's 210).
--
-- The tier is passed in, not resolved here. src/lib/entitlements.ts is the one
-- place that decides what plan an account is on, and a second resolver written
-- in SQL would be exactly the defect this block exists to remove. The caller is
-- always the server, holding the service role.


-- ─── The counter ─────────────────────────────────────────────────────────────

create table if not exists public.auto_apply_counters (
  month   date    not null,           -- the first day of the month, in UTC
  user_id uuid    not null references auth.users(id) on delete cascade,
  count   integer not null default 0 check (count >= 0),
  primary key (month, user_id)
);

alter table public.auto_apply_counters enable row level security;
revoke all on table public.auto_apply_counters from anon, authenticated;

comment on table public.auto_apply_counters is
  'One row per user per month. Written only by claim_auto_apply, under lock.';


-- ─── One application, or the reason there is none ────────────────────────────

create or replace function public.claim_auto_apply(p_user_id uuid, p_tier text)
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
  v_month  date := date_trunc('month', (now() at time zone 'utc'))::date;
  v_limits jsonb;
  v_quota  integer;
  v_guard  integer;
  v_count  integer;
begin
  if p_user_id is null then
    raise exception 'auto_apply_claim_requires_user' using errcode = 'JV010';
  end if;

  if p_tier is null or p_tier not in ('free', 'pro', 'premium') then
    raise exception 'auto_apply_claim_requires_tier' using errcode = 'JV010';
  end if;

  select s.value -> 'limits' into v_limits
    from public.admin_settings s
   where s.key = 'global';

  v_quota := (v_limits -> 'auto_apply_monthly' ->> p_tier)::integer;
  v_guard := (v_limits ->> 'auto_apply_monthly_guard')::integer;

  -- A missing ceiling is not "no ceiling": nothing is claimed.
  if v_quota is null or v_guard is null then
    raise exception 'auto_apply_quota_missing' using errcode = 'JV002';
  end if;

  insert into public.auto_apply_counters (month, user_id)
  values (v_month, p_user_id)
  on conflict (month, user_id) do nothing;

  -- The lock is what stops two applications from both taking the last unit.
  select c.count into v_count
    from public.auto_apply_counters c
   where c.month = v_month and c.user_id = p_user_id
   for update;

  -- The plan speaks first. The guard is for a loop nobody meant to write, and
  -- it sits above every plan quota so it can never be the voice that refuses a
  -- customer who is simply at the end of their month.
  if v_count >= v_quota then
    return query select false, 'quota_exhausted'::text, v_count, v_quota, v_guard;
    return;
  end if;

  if v_count >= v_guard then
    return query select false, 'guard'::text, v_count, v_quota, v_guard;
    return;
  end if;

  update public.auto_apply_counters c
     set count = c.count + 1
   where c.month = v_month and c.user_id = p_user_id
  returning c.count into v_count;

  return query select true, 'ok'::text, v_count, v_quota, v_guard;
end;
$function$;

revoke all on function public.claim_auto_apply(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_auto_apply(uuid, text) to service_role;


-- ─── Giving a unit back ──────────────────────────────────────────────────────
--
-- An application that fails on the way out did not happen: the quota unit comes
-- back. What it already cost us does not — that stays on the ledger row, which
-- is the whole point of logging the cost apart from the quota.

create or replace function public.release_auto_apply(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_month date := date_trunc('month', (now() at time zone 'utc'))::date;
  v_count integer;
begin
  update public.auto_apply_counters c
     set count = greatest(0, c.count - 1)
   where c.month = v_month and c.user_id = p_user_id
  returning c.count into v_count;

  return coalesce(v_count, 0);
end;
$function$;

revoke all on function public.release_auto_apply(uuid) from public, anon, authenticated;
grant execute on function public.release_auto_apply(uuid) to service_role;


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.auto_apply_counters') is null then
    raise exception 'auto_apply_counters is missing';
  end if;

  if has_table_privilege('authenticated', 'public.auto_apply_counters', 'SELECT')
     or has_table_privilege('anon', 'public.auto_apply_counters', 'SELECT')
     or has_function_privilege('authenticated', 'public.claim_auto_apply(uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.claim_auto_apply(uuid, text)', 'EXECUTE') then
    raise exception 'the auto-apply counter or its function is reachable by a client';
  end if;

  if to_regprocedure('public.claim_auto_apply(uuid, text)') is null
     or to_regprocedure('public.release_auto_apply(uuid)') is null then
    raise exception 'the auto-apply claim functions are missing';
  end if;
end;
$$;
