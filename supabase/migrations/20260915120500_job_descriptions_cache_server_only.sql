-- job_descriptions_cache: server-only.
--
-- The table was open to every signed-in user through the policy
-- authenticated_all (ALL, using true, check true): any account could rewrite
-- the cached description of any job offer. That description is shown on the
-- jobs page and fed to auto-apply's CV tailoring — so one account could put
-- words into the CV that auto-apply sends, for another user, to a real
-- recruiter. Content injection with a shared blast radius (raised and decided
-- 2026-09-15, urgent).
--
-- Nothing on the client reads or writes this table: getFullDescription is its
-- only user, on the server, and now uses the service role for both. Clients
-- lose every privilege, reads included; row level security stays on with no
-- policy, so a grant added back by mistake still exposes no row.

drop policy if exists authenticated_all on public.job_descriptions_cache;

revoke all on public.job_descriptions_cache from anon, authenticated;

alter table public.job_descriptions_cache enable row level security;


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
declare
  v_role text;
  v_priv text;
begin
  foreach v_role in array array['anon', 'authenticated']
  loop
    foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
    loop
      if has_table_privilege(v_role, 'public.job_descriptions_cache', v_priv) then
        raise exception 'job_descriptions_cache: % still holds %', v_role, v_priv;
      end if;
    end loop;

    foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']
    loop
      if has_any_column_privilege(v_role, 'public.job_descriptions_cache', v_priv) then
        raise exception 'job_descriptions_cache: % still holds % on a column', v_role, v_priv;
      end if;
    end loop;
  end loop;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'job_descriptions_cache') then
    raise exception 'job_descriptions_cache: a policy remains';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.job_descriptions_cache'::regclass) then
    raise exception 'job_descriptions_cache: row level security is off';
  end if;

  if not (has_table_privilege('service_role', 'public.job_descriptions_cache', 'SELECT')
      and has_table_privilege('service_role', 'public.job_descriptions_cache', 'INSERT')
      and has_table_privilege('service_role', 'public.job_descriptions_cache', 'UPDATE')) then
    raise exception 'job_descriptions_cache: the service role lost access';
  end if;
end;
$$;
