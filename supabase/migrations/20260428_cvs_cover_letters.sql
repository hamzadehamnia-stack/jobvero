-- ─────────────────────────────────────────────────────────────────────────────
-- CVs table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.cvs (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  title       text        not null default '',
  content     jsonb       not null default '{}',
  template    text,
  country     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.cvs enable row level security;

create policy "cvs: users read own"   on public.cvs for select using (auth.uid() = user_id);
create policy "cvs: users insert own" on public.cvs for insert with check (auth.uid() = user_id);
create policy "cvs: users update own" on public.cvs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cvs: users delete own" on public.cvs for delete using (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cvs_updated_at
  before update on public.cvs
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Cover Letters table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.cover_letters (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  job_title    text        not null default '',
  company_name text        not null default '',
  content      text        not null default '',
  language     text        not null default 'en',
  tone         text        not null default 'Professional',
  cv_id        uuid        references public.cvs(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.cover_letters enable row level security;

create policy "cover_letters: users read own"   on public.cover_letters for select using (auth.uid() = user_id);
create policy "cover_letters: users insert own" on public.cover_letters for insert with check (auth.uid() = user_id);
create policy "cover_letters: users update own" on public.cover_letters for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cover_letters: users delete own" on public.cover_letters for delete using (auth.uid() = user_id);
