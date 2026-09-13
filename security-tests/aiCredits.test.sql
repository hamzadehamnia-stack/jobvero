-- Security and behaviour test for the AI credit functions (step 2b).
--
-- Run it: paste the whole file into the Supabase SQL editor, as the postgres
-- role, AFTER applying 20260913120300_ai_credit_functions.sql. Not through the
-- MCP execute_sql tool: it runs in a read-only transaction.
--
-- One DO block that ALWAYS ends by raising. That is what rolls back the
-- fixture user, the ledger rows, the sessions and the temporary catalogue edit.
-- Read the error:
--
--   RESULT: all N checks passed — test data rolled back
--   RESULT: K FAILED, N ok — test data rolled back
--
-- Authenticated calls run under SET ROLE authenticated with request.jwt.claims,
-- the way PostgREST runs them, so auth.uid() and the EXECUTE grants are real.
-- Service-role functions are called as postgres.
--
-- refund_stale_ai_reservations() is called for real, so it also refunds any
-- genuinely stale reservation belonging to other users — inside this
-- transaction, rolled back with everything else.
--
-- Not covered: two truly concurrent reservations. A single transaction cannot
-- race itself; that property rests on the advisory lock and the conditional
-- UPDATE, and needs two connections to exercise.

do $test$
declare
  v_uid     uuid := gen_random_uuid();
  v_other   uuid := gen_random_uuid();
  v_log     text := '';
  v_ok      integer;
  v_fail    integer;
  r         record;
  v_usage   uuid;
  v_session uuid;
  v_bal     integer;
  v_i       integer;
  v_n       integer;
  v_bool    boolean;
  v_num     numeric;
begin
  -- ─── Fixture ───────────────────────────────────────────────────────────────

  insert into auth.users (id, email)
  values (v_uid, 'ai-credits-test-' || v_uid || '@invalid.local');

  insert into public.profiles (id) values (v_uid);
  update public.profiles set ai_credits_remaining = 100 where id = v_uid;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated')::text,
    true
  );


  -- ─── T1. Function privileges ───────────────────────────────────────────────

  v_log := v_log || case when
        not has_function_privilege('authenticated', 'public.settle_ai_usage(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.refund_ai_usage(uuid, text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.record_ai_call(uuid, text, text, integer, integer, numeric, boolean, text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.reserve_ai_credits_for(uuid, text, text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.log_system_ai_usage(uuid, text, text, integer, integer, numeric, boolean, text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.refund_stale_ai_reservations(interval)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.ai_reserve_internal(uuid, text, text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.reserve_ai_credits(text, text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.start_ai_session(text, text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.reserve_ai_credits(text, text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.claim_ai_session_call(uuid, text)', 'EXECUTE')
    then E'\nok    T1 privileges: authenticated has only the auth.uid() functions, anon none'
    else E'\nFAIL  T1 function privileges do not match the design'
  end;


  -- ─── T2. A new key charges once ────────────────────────────────────────────

  select ai_credits_remaining into v_bal from public.profiles where id = v_uid;

  set local role authenticated;
  select * into r from public.reserve_ai_credits('quick_write', 'k-quick');
  reset role;
  v_usage := r.usage_id;

  v_log := v_log || case
    when r.charged_now and r.usage_status = 'reserved'
     and (select ai_credits_remaining from public.profiles where id = v_uid) = v_bal - 1
    then E'\nok    T2 new key: reserved, charged_now, 1 credit debited'
    else format(E'\nFAIL  T2 new key: status=%s charged_now=%s', r.usage_status, r.charged_now)
  end;


  -- ─── T3. The same key in flight charges nothing, and says so ───────────────

  set local role authenticated;
  select * into r from public.reserve_ai_credits('quick_write', 'k-quick');
  reset role;

  v_log := v_log || case
    when not r.charged_now and r.usage_status = 'reserved' and r.usage_id = v_usage
     and (select ai_credits_remaining from public.profiles where id = v_uid) = v_bal - 1
    then E'\nok    T3 in-flight duplicate: same row, charged_now=false, no second debit'
    else format(E'\nFAIL  T3 in-flight duplicate: status=%s charged_now=%s', r.usage_status, r.charged_now)
  end;


  -- ─── T4. A settled key is reported as already processed ────────────────────

  v_bool := public.settle_ai_usage(v_usage);

  set local role authenticated;
  select * into r from public.reserve_ai_credits('quick_write', 'k-quick');
  reset role;

  v_log := v_log || case
    when v_bool and not r.charged_now and r.usage_status = 'settled'
     and (select ai_credits_remaining from public.profiles where id = v_uid) = v_bal - 1
     and not public.settle_ai_usage(v_usage)
    then E'\nok    T4 settled key: status=settled, charged_now=false; a second settle is a no-op'
    else format(E'\nFAIL  T4 settled key: status=%s charged_now=%s', r.usage_status, r.charged_now)
  end;


  -- ─── T5. Refund returns credits once; a retried refunded key charges again ─

  select ai_credits_remaining into v_bal from public.profiles where id = v_uid;

  set local role authenticated;
  select * into r from public.reserve_ai_credits('cv_generation', 'k-cv');
  reset role;
  v_usage := r.usage_id;

  v_bool := public.refund_ai_usage(v_usage, 'test');

  v_log := v_log || case
    when v_bool
     and (select ai_credits_remaining from public.profiles where id = v_uid) = v_bal
     and not public.refund_ai_usage(v_usage, 'test')
     and not public.settle_ai_usage(v_usage)
    then E'\nok    T5 refund: 2 credits back, a second refund and a later settle are no-ops'
    else E'\nFAIL  T5 refund did not restore exactly once'
  end;

  set local role authenticated;
  select * into r from public.reserve_ai_credits('cv_generation', 'k-cv');
  reset role;

  v_log := v_log || case
    when r.charged_now and r.usage_status = 'reserved' and r.usage_id = v_usage
     and (select ai_credits_remaining from public.profiles where id = v_uid) = v_bal - 2
    then E'\nok    T5 refunded key retried: charged again, back to reserved'
    else format(E'\nFAIL  T5 refunded key retried: status=%s charged_now=%s', r.usage_status, r.charged_now)
  end;

  perform public.refund_ai_usage(v_usage, 'test cleanup');


  -- ─── T6. A key cannot be reused for another action ─────────────────────────

  set local role authenticated;
  begin
    perform public.reserve_ai_credits('match_score', 'k-quick');
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then v_log := v_log || E'\nFAIL  T6 a key reused for another action was accepted';
    when sqlstate 'JV010' then v_log := v_log || E'\nok    T6 key reused for another action: JV010';
    when others           then v_log := v_log || format(E'\nFAIL  T6 expected JV010, got %s: %s', sqlstate, sqlerrm);
  end;
  reset role;


  -- ─── T7. Insufficient credits: refused, balance untouched ──────────────────

  update public.profiles set ai_credits_remaining = 1 where id = v_uid;

  set local role authenticated;
  begin
    perform public.reserve_ai_credits('cv_generation', 'k-poor');
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then v_log := v_log || E'\nFAIL  T7 reservation accepted with 1 credit for a 2-credit action';
    when sqlstate 'JV004' then
      v_log := v_log || E'\nok    T7 insufficient credits: JV004';
    when others           then v_log := v_log || format(E'\nFAIL  T7 expected JV004, got %s: %s', sqlstate, sqlerrm);
  end;
  reset role;

  v_log := v_log || case
    when (select ai_credits_remaining from public.profiles where id = v_uid) = 1
    then E'\nok    T7 balance unchanged after the refusal'
    else E'\nFAIL  T7 balance changed after a refused reservation'
  end;

  update public.profiles set ai_credits_remaining = 100 where id = v_uid;


  -- ─── T8. A blocked account cannot reserve ──────────────────────────────────

  update public.profiles set is_blocked = true where id = v_uid;

  set local role authenticated;
  begin
    perform public.reserve_ai_credits('quick_write', 'k-blocked');
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then v_log := v_log || E'\nFAIL  T8 a blocked account reserved credits';
    when sqlstate 'JV005' then v_log := v_log || E'\nok    T8 blocked account: JV005';
    when others           then v_log := v_log || format(E'\nFAIL  T8 expected JV005, got %s: %s', sqlstate, sqlerrm);
  end;
  reset role;

  update public.profiles set is_blocked = false where id = v_uid;


  -- ─── T9. Unknown and disabled actions ──────────────────────────────────────

  set local role authenticated;
  begin
    perform public.reserve_ai_credits('no_such_action', 'k-unknown');
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then v_log := v_log || E'\nFAIL  T9 an unknown action was reserved';
    when sqlstate 'JV002' then v_log := v_log || E'\nok    T9 unknown action: JV002';
    when others           then v_log := v_log || format(E'\nFAIL  T9 expected JV002, got %s: %s', sqlstate, sqlerrm);
  end;
  reset role;

  update public.ai_action_costs set enabled = false where action = 'quick_write';

  set local role authenticated;
  begin
    perform public.reserve_ai_credits('quick_write', 'k-disabled');
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then v_log := v_log || E'\nFAIL  T9 a disabled action was reserved';
    when sqlstate 'JV003' then v_log := v_log || E'\nok    T9 disabled action: JV003';
    when others           then v_log := v_log || format(E'\nFAIL  T9 expected JV003, got %s: %s', sqlstate, sqlerrm);
  end;
  reset role;

  update public.ai_action_costs set enabled = true where action = 'quick_write';


  -- ─── T10. Each kind of action has exactly one entry point ──────────────────

  set local role authenticated;

  begin
    perform public.reserve_ai_credits('chat', 'k-chat-direct');
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then v_log := v_log || E'\nFAIL  T10 a session action was reserved without a session';
    when sqlstate 'JV010' then v_log := v_log || E'\nok    T10 session action through reserve_ai_credits: JV010';
    when others           then v_log := v_log || format(E'\nFAIL  T10 expected JV010, got %s: %s', sqlstate, sqlerrm);
  end;

  begin
    perform public.start_ai_session('quick_write', 'k-not-a-session');
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then v_log := v_log || E'\nFAIL  T10 a session was opened for a non-session action';
    when sqlstate 'JV010' then v_log := v_log || E'\nok    T10 non-session action through start_ai_session: JV010';
    when others           then v_log := v_log || format(E'\nFAIL  T10 expected JV010, got %s: %s', sqlstate, sqlerrm);
  end;

  begin
    perform public.reserve_ai_credits('system_email_finder', 'k-system');
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then v_log := v_log || E'\nFAIL  T10 a system action was reserved';
    when sqlstate 'JV010' then v_log := v_log || E'\nok    T10 system action through reserve_ai_credits: JV010';
    when others           then v_log := v_log || format(E'\nFAIL  T10 expected JV010, got %s: %s', sqlstate, sqlerrm);
  end;

  begin
    perform public.refund_ai_usage(v_usage, 'client tries to refund itself');
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01'         then v_log := v_log || E'\nFAIL  T10 authenticated called refund_ai_usage';
    when insufficient_privilege   then v_log := v_log || E'\nok    T10 authenticated calling refund_ai_usage: permission denied';
    when others                   then v_log := v_log || format(E'\nFAIL  T10 expected 42501, got %s: %s', sqlstate, sqlerrm);
  end;

  reset role;


  -- ─── T11. Interview: 11 model calls, then the session ends ─────────────────

  select ai_credits_remaining into v_bal from public.profiles where id = v_uid;

  set local role authenticated;
  select * into r from public.start_ai_session('interview_session', 's-interview');
  v_session := r.session_id;

  v_n := 0;
  for v_i in 1..11 loop
    select * into r from public.claim_ai_session_call(v_session, 'model');
    if r.allowed then v_n := v_n + 1; end if;
  end loop;
  select * into r from public.claim_ai_session_call(v_session, 'model');
  reset role;

  v_log := v_log || case
    when (select ai_credits_remaining from public.profiles where id = v_uid) = v_bal - 7
     and (select expires_at from public.ai_sessions where id = v_session) = now() + interval '60 minutes'
    then E'\nok    T11 interview opened: 7 credits, expires in 60 minutes'
    else E'\nFAIL  T11 interview opening: wrong charge or expiry'
  end;

  v_log := v_log || case
    when v_n = 11 and not r.allowed and r.reason = 'call_limit'
     and (select end_reason from public.ai_sessions where id = v_session) = 'call_limit'
    then E'\nok    T11 11 model calls allowed, the 12th refused and the session ended'
    else format(E'\nFAIL  T11 model calls allowed=%s, 12th reason=%s', v_n, r.reason)
  end;

  set local role authenticated;
  select * into r from public.claim_ai_session_call(v_session, 'stt');
  reset role;

  v_log := v_log || case
    when not r.allowed and r.reason = 'closed'
    then E'\nok    T11 an ended session refuses every call'
    else format(E'\nFAIL  T11 ended session: allowed=%s reason=%s', r.allowed, r.reason)
  end;

  set local role authenticated;
  select * into r from public.start_ai_session('interview_session', 's-interview');
  reset role;

  v_log := v_log || case
    when not r.charged_now and r.session_id = v_session
     and (select ai_credits_remaining from public.profiles where id = v_uid) = v_bal - 7
    then E'\nok    T11 replaying the start key returns the same session, no new charge'
    else E'\nFAIL  T11 replaying the start key charged again or opened another session'
  end;


  -- ─── T12. Voice ceilings refuse the voice, not the session ─────────────────

  set local role authenticated;
  select * into r from public.start_ai_session('interview_session', 's-voice');
  v_session := r.session_id;

  v_n := 0;
  for v_i in 1..12 loop
    select * into r from public.claim_ai_session_call(v_session, 'tts');
    if r.allowed then v_n := v_n + 1; end if;
  end loop;
  select * into r from public.claim_ai_session_call(v_session, 'tts');
  v_bool := r.allowed;
  select * into r from public.claim_ai_session_call(v_session, 'model');
  reset role;

  v_log := v_log || case
    when v_n = 12 and not v_bool and r.allowed
     and (select ended_at from public.ai_sessions where id = v_session) is null
    then E'\nok    T12 12 TTS calls allowed, the 13th refused, model calls still allowed'
    else format(E'\nFAIL  T12 tts allowed=%s, 13th allowed=%s, model after=%s', v_n, v_bool, r.allowed)
  end;


  -- ─── T13. Another user cannot touch the session ────────────────────────────

  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);

  set local role authenticated;
  begin
    perform public.claim_ai_session_call(v_session, 'model');
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then v_log := v_log || E'\nFAIL  T13 another user claimed a call on this session';
    when sqlstate 'JV006' then v_log := v_log || E'\nok    T13 another user''s session: JV006';
    when others           then v_log := v_log || format(E'\nFAIL  T13 expected JV006, got %s: %s', sqlstate, sqlerrm);
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);


  -- ─── T14. The cost ceiling stops the session ───────────────────────────────

  set local role authenticated;
  select * into r from public.start_ai_session('interview_session', 's-cost');
  reset role;
  v_session := r.session_id;

  perform public.record_ai_call(r.usage_id, 'model', 'test/model', 1000, 500, 1.20);

  set local role authenticated;
  select * into r from public.claim_ai_session_call(v_session, 'model');
  reset role;

  v_log := v_log || case
    when not r.allowed and r.reason = 'cost_limit'
     and (select end_reason from public.ai_sessions where id = v_session) = 'cost_limit'
    then E'\nok    T14 session at $1.20 of logged cost: refused and ended (cost_limit)'
    else format(E'\nFAIL  T14 cost ceiling: allowed=%s reason=%s', r.allowed, r.reason)
  end;


  -- ─── T15. An expired session is closed on the next claim ───────────────────

  set local role authenticated;
  select * into r from public.start_ai_session('interview_session', 's-expire');
  reset role;
  v_session := r.session_id;

  update public.ai_sessions set expires_at = now() - interval '1 minute' where id = v_session;

  set local role authenticated;
  select * into r from public.claim_ai_session_call(v_session, 'model');
  reset role;

  v_log := v_log || case
    when not r.allowed and r.reason = 'expired'
     and (select end_reason from public.ai_sessions where id = v_session) = 'expired'
    then E'\nok    T15 expired session: refused and ended (expired)'
    else format(E'\nFAIL  T15 expiry: allowed=%s reason=%s', r.allowed, r.reason)
  end;


  -- ─── T16. Chat: 20 messages per credit, no voice ───────────────────────────

  select ai_credits_remaining into v_bal from public.profiles where id = v_uid;

  set local role authenticated;
  select * into r from public.start_ai_session('chat', 'c-chat');
  v_session := r.session_id;

  v_n := 0;
  for v_i in 1..20 loop
    select * into r from public.claim_ai_session_call(v_session, 'model');
    if r.allowed then v_n := v_n + 1; end if;
  end loop;
  select * into r from public.claim_ai_session_call(v_session, 'model');
  v_bool := r.allowed;

  select * into r from public.start_ai_session('chat', 'c-chat-voice');
  select * into r from public.claim_ai_session_call(r.session_id, 'stt');
  reset role;

  v_log := v_log || case
    when v_n = 20 and not v_bool
     and (select ai_credits_remaining from public.profiles where id = v_uid) = v_bal - 2
     and (select expires_at from public.ai_sessions where id = v_session) is null
    then E'\nok    T16 chat: 1 credit, 20 messages, the 21st refused, no expiry'
    else format(E'\nFAIL  T16 chat: messages allowed=%s, 21st allowed=%s', v_n, v_bool)
  end;

  v_log := v_log || case
    when not r.allowed and r.reason = 'call_limit'
    then E'\nok    T16 chat has no voice: STT refused'
    else format(E'\nFAIL  T16 chat voice: allowed=%s reason=%s', r.allowed, r.reason)
  end;


  -- ─── T17. A refunded session closes, and reopens when retried ──────────────

  select ai_credits_remaining into v_bal from public.profiles where id = v_uid;

  set local role authenticated;
  select * into r from public.start_ai_session('interview_session', 's-refund');
  reset role;
  v_session := r.session_id;

  perform public.refund_ai_usage(r.usage_id, 'first turn failed');

  v_log := v_log || case
    when (select ai_credits_remaining from public.profiles where id = v_uid) = v_bal
     and (select end_reason from public.ai_sessions where id = v_session) = 'first_turn_failed'
    then E'\nok    T17 refunded session: 7 credits back, session closed (first_turn_failed)'
    else E'\nFAIL  T17 refunded session: credits or session state wrong'
  end;

  set local role authenticated;
  select * into r from public.start_ai_session('interview_session', 's-refund');
  reset role;

  v_log := v_log || case
    when r.charged_now and r.session_id = v_session
     and (select ended_at from public.ai_sessions where id = v_session) is null
     and (select ai_credits_remaining from public.profiles where id = v_uid) = v_bal - 7
    then E'\nok    T17 retried after refund: charged again, same session reopened'
    else E'\nFAIL  T17 retry after refund: wrong charge or session'
  end;


  -- ─── T18. Stale reservations are refunded, recent ones are not ─────────────

  select ai_credits_remaining into v_bal from public.profiles where id = v_uid;

  set local role authenticated;
  select * into r from public.reserve_ai_credits('quick_write', 'k-stale-old');
  v_usage := r.usage_id;
  select * into r from public.reserve_ai_credits('quick_write', 'k-stale-recent');
  reset role;

  update public.ai_usage set reserved_at = now() - interval '16 minutes' where id = v_usage;
  update public.ai_usage set reserved_at = now() - interval '6 minutes'  where id = r.usage_id;

  v_n := public.refund_stale_ai_reservations();

  v_log := v_log || case
    when v_n >= 1
     and (select status from public.ai_usage where id = v_usage) = 'refunded'
     and (select status from public.ai_usage where id = r.usage_id) = 'reserved'
     and (select ai_credits_remaining from public.profiles where id = v_uid) = v_bal - 1
    then E'\nok    T18 cleanup: the 16-minute reservation refunded, the 6-minute one kept'
    else format(E'\nFAIL  T18 cleanup: refunded=%s', v_n)
  end;

  begin
    perform public.refund_stale_ai_reservations(interval '1 minute');
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then v_log := v_log || E'\nFAIL  T18 a 1-minute cleanup window was accepted';
    when sqlstate 'JV010' then v_log := v_log || E'\nok    T18 cleanup window under 5 minutes: JV010';
    when others           then v_log := v_log || format(E'\nFAIL  T18 expected JV010, got %s: %s', sqlstate, sqlerrm);
  end;


  -- ─── T19. System usage: logged against the user, never charged ─────────────

  select ai_credits_remaining into v_bal from public.profiles where id = v_uid;

  v_usage := public.log_system_ai_usage(v_uid, 'system_inbox_classify', 'anthropic/claude-sonnet-4-6', 800, 300, 0.02);

  v_log := v_log || case
    when (select status = 'settled' and credits_charged = 0 and cost_usd = 0.02
            from public.ai_usage where id = v_usage)
     and (select count(*) from public.ai_usage_calls where usage_id = v_usage) = 1
     and (select ai_credits_remaining from public.profiles where id = v_uid) = v_bal
    then E'\nok    T19 system usage: settled, 0 credits, cost and call logged, balance untouched'
    else E'\nFAIL  T19 system usage row is wrong'
  end;

  begin
    perform public.log_system_ai_usage(v_uid, 'chat', 'x', 1, 1, 0.01);
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then v_log := v_log || E'\nFAIL  T19 a user action was logged as free system usage';
    when sqlstate 'JV010' then v_log := v_log || E'\nok    T19 user action through log_system_ai_usage: JV010';
    when others           then v_log := v_log || format(E'\nFAIL  T19 expected JV010, got %s: %s', sqlstate, sqlerrm);
  end;

  begin
    perform public.log_system_ai_usage(null, 'system_inbox_classify', 'x', 1, 1, 0.01);
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then v_log := v_log || E'\nFAIL  T19 system usage without a user was accepted';
    when sqlstate 'JV010' then v_log := v_log || E'\nok    T19 system usage without a user: JV010';
    when others           then v_log := v_log || format(E'\nFAIL  T19 expected JV010, got %s: %s', sqlstate, sqlerrm);
  end;


  -- ─── T20. Per-call logging accumulates on the ledger row ───────────────────

  v_num := public.record_ai_call(v_usage, 'tts', 'openai/gpt-4o-mini-tts', null, null, 0.05, true);

  v_log := v_log || case
    when v_num = 0.07
     and (select cost_estimated from public.ai_usage where id = v_usage)
     and (select prompt_tokens = 800 and completion_tokens = 300 from public.ai_usage where id = v_usage)
    then E'\nok    T20 calls accumulate: cost 0.02 + 0.05 estimated = 0.07, flagged estimated'
    else format(E'\nFAIL  T20 accumulated cost=%s', v_num)
  end;

  begin
    perform public.record_ai_call(v_usage, 'model', 'x', 1, 1, -0.01);
    raise exception using errcode = 'JVT01';
  exception
    when sqlstate 'JVT01' then v_log := v_log || E'\nFAIL  T20 a negative cost was accepted';
    when sqlstate 'JV010' then v_log := v_log || E'\nok    T20 negative cost: JV010';
    when others           then v_log := v_log || format(E'\nFAIL  T20 expected JV010, got %s: %s', sqlstate, sqlerrm);
  end;


  -- ─── Report, and roll everything back ──────────────────────────────────────

  v_fail := (length(v_log) - length(replace(v_log, E'\nFAIL', ''))) / length(E'\nFAIL');
  v_ok   := (length(v_log) - length(replace(v_log, E'\nok ',  ''))) / length(E'\nok ');

  raise exception using
    errcode = 'JVT00',
    message = case
                when v_fail = 0 then format('RESULT: all %s checks passed — test data rolled back', v_ok)
                else format('RESULT: %s FAILED, %s ok — test data rolled back', v_fail, v_ok)
              end || v_log;
end;
$test$;
