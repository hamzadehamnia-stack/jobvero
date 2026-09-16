-- Auto-apply and the email finder come back into the catalogue.
--
-- Five model calls lived outside it: the CV tailoring, the application email
-- body, the ATS screening, and the two email-finder levels. Outside the
-- catalogue means outside the model guard (a preview id survived three reviews
-- there), outside the output ceilings, and outside the ledger — an auto-apply
-- run cost real money and left no trace of what.
--
-- Each step now takes its model and its ceiling from here. As decided for the
-- interview's speech calls, an action whose work happens in stages carries a
-- map: limits.models.<step> and limits.max_tokens.<step>. aiModels checks every
-- id in limits.models against OpenRouter's list, so a step is as guarded as an
-- action.
--
-- Ceilings follow the rule of 2026-09-16 — at least twice the largest answer
-- measured:
--   auto_apply.cv        2102 tokens measured (a full HTML CV)   → 8192
--   auto_apply.email      106 tokens measured                    → 256
--   system_email_finder.scrape  19 tokens measured               → 300 (kept)
--   system_email_finder.search  14 tokens measured               → 300 (kept)
--   system_auto_apply_screening 61 tokens, was cut off           → 256 (done 20260916130000)
--
-- And auto_apply becomes what the user pays: one credit per application sent,
-- not per model call. Its internal steps cost the house, on the application's
-- own ledger row.

update public.ai_action_costs
   set credits    = 1,
       model      = 'anthropic/claude-sonnet-4.5',
       max_tokens = 8192,
       limits     = limits
                 || jsonb_build_object(
                      'models',     jsonb_build_object(
                                      'cv',    'anthropic/claude-sonnet-4.5',
                                      'email', 'deepseek/deepseek-chat'),
                      'max_tokens', jsonb_build_object(
                                      'cv',    8192,
                                      'email', 256))
 where action = 'auto_apply';

update public.ai_action_costs
   set limits = limits
             || jsonb_build_object(
                  'models',     jsonb_build_object(
                                  'scrape', 'deepseek/deepseek-chat',
                                  'search', 'perplexity/sonar'),
                  'max_tokens', jsonb_build_object(
                                  'scrape', 300,
                                  'search', 300))
 where action = 'system_email_finder';


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
declare
  v_auto   jsonb := (select limits from public.ai_action_costs where action = 'auto_apply');
  v_finder jsonb := (select limits from public.ai_action_costs where action = 'system_email_finder');
begin
  if (select credits from public.ai_action_costs where action = 'auto_apply') <> 1 then
    raise exception 'ai_action_costs: auto_apply must cost exactly one credit per application';
  end if;

  if v_auto #>> '{models,cv}' is null or v_auto #>> '{models,email}' is null
     or v_finder #>> '{models,scrape}' is null or v_finder #>> '{models,search}' is null then
    raise exception 'ai_action_costs: a step model is missing';
  end if;

  if (v_auto #>> '{max_tokens,cv}')::integer < 2 * 2102
     or (v_auto #>> '{max_tokens,email}')::integer < 2 * 106
     or (v_finder #>> '{max_tokens,scrape}')::integer < 2 * 19
     or (v_finder #>> '{max_tokens,search}')::integer < 2 * 14 then
    raise exception 'ai_action_costs: a step ceiling is below twice its measured answer';
  end if;

  -- The rule of the previous migration, re-checked over step models too.
  if exists (
    select 1
      from public.ai_action_costs c, lateral jsonb_each_text(coalesce(c.limits -> 'models', '{}'::jsonb)) m
     where m.value ~* 'preview' or m.value ~* ':free'
        or m.value ~* '(^|[-_./:])exp(erimental)?([-_./:]|$)'
  ) then
    raise exception 'ai_action_costs: a step pins a preview, experimental or free model';
  end if;
end;
$$;
