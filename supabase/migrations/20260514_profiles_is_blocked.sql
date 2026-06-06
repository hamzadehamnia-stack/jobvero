-- Add is_blocked flag to profiles
alter table public.profiles
  add column if not exists is_blocked boolean not null default false;

-- Index for fast middleware lookup
create index if not exists profiles_is_blocked_idx on public.profiles (id, is_blocked);
