-- Close the INSERT and DELETE holes on public.profiles.
--
-- Must be applied BEFORE 20260913120100_stripe_billing.sql, whose assertion
-- checks INSERT on the subscription columns and fails until this has run.
--
-- harden_profiles_write_access (10 September, applied directly to the
-- database) revoked the table-level UPDATE and re-granted it column by column.
-- It never touched INSERT or DELETE, and both are still granted on the whole
-- table to anon and authenticated. RLS does not cover the gap: policies decide
-- which rows a user may write, never which columns, and profiles_insert_own
-- only requires id = auth.uid().
--
-- The row is not created by a trigger on auth.users — there is none. It is
-- created by client-side upserts under the user's own JWT. So today any
-- signed-in user can:
--
--   delete from profiles where id = auth.uid();          -- profiles_delete_own
--   insert into profiles (id, subscription_plan, ai_credits_remaining)
--   values (auth.uid(), 'premium', 999999);               -- table-level INSERT
--
-- and a plain delete + re-insert also hands out a fresh trial_ends_at every
-- time, while wiping a paying user's subscription row.


-- ─── 1. INSERT: column-level grant only ──────────────────────────────────────
--
-- Exactly the columns written by the upserts that can create the row:
-- OnboardingModal.tsx, SettingsClient.tsx (four sections) and
-- api/auth/signup/route.ts.
--
-- email_alias and jobvero_id are granted because authenticated already holds
-- UPDATE on both (harden_profiles_write_access); withholding INSERT alone would
-- protect nothing. Section 5 constrains what an alias may be.
--
-- Not granted, although UPDATE is: target_job, minimum_salary, notify_new_jobs.
-- No client code writes them.

revoke insert on public.profiles from anon, authenticated;

grant insert (
  id,
  full_name, phone, location, avatar_url,
  job_title, linkedin_url, portfolio_url,
  target_job_title, target_countries, sector, contract_type,
  work_type, target_country, min_salary, max_salary, available_from,
  notify_email_alerts, notify_job_alerts, notify_weekly_report,
  preferred_language, onboarding_completed, updated_at,
  email_alias, jobvero_id
) on public.profiles to authenticated;


-- ─── 2. DELETE and the remaining table privileges ────────────────────────────
--
-- No client code deletes a profile. Account deletion will go through a
-- dedicated server route using the service role; deleting the auth user
-- already cascades here through profiles_id_fkey.
--
-- The policy is dropped and the privilege revoked as well, so the hole does not
-- reopen if RLS is ever disabled on this table.
--
-- TRUNCATE, REFERENCES and TRIGGER come from Supabase's default grants.
-- PostgREST exposes none of them, but TRUNCATE ignores RLS entirely, and none
-- of the three has any use for a client.

drop policy if exists profiles_delete_own on public.profiles;

revoke delete, truncate, references, trigger on public.profiles from anon, authenticated;


-- ─── 3. Trial quota: one value, in admin_settings ────────────────────────────
--
-- 10 credits: an AI interview costs 5, so a quota of 5 would be spent by a
-- single action. Set explicitly — this is a product decision, not a default to
-- merge around.

do $$
begin
  update public.admin_settings
     set value      = jsonb_set(value, '{limits,trial_credits}', to_jsonb(10), true),
         updated_at = now()
   where key = 'global';

  if not found then
    raise exception 'admin_settings has no ''global'' row — expected the seed from 20260514_admin_settings.sql';
  end if;
end;
$$;


-- ─── 4. Trial grant on insert, from admin_settings ───────────────────────────
--
-- Replaces the column DEFAULTs on trial_ends_at and ai_credits_remaining, so
-- the quota is read from admin_settings. A BEFORE INSERT trigger also
-- overwrites any value supplied with the insert — a second layer behind the
-- column grants, and it applies to the service role too.
--
-- This trigger must never block the creation of a profile. A missing, invalid
-- or unreadable trial_credits falls back to 10 instead of raising: the admin
-- dashboard can save a settings blob without the key (see
-- api/admin/settings/route.ts), and a raise here would turn that one click into
-- a total signup outage — BEFORE INSERT also fires on upserts against existing
-- rows, so every settings save would fail with it. The 10 is a floor for that
-- failure, not a second source of truth: the normal path always reads
-- admin_settings.
--
-- SECURITY DEFINER because admin_settings is service-role only: run as the
-- inserting user, the lookup would find nothing. The fixed search_path stops a
-- caller from shadowing admin_settings or profiles with their own objects.
--
-- subscription_plan loses its default ('trial') and stays null. Every reader in
-- the current code maps null to 'trial' (getEffectiveTier, getDisplayTier,
-- useSubscription, interview-coach), so a null row behaves exactly like
-- 'trial' does today. 'free' would not: getEffectiveTier returns it as-is.
--
-- Existing rows are not touched.

create or replace function public.profiles_apply_trial_grant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raw     text;
  v_credits integer := 10;
begin
  begin
    select value -> 'limits' ->> 'trial_credits'
      into v_raw
      from public.admin_settings
     where key = 'global';

    -- Digits only, bounded, so the cast below cannot fail on "abc", "-3",
    -- "7.5" or an integer overflow.
    if v_raw ~ '^[0-9]{1,6}$' then
      v_credits := v_raw::integer;
    end if;
  exception when others then
    v_credits := 10;
  end;

  new.trial_ends_at        := now() + interval '3 days';
  new.ai_credits_remaining := v_credits;
  return new;
end;
$$;

-- Trigger functions are not checked for EXECUTE when the trigger fires, so this
-- only removes a pointless direct entry point.
revoke all on function public.profiles_apply_trial_grant() from public, anon, authenticated;

drop trigger if exists profiles_apply_trial_grant on public.profiles;
create trigger profiles_apply_trial_grant
  before insert on public.profiles
  for each row execute function public.profiles_apply_trial_grant();

alter table public.profiles
  alter column trial_ends_at        drop default,
  alter column ai_credits_remaining drop default,
  alter column subscription_plan    drop default;


-- ─── 5. Reserved email aliases ───────────────────────────────────────────────
--
-- The alias is the local part of <alias>@getjobvero.com: the inbox webhook
-- routes on it and outbound mail is sent From it. Without this, a user can set
-- theirs to support and send mail as support@getjobvero.com.
--
-- Compared lower-cased, because mail clients treat local parts
-- case-insensitively and generateEmailAlias is not the only writer — the
-- client holds UPDATE on the column. split_part is defensive: aliases are
-- stored without the domain today.
--
-- reply and apply are on the list because the inbox webhook already treats
-- them as system addresses, but nothing stopped a user from taking them.
--
-- Exact matches only. Variants such as support1 or jobvero-support pass.
--
-- One existing account holds 'admin': the owner's, whose full_name is also
-- 'Admin' — which is where the alias came from, and why any regeneration would
-- produce it again. Both are corrected here, by the owner's decision. Thread
-- replies are unaffected: they route on reply+{threadId}@, not on the alias.
-- Only mail sent straight to admin@getjobvero.com stops reaching that inbox.
-- The WHERE matches on the alias, so a re-run is a no-op.

update public.profiles
   set email_alias = 'hamza',
       full_name   = 'Hamza Dehamnia'
 where email_alias = 'admin';

alter table public.profiles
  drop constraint if exists profiles_email_alias_not_reserved;

alter table public.profiles
  add constraint profiles_email_alias_not_reserved
  check (lower(split_part(email_alias, '@', 1)) not in (
    'support', 'admin', 'billing', 'noreply', 'no-reply', 'contact', 'help',
    'info', 'team', 'security', 'abuse', 'postmaster', 'jobvero',
    'reply', 'apply'
  ));


-- ─── 6. Assert the outcome ───────────────────────────────────────────────────
--
-- has_*_privilege sees table-level and column-level grants alike. Any failure
-- aborts the whole migration.

do $$
declare
  v_role text;
  v_col  text;
  v_priv text;
begin
  foreach v_role in array array['anon', 'authenticated']
  loop
    foreach v_priv in array array['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
    loop
      if has_table_privilege(v_role, 'public.profiles', v_priv) then
        raise exception 'profiles: % still holds %', v_role, v_priv;
      end if;
    end loop;

    foreach v_col in array array[
      'subscription_plan', 'trial_ends_at', 'subscription_started_at',
      'ai_credits_remaining', 'ai_credits_reset_at', 'is_blocked', 'created_at'
    ]
    loop
      foreach v_priv in array array['INSERT', 'UPDATE']
      loop
        if has_column_privilege(v_role, 'public.profiles', v_col, v_priv) then
          raise exception 'profiles.% is still writable by % via %', v_col, v_role, v_priv;
        end if;
      end loop;
    end loop;
  end loop;

  if has_table_privilege('anon', 'public.profiles', 'INSERT') then
    raise exception 'profiles: anon still holds INSERT';
  end if;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'profiles' and cmd = 'DELETE'
  ) then
    raise exception 'profiles: a DELETE policy still exists';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.profiles'::regclass
       and tgname  = 'profiles_apply_trial_grant'
       and tgenabled <> 'D'
  ) then
    raise exception 'profiles: trigger profiles_apply_trial_grant is missing or disabled';
  end if;

  if (select value -> 'limits' ->> 'trial_credits'
        from public.admin_settings where key = 'global') is distinct from '10' then
    raise exception 'admin_settings: limits.trial_credits is not 10';
  end if;
end;
$$;
