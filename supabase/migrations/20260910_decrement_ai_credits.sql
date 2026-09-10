-- AI credit consumption.
--
-- lib/subscription/access.ts has called decrement_ai_credits since the
-- subscription system was written, but the function was never created. The RPC
-- returned PGRST202, consumeFeature discarded the error with `.then(() =>
-- undefined)`, and nothing surfaced. Credits were therefore never deducted and
-- feature_usage stayed empty from day one — confirmed against production: an
-- account created in May still holds its default 10 credits, and feature_usage
-- has 0 rows across both accounts.
--
-- This is the missing function. It also writes the usage row, so the two facts
-- that must agree — the balance and the audit trail — are written together
-- instead of by two independent callers that can diverge.
--
-- Identity is a parameter, and that is safe only because of how it is reached:
-- EXECUTE is granted to service_role alone, so the browser cannot call this at
-- all, and the one call site derives p_user_id from supabase.auth.getUser() on
-- the server. A user id is never accepted from the client.
--
-- SECURITY DEFINER is what lets this work alongside the column-level lockdown
-- on profiles: anon and authenticated no longer hold UPDATE on
-- ai_credits_remaining, and they do not need to — the decrement happens here,
-- as the function owner. `set search_path` is not decoration: without it a
-- caller able to influence search_path could shadow `profiles` with their own
-- table and have this function write there.

create or replace function public.decrement_ai_credits(
  p_user_id uuid,
  p_feature text,
  p_amount  integer
)
returns table (consumed boolean, remaining integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining integer;
  v_consumed  boolean := false;
begin
  if p_user_id is null then
    raise exception 'decrement_ai_credits: p_user_id is required';
  end if;
  if p_feature is null or length(p_feature) = 0 then
    raise exception 'decrement_ai_credits: p_feature is required';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'decrement_ai_credits: p_amount must be >= 0, got %', p_amount;
  end if;

  if p_amount = 0 then
    -- Premium tiers are configured with credits: 0. Nothing to deduct, but the
    -- use still belongs in the audit trail. The profile must exist all the same:
    -- an account we hold no record for is not entitled to a free pass.
    select coalesce(ai_credits_remaining, 0)
      into v_remaining
      from public.profiles
     where id = p_user_id;

    v_consumed := found;
  else
    -- One statement. The balance check lives in the WHERE clause rather than in
    -- a preceding SELECT, so concurrent callers serialise on the row lock and
    -- the last credit cannot be spent twice. A check-then-update would let two
    -- requests both read "1 remaining" and both proceed.
    --
    -- The `>= p_amount` guard is also the floor: the balance can reach exactly
    -- zero and never goes negative, so no CASE or GREATEST is needed.
    --
    -- coalesce because ai_credits_remaining is nullable. Without it, NULL fails
    -- the comparison silently and the account is locked out of every paid
    -- feature with no error to explain why. NULL is read as zero, which matches
    -- what canUseFeature already does on the read path (`?? 0`).
    update public.profiles
       set ai_credits_remaining = coalesce(ai_credits_remaining, 0) - p_amount
     where id = p_user_id
       and coalesce(ai_credits_remaining, 0) >= p_amount
    returning ai_credits_remaining into v_remaining;

    v_consumed := found;

    if not v_consumed then
      -- Report the real balance so the caller can distinguish "insufficient"
      -- from "no such profile". Informational only, outside the atomic step.
      select coalesce(ai_credits_remaining, 0)
        into v_remaining
        from public.profiles
       where id = p_user_id;
    end if;
  end if;

  -- Usage is recorded only when the charge succeeded. A refused request is not
  -- usage, and writing it would corrupt the time-window counts that
  -- canUseFeature reads back from this table.
  if v_consumed then
    insert into public.feature_usage (user_id, feature_key)
    values (p_user_id, p_feature);
  end if;

  return query select v_consumed, coalesce(v_remaining, 0);
end;
$$;

-- service_role only. The browser must never reach this: anon and authenticated
-- have just been stripped of UPDATE on ai_credits_remaining, and a callable
-- SECURITY DEFINER function would hand that capability straight back.
revoke all on function public.decrement_ai_credits(uuid, text, integer) from public;
revoke all on function public.decrement_ai_credits(uuid, text, integer) from anon, authenticated;
grant execute on function public.decrement_ai_credits(uuid, text, integer) to service_role;
