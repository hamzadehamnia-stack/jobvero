-- A paid interview always owes its report.
--
-- The final report is written by the model, and the server saves it only when
-- it parses. Until now a report that never parsed left the interview with its 7
-- credits taken and nothing to show: after two failed tries the session hit
-- limits.model_calls and closed as 'call_limit', report or no report.
--
-- From here:
--   · report_attempts counts the report turns of a session. The first is the
--     turn the user paid for; the three after it are retries they ask for with
--     a button, charged nothing — the report is part of what they bought;
--   · claim_interview_report_attempt hands out those attempts, one at a time
--     and under lock, and closes the session as 'report_failed' when they run
--     out, so an operator can find it and refund by hand;
--   · limits.model_calls goes from 11 to 12: eight turns of the interview plus
--     four report attempts, so the attempt ceiling is reached before the call
--     ceiling and the session never closes as 'call_limit' with a report owed;
--   · each retry's cost is real and nobody is charged for it: it goes on its
--     own ai_usage row, action system_interview_report_retry, zero credits,
--     which puts it in cost_system_usd of ai_margin_weekly rather than nowhere.

alter table public.ai_sessions
  add column if not exists report_attempts integer not null default 0;

alter table public.ai_sessions
  drop constraint if exists ai_sessions_report_attempts_check;
alter table public.ai_sessions
  add constraint ai_sessions_report_attempts_check check (report_attempts >= 0);


-- ─── One report attempt, or the end of the session ───────────────────────────

create or replace function public.claim_interview_report_attempt(
  p_session_id   uuid,
  p_max_attempts integer
)
returns table(allowed boolean, attempts integer)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_session public.ai_sessions%rowtype;
begin
  if p_max_attempts is null or p_max_attempts < 1 then
    raise exception 'invalid_max_attempts' using errcode = 'JV010';
  end if;

  select s.* into v_session
    from public.ai_sessions s
   where s.id = p_session_id
     for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'JV006';
  end if;

  if v_session.ended_at is not null then
    return query select false, v_session.report_attempts;
    return;
  end if;

  if v_session.report_attempts >= p_max_attempts then
    -- Out of attempts: the session closes here, marked for a human.
    update public.ai_sessions s
       set ended_at = now(), end_reason = 'report_failed'
     where s.id = p_session_id;
    return query select false, v_session.report_attempts;
    return;
  end if;

  update public.ai_sessions s
     set report_attempts = s.report_attempts + 1
   where s.id = p_session_id
  returning s.report_attempts into v_session.report_attempts;

  return query select true, v_session.report_attempts;
end;
$function$;

revoke all on function public.claim_interview_report_attempt(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_interview_report_attempt(uuid, integer) to service_role;


-- ─── A system usage row a streamed call can be recorded against ──────────────
--
-- log_system_ai_usage writes the row and its call in one go, which fits a call
-- whose cost is already known. A streamed call needs the row first and records
-- the call when the stream ends — with its generation id when the cost is not
-- in the stream — so it needs the row on its own.

create or replace function public.open_system_ai_usage(
  p_user_id uuid,
  p_action  text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
begin
  if p_user_id is null then
    raise exception 'system_usage_requires_user' using errcode = 'JV010';
  end if;

  if p_action is null or p_action not like 'system\_%' then
    raise exception 'not_a_system_action' using errcode = 'JV010';
  end if;

  if not exists (select 1 from public.ai_action_costs c where c.action = p_action) then
    raise exception 'unknown_action' using errcode = 'JV002';
  end if;

  insert into public.ai_usage (user_id, idempotency_key, action, credits_charged, status, settled_at)
  values (p_user_id, 'system:' || gen_random_uuid(), p_action, 0, 'settled', now())
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.open_system_ai_usage(uuid, text) from public, anon, authenticated;
grant execute on function public.open_system_ai_usage(uuid, text) to service_role;


-- ─── Catalogue ───────────────────────────────────────────────────────────────

-- The retries are made with the interview's own model and ceilings; this row
-- exists to carry their cost, at zero credits.
insert into public.ai_action_costs (action, credits, model, max_tokens, max_input_chars, limits)
select 'system_interview_report_retry', 0, c.model, c.max_tokens, c.max_input_chars, '{}'::jsonb
  from public.ai_action_costs c
 where c.action = 'interview_session'
on conflict (action) do nothing;

update public.ai_action_costs
   set limits = limits || jsonb_build_object('model_calls', 12, 'report_attempts', 4)
 where action = 'interview_session';


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
declare
  v_limits jsonb := (select limits from public.ai_action_costs where action = 'interview_session');
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'ai_sessions' and column_name = 'report_attempts') then
    raise exception 'ai_sessions: report_attempts is missing';
  end if;

  if (v_limits ->> 'model_calls')::integer is distinct from 12
     or (v_limits ->> 'report_attempts')::integer is distinct from 4 then
    raise exception 'ai_action_costs: interview_session model_calls or report_attempts not set';
  end if;

  -- Eight turns plus every report attempt must fit under the call ceiling.
  if (v_limits ->> 'model_calls')::integer < 8 + (v_limits ->> 'report_attempts')::integer then
    raise exception 'ai_action_costs: interview_session would run out of calls before its report attempts';
  end if;

  if not exists (select 1 from public.ai_action_costs
                  where action = 'system_interview_report_retry' and credits = 0) then
    raise exception 'ai_action_costs: system_interview_report_retry is missing or is not free';
  end if;

  if has_function_privilege('authenticated', 'public.claim_interview_report_attempt(uuid, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.open_system_ai_usage(uuid, text)', 'EXECUTE') then
    raise exception 'a signed-in user can call the report attempt or system usage functions';
  end if;
end;
$$;
