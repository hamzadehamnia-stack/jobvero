-- Waitlist signups.
--
-- Replaces data/waitlist.json, which /api/waitlist wrote with writeFileSync.
-- That works locally and cannot work on Vercel: the deployment filesystem is
-- read-only outside /tmp, so every production signup returned 500. Storing the
-- rows here also stops a public endpoint from appending caller-supplied email
-- addresses to a file tracked in git.

create table if not exists public.waitlist (
  id        uuid primary key default gen_random_uuid(),
  email     text        not null unique,
  joined_at timestamptz not null default now()
);

create index if not exists waitlist_joined_at_idx on public.waitlist (joined_at desc);

-- Service role only: the route inserts with the service key, and nothing should
-- be able to read the list back through PostgREST. RLS enabled with a policy
-- that never matches -- the same shape as api_tokens and admin_settings. The
-- service role bypasses RLS by design.
alter table public.waitlist enable row level security;

drop policy if exists "service role only" on public.waitlist;
create policy "service role only" on public.waitlist
  using (false) with check (false);
