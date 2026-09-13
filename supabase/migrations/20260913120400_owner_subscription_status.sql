-- Owner account: record its premium plan as an active subscription (decision D1).
--
-- entitlements.resolveTier grants a paid tier only when subscription_status is
-- 'active' or 'trialing'. A null status is never paid access — that is what a
-- plan set by hand looks like, and trusting it is the hole resolveTier closes.
-- The owner's premium plan was set by hand before Stripe existed, so without
-- this the owner account would drop to free the day resolveTier ships.
--
-- stripe_subscription_id stays null on purpose: there is no Stripe
-- subscription behind this plan. Consequence, accepted: no invoice.paid will
-- ever reset this account's credits; they are topped up by hand.
--
-- Matched on the alias and the plan rather than an id, so no generated id is
-- written into a migration. email_alias is unique, and the assertion requires
-- the row to end up exactly as intended. Re-running it changes nothing.

do $$
declare
  v_count integer;
begin
  update public.profiles
     set subscription_status = 'active'
   where email_alias = 'hamza'
     and subscription_plan = 'premium'
     and stripe_subscription_id is null
     and subscription_status is distinct from 'active';

  get diagnostics v_count = row_count;

  if v_count > 1 then
    raise exception 'owner_subscription_status: % rows matched, expected at most one', v_count;
  end if;

  if not exists (
    select 1
      from public.profiles
     where email_alias = 'hamza'
       and subscription_plan = 'premium'
       and subscription_status = 'active'
       and stripe_subscription_id is null
  ) then
    raise exception 'owner_subscription_status: the owner row is not premium / active / without a Stripe subscription';
  end if;
end;
$$;
