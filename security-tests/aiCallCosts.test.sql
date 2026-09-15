-- Test for the deferred AI call cost functions and the margin view (step 2d).
--
-- Run it: paste the whole file into the Supabase SQL editor, as the postgres
-- role, AFTER applying 20260914120100_ai_call_cost_pending.sql. Not through the
-- MCP execute_sql tool: it runs in a read-only transaction.
--
-- One DO block that ALWAYS ends by raising, so nothing it writes survives.
-- Read the error:
--
--   RESULT: all N checks passed — test data rolled back
--   RESULT: K FAILED, N ok — test data rolled back
--
-- claim_pending_ai_call_costs() is called for real, so it also claims any real
-- pending row due at that moment — inside this transaction, rolled back with
-- everything else. The margin view check compares totals before and after the
-- fixture rows, so real data in the same week does not affect it.
--
-- Guarded like the other SQL tests: every log line is classified, and the total
-- must equal c_expected_checks.

do $test$
declare
  v_uid       uuid    := gen_random_uuid();
  v_log       text    := '';
  v_ok        integer;
  v_fail      integer;
  r           record;
  v_usage     uuid;
  v_call      bigint;
  v_call2     bigint;
  v_bool      boolean;
  v_n         integer;
  v_att       integer;
  v_settled0  numeric;
  v_refunded0 numeric;
  v_system0   numeric;
  v_settled1  numeric;
  v_refunded1 numeric;
  v_system1   numeric;
begin
  -- ─── Fixture: a user with a reserved quick_write charge ────────────────────

  insert into auth.users (id, email)
  values (v_uid, 'ai-cost-test-' || v_uid || '@invalid.local');

  insert into public.profiles (id) values (v_uid);
  update public.profiles set ai_credits_remaining = 20 where id = v_uid;

  select * into r from public.reserve_ai_credits_for(v_uid, 'quick_write', 'k-cost');
  v_usage := r.usage_id;


  -- ─── T1. Service role only ─────────────────────────────────────────────────

  v_log := v_log || case when
        not has_function_privilege('anon',          'public.record_ai_call_pending(uuid, text, text, text, text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.record_ai_call_pending(uuid, text, text, text, text)', 'EXECUTE')
    and not has_function_privilege('anon',          'public.complete_ai_call_cost(bigint, integer, integer, numeric)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.complete_ai_call_cost(bigint, integer, integer, numeric)', 'EXECUTE')
    and not has_function_privilege('anon',          'public.claim_pending_ai_call_costs(integer)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.claim_pending_ai_call_costs(integer)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.record_ai_call_pending(uuid, text, text, text, text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.complete_ai_call_cost(bigint, integer, integer, numeric)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.claim_pending_ai_call_costs(integer)', 'EXECUTE')
    then E'\nok    T1 privileges: the three functions are service_role only'
    else E'\nFAIL  T1 function privileges do not match the design'
  end;


  -- ─── T2. A signed-in user cannot complete a cost ───────────────────────────

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);

  set local role authenticated;
  begin
    perform public.complete_ai_call_cost(1, 1, 1, 0.01);
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01'       then v_log := v_log || E'\nFAIL  T2 authenticated completed a call cost';
    when insufficient_privilege then v_log := v_log || E'\nok    T2 authenticated calling complete_ai_call_cost: permission denied';
    when others                 then v_log := v_log || format(E'\nFAIL  T2 expected 42501, got %s: %s', sqlstate, sqlerrm);
  end;
  reset role;


  -- ─── T3. A pending call keeps its generation id and has no cost yet ────────

  v_call := public.record_ai_call_pending(v_usage, 'model', 'deepseek/deepseek-v3.2', 'gen-test-1');

  v_log := v_log || case
    when (select cost_status = 'pending' and generation_id = 'gen-test-1' and cost_usd is null
             and cost_attempts = 0 and cost_next_attempt_at = now() + interval '1 minute'
            from public.ai_usage_calls where id = v_call)
     and (select coalesce(cost_usd, 0) = 0 and model = 'deepseek/deepseek-v3.2'
            from public.ai_usage where id = v_usage)
    then E'\nok    T3 pending call: generation id kept, no cost yet, first attempt in 1 minute'
    else E'\nFAIL  T3 pending call row is wrong'
  end;


  -- ─── T4. A pending call needs a generation id ──────────────────────────────

  begin
    perform public.record_ai_call_pending(v_usage, 'model', 'x', '');
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then v_log := v_log || E'\nFAIL  T4 an empty generation id was accepted';
    when sqlstate 'JV010' then v_log := v_log || E'\nok    T4 empty generation id: JV010';
    when others           then v_log := v_log || format(E'\nFAIL  T4 expected JV010, got %s: %s', sqlstate, sqlerrm);
  end;


  -- ─── T5. Completion lands on the call and on the ledger row ────────────────

  v_bool := public.complete_ai_call_cost(v_call, 100, 50, 0.012);

  v_log := v_log || case
    when v_bool
     and (select cost_status = 'final' and cost_usd = 0.012 and prompt_tokens = 100
             and completion_tokens = 50 and cost_next_attempt_at is null
            from public.ai_usage_calls where id = v_call)
     and (select cost_usd = 0.012 and prompt_tokens = 100 and completion_tokens = 50
            from public.ai_usage where id = v_usage)
    then E'\nok    T5 completed: call final, cost and tokens added to the ledger row'
    else E'\nFAIL  T5 completion did not land on the call and the ledger row'
  end;


  -- ─── T6. A second completion changes nothing ───────────────────────────────

  v_bool := public.complete_ai_call_cost(v_call, 100, 50, 0.012);

  v_log := v_log || case
    when not v_bool and (select cost_usd = 0.012 from public.ai_usage where id = v_usage)
    then E'\nok    T6 a second completion is a no-op: the cost is not counted twice'
    else E'\nFAIL  T6 a second completion changed the ledger'
  end;


  -- ─── T7. A completion needs a cost ─────────────────────────────────────────

  begin
    perform public.complete_ai_call_cost(v_call, 1, 1, null);
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then v_log := v_log || E'\nFAIL  T7 a completion without a cost was accepted';
    when sqlstate 'JV010' then v_log := v_log || E'\nok    T7 completion without a cost: JV010';
    when others           then v_log := v_log || format(E'\nFAIL  T7 expected JV010, got %s: %s', sqlstate, sqlerrm);
  end;


  -- ─── T8. Not claimed before its first attempt is due ───────────────────────

  v_call2 := public.record_ai_call_pending(v_usage, 'model', 'deepseek/deepseek-v3.2', 'gen-test-2');

  select count(*) into v_n from public.claim_pending_ai_call_costs(500) c where c.call_id = v_call2;

  v_log := v_log || case
    when v_n = 0
    then E'\nok    T8 a pending call is not claimed before its first attempt is due'
    else E'\nFAIL  T8 a pending call was claimed before it was due'
  end;


  -- ─── T9. Claimed once when due, next attempt booked ────────────────────────

  update public.ai_usage_calls set cost_next_attempt_at = now() - interval '1 second' where id = v_call2;

  select count(*), max(c.attempt) into v_n, v_att
    from public.claim_pending_ai_call_costs(500) c
   where c.call_id = v_call2;

  v_log := v_log || case
    when v_n = 1 and v_att = 1
     and (select cost_attempts = 1 and cost_next_attempt_at = now() + interval '5 minutes'
            from public.ai_usage_calls where id = v_call2)
    then E'\nok    T9 a due call is claimed: attempt 1, next attempt booked in 5 minutes'
    else format(E'\nFAIL  T9 claim of a due call: claimed=%s attempt=%s', v_n, v_att)
  end;


  -- ─── T10. Not handed out twice ─────────────────────────────────────────────

  select count(*) into v_n from public.claim_pending_ai_call_costs(500) c where c.call_id = v_call2;

  v_log := v_log || case
    when v_n = 0
    then E'\nok    T10 a claimed call is not claimed again before its next attempt'
    else E'\nFAIL  T10 a claimed call was handed out twice'
  end;


  -- ─── T11. Given up after 6 attempts, never guessed ─────────────────────────

  update public.ai_usage_calls
     set cost_attempts = 6, cost_next_attempt_at = now() - interval '1 second'
   where id = v_call2;

  select count(*) into v_n from public.claim_pending_ai_call_costs(500) c where c.call_id = v_call2;

  v_log := v_log || case
    when v_n = 0
     and (select cost_status = 'unavailable' and cost_usd is null and cost_next_attempt_at is null
            from public.ai_usage_calls where id = v_call2)
    then E'\nok    T11 after 6 attempts: marked unavailable, no guessed cost'
    else E'\nFAIL  T11 an exhausted call was not marked unavailable'
  end;


  -- ─── T12. An unavailable call cannot be completed later ────────────────────

  v_bool := public.complete_ai_call_cost(v_call2, 10, 10, 0.5);

  v_log := v_log || case
    when not v_bool and (select cost_usd = 0.012 from public.ai_usage where id = v_usage)
    then E'\nok    T12 an unavailable call cannot be completed afterwards'
    else E'\nFAIL  T12 an unavailable call was completed'
  end;


  -- ─── T13. The margin view is service role only ─────────────────────────────

  v_log := v_log || case
    when not has_table_privilege('anon',          'public.ai_margin_weekly', 'SELECT')
     and not has_table_privilege('authenticated', 'public.ai_margin_weekly', 'SELECT')
     and     has_table_privilege('service_role',  'public.ai_margin_weekly', 'SELECT')
    then E'\nok    T13 margin view: no client role can read it, service_role can'
    else E'\nFAIL  T13 margin view privileges do not match the design'
  end;


  -- ─── T14. Settled, refunded and system costs land in separate columns ──────
  --
  -- Totals for this week, before and after three fixture actions: one settled
  -- customer action (the 0.012 above), one refunded customer action that had
  -- consumed 0.03 of tokens, one system action costing 0.02.

  select coalesce(sum(cost_settled_usd), 0), coalesce(sum(cost_refunded_usd), 0), coalesce(sum(cost_system_usd), 0)
    into v_settled0, v_refunded0, v_system0
    from public.ai_margin_weekly
   where week = date_trunc('week', now());

  perform public.settle_ai_usage(v_usage);

  select * into r from public.reserve_ai_credits_for(v_uid, 'match_score', 'k-refunded');
  perform public.record_ai_call(r.usage_id, 'model', 'test/model', 10, 10, 0.03);
  perform public.refund_ai_usage(r.usage_id, 'post-processing failed after the model answered');

  perform public.log_system_ai_usage(v_uid, 'system_email_finder', 'test/model', 1, 1, 0.02);

  select coalesce(sum(cost_settled_usd), 0), coalesce(sum(cost_refunded_usd), 0), coalesce(sum(cost_system_usd), 0)
    into v_settled1, v_refunded1, v_system1
    from public.ai_margin_weekly
   where week = date_trunc('week', now());

  v_log := v_log || case
    when v_settled1 - v_settled0 = 0.012
     and v_refunded1 - v_refunded0 = 0.03
     and v_system1 - v_system0 = 0.02
    then E'\nok    T14 margin view: +0.012 settled, +0.03 refunded, +0.02 system, never mixed'
    else format(E'\nFAIL  T14 margin view deltas: settled %s, refunded %s, system %s',
                v_settled1 - v_settled0, v_refunded1 - v_refunded0, v_system1 - v_system0)
  end;


  -- ─── Report, and roll everything back ──────────────────────────────────────
  --
  -- Every check writes exactly one line, starting with "ok " or "FAIL ". Each
  -- line is classified; a line starting with neither is a failure, and the
  -- total must equal c_expected_checks.

  declare
    c_expected_checks constant integer := 14;
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
