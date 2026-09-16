-- 'report_failed' is one of the ways a session ends.
--
-- claim_interview_report_attempt (migration 20260916100100) closes a session
-- that has run out of report attempts with end_reason 'report_failed', so that
-- an operator can find the interviews that were paid for and never got their
-- report. The check constraint predates that reason and refused the value: the
-- close raised inside the function, and the route answered 500 instead of
-- telling the user its team had been notified. Found by case 34 of
-- security-tests/aiBillingE2E.test.js.

alter table public.ai_sessions
  drop constraint if exists ai_sessions_end_reason_check;

alter table public.ai_sessions
  add constraint ai_sessions_end_reason_check
  check (end_reason = any (array[
    'completed',
    'call_limit',
    'cost_limit',
    'expired',
    'first_turn_failed',
    'report_failed'
  ]));


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
declare
  v_def text := (select pg_get_constraintdef(oid) from pg_constraint
                  where conrelid = 'public.ai_sessions'::regclass
                    and conname  = 'ai_sessions_end_reason_check');
  v_reason text;
begin
  if v_def is null then
    raise exception 'ai_sessions: the end_reason check is gone';
  end if;

  foreach v_reason in array array['completed', 'call_limit', 'cost_limit', 'expired', 'first_turn_failed', 'report_failed'] loop
    if position(v_reason in v_def) = 0 then
      raise exception 'ai_sessions: end_reason no longer accepts %', v_reason;
    end if;
  end loop;
end;
$$;
