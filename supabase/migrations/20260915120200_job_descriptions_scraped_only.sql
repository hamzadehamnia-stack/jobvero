-- Job descriptions are never written by AI any more.
--
-- getFullDescription had a third level: when an offer's page could not be
-- scraped, deepseek/deepseek-chat wrote "a complete job description" from the
-- title, the company and a 600-character excerpt. That is an invented offer,
-- and a candidate applying to an invented offer is worse off than one shown the
-- excerpt (decision of 2026-09-15). The level is gone from the code. This
-- removes what it left in the cache — 45 rows on 2026-09-15 — which the cache
-- level would otherwise keep serving, to the jobs page and to auto-apply's CV
-- tailoring alike, and makes sure no such row comes back.

delete from public.job_descriptions_cache
 where source is distinct from 'scrape';

alter table public.job_descriptions_cache
  alter column source set not null;

alter table public.job_descriptions_cache
  add constraint job_descriptions_cache_scraped_only check (source = 'scrape');


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from public.job_descriptions_cache where source is distinct from 'scrape') then
    raise exception 'job_descriptions_cache: a row not scraped remains';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.job_descriptions_cache'::regclass
       and conname  = 'job_descriptions_cache_scraped_only'
  ) then
    raise exception 'job_descriptions_cache: constraint job_descriptions_cache_scraped_only is missing';
  end if;
end;
$$;
