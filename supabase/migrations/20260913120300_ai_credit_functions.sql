-- AI credits, step 2b: reserve / settle / refund, session counters, cleanup.
--
-- Replaces §6 consume_ai_credit and the §10.6 functions of
-- Docs/stripe-jobvero-brief.md, with the corrections agreed in review:
--
--   1. Errors use a private SQLSTATE class, JVxxx. The brief's P0002–P0004 are
--      PL/pgSQL's own no_data_found, too_many_rows and assert_failure, so a
--      route matching on them would misread genuine internal errors.
--
--   2. Idempotency no longer hands out free calls. The brief returned an
--      existing reservation whatever its state, so a key replayed after a
--      refund reached OpenRouter without a charge — and so did a duplicate
--      request arriving while the first was still in flight. Reservation now
--      returns (usage_id, usage_status, charged_now):
--        charged_now = true            → this call charged; call the model
--        usage_status = 'settled'      → already processed; 409, no model call
--        usage_status = 'reserved',
--        charged_now = false           → in flight; 409, no model call
--      A refunded row is charged again and comes back with charged_now = true.
--
--   3. Stale reservations are refunded by refund_stale_ai_reservations(),
--      called by a Vercel cron (step 2e).
--
--   4. A blocked account cannot reserve anything, whatever the route checked.
--
-- Error codes, for the routes:
--   JV001 not_authenticated      JV002 unknown_action     JV003 action_disabled
--   JV004 insufficient_credits   JV005 account_blocked    JV006 session_not_found
--   JV010 invalid_request — bad or reused idempotency key, wrong function for
--         the action, invalid argument, missing profile
--
-- Who may call what:
--   authenticated  reserve_ai_credits, start_ai_session, claim_ai_session_call
--                  — identity from auth.uid(), which a caller cannot forge
--   service_role   reserve_ai_credits_for (auto-apply cron), record_ai_call,
--                  settle_ai_usage, refund_ai_usage, advance_ai_session_turn,
--                  end_ai_session, refund_stale_ai_reservations,
--                  log_system_ai_usage
--   nobody         ai_reserve_internal — reached only through the wrappers
--
-- Every function is SECURITY DEFINER with a fixed search_path: they write
-- tables no client can write, and without the fixed path a caller able to
-- influence search_path could shadow those tables with their own.


-- ─── 1. ai_usage.reserved_at ─────────────────────────────────────────────────
--
-- The stale-reservation cleanup needs the time a row was last reserved, not
-- when it was created: a refunded row can be reserved again later under the
-- same key, and judged by created_at it would be refunded on the spot.

alter table public.ai_usage
  add column if not exists reserved_at timestamptz not null default now();

drop index if exists public.ai_usage_status_idx;

create index if not exists ai_usage_stale_reserved_idx
  on public.ai_usage (reserved_at) where status = 'reserved';


-- ─── 2. Reservation ──────────────────────────────────────────────────────────

create or replace function public.ai_reserve_internal(
  p_user_id         uuid,
  p_action          text,
  p_idempotency_key text
)
returns table (usage_id uuid, usage_status text, charged_now boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cost    integer;
  v_enabled boolean;
  v_id      uuid;
  v_status  text;
  v_action  text;
  v_blocked boolean;
begin
  if p_user_id is null then
    raise exception 'not_authenticated' using errcode = 'JV001';
  end if;

  if p_idempotency_key is null or length(p_idempotency_key) not between 1 and 200 then
    raise exception 'invalid_idempotency_key' using errcode = 'JV010';
  end if;

  select c.credits, c.enabled
    into v_cost, v_enabled
    from public.ai_action_costs c
   where c.action = p_action;

  if not found then
    raise exception 'unknown_action' using errcode = 'JV002';
  end if;
  if not v_enabled then
    raise exception 'action_disabled' using errcode = 'JV003';
  end if;
  if v_cost = 0 then
    -- system_ actions are logged (log_system_ai_usage), never reserved.
    raise exception 'system_action_not_reservable' using errcode = 'JV010';
  end if;

  -- Serialise every call for the same (user, key). Without it two identical
  -- requests racing on a flaky connection both find no row, both charge, and
  -- the losing insert fails after its debit has already happened.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || '|' || p_idempotency_key, 0));

  select u.id, u.status, u.action
    into v_id, v_status, v_action
    from public.ai_usage u
   where u.user_id = p_user_id
     and u.idempotency_key = p_idempotency_key
   for update;

  if found and v_action <> p_action then
    -- Reusing a key across actions would let a reservation priced for a cheap
    -- action unlock an expensive one.
    raise exception 'idempotency_key_reused' using errcode = 'JV010';
  end if;

  if found and v_status in ('reserved', 'settled') then
    return query select v_id, v_status, false;
    return;
  end if;

  -- A new key, or a refunded one being retried: charge now. The balance check
  -- is in the WHERE, so concurrent requests for the last credits serialise on
  -- the row lock and the balance cannot go negative.
  update public.profiles p
     set ai_credits_remaining = coalesce(p.ai_credits_remaining, 0) - v_cost
   where p.id = p_user_id
     and not coalesce(p.is_blocked, false)
     and coalesce(p.ai_credits_remaining, 0) >= v_cost;

  if not found then
    select coalesce(p.is_blocked, false)
      into v_blocked
      from public.profiles p
     where p.id = p_user_id;

    if not found then
      raise exception 'profile_not_found' using errcode = 'JV010';
    elsif v_blocked then
      raise exception 'account_blocked' using errcode = 'JV005';
    else
      raise exception 'insufficient_credits' using errcode = 'JV004';
    end if;
  end if;

  if v_id is not null then
    -- Retried after a refund: charged at today's catalogue price.
    update public.ai_usage u
       set status          = 'reserved',
           credits_charged = v_cost,
           reserved_at     = now(),
           settled_at      = null,
           error           = null
     where u.id = v_id;
  else
    insert into public.ai_usage (user_id, idempotency_key, action, credits_charged)
    values (p_user_id, p_idempotency_key, p_action, v_cost)
    returning id into v_id;
  end if;

  return query select v_id, 'reserved'::text, true;
end;
$$;


-- For a signed-in user, from the user's own Supabase client.
create or replace function public.reserve_ai_credits(
  p_action          text,
  p_idempotency_key text
)
returns table (usage_id uuid, usage_status text, charged_now boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Session actions must open a session, or their counters would not exist.
  if p_action in ('interview_session', 'chat') then
    raise exception 'use_start_ai_session' using errcode = 'JV010';
  end if;

  return query select * from public.ai_reserve_internal(auth.uid(), p_action, p_idempotency_key);
end;
$$;


-- For server jobs with no user session: the auto-apply cron. Service role only;
-- the caller is trusted to pass the user the work is done for.
create or replace function public.reserve_ai_credits_for(
  p_user_id         uuid,
  p_action          text,
  p_idempotency_key text
)
returns table (usage_id uuid, usage_status text, charged_now boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_action in ('interview_session', 'chat') then
    raise exception 'use_start_ai_session' using errcode = 'JV010';
  end if;

  return query select * from public.ai_reserve_internal(p_user_id, p_action, p_idempotency_key);
end;
$$;


-- ─── 3. Sessions: interview and chat ─────────────────────────────────────────
--
-- One session is one charge. The session is opened by reserving; every
-- upstream call is claimed against the session's counters first, and the
-- session stops at the first ceiling reached: a call counter, the running cost
-- (limits.max_cost_usd, compared with ai_usage.cost_usd) or its expiry.

create or replace function public.start_ai_session(
  p_action          text,
  p_idempotency_key text
)
returns table (session_id uuid, usage_id uuid, usage_status text, charged_now boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_reservation record;
  v_minutes     integer;
  v_session     uuid;
begin
  if p_action is null or p_action not in ('interview_session', 'chat') then
    raise exception 'not_a_session_action' using errcode = 'JV010';
  end if;

  select * into v_reservation
    from public.ai_reserve_internal(auth.uid(), p_action, p_idempotency_key);

  select (c.limits ->> 'minutes')::integer
    into v_minutes
    from public.ai_action_costs c
   where c.action = p_action;

  if v_reservation.charged_now then
    -- A new session, or a refunded one retried under the same key: open it.
    -- Counters are kept on a retry — calls already spent stay spent — and the
    -- cost already logged keeps counting towards max_cost_usd.
    insert into public.ai_sessions as s (user_id, action, usage_id, expires_at)
    values (
      auth.uid(),
      p_action,
      v_reservation.usage_id,
      case when v_minutes is not null then now() + make_interval(mins => v_minutes) end
    )
    on conflict (usage_id) do update
      set ended_at   = null,
          end_reason = null,
          expires_at = excluded.expires_at
    returning s.id into v_session;
  else
    select s.id
      into v_session
      from public.ai_sessions s
     where s.usage_id = v_reservation.usage_id;
  end if;

  return query
    select v_session, v_reservation.usage_id, v_reservation.usage_status, v_reservation.charged_now;
end;
$$;


-- Claims one upstream call ('model', 'stt' or 'tts') before it is made.
-- Returns allowed = false with a reason instead of raising, so the session's
-- end state (ended_at, end_reason) is kept: a raise would roll it back.
--
-- The cost ceiling is checked before the call, against the cost logged so far,
-- so a session can overshoot max_cost_usd by at most the one call that crosses
-- it (a Sonnet turn is ~$0.06 at worst).
create or replace function public.claim_ai_session_call(
  p_session_id uuid,
  p_kind       text
)
returns table (allowed boolean, reason text, calls_used integer, calls_limit integer, session_cost_usd numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session  public.ai_sessions%rowtype;
  v_status   text;
  v_cost     numeric;
  v_limits   jsonb;
  v_limit    integer;
  v_used     integer;
  v_max_cost numeric;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'JV001';
  end if;

  if p_kind is null or p_kind not in ('model', 'stt', 'tts') then
    raise exception 'invalid_call_kind' using errcode = 'JV010';
  end if;

  select s.*
    into v_session
    from public.ai_sessions s
   where s.id = p_session_id
     and s.user_id = auth.uid()
   for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'JV006';
  end if;

  select u.status, coalesce(u.cost_usd, 0), c.limits
    into v_status, v_cost, v_limits
    from public.ai_usage u
    join public.ai_action_costs c on c.action = u.action
   where u.id = v_session.usage_id;

  if v_status = 'refunded' or v_session.ended_at is not null then
    return query select false, 'closed'::text, null::integer, null::integer, v_cost;
    return;
  end if;

  if v_session.expires_at is not null and v_session.expires_at <= now() then
    update public.ai_sessions s
       set ended_at = now(), end_reason = 'expired'
     where s.id = p_session_id;
    return query select false, 'expired'::text, null::integer, null::integer, v_cost;
    return;
  end if;

  v_max_cost := (v_limits ->> 'max_cost_usd')::numeric;

  if v_max_cost is not null and v_cost >= v_max_cost then
    update public.ai_sessions s
       set ended_at = now(), end_reason = 'cost_limit'
     where s.id = p_session_id;
    return query select false, 'cost_limit'::text, null::integer, null::integer, v_cost;
    return;
  end if;

  v_limit := (v_limits ->> (p_kind || '_calls'))::integer;
  v_used  := case p_kind
               when 'model' then v_session.model_calls
               when 'stt'   then v_session.stt_calls
               else              v_session.tts_calls
             end;

  if v_limit is null or v_used >= v_limit then
    -- No ceiling configured for a kind means no call of that kind: chat has no
    -- voice. Running out of model calls ends the session; running out of
    -- voice calls only refuses the voice.
    if p_kind = 'model' then
      update public.ai_sessions s
         set ended_at = now(), end_reason = 'call_limit'
       where s.id = p_session_id;
    end if;
    return query select false, 'call_limit'::text, v_used, v_limit, v_cost;
    return;
  end if;

  update public.ai_sessions s
     set model_calls = s.model_calls + case when p_kind = 'model' then 1 else 0 end,
         stt_calls   = s.stt_calls   + case when p_kind = 'stt'   then 1 else 0 end,
         tts_calls   = s.tts_calls   + case when p_kind = 'tts'   then 1 else 0 end
   where s.id = p_session_id;

  return query select true, 'ok'::text, v_used + 1, v_limit, v_cost;
end;
$$;


-- The server decides which turn comes next; the client's questionNumber is not
-- trusted. Returns the new count, or null if the session is closed.
create or replace function public.advance_ai_session_turn(p_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_turns integer;
begin
  update public.ai_sessions s
     set turns_completed = s.turns_completed + 1
   where s.id = p_session_id
     and s.ended_at is null
  returning s.turns_completed into v_turns;

  return v_turns;
end;
$$;


create or replace function public.end_ai_session(p_session_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ai_sessions s
     set ended_at = now(), end_reason = p_reason
   where s.id = p_session_id
     and s.ended_at is null;

  return found;
end;
$$;


-- ─── 4. Cost logging, settlement, refund ─────────────────────────────────────

-- One upstream call: a per-call row, and the running totals on the ledger row.
-- Works on any status — a failed call is logged before its refund, and a
-- session keeps logging after its charge is settled. When OpenRouter returns no
-- cost (text-to-speech), the route passes an estimate with p_cost_estimated.
-- Returns the ledger row's running cost.
create or replace function public.record_ai_call(
  p_usage_id          uuid,
  p_kind              text,
  p_model             text,
  p_prompt_tokens     integer default null,
  p_completion_tokens integer default null,
  p_cost_usd          numeric default null,
  p_cost_estimated    boolean default false,
  p_error             text    default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total numeric;
begin
  if p_cost_usd < 0 or p_prompt_tokens < 0 or p_completion_tokens < 0 then
    raise exception 'negative_usage' using errcode = 'JV010';
  end if;

  insert into public.ai_usage_calls
    (usage_id, kind, model, prompt_tokens, completion_tokens, cost_usd, cost_estimated, error)
  values
    (p_usage_id, p_kind, p_model, p_prompt_tokens, p_completion_tokens, p_cost_usd,
     coalesce(p_cost_estimated, false), left(p_error, 500));

  update public.ai_usage u
     set prompt_tokens     = coalesce(u.prompt_tokens, 0)     + coalesce(p_prompt_tokens, 0),
         completion_tokens = coalesce(u.completion_tokens, 0) + coalesce(p_completion_tokens, 0),
         cost_usd          = coalesce(u.cost_usd, 0)          + coalesce(p_cost_usd, 0),
         cost_estimated    = u.cost_estimated or coalesce(p_cost_estimated, false),
         model             = coalesce(u.model, p_model)
   where u.id = p_usage_id
  returning u.cost_usd into v_total;

  return v_total;
end;
$$;


-- reserved → settled. Idempotent: false if the row was not reserved.
create or replace function public.settle_ai_usage(p_usage_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ai_usage u
     set status = 'settled', settled_at = now()
   where u.id = p_usage_id
     and u.status = 'reserved';

  return found;
end;
$$;


-- reserved → refunded, credits returned. Idempotent: false if the row was not
-- reserved, so a double call can never credit twice. A session whose charge is
-- refunded never really started, and is closed.
create or replace function public.refund_ai_usage(p_usage_id uuid, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid;
  v_credits integer;
begin
  update public.ai_usage u
     set status = 'refunded', error = left(p_error, 500), settled_at = now()
   where u.id = p_usage_id
     and u.status = 'reserved'
  returning u.user_id, u.credits_charged into v_user, v_credits;

  if v_user is null then
    return false;
  end if;

  update public.profiles p
     set ai_credits_remaining = coalesce(p.ai_credits_remaining, 0) + v_credits
   where p.id = v_user;

  update public.ai_sessions s
     set ended_at = now(), end_reason = 'first_turn_failed'
   where s.usage_id = p_usage_id
     and s.ended_at is null;

  return true;
end;
$$;


-- Refunds reservations that never settled: the request died between the
-- charge and the settlement (timeout, crashed function, lost connection).
-- Called by a Vercel cron. The window cannot be set below 5 minutes, so a
-- mistaken call cannot refund requests still running.
create or replace function public.refund_stale_ai_reservations(
  p_older_than interval default interval '15 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  if p_older_than is null or p_older_than < interval '5 minutes' then
    raise exception 'stale_window_too_short' using errcode = 'JV010';
  end if;

  for v_id in
    select u.id
      from public.ai_usage u
     where u.status = 'reserved'
       and u.reserved_at < now() - p_older_than
     order by u.reserved_at
     limit 500
     for update skip locked
  loop
    if public.refund_ai_usage(v_id, 'stale_reservation') then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;


-- A free system_ call (inbox classification, email finder, auto-apply
-- screening), logged against the user it was done for. Nothing is charged; the
-- row is born settled.
create or replace function public.log_system_ai_usage(
  p_user_id           uuid,
  p_action            text,
  p_model             text,
  p_prompt_tokens     integer default null,
  p_completion_tokens integer default null,
  p_cost_usd          numeric default null,
  p_cost_estimated    boolean default false,
  p_error             text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  perform public.record_ai_call(
    v_id, 'model', p_model, p_prompt_tokens, p_completion_tokens,
    p_cost_usd, p_cost_estimated, p_error
  );

  return v_id;
end;
$$;


-- ─── 5. Privileges ───────────────────────────────────────────────────────────
--
-- Supabase grants EXECUTE on new functions to anon, authenticated and
-- service_role by default, so every grant below is explicit in both
-- directions.

revoke all on function public.ai_reserve_internal(uuid, text, text)
  from public, anon, authenticated, service_role;

revoke all on function public.reserve_ai_credits(text, text)            from public, anon;
revoke all on function public.start_ai_session(text, text)              from public, anon;
revoke all on function public.claim_ai_session_call(uuid, text)         from public, anon;
grant execute on function public.reserve_ai_credits(text, text)         to authenticated;
grant execute on function public.start_ai_session(text, text)           to authenticated;
grant execute on function public.claim_ai_session_call(uuid, text)      to authenticated;

revoke all on function public.reserve_ai_credits_for(uuid, text, text)                                         from public, anon, authenticated;
revoke all on function public.record_ai_call(uuid, text, text, integer, integer, numeric, boolean, text)       from public, anon, authenticated;
revoke all on function public.settle_ai_usage(uuid)                                                            from public, anon, authenticated;
revoke all on function public.refund_ai_usage(uuid, text)                                                      from public, anon, authenticated;
revoke all on function public.advance_ai_session_turn(uuid)                                                    from public, anon, authenticated;
revoke all on function public.end_ai_session(uuid, text)                                                       from public, anon, authenticated;
revoke all on function public.refund_stale_ai_reservations(interval)                                           from public, anon, authenticated;
revoke all on function public.log_system_ai_usage(uuid, text, text, integer, integer, numeric, boolean, text)  from public, anon, authenticated;

grant execute on function public.reserve_ai_credits_for(uuid, text, text)                                        to service_role;
grant execute on function public.record_ai_call(uuid, text, text, integer, integer, numeric, boolean, text)      to service_role;
grant execute on function public.settle_ai_usage(uuid)                                                           to service_role;
grant execute on function public.refund_ai_usage(uuid, text)                                                     to service_role;
grant execute on function public.advance_ai_session_turn(uuid)                                                   to service_role;
grant execute on function public.end_ai_session(uuid, text)                                                      to service_role;
grant execute on function public.refund_stale_ai_reservations(interval)                                          to service_role;
grant execute on function public.log_system_ai_usage(uuid, text, text, integer, integer, numeric, boolean, text) to service_role;


-- ─── 6. Assert the outcome ───────────────────────────────────────────────────

do $$
declare
  v_fn   text;
  v_role text;
  v_proc record;
begin
  -- anon reaches none of them.
  foreach v_fn in array array[
    'public.ai_reserve_internal(uuid, text, text)',
    'public.reserve_ai_credits(text, text)',
    'public.reserve_ai_credits_for(uuid, text, text)',
    'public.start_ai_session(text, text)',
    'public.claim_ai_session_call(uuid, text)',
    'public.advance_ai_session_turn(uuid)',
    'public.end_ai_session(uuid, text)',
    'public.record_ai_call(uuid, text, text, integer, integer, numeric, boolean, text)',
    'public.settle_ai_usage(uuid)',
    'public.refund_ai_usage(uuid, text)',
    'public.refund_stale_ai_reservations(interval)',
    'public.log_system_ai_usage(uuid, text, text, integer, integer, numeric, boolean, text)'
  ]
  loop
    if has_function_privilege('anon', v_fn, 'EXECUTE') then
      raise exception '%: anon can execute it', v_fn;
    end if;
  end loop;

  -- authenticated reaches exactly the three that use auth.uid().
  foreach v_fn in array array[
    'public.ai_reserve_internal(uuid, text, text)',
    'public.reserve_ai_credits_for(uuid, text, text)',
    'public.advance_ai_session_turn(uuid)',
    'public.end_ai_session(uuid, text)',
    'public.record_ai_call(uuid, text, text, integer, integer, numeric, boolean, text)',
    'public.settle_ai_usage(uuid)',
    'public.refund_ai_usage(uuid, text)',
    'public.refund_stale_ai_reservations(interval)',
    'public.log_system_ai_usage(uuid, text, text, integer, integer, numeric, boolean, text)'
  ]
  loop
    if has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '%: authenticated can execute a service-role function', v_fn;
    end if;
  end loop;

  foreach v_fn in array array[
    'public.reserve_ai_credits(text, text)',
    'public.start_ai_session(text, text)',
    'public.claim_ai_session_call(uuid, text)'
  ]
  loop
    if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
      raise exception '%: authenticated cannot execute it', v_fn;
    end if;
  end loop;

  if has_function_privilege('service_role', 'public.ai_reserve_internal(uuid, text, text)', 'EXECUTE') then
    raise exception 'ai_reserve_internal: service_role can execute it directly';
  end if;

  -- Every one is SECURITY DEFINER with a pinned search_path.
  for v_proc in
    select p.proname, p.prosecdef, p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'ai_reserve_internal', 'reserve_ai_credits', 'reserve_ai_credits_for',
         'start_ai_session', 'claim_ai_session_call', 'advance_ai_session_turn',
         'end_ai_session', 'record_ai_call', 'settle_ai_usage', 'refund_ai_usage',
         'refund_stale_ai_reservations', 'log_system_ai_usage'
       )
  loop
    if not v_proc.prosecdef then
      raise exception '%: not SECURITY DEFINER', v_proc.proname;
    end if;
    if v_proc.proconfig is null
       or not exists (select 1 from unnest(v_proc.proconfig) cfg where cfg like 'search_path=%') then
      raise exception '%: search_path is not pinned', v_proc.proname;
    end if;
  end loop;
end;
$$;
