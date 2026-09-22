-- The webhook events left by the end-to-end proof.
--
-- stripe_events is the replay guard: one row per event id ever handled. The
-- rows it held were all received on 2026-09-18 between 11:25 and 11:33, during
-- two test-mode runs whose disposable accounts have since been deleted.
--
-- The table carries no account column, so "does this row concern a real
-- customer" cannot be asked of the row itself. It can be asked of the accounts:
-- if NO profile has ever had a Stripe customer, then no row here can belong to
-- one. That is the guard below, and it is what makes this safe -- and what
-- makes it refuse to run again once a real customer exists.
--
-- IN PRODUCTION THIS TABLE IS NEVER PURGED without a retention policy decided
-- explicitly. Deleting a row here re-opens the door to replaying the event it
-- recorded.

do $$
declare
  v_customers integer;
  v_deleted   integer;
  v_before    integer;
begin
  select count(*) into v_customers
    from public.profiles
   where stripe_customer_id is not null or stripe_subscription_id is not null;

  if v_customers > 0 then
    raise exception
      'refusing to purge: % account(s) have a Stripe customer, so these rows are no longer provably test-only',
      v_customers;
  end if;

  select count(*) into v_before from public.stripe_events;

  delete from public.stripe_events;
  get diagnostics v_deleted = row_count;

  raise notice 'stripe_events: % row(s) removed of % present', v_deleted, v_before;

  if (select count(*) from public.stripe_events) <> 0 then
    raise exception 'stripe_events is not empty after the purge';
  end if;
end;
$$;
