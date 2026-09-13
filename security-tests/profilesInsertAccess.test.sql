-- Security regression test for harden_profiles_insert_access.
--
-- Run it: paste the whole file into the Supabase SQL editor, as the postgres
-- role. Not through the MCP execute_sql tool: it runs every query in a
-- read-only transaction, and the fixture insert fails with 25006.
--
-- It is one DO block that ALWAYS ends by raising an exception. That is what
-- guarantees nothing it writes survives — the fixture user, the profile rows,
-- the temporary edits to admin_settings, every attempt — and it is also how the
-- report comes back, since not every client shows NOTICEs. Read the error:
--
--   RESULT: all N checks passed — test data rolled back
--   RESULT: K FAILED, N ok — test data rolled back
--
-- It impersonates a signed-in user the way PostgREST does — SET ROLE
-- authenticated plus request.jwt.claims — so the real grants, RLS policies,
-- trigger and constraints are exercised. It does not go through PostgREST or
-- supabase-js; that needs a real test account.
--
-- Missing grants and RLS violations both raise SQLSTATE 42501, so checks that
-- must be refused by a GRANT match on the message as well.
--
-- An attempt that should be refused but succeeds is undone by raising the
-- private SQLSTATE JVT01 inside its own sub-block, so one breach does not
-- corrupt the checks after it.

do $test$
declare
  v_uid      uuid    := gen_random_uuid();
  v_log      text    := '';
  v_ok       integer := 0;
  v_fail     integer := 0;
  v_count    integer;
  v_case     record;
  v_alias    text;
  v_role     text;
  v_priv     text;
  v_row      public.profiles;
  v_settings jsonb;
  v_raw      text;
  v_expected integer;
begin
  -- ─── Fixture, as postgres ──────────────────────────────────────────────────

  insert into auth.users (id, email)
  values (v_uid, 'profiles-test-' || v_uid || '@invalid.local');

  insert into public.profiles (id) values (v_uid);

  select value into v_settings from public.admin_settings where key = 'global';

  -- Same rule as the trigger: a valid trial_credits, otherwise 10.
  v_raw      := v_settings -> 'limits' ->> 'trial_credits';
  v_expected := case when v_raw ~ '^[0-9]{1,6}$' then v_raw::integer else 10 end;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text,
    true
  );


  -- ─── T1. A user cannot delete their own profile ────────────────────────────

  set local role authenticated;

  begin
    delete from public.profiles where id = v_uid;
    get diagnostics v_count = row_count;
    if v_count > 0 then
      raise exception using errcode = 'JVT01';
    end if;
    v_ok  := v_ok + 1;
    v_log := v_log || E'\nok    T1 delete own profile: 0 rows affected';
  exception
    when sqlstate 'JVT01' then
      v_fail := v_fail + 1;
      v_log  := v_log || E'\nFAIL  T1 authenticated deleted its own profile row';
    when insufficient_privilege then
      v_ok  := v_ok + 1;
      v_log := v_log || E'\nok    T1 delete own profile: ' || sqlerrm;
  end;


  -- ─── T2/T3. With no row yet, a user cannot insert a paid or padded one ─────
  --
  -- The row is removed as postgres first: that is the real state between signUp
  -- and onboarding, and without it the INSERT would fail on the primary key and
  -- pass for the wrong reason.

  reset role;
  delete from public.profiles where id = v_uid;
  set local role authenticated;

  for v_case in
    select * from (values
      ('T2', 'subscription_plan',       $v$'premium'$v$),
      ('T3', 'trial_ends_at',           $v$now() + interval '10 years'$v$),
      ('T3', 'subscription_started_at', $v$now()$v$),
      ('T3', 'ai_credits_remaining',    $v$999999$v$),
      ('T3', 'ai_credits_reset_at',     $v$now() + interval '10 years'$v$),
      ('T3', 'is_blocked',              $v$false$v$),
      ('T3', 'created_at',              $v$now() - interval '1 year'$v$)
    ) as t(test, col, val)
  loop
    begin
      execute format('insert into public.profiles (id, %I) values (%L, %s)', v_case.col, v_uid, v_case.val);
      raise exception using errcode = 'JVT01';
    exception
      when sqlstate 'JVT01' then
        v_fail := v_fail + 1;
        v_log  := v_log || format(E'\nFAIL  %s authenticated inserted a row setting %s', v_case.test, v_case.col);
      when insufficient_privilege then
        if sqlerrm like 'permission denied%' then
          v_ok  := v_ok + 1;
          v_log := v_log || format(E'\nok    %s insert setting %s: %s', v_case.test, v_case.col, sqlerrm);
        else
          v_fail := v_fail + 1;
          v_log  := v_log || format(E'\nFAIL  %s %s refused by RLS, not by the grant: %s', v_case.test, v_case.col, sqlerrm);
        end if;
    end;
  end loop;


  -- ─── T4. Onboarding still creates the row, with the trial grant ────────────
  --
  -- Same columns as the OnboardingModal upsert, which is what creates the row.

  begin
    insert into public.profiles (
      id, full_name, phone, location, target_job_title, sector,
      contract_type, work_type, target_country, onboarding_completed, updated_at
    ) values (
      v_uid, 'Security Test', null, null, null, null,
      null, null, null, true, now()
    );
    v_ok  := v_ok + 1;
    v_log := v_log || E'\nok    T4 onboarding insert accepted';
  exception when others then
    v_fail := v_fail + 1;
    v_log  := v_log || E'\nFAIL  T4 onboarding insert refused: ' || sqlerrm;
  end;

  select * into v_row from public.profiles where id = v_uid;

  if not found then
    v_fail := v_fail + 1;
    v_log  := v_log || E'\nFAIL  T4 no row to inspect';
  else
    if v_row.subscription_plan is null then
      v_ok  := v_ok + 1;
      v_log := v_log || E'\nok    T4 subscription_plan = null';
    else
      v_fail := v_fail + 1;
      v_log  := v_log || format(E'\nFAIL  T4 subscription_plan = %s, want null', v_row.subscription_plan);
    end if;

    if v_row.ai_credits_remaining is distinct from v_expected then
      v_fail := v_fail + 1;
      v_log  := v_log || format(E'\nFAIL  T4 ai_credits_remaining = %s, want %s', v_row.ai_credits_remaining, v_expected);
    else
      v_ok  := v_ok + 1;
      v_log := v_log || format(E'\nok    T4 ai_credits_remaining = %s', v_row.ai_credits_remaining);
    end if;

    if v_row.trial_ends_at is distinct from now() + interval '3 days' then
      v_fail := v_fail + 1;
      v_log  := v_log || format(E'\nFAIL  T4 trial_ends_at = now() + %s, want now() + 3 days', v_row.trial_ends_at - now());
    else
      v_ok  := v_ok + 1;
      v_log := v_log || E'\nok    T4 trial_ends_at = now() + 3 days';
    end if;
  end if;


  -- ─── T5. The trigger overwrites supplied values, even from postgres ────────

  reset role;
  delete from public.profiles where id = v_uid;

  begin
    insert into public.profiles (id, trial_ends_at, ai_credits_remaining)
    values (v_uid, now() + interval '10 years', 999999);

    select * into v_row from public.profiles where id = v_uid;

    if v_row.ai_credits_remaining = v_expected
       and v_row.trial_ends_at = now() + interval '3 days' then
      v_ok  := v_ok + 1;
      v_log := v_log || E'\nok    T5 trigger overwrote credits=999999 and trial=+10 years';
    else
      v_fail := v_fail + 1;
      v_log  := v_log || format(E'\nFAIL  T5 supplied values kept: credits = %s, trial_ends_at = now() + %s',
                                 v_row.ai_credits_remaining, v_row.trial_ends_at - now());
    end if;
  exception when others then
    v_fail := v_fail + 1;
    v_log  := v_log || E'\nFAIL  T5 insert as postgres failed: ' || sqlerrm;
  end;


  -- ─── T5b. A broken trial_credits never blocks profile creation ─────────────
  --
  -- Each case edits admin_settings, inserts a fresh row, and expects 10 credits
  -- and no error. The original settings are restored afterwards so the checks
  -- below run against the real configuration.

  foreach v_raw in array array['<missing>', 'abc', '-3', '99999999999']
  loop
    begin
      delete from public.profiles where id = v_uid;

      if v_raw = '<missing>' then
        update public.admin_settings
           set value = value #- '{limits,trial_credits}'
         where key = 'global';
      else
        update public.admin_settings
           set value = jsonb_set(value, '{limits,trial_credits}', to_jsonb(v_raw), true)
         where key = 'global';
      end if;

      insert into public.profiles (id) values (v_uid);
      select * into v_row from public.profiles where id = v_uid;

      if v_row.ai_credits_remaining = 10 then
        v_ok  := v_ok + 1;
        v_log := v_log || format(E'\nok    T5b trial_credits = %s: insert accepted, 10 credits', v_raw);
      else
        v_fail := v_fail + 1;
        v_log  := v_log || format(E'\nFAIL  T5b trial_credits = %s: row got %s credits, want 10', v_raw, v_row.ai_credits_remaining);
      end if;
    exception when others then
      v_fail := v_fail + 1;
      v_log  := v_log || format(E'\nFAIL  T5b trial_credits = %s: insert blocked: %s', v_raw, sqlerrm);
    end;
  end loop;

  update public.admin_settings set value = v_settings where key = 'global';

  -- Leave a row in place for T6 and T7, whatever happened above.
  if not exists (select 1 from public.profiles where id = v_uid) then
    insert into public.profiles (id) values (v_uid);
  end if;


  -- ─── T6. The upsert path cannot smuggle a paid plan either ─────────────────
  --
  -- PostgREST upserts as INSERT ... ON CONFLICT (id) DO UPDATE. The row exists,
  -- so this exercises the conflict branch.

  set local role authenticated;

  begin
    insert into public.profiles (id, subscription_plan)
    values (v_uid, 'premium')
    on conflict (id) do update set subscription_plan = excluded.subscription_plan;
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then
      v_fail := v_fail + 1;
      v_log  := v_log || E'\nFAIL  T6 upsert set subscription_plan';
    when insufficient_privilege then
      v_ok  := v_ok + 1;
      v_log := v_log || E'\nok    T6 upsert setting subscription_plan: ' || sqlerrm;
  end;

  begin
    insert into public.profiles (id, notify_email_alerts, notify_job_alerts, notify_weekly_report)
    values (v_uid, true, true, false)
    on conflict (id) do update set
      notify_email_alerts  = excluded.notify_email_alerts,
      notify_job_alerts    = excluded.notify_job_alerts,
      notify_weekly_report = excluded.notify_weekly_report;
    v_ok  := v_ok + 1;
    v_log := v_log || E'\nok    T6 settings upsert on an existing row accepted';
  exception when others then
    v_fail := v_fail + 1;
    v_log  := v_log || E'\nFAIL  T6 settings upsert refused: ' || sqlerrm;
  end;


  -- ─── T7. Reserved aliases are refused, others are not ──────────────────────

  foreach v_alias in array array['support', 'admin', 'Billing', 'no-reply', 'postmaster', 'jobvero', 'reply', 'apply']
  loop
    begin
      update public.profiles set email_alias = v_alias where id = v_uid;
      get diagnostics v_count = row_count;
      raise exception using errcode = 'JVT01';
    exception
      when sqlstate 'JVT01' then
        v_fail := v_fail + 1;
        v_log  := v_log || format(E'\nFAIL  T7 alias %s accepted (%s row)', v_alias, v_count);
      when check_violation then
        v_ok  := v_ok + 1;
        v_log := v_log || format(E'\nok    T7 alias %s refused', v_alias);
      when unique_violation then
        v_fail := v_fail + 1;
        v_log  := v_log || format(E'\nFAIL  T7 alias %s only stopped because another account already holds it', v_alias);
    end;
  end loop;

  begin
    update public.profiles set email_alias = 'supportfan' || left(replace(v_uid::text, '-', ''), 8) where id = v_uid;
    get diagnostics v_count = row_count;
    if v_count = 1 then
      v_ok  := v_ok + 1;
      v_log := v_log || E'\nok    T7 non-reserved alias supportfan… accepted (exact match only)';
    else
      v_fail := v_fail + 1;
      v_log  := v_log || E'\nFAIL  T7 non-reserved alias update matched no row';
    end if;
  exception when others then
    v_fail := v_fail + 1;
    v_log  := v_log || E'\nFAIL  T7 non-reserved alias refused: ' || sqlerrm;
  end;


  -- ─── T8. anon cannot insert at all ─────────────────────────────────────────

  reset role;
  delete from public.profiles where id = v_uid;
  set local role anon;

  begin
    insert into public.profiles (id) values (v_uid);
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then
      v_fail := v_fail + 1;
      v_log  := v_log || E'\nFAIL  T8 anon inserted a profile row';
    when insufficient_privilege then
      if sqlerrm like 'permission denied%' then
        v_ok  := v_ok + 1;
        v_log := v_log || E'\nok    T8 anon insert: ' || sqlerrm;
      else
        v_fail := v_fail + 1;
        v_log  := v_log || E'\nFAIL  T8 anon stopped by RLS only, INSERT grant still present: ' || sqlerrm;
      end if;
  end;


  -- ─── T9. No stray table privileges ─────────────────────────────────────────

  reset role;

  foreach v_role in array array['anon', 'authenticated']
  loop
    foreach v_priv in array array['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
    loop
      if has_table_privilege(v_role, 'public.profiles', v_priv) then
        v_fail := v_fail + 1;
        v_log  := v_log || format(E'\nFAIL  T9 %s holds %s on profiles', v_role, v_priv);
      else
        v_ok  := v_ok + 1;
        v_log := v_log || format(E'\nok    T9 %s has no %s on profiles', v_role, v_priv);
      end if;
    end loop;
  end loop;


  -- ─── Report, and roll everything back ──────────────────────────────────────
  --
  -- Every check writes exactly one line, starting with "ok " or "FAIL ", and
  -- bumps exactly one of v_ok / v_fail. The log is split into lines and each
  -- line is classified on its own: a line starting with neither counts as a
  -- failure. The classified counts must agree with the counters, and their
  -- total with the number of checks this file runs — loop iterations included —
  -- so a branch that writes nothing, a check that never ran, or a NULL that
  -- wiped the log is reported as a failure instead of passing.
  --
  -- Adding or removing a check means updating c_expected_checks.

  declare
    c_expected_checks constant integer := 37;
    v_counted_ok      constant integer := v_ok;
    v_counted_fail    constant integer := v_fail;
    v_unclassified    integer;
    v_total           integer;
  begin
    select count(*) filter (where line like 'ok %'),
           count(*) filter (where line like 'FAIL %'),
           count(*) filter (where line not like 'ok %' and line not like 'FAIL %')
      into v_ok, v_fail, v_unclassified
      from regexp_split_to_table(coalesce(v_log, ''), E'\n') as line
     where line <> '';

    v_total := v_ok + v_fail + v_unclassified;

    if v_ok <> v_counted_ok or v_fail <> v_counted_fail then
      v_log  := coalesce(v_log, '')
             || format(E'\nFAIL  REPORT counters say %s ok / %s FAIL, the log holds %s ok / %s FAIL',
                       v_counted_ok, v_counted_fail, v_ok, v_fail);
      v_fail := v_fail + 1;
    end if;

    if v_unclassified > 0 then
      v_fail := v_fail + v_unclassified;
      v_log  := coalesce(v_log, '')
             || format(E'\nFAIL  REPORT %s log line(s) start with neither "ok" nor "FAIL"', v_unclassified);
    end if;

    if v_total <> c_expected_checks then
      v_fail := v_fail + 1;
      v_log  := coalesce(v_log, '')
             || format(E'\nFAIL  REPORT expected %s checks, the log holds %s', c_expected_checks, v_total);
    end if;

    raise exception using
      errcode = 'JVT00',
      message = case
                  when v_fail = 0 then format('RESULT: all %s checks passed — test data rolled back', v_ok)
                  else format('RESULT: %s FAILED, %s ok — test data rolled back', v_fail, v_ok)
                end || coalesce(v_log, '');
  end;
end;
$test$;
