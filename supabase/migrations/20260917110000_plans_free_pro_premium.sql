-- The plan model of 2026-09-17: Free, Pro, Premium. Nothing else.
--
-- Docs/jobvero-plans-reference.md, frozen the same day, is the authority:
--
--   · there is no time-limited trial. Free is permanent and is the trial.
--   · the Starter tier is merged into Free and no longer exists.
--   · credits a month: Free 10, Pro 60, Premium 150.
--   · automatic applications a month: Free 0, Pro 100, Premium 210 — counted
--     apart from credits, which they never spend (reference §3).
--   · the runaway guard rises 150 → 250, because it must sit ABOVE the highest
--     plan quota. At 150 it was below Premium's 210, so the guard would have
--     refused first and the user would have been told the wrong reason.
--   · Free has 15 emails classified a month, on top of the 25-a-day alias cap
--     every plan carries.
--
-- Every number here stays changeable without a deploy: they live in
-- admin_settings.limits, and src/lib/entitlements.ts reads them from there.
--
-- What this migration does NOT do: refill credits monthly. Nothing in this
-- database ever has — there is no reset function, for any tier — and the new
-- model makes that gap matter. It is reported, not silently invented here.


-- ─── 1. The numbers ──────────────────────────────────────────────────────────

update public.admin_settings
   set value = jsonb_set(
         value,
         '{limits}',
         (coalesce(value -> 'limits', '{}'::jsonb)
            - 'starter_credits_monthly'   -- the tier is gone
            - 'trial_credits')            -- the trial is gone
         || jsonb_build_object(
              'free_credits_monthly',          10,
              'pro_credits_monthly',           60,
              'premium_credits_monthly',       150,
              'auto_apply_monthly',            jsonb_build_object('free', 0, 'pro', 100, 'premium', 210),
              'auto_apply_monthly_guard',      250,
              'inbox_classify_free_per_month', 15
            ),
         true)
 where key = 'global';


-- ─── 2. The accounts ─────────────────────────────────────────────────────────
--
-- Nobody is locked out by the change: an account on the retired 'trial' or
-- 'starter' plan lands on Free, which is now a real plan with its own credits
-- rather than the expired state it used to mean. A paid plan is left alone.

update public.profiles
   set subscription_plan = 'free'
 where subscription_plan is null
    or subscription_plan in ('trial', 'starter');


-- ─── 3. The constraint ───────────────────────────────────────────────────────
--
-- Written after the accounts are migrated: a CHECK added first would reject the
-- rows it is meant to protect.

alter table public.profiles
  drop constraint if exists profiles_subscription_plan_check;

alter table public.profiles
  add constraint profiles_subscription_plan_check
  check (subscription_plan in ('free', 'pro', 'premium'));


-- ─── 4. What a new account gets ──────────────────────────────────────────────
--
-- profiles_apply_trial_grant set trial_ends_at to now() + 3 days and granted
-- trial_credits. It was also the ONLY thing that ever put credits on a new
-- account, so it cannot simply be dropped: a signup would land on zero credits
-- while the pricing page promises ten.
--
-- Replaced, not removed: the same grant, from free_credits_monthly, and no
-- trial date. trial_ends_at is left on the table — dropping a column is not
-- this block's business — but nothing reads it any more.

drop trigger if exists profiles_apply_trial_grant on public.profiles;
drop function if exists public.profiles_apply_trial_grant();

create or replace function public.profiles_apply_free_grant()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_raw     text;
  v_credits integer := 10;   -- the reference's Free allowance, if the setting is unreadable
begin
  begin
    select value -> 'limits' ->> 'free_credits_monthly'
      into v_raw
      from public.admin_settings
     where key = 'global';

    -- Digits only, bounded, so the cast cannot fail on "abc", "-3", "7.5" or an
    -- integer overflow.
    if v_raw ~ '^[0-9]{1,6}$' then
      v_credits := v_raw::integer;
    end if;
  exception when others then
    v_credits := 10;
  end;

  new.ai_credits_remaining := v_credits;
  return new;
end;
$function$;

create trigger profiles_apply_free_grant
  before insert on public.profiles
  for each row
  execute function public.profiles_apply_free_grant();


-- ─── 5. Assert the outcome ───────────────────────────────────────────────────

do $$
declare
  v_limits jsonb := (select value -> 'limits' from public.admin_settings where key = 'global');
  v_guard  integer;
  v_prem   integer;
begin
  if (v_limits ->> 'free_credits_monthly')::integer    is distinct from 10
  or (v_limits ->> 'pro_credits_monthly')::integer     is distinct from 60
  or (v_limits ->> 'premium_credits_monthly')::integer is distinct from 150 then
    raise exception 'admin_settings: the monthly credits are not 10 / 60 / 150';
  end if;

  if (v_limits -> 'auto_apply_monthly' ->> 'free')::integer    is distinct from 0
  or (v_limits -> 'auto_apply_monthly' ->> 'pro')::integer     is distinct from 100
  or (v_limits -> 'auto_apply_monthly' ->> 'premium')::integer is distinct from 210 then
    raise exception 'admin_settings: the auto-apply quotas are not 0 / 100 / 210';
  end if;

  if (v_limits ->> 'inbox_classify_free_per_month')::integer is distinct from 15 then
    raise exception 'admin_settings: the free inbox quota is not 15';
  end if;

  if v_limits ? 'starter_credits_monthly' or v_limits ? 'trial_credits' then
    raise exception 'admin_settings: a retired key survived';
  end if;

  -- The guard exists to stop a runaway loop, never to be the voice that refuses
  -- a customer. Strictly above the highest plan quota, or the wrong reason wins.
  v_guard := (v_limits ->> 'auto_apply_monthly_guard')::integer;
  v_prem  := (v_limits -> 'auto_apply_monthly' ->> 'premium')::integer;
  if v_guard is null or v_guard <= v_prem then
    raise exception 'admin_settings: the auto-apply guard (%) must sit above the Premium quota (%)', v_guard, v_prem;
  end if;

  if exists (select 1 from public.profiles where subscription_plan not in ('free', 'pro', 'premium')) then
    raise exception 'profiles: an account is still on a retired plan';
  end if;

  if to_regprocedure('public.profiles_apply_trial_grant()') is not null then
    raise exception 'the trial grant trigger function still exists';
  end if;

  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.profiles'::regclass
                    and tgname = 'profiles_apply_free_grant'
                    and not tgisinternal) then
    raise exception 'no grant trigger on profiles: a new account would get zero credits';
  end if;
end;
$$;
