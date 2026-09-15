-- Admin settings: switches that switch, limits that are read.
--
-- Decisions of 2026-09-15:
--   · The AI kill switch (brief §10.14 test 19), and one toggle per AI feature,
--     each read by its routes (FEATURE_SWITCH in lib/ai/rules). Three features
--     had no toggle — the assistant chat, document modification, applying with
--     AI — and get one. Written explicitly on, so the admin screen shows what is
--     in force; existing values are kept.
--   · Interviews: credits only. The per-tier monthly session caps go — the page
--     hard-coded 8/15, this table said 10/50, and neither was the rule.
--   · Auto-apply: one monthly guard, here and only here, 150 applications. The
--     per-tier keys and the catalogue's monthly_applications_guard go. A guard,
--     not a rule: Premium's monthly credits bind first.

update public.admin_settings
   set value = jsonb_set(
                 jsonb_set(
                   value || jsonb_build_object('ai_enabled', coalesce(value -> 'ai_enabled', 'true'::jsonb)),
                   '{features}',
                   '{"assistant_chat": true, "modify_document": true, "apply_with_ai": true}'::jsonb
                     || coalesce(value -> 'features', '{}'::jsonb)
                 ),
                 '{limits}',
                 (coalesce(value -> 'limits', '{}'::jsonb)
                   - 'free_auto_apply_monthly' - 'trial_auto_apply_monthly' - 'starter_auto_apply_monthly'
                   - 'pro_auto_apply_monthly'  - 'premium_auto_apply_monthly'
                   - 'free_interviews_monthly' - 'trial_interviews_monthly' - 'starter_interviews_monthly'
                   - 'pro_interviews_monthly'  - 'premium_interviews_monthly')
                   || '{"auto_apply_monthly_guard": 150}'::jsonb
               )
 where key = 'global';

update public.ai_action_costs
   set limits = limits - 'monthly_applications_guard'
 where action = 'auto_apply';


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
declare
  v_value jsonb := (select value from public.admin_settings where key = 'global');
  v_key   text;
begin
  if v_value is null then
    raise exception 'admin_settings: no global row';
  end if;

  if v_value -> 'ai_enabled' is distinct from 'true'::jsonb then
    raise exception 'admin_settings: ai_enabled is not true';
  end if;

  foreach v_key in array array['assistant_chat', 'cv_builder', 'modify_document', 'cover_letter', 'ats_score',
                               'apply_with_ai', 'interview_coach', 'auto_apply', 'ai_matches']
  loop
    if jsonb_typeof(v_value -> 'features' -> v_key) is distinct from 'boolean' then
      raise exception 'admin_settings: features.% is not a boolean', v_key;
    end if;
  end loop;

  if v_value -> 'limits' -> 'auto_apply_monthly_guard' is distinct from '150'::jsonb then
    raise exception 'admin_settings: limits.auto_apply_monthly_guard is not 150';
  end if;

  if exists (
    select 1 from jsonb_object_keys(v_value -> 'limits') as k
     where k like '%\_auto\_apply\_monthly' or k like '%\_interviews\_monthly'
  ) then
    raise exception 'admin_settings: a per-tier auto-apply or interview cap remains';
  end if;

  -- What this migration must not touch.
  foreach v_key in array array['trial_credits', 'starter_credits_monthly', 'pro_credits_monthly',
                               'premium_credits_monthly', 'inbox_classify_global_per_day']
  loop
    if not (v_value -> 'limits') ? v_key then
      raise exception 'admin_settings: limits.% went missing', v_key;
    end if;
  end loop;

  if (select limits ? 'monthly_applications_guard' from public.ai_action_costs where action = 'auto_apply') then
    raise exception 'ai_action_costs: auto_apply still carries monthly_applications_guard';
  end if;
end;
$$;
