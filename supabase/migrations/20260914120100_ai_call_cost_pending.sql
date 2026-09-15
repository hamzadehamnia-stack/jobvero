-- AI credits, step 2d: deferred cost for calls whose usage never arrives, and
-- the weekly margin view.
--
-- Streaming settles the credit at the first content chunk: from there the
-- client receives tokens and the cost is real. The actual cost comes later, in
-- the usage chunk OpenRouter sends just before [DONE]. A stream that ends
-- without it — the client disconnected, the function was cut short — would
-- leave the call without a cost, and the margin view would under-report
-- exactly the calls it most needs to see.
--
-- So a call can be recorded as 'pending' as soon as it starts producing, while
-- the request is still alive, carrying the generation id OpenRouter returns in
-- the X-Generation-Id response header. The usage chunk completes it. If it
-- never comes, the ai-ledger cron claims the row, reads total_cost from
-- GET https://openrouter.ai/api/v1/generation?id=…, and completes it: deferred
-- work, never a blocking call inside a request. Next.js 14 has no after() and
-- the project has no waitUntil, so nothing may depend on work that runs after
-- the response — the pending row is written while the stream is still open.
--
-- OpenRouter does not document when generation stats become available, so each
-- claim books the next attempt with growing delays (5 min, 15 min, 1 h, 6 h,
-- then daily), and a row still pending a day after its 6th attempt is marked
-- 'unavailable' rather than given a guessed cost.
--
-- Non-streaming calls use the same path when their response carries no cost.


-- ─── 1. ai_usage_calls: generation id and cost status ────────────────────────

alter table public.ai_usage_calls
  add column if not exists generation_id        text,
  add column if not exists cost_status          text        not null default 'final',
  add column if not exists cost_attempts        integer     not null default 0,
  add column if not exists cost_next_attempt_at timestamptz;

alter table public.ai_usage_calls
  drop constraint if exists ai_usage_calls_cost_status_check;

alter table public.ai_usage_calls
  add constraint ai_usage_calls_cost_status_check
  check (cost_status in ('final', 'pending', 'unavailable'));

create index if not exists ai_usage_calls_pending_idx
  on public.ai_usage_calls (cost_next_attempt_at) where cost_status = 'pending';


-- ─── 2. Record a call whose cost is not known yet ────────────────────────────

create or replace function public.record_ai_call_pending(
  p_usage_id      uuid,
  p_kind          text,
  p_model         text,
  p_generation_id text,
  p_error         text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id bigint;
begin
  if p_generation_id is null or length(p_generation_id) not between 1 and 200 then
    raise exception 'invalid_generation_id' using errcode = 'JV010';
  end if;

  insert into public.ai_usage_calls
    (usage_id, kind, model, generation_id, cost_status, cost_next_attempt_at, error)
  values
    (p_usage_id, p_kind, p_model, p_generation_id, 'pending', now() + interval '1 minute', left(p_error, 500))
  returning id into v_id;

  update public.ai_usage u
     set model = coalesce(u.model, p_model)
   where u.id = p_usage_id;

  return v_id;
end;
$$;


-- ─── 3. Complete it, once ────────────────────────────────────────────────────
--
-- pending → final, and the cost and tokens added to the ledger row. Only a
-- pending row moves, so the request (usage chunk) and the cron (generation
-- stats) can both try: the first one wins and the cost is never counted twice.

create or replace function public.complete_ai_call_cost(
  p_call_id           bigint,
  p_prompt_tokens     integer,
  p_completion_tokens integer,
  p_cost_usd          numeric
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usage uuid;
begin
  if p_cost_usd is null or p_cost_usd < 0 or p_prompt_tokens < 0 or p_completion_tokens < 0 then
    raise exception 'invalid_usage' using errcode = 'JV010';
  end if;

  update public.ai_usage_calls c
     set prompt_tokens        = p_prompt_tokens,
         completion_tokens    = p_completion_tokens,
         cost_usd             = p_cost_usd,
         cost_status          = 'final',
         cost_next_attempt_at = null
   where c.id = p_call_id
     and c.cost_status = 'pending'
  returning c.usage_id into v_usage;

  if v_usage is null then
    return false;
  end if;

  update public.ai_usage u
     set prompt_tokens     = coalesce(u.prompt_tokens, 0)     + coalesce(p_prompt_tokens, 0),
         completion_tokens = coalesce(u.completion_tokens, 0) + coalesce(p_completion_tokens, 0),
         cost_usd          = coalesce(u.cost_usd, 0)          + p_cost_usd
   where u.id = v_usage;

  return true;
end;
$$;


-- ─── 4. Hand out the rows the cron should look up ────────────────────────────
--
-- The claim books the next attempt in the same statement, under SKIP LOCKED, so
-- two overlapping cron runs never fetch the same generation. A row still
-- pending when its attempt after the 6th comes due is given up: 'unavailable',
-- no cost, rather than an invented one.

create or replace function public.claim_pending_ai_call_costs(p_limit integer default 50)
returns table (call_id bigint, generation_id text, attempt integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if p_limit is null or p_limit not between 1 and 500 then
    raise exception 'invalid_limit' using errcode = 'JV010';
  end if;

  update public.ai_usage_calls c
     set cost_status = 'unavailable', cost_next_attempt_at = null
   where c.cost_status = 'pending'
     and c.cost_attempts >= 6
     and c.cost_next_attempt_at <= now();

  return query
    with due as (
      select c.id
        from public.ai_usage_calls c
       where c.cost_status = 'pending'
         and c.cost_next_attempt_at <= now()
       order by c.cost_next_attempt_at
       limit p_limit
       for update skip locked
    ),
    claimed as (
      update public.ai_usage_calls c
         set cost_attempts        = c.cost_attempts + 1,
             cost_next_attempt_at = now() + case c.cost_attempts
                                              when 0 then interval '5 minutes'
                                              when 1 then interval '15 minutes'
                                              when 2 then interval '1 hour'
                                              when 3 then interval '6 hours'
                                              else        interval '24 hours'
                                            end
        from due
       where c.id = due.id
      returning c.id, c.generation_id, c.cost_attempts
    )
    select claimed.id, claimed.generation_id, claimed.cost_attempts from claimed;
end;
$$;


-- ─── 5. Privileges on the functions ──────────────────────────────────────────

revoke all on function public.record_ai_call_pending(uuid, text, text, text, text)       from public, anon, authenticated;
revoke all on function public.complete_ai_call_cost(bigint, integer, integer, numeric)   from public, anon, authenticated;
revoke all on function public.claim_pending_ai_call_costs(integer)                       from public, anon, authenticated;

grant execute on function public.record_ai_call_pending(uuid, text, text, text, text)     to service_role;
grant execute on function public.complete_ai_call_cost(bigint, integer, integer, numeric) to service_role;
grant execute on function public.claim_pending_ai_call_costs(integer)                     to service_role;


-- ─── 6. Weekly margin view (brief §10.10) ────────────────────────────────────
--
-- Three costs, never mixed:
--
--   cost_settled_usd   customer actions settled: paid for with credits
--   cost_refunded_usd  customer actions refunded: the credit went back, but
--                      tokens were consumed — absorbed. A quality signal: if
--                      it grows, routes fail after the model has produced
--   cost_system_usd    system_ actions (inbox, email finder, auto-apply
--                      screening): settled, but paid by no customer — the cost
--                      of the owner's own automation
--
-- system_ rows are settled with 0 credits. Counting them in the first column
-- would call them customer-paid and drag cost_per_credit_usd down, so they get
-- their own column.
--
-- cost_per_credit_usd is the brief's signal, on customer-paid actions only: it
-- should stay close to $0.13. Reserved rows (still in flight) are in no column.
-- The plan is the account's plan when the view is read, not when the action
-- ran — the brief's definition, good enough for a weekly look.
--
-- security_invoker, and no client privilege. A view owned by postgres would read
-- ai_usage past its RLS and hand every account's spending to anyone holding
-- the public anon key. Service role only.

create or replace view public.ai_margin_weekly
with (security_invoker = true)
as
select
  date_trunc('week', u.created_at)                                                                         as week,
  coalesce(p.subscription_plan, 'none')                                                                    as plan,
  count(*)                        filter (where u.status = 'settled'  and u.action not like 'system\_%')   as settled_actions,
  coalesce(sum(u.credits_charged) filter (where u.status = 'settled'  and u.action not like 'system\_%'), 0) as credits_settled,
  coalesce(sum(u.cost_usd)        filter (where u.status = 'settled'  and u.action not like 'system\_%'), 0) as cost_settled_usd,
  count(*)                        filter (where u.status = 'refunded' and u.action not like 'system\_%')   as refunded_actions,
  coalesce(sum(u.cost_usd)        filter (where u.status = 'refunded' and u.action not like 'system\_%'), 0) as cost_refunded_usd,
  count(*)                        filter (where u.action like 'system\_%')                                 as system_actions,
  coalesce(sum(u.cost_usd)        filter (where u.action like 'system\_%'), 0)                             as cost_system_usd,
  round(
    sum(u.cost_usd) filter (where u.status = 'settled' and u.action not like 'system\_%')
    / nullif(sum(u.credits_charged) filter (where u.status = 'settled' and u.action not like 'system\_%'), 0),
    4
  )                                                                                                        as cost_per_credit_usd
from public.ai_usage u
join public.profiles p on p.id = u.user_id
where u.status in ('settled', 'refunded')
group by 1, 2;

revoke all on public.ai_margin_weekly from public, anon, authenticated;
grant select on public.ai_margin_weekly to service_role;


-- ─── 7. Assert the outcome ───────────────────────────────────────────────────

do $$
declare
  v_fn   text;
  v_role text;
begin
  foreach v_fn in array array[
    'public.record_ai_call_pending(uuid, text, text, text, text)',
    'public.complete_ai_call_cost(bigint, integer, integer, numeric)',
    'public.claim_pending_ai_call_costs(integer)'
  ]
  loop
    foreach v_role in array array['anon', 'authenticated']
    loop
      if has_function_privilege(v_role, v_fn, 'EXECUTE') then
        raise exception '%: % can execute it', v_fn, v_role;
      end if;
    end loop;

    if not has_function_privilege('service_role', v_fn, 'EXECUTE') then
      raise exception '%: service_role cannot execute it', v_fn;
    end if;

    if not (select p.prosecdef and exists (select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%')
              from pg_proc p where p.oid = v_fn::regprocedure) then
      raise exception '%: not SECURITY DEFINER with a pinned search_path', v_fn;
    end if;
  end loop;

  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'ai_usage_calls'
         and column_name in ('generation_id', 'cost_status', 'cost_attempts', 'cost_next_attempt_at')) <> 4 then
    raise exception 'ai_usage_calls: deferred cost columns are missing';
  end if;

  foreach v_role in array array['anon', 'authenticated']
  loop
    if has_table_privilege(v_role, 'public.ai_margin_weekly', 'SELECT') then
      raise exception 'ai_margin_weekly: % can read it', v_role;
    end if;
  end loop;

  if not exists (
    select 1 from pg_class c
     where c.oid = 'public.ai_margin_weekly'::regclass
       and 'security_invoker=true' = any (c.reloptions)
  ) then
    raise exception 'ai_margin_weekly: security_invoker is not set';
  end if;
end;
$$;
