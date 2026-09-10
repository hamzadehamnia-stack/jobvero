-- API rate limiting.
--
-- Counters for the route wrapper in src/lib/rateLimit.ts. Deliberately its own
-- table rather than a reuse of feature_usage: that table is the audit trail for
-- billable feature consumption, and mixing throttle counters into it would
-- corrupt quota accounting and make both harder to reason about.
--
-- One row per (identity, window). bucket_key encodes all three parts:
--
--   parse-cv:u:9f3c…:3600     hourly bucket for one user on one route
--   waitlist:ip:7ab1…:86400   daily bucket for one hashed IP
--
-- IP-keyed rows carry an HMAC, never the address itself — see rateLimit.ts.

create table if not exists public.api_rate_limits (
  bucket_key   text        primary key,
  window_start timestamptz not null default now(),
  hits         integer     not null default 0
);

-- Supports the purge of expired buckets (see the daily cron).
create index if not exists api_rate_limits_window_start_idx
  on public.api_rate_limits (window_start);

-- Service role only. The counters are written by the rate limiter with the
-- service key; no browser client should read or write them — being able to read
-- them would leak per-user activity, and being able to write them would let a
-- caller reset their own throttle. RLS on with a policy that never matches is
-- the same shape used by api_tokens, admin_settings and waitlist.
alter table public.api_rate_limits enable row level security;

drop policy if exists "service role only" on public.api_rate_limits;
create policy "service role only" on public.api_rate_limits
  using (false) with check (false);


-- ─── check_rate_limit ────────────────────────────────────────────────────────
--
-- Counts one hit against every window in p_limits and reports whether the
-- caller is still under all of them.
--
-- p_limits is a JSON array of {"w": window_seconds, "n": max_hits}, e.g.
--   '[{"w":3600,"n":100},{"w":86400,"n":200}]'
-- so a route can carry an hourly and a daily ceiling in a single round trip.
--
-- The counting has to happen in ONE statement per window. A read-then-write
-- limiter is racy by construction: two concurrent requests both read 99/100 and
-- both proceed. The INSERT … ON CONFLICT DO UPDATE below does the window reset
-- and the increment inside the same atomic statement, so concurrent callers
-- serialise on the row lock and every hit is counted exactly once.
--
-- Fixed window, not sliding: a caller can spend the tail of one window and the
-- head of the next back to back, so a short burst of up to 2×n is reachable at
-- a boundary. Accepted deliberately — the goal here is bounding cost over
-- hours, and a sliding-window log would need one row per request.
--
-- A denied request still increments its counters. That is intentional: under
-- abuse the limiter gets stricter, not looser.
--
-- SECURITY DEFINER so it can write a table that denies everyone under RLS.
-- `set search_path` is not decoration: without it, a caller able to influence
-- search_path could shadow `api_rate_limits` with their own table and have this
-- function write there instead.

create or replace function public.check_rate_limit(
  p_key    text,
  p_limits jsonb
)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_spec    jsonb;
  v_window  integer;
  v_limit   integer;
  v_hits    integer;
  v_start   timestamptz;
  v_allowed boolean := true;
  v_retry   integer := 0;
begin
  if p_key is null or length(p_key) = 0 then
    raise exception 'check_rate_limit: p_key is required';
  end if;

  for v_spec in select * from jsonb_array_elements(p_limits)
  loop
    v_window := (v_spec ->> 'w')::integer;
    v_limit  := (v_spec ->> 'n')::integer;

    if v_window is null or v_window <= 0 or v_limit is null or v_limit < 0 then
      raise exception 'check_rate_limit: invalid window/limit pair %', v_spec;
    end if;

    insert into public.api_rate_limits as t (bucket_key, window_start, hits)
    values (p_key || ':' || v_window, now(), 1)
    on conflict (bucket_key) do update
      set hits = case
                   when t.window_start <= now() - make_interval(secs => v_window) then 1
                   else t.hits + 1
                 end,
          window_start = case
                   when t.window_start <= now() - make_interval(secs => v_window) then now()
                   else t.window_start
                 end
    returning t.hits, t.window_start into v_hits, v_start;

    if v_hits > v_limit then
      v_allowed := false;
      -- Report the longest wait across every breached window, so a client that
      -- honours Retry-After does not come straight back into a daily ceiling.
      v_retry := greatest(
        v_retry,
        ceil(extract(epoch from (v_start + make_interval(secs => v_window)) - now()))::integer
      );
    end if;
  end loop;

  return query select v_allowed, greatest(v_retry, 1);
end;
$$;

-- Only the service role may call it. anon/authenticated must not be able to
-- burn another identity's counters, or probe them.
revoke all on function public.check_rate_limit(text, jsonb) from public;
revoke all on function public.check_rate_limit(text, jsonb) from anon, authenticated;
grant execute on function public.check_rate_limit(text, jsonb) to service_role;


-- ─── purge_expired_rate_limits ───────────────────────────────────────────────
--
-- Buckets are never read after their window closes, but the rows stay behind.
-- Called from the daily cron (api/cron/auto-apply) so the table does not grow
-- without bound. Keeps 2 days: longer than the longest configured window
-- (86400s), so nothing live is ever removed.

create or replace function public.purge_expired_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.api_rate_limits
  where window_start < now() - interval '2 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_rate_limits() from public;
revoke all on function public.purge_expired_rate_limits() from anon, authenticated;
grant execute on function public.purge_expired_rate_limits() to service_role;
