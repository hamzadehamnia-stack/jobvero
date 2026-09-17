-- Inbox counters whose account no longer exists.
--
-- inbox_classify_counters.subject is free text: it holds a user id for the
-- 'alias' and 'month' scopes and the literal 'global' for the daily ceiling.
-- That is why it carries no foreign key, and why nothing about it cascades when
-- an account is deleted -- the rows simply stay, counting against a user who is
-- gone. They are never read again, but they accumulate, and the first ones were
-- left by a test that created disposable accounts and deleted them.
--
-- This clears the ones already stranded. The guard against more of them is at
-- the source: whatever deletes an account deletes its counters, which is what
-- security-tests/planChanges.test.js now does for the accounts it creates.
--
-- 'global' is matched by neither predicate and is left alone.

delete from public.inbox_classify_counters c
 where c.scope in ('alias', 'month')
   and c.subject ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and not exists (select 1 from public.profiles p where p.id::text = c.subject);


do $$
declare
  v_orphans integer;
  v_global  integer;
begin
  select count(*) into v_orphans
    from public.inbox_classify_counters c
   where c.scope in ('alias', 'month')
     and c.subject ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and not exists (select 1 from public.profiles p where p.id::text = c.subject);

  if v_orphans > 0 then
    raise exception '% orphan inbox counter(s) survived the cleanup', v_orphans;
  end if;

  -- The daily ceiling every alias shares must not have been swept up with them.
  select count(*) into v_global
    from public.inbox_classify_counters c
   where c.scope = 'global' and c.day = current_date;

  if v_global > 1 then
    raise exception 'more than one global counter for today: %', v_global;
  end if;
end;
$$;
