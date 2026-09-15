-- Test accounts: a flag, so they can be kept out of the user counts.
--
-- The end-to-end billing test (security-tests/aiBillingE2E.test.js) signs in as
-- a real account against the production database — there is no other — and
-- the ledger rows of its first run are, for now, the only real cost data the
-- margin view has. The account is kept, but must not count as a user. A prefix
-- on full_name makes it recognisable in the admin screens; only a column can be
-- filtered on reliably, so it gets both.
--
-- Clients get no privilege on the column: INSERT and UPDATE on profiles are
-- column-level grants (harden_profiles_write_access,
-- harden_profiles_insert_access), and a new column is in neither list.
--
-- To delete right before launch: every account with is_test_account = true.

alter table public.profiles
  add column if not exists is_test_account boolean not null default false;

-- The throwaway account created by the first end-to-end run (2026-09-15),
-- matched on its generated email rather than on a hard-coded id.
update public.profiles p
   set is_test_account = true,
       full_name       = '[TEST] AI billing E2E'
  from auth.users u
 where u.id = p.id
   and u.email like 'ai-e2e-%@example.com';


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
declare
  v_role text;
  v_priv text;
begin
  if (select count(*) from public.profiles where is_test_account) <> 1 then
    raise exception 'profiles: expected exactly one test account, found %',
      (select count(*) from public.profiles where is_test_account);
  end if;

  foreach v_role in array array['anon', 'authenticated']
  loop
    foreach v_priv in array array['INSERT', 'UPDATE']
    loop
      if has_column_privilege(v_role, 'public.profiles', 'is_test_account', v_priv) then
        raise exception 'profiles.is_test_account is writable by % via %', v_role, v_priv;
      end if;
    end loop;
  end loop;
end;
$$;
