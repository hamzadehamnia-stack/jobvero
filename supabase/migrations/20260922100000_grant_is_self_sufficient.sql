-- A payment must not depend on the order its events arrive in.
--
-- invoice.paid was granting from the account's CURRENT state: on a first
-- purchase it arrives before customer.subscription.created, so the account was
-- still read as Free and the first grant was 10 credits, corrected to 60 a
-- moment later by the subscription event. The balance came out right by luck of
-- ordering, and Stripe guarantees no ordering at all.
--
-- The fix is to make the grant self-sufficient: the caller states the plan it
-- has proof of -- for invoice.paid, the price id on the invoice line, mapped
-- server-side -- and that plan is written to the account as well as used for
-- the allowance. Whoever arrives first is right, and the other is refused as a
-- duplicate because both now compute the same key.
--
-- p_source records WHICH invoice paid for a grant without putting it in the
-- key: the key is the rule (one allocation per plan per period), the column is
-- the trace.

alter table public.credit_grants
  add column if not exists source text;

comment on column public.credit_grants.source is
  'What produced this grant: a Stripe invoice id, ''plan_change'', ''renewal'', ''cancellation''. Trace only -- idempotency is the primary key.';

-- The 4-argument version must go, or the two overloads are ambiguous.
drop function if exists public.grant_period_credits(uuid, text, timestamptz, timestamptz);

create or replace function public.grant_period_credits(
  p_user_id      uuid,
  p_grant_key    text,
  p_period_start timestamptz,
  p_period_end   timestamptz,
  p_plan         text default null,
  p_source       text default null
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
  v_stated   boolean := false;
begin
  if p_user_id is null or p_grant_key is null or btrim(p_grant_key) = '' then
    raise exception 'grant_requires_user_and_key' using errcode = 'JV010';
  end if;

  if p_period_end <= p_period_start then
    raise exception 'grant_period_is_backwards' using errcode = 'JV010';
  end if;

  if p_plan is not null and p_plan not in ('free', 'pro', 'premium') then
    raise exception 'grant_unknown_plan_%', p_plan using errcode = 'JV010';
  end if;

  select p.subscription_plan, p.subscription_status, coalesce(p.is_blocked, false)
    into v_plan, v_status, v_blocked
    from public.profiles p
   where p.id = p_user_id
     for update;

  if not found then
    raise exception 'profile_not_found' using errcode = 'JV010';
  end if;

  if v_blocked then
    return query select false, 'blocked'::text, 0;
    return;
  end if;

  -- A caller with proof of what was bought overrides what the row says. This is
  -- the whole point: the row may not have been updated yet.
  if p_plan is not null then
    v_plan   := p_plan;
    v_stated := true;
  else
    v_plan := coalesce(v_plan, 'free');
  end if;

  -- The dunning rules still apply, but only to what the ACCOUNT says. A stated
  -- plan comes from a payment that succeeded, so a stale past_due on the row
  -- must not refuse the very grant that payment earned.
  if not v_stated and v_plan in ('pro', 'premium') then
    if coalesce(v_status, '') = 'past_due' then
      return query select false, 'payment_retrying'::text, 0;
      return;

    elsif coalesce(v_status, '') not in ('active', 'trialing') then
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

  insert into public.credit_grants (user_id, grant_key, plan, credits, period_start, period_end, source)
  values (p_user_id, p_grant_key, v_plan, v_credits, p_period_start, p_period_end, p_source)
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
         -- A stated plan is written to the account: the event that proves the
         -- purchase is also the one that records it.
         subscription_plan    = case when v_fell then 'free'
                                     when v_stated then v_plan
                                     else p.subscription_plan end,
         subscription_status  = case when v_fell then null
                                     when v_stated and v_plan <> 'free' then 'active'
                                     else p.subscription_status end,
         scheduled_plan       = case when v_fell then null else p.scheduled_plan end,
         cancel_at_period_end = case when v_fell then false else p.cancel_at_period_end end
   where p.id = p_user_id;

  return query select true, (case when v_fell then 'downgraded_to_free' else 'granted' end)::text, v_credits;
end;
$function$;

revoke all on function public.grant_period_credits(uuid, text, timestamptz, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.grant_period_credits(uuid, text, timestamptz, timestamptz, text, text) to service_role;


-- apply_plan_change now states the plan it is applying, and says so.
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

  if v_rank_new = v_rank_cur then
    update public.profiles
       set scheduled_plan = null, cancel_at_period_end = false
     where id = p_user_id;
    return query select 'unchanged'::text, false, 'same_plan'::text, 0, v_end;
    return;
  end if;

  if v_rank_new < v_rank_cur then
    update public.profiles
       set scheduled_plan       = p_new_plan,
           cancel_at_period_end = (p_new_plan = 'free')
     where id = p_user_id;

    return query select 'scheduled'::text, false, 'applies_at_period_end'::text, 0, v_end;
    return;
  end if;

  if v_current = 'free' or v_start is null or v_end is null or v_end <= now() then
    v_start := now();
    v_end   := now() + interval '1 month';
  end if;

  update public.profiles
     set subscription_plan    = p_new_plan,
         subscription_status  = 'active',
         scheduled_plan       = null,
         cancel_at_period_end = false
   where id = p_user_id;

  -- The same key space invoice.paid uses, so the two events that describe one
  -- purchase collide on one key and grant once, in either order.
  v_key := 'changement:' || v_start::date || ':' || p_new_plan;

  select * into v_result
    from public.grant_period_credits(p_user_id, v_key, v_start, v_end, p_new_plan, 'plan_change');

  return query select 'upgraded'::text, v_result.granted, v_result.reason, v_result.credits, v_end;
end;
$function$;

revoke all on function public.apply_plan_change(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_plan_change(uuid, text) to service_role;


-- renew_due_periods says where its grants come from too.
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
      from public.grant_period_credits(v_row.id, 'period:' || v_start::date, v_start, v_end, null, 'renewal');

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


do $$
begin
  if to_regprocedure('public.grant_period_credits(uuid, text, timestamptz, timestamptz)') is not null then
    raise exception 'the four-argument grant still exists beside the six-argument one';
  end if;

  if to_regprocedure('public.grant_period_credits(uuid, text, timestamptz, timestamptz, text, text)') is null then
    raise exception 'the self-sufficient grant is missing';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'credit_grants' and column_name = 'source') then
    raise exception 'credit_grants.source is missing';
  end if;

  if has_function_privilege('authenticated', 'public.grant_period_credits(uuid, text, timestamptz, timestamptz, text, text)', 'EXECUTE') then
    raise exception 'the grant is reachable by a client';
  end if;
end;
$$;
