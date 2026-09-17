-- Changing plan, and the month a card expires.
--
-- The rules, agreed 2026-09-17:
--
--   REPLACEMENT, NEVER ADDITION. An upgrade sets the balance to the new plan's
--   allowance. Adding the difference would punish the customer who had already
--   spent theirs and reward the one who had not.
--
--   UP IMMEDIATELY, DOWN AT THE TERM. They pay for the upgrade today, so they
--   get it today. They already paid for the month at the higher tier, so
--   nothing is taken back before it ends.
--
--   ONE GRANT PER PLAN PER PERIOD, keyed 'changement:<period>:<plan>'.
--   Free -> Pro -> Premium in one month is two keys and two grants: a real
--   customer climbing must not be punished. Premium -> Pro -> Premium is one
--   key, and the round trip earns nothing.
--
-- And the dunning rule: while Stripe retries a failed payment the customer
-- keeps everything they have and receives nothing new. Only when Stripe gives
-- up for good do they fall to Free.


-- ─── 1. A scheduled change ───────────────────────────────────────────────────
--
-- A downgrade and a cancellation are not applied now: they are written down and
-- applied when the period the customer paid for ends.

alter table public.profiles
  add column if not exists scheduled_plan text;

alter table public.profiles
  drop constraint if exists profiles_scheduled_plan_check;
alter table public.profiles
  add constraint profiles_scheduled_plan_check
  check (scheduled_plan is null or scheduled_plan in ('free', 'pro', 'premium'));

comment on column public.profiles.scheduled_plan is
  'The plan to move to when the current period ends. Null means nothing scheduled. Written only by apply_plan_change and renew_due_periods.';

-- A customer who could write their own scheduled plan could schedule an upgrade
-- they never paid for.
revoke update (scheduled_plan) on public.profiles from authenticated, anon;
revoke insert (scheduled_plan) on public.profiles from authenticated, anon;


-- ─── 2. Granting, with the three ways a payment can stand ────────────────────
--
-- active / trialing   grant the plan's allowance
-- past_due            grant nothing, change nothing: Stripe is still retrying
-- anything else       Stripe has given up, or never started. The account
--                     becomes Free here and gets Free's allowance, because a
--                     cancelled customer who kept 150 credits for ever would be
--                     a paying plan given away.

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
  v_fell     boolean := false;
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

  if v_blocked then
    return query select false, 'blocked'::text, 0;
    return;
  end if;

  if v_plan in ('pro', 'premium') then
    if coalesce(v_status, '') = 'past_due' then
      -- Stripe is retrying. Access stays (resolveTier accepts past_due); the
      -- balance is frozen and the period left in the past, so the moment the
      -- payment clears the webhook grants and the customer is whole.
      return query select false, 'payment_retrying'::text, 0;
      return;

    elsif coalesce(v_status, '') not in ('active', 'trialing') then
      -- canceled, unpaid, paused, incomplete, incomplete_expired, or a status
      -- this code does not know: the subscription is over, or never began.
      v_plan := 'free';
      v_fell := true;
    end if;
  end if;

  select s.value -> 'limits' into v_limits
    from public.admin_settings s
   where s.key = 'global';

  v_credits := (v_limits ->> (v_plan || '_credits_monthly'))::integer;

  if v_credits is null then
    raise exception 'credit_allowance_missing_for_plan_%', v_plan using errcode = 'JV002';
  end if;

  insert into public.credit_grants (user_id, grant_key, plan, credits, period_start, period_end)
  values (p_user_id, p_grant_key, v_plan, v_credits, p_period_start, p_period_end)
  on conflict (user_id, grant_key) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return query select false, 'already_granted'::text, 0;
    return;
  end if;

  update public.profiles p
     set ai_credits_remaining = v_credits,
         current_period_start = p_period_start,
         current_period_end   = p_period_end,
         subscription_plan    = case when v_fell then 'free' else p.subscription_plan end,
         subscription_status  = case when v_fell then null    else p.subscription_status end,
         scheduled_plan       = case when v_fell then null    else p.scheduled_plan end,
         cancel_at_period_end = case when v_fell then false   else p.cancel_at_period_end end
   where p.id = p_user_id;

  return query select true, (case when v_fell then 'downgraded_to_free' else 'granted' end)::text, v_credits;
end;
$function$;

revoke all on function public.grant_period_credits(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_period_credits(uuid, text, timestamptz, timestamptz) to service_role;


-- ─── 3. Changing plan ────────────────────────────────────────────────────────
--
-- Called by the application today and by the Stripe webhook in e9c, on a
-- payment that succeeded. It sets subscription_status to 'active' on an
-- upgrade because an upgrade is only ever called after money moved; the webhook
-- remains the source of truth and will overwrite it with what Stripe says.

create or replace function public.apply_plan_change(p_user_id uuid, p_new_plan text)
returns table(outcome text, granted boolean, reason text, credits integer, effective timestamptz)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_current  text;
  v_start    timestamptz;
  v_end      timestamptz;
  v_rank_new integer;
  v_rank_cur integer;
  v_result   record;
  v_key      text;
begin
  if p_user_id is null then
    raise exception 'plan_change_requires_user' using errcode = 'JV010';
  end if;

  if p_new_plan is null or p_new_plan not in ('free', 'pro', 'premium') then
    raise exception 'plan_change_requires_plan' using errcode = 'JV010';
  end if;

  select coalesce(p.subscription_plan, 'free'), p.current_period_start, p.current_period_end
    into v_current, v_start, v_end
    from public.profiles p
   where p.id = p_user_id
     for update;

  if not found then
    raise exception 'profile_not_found' using errcode = 'JV010';
  end if;

  v_rank_cur := case v_current  when 'premium' then 2 when 'pro' then 1 else 0 end;
  v_rank_new := case p_new_plan when 'premium' then 2 when 'pro' then 1 else 0 end;

  -- Same plan: nothing to grant. This is also how a round trip ends — the
  -- downgrade was only ever scheduled, so coming back cancels the schedule and
  -- the plan never actually moved.
  if v_rank_new = v_rank_cur then
    update public.profiles
       set scheduled_plan = null, cancel_at_period_end = false
     where id = p_user_id;
    return query select 'unchanged'::text, false, 'same_plan'::text, 0, v_end;
    return;
  end if;

  -- ── Down: written down, applied at the term ────────────────────────────────
  if v_rank_new < v_rank_cur then
    update public.profiles
       set scheduled_plan       = p_new_plan,
           cancel_at_period_end = (p_new_plan = 'free')
     where id = p_user_id;

    return query select 'scheduled'::text, false, 'applies_at_period_end'::text, 0, v_end;
    return;
  end if;

  -- ── Up: now ────────────────────────────────────────────────────────────────
  --
  -- From Free the period restarts today: this is the day they start paying.
  -- Between paid plans the period is kept, so the applications already made
  -- this month keep counting -- against the higher ceiling.
  if v_current = 'free' or v_start is null or v_end is null or v_end <= now() then
    v_start := now();
    v_end   := now() + interval '1 month';
  end if;

  update public.profiles
     set subscription_plan   = p_new_plan,
         subscription_status = 'active',
         scheduled_plan      = null,
         cancel_at_period_end = false
   where id = p_user_id;

  -- One grant per plan per period: an upgrade to a plan already granted in this
  -- period grants nothing, and the climb Free -> Pro -> Premium is two keys.
  v_key := 'changement:' || v_start::date || ':' || p_new_plan;

  select * into v_result
    from public.grant_period_credits(p_user_id, v_key, v_start, v_end);

  return query select 'upgraded'::text, v_result.granted, v_result.reason, v_result.credits, v_end;
end;
$function$;

revoke all on function public.apply_plan_change(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_plan_change(uuid, text) to service_role;


-- ─── 4. The sweep applies what was scheduled ─────────────────────────────────
--
-- p_user_ids narrows the sweep to named accounts. It is what lets a test touch
-- only the accounts it created -- a suite that wrote into real customers'
-- balances is how this parameter came to exist -- and it is also how an
-- operator re-runs one account after fixing a setting.

create or replace function public.renew_due_periods(
  p_limit    integer default 200,
  p_user_ids uuid[] default null
)
returns table(user_id uuid, granted boolean, reason text, credits integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_row    record;
  v_start  timestamptz;
  v_end    timestamptz;
  v_result record;
begin
  for v_row in
    select p.id, p.created_at, p.current_period_end, p.scheduled_plan
      from public.profiles p
     where (p.current_period_end is null or p.current_period_end <= now())
       and (p_user_ids is null or p.id = any (p_user_ids))
     order by p.current_period_end nulls first
     limit greatest(1, coalesce(p_limit, 200))
     for update skip locked
  loop
    -- What was scheduled takes effect now, before the allowance is worked out:
    -- a customer who downgraded last month must be granted the new plan's
    -- credits, not the old plan's.
    if v_row.scheduled_plan is not null then
      update public.profiles
         set subscription_plan    = v_row.scheduled_plan,
             subscription_status  = case when v_row.scheduled_plan = 'free' then null
                                         else subscription_status end,
             scheduled_plan       = null,
             cancel_at_period_end = false
       where id = v_row.id;
    end if;

    v_start := coalesce(v_row.current_period_end, v_row.created_at, now());

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

revoke all on function public.renew_due_periods(integer, uuid[]) from public, anon, authenticated;
grant execute on function public.renew_due_periods(integer, uuid[]) to service_role;

drop function if exists public.renew_due_periods(integer);


-- ─── 5. Assert the outcome ───────────────────────────────────────────────────

do $$
declare
  v_role text;
  v_priv text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles'
                    and column_name = 'scheduled_plan') then
    raise exception 'profiles.scheduled_plan is missing';
  end if;

  foreach v_role in array array['anon', 'authenticated']
  loop
    foreach v_priv in array array['INSERT', 'UPDATE']
    loop
      if has_column_privilege(v_role, 'public.profiles', 'scheduled_plan', v_priv) then
        raise exception 'profiles.scheduled_plan is still writable by % via %', v_role, v_priv;
      end if;
    end loop;
  end loop;

  if to_regprocedure('public.apply_plan_change(uuid, text)') is null then
    raise exception 'apply_plan_change is missing';
  end if;

  if to_regprocedure('public.renew_due_periods(integer)') is not null then
    raise exception 'the unfiltered sweep still exists beside the filtered one';
  end if;

  if has_function_privilege('authenticated', 'public.apply_plan_change(uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.apply_plan_change(uuid, text)', 'EXECUTE') then
    raise exception 'apply_plan_change is reachable by a client: a user could grant themselves a plan';
  end if;
end;
$$;
