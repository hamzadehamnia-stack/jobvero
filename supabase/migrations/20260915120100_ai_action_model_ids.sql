-- Two catalogue model ids that OpenRouter does not list.
--
-- Checked on 2026-09-15 by security-tests/aiModels.test.js against
-- GET https://openrouter.ai/api/v1/models (445 models): eleven of the thirteen
-- ids are listed. These two were copied from the code, which writes the
-- version with a hyphen; OpenRouter's ids use a dot.
--
--   auto_apply             anthropic/claude-sonnet-4-5  →  anthropic/claude-sonnet-4.5
--   system_inbox_classify  anthropic/claude-sonnet-4-6  →  anthropic/claude-sonnet-4.6
--
-- OpenRouter still resolves both hyphenated ids to the dotted ones today
-- (GET /api/v1/models/<id>/endpoints answers for either), so nothing is broken
-- in production. That resolution is undocumented; the listed id is the
-- contract. Same models, same versions: only the spelling changes.
--
-- No route reads these two rows yet: auto-apply and the inbox webhook move onto
-- the catalogue in step 2e.

update public.ai_action_costs
   set model = 'anthropic/claude-sonnet-4.5'
 where action = 'auto_apply'
   and model  = 'anthropic/claude-sonnet-4-5';

update public.ai_action_costs
   set model = 'anthropic/claude-sonnet-4.6'
 where action = 'system_inbox_classify'
   and model  = 'anthropic/claude-sonnet-4-6';


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
begin
  if (select model from public.ai_action_costs where action = 'auto_apply')
       is distinct from 'anthropic/claude-sonnet-4.5' then
    raise exception 'ai_action_costs: auto_apply model is not anthropic/claude-sonnet-4.5';
  end if;

  if (select model from public.ai_action_costs where action = 'system_inbox_classify')
       is distinct from 'anthropic/claude-sonnet-4.6' then
    raise exception 'ai_action_costs: system_inbox_classify model is not anthropic/claude-sonnet-4.6';
  end if;

  if exists (select 1 from public.ai_action_costs where model ~ '^anthropic/claude-[a-z]+-[0-9]+-[0-9]+$') then
    raise exception 'ai_action_costs: an Anthropic model id still spells its version with a hyphen';
  end if;
end;
$$;
