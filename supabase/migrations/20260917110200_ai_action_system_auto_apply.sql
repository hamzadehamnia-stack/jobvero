-- An automatic application becomes a system action.
--
-- ai_margin_weekly sums cost_system_usd over `action like 'system\_%'`. The
-- application's steps used to hang on the action `auto_apply`, which is not a
-- system action — so the moment applications stopped costing a credit, their
-- cost would have left the margin report altogether, and the question "what do
-- my automatic applications cost me this month" would have had no answer.
--
-- Same models and the same ceilings as the row it replaces, step for step:
--   cv     the CV rewritten for the job
--   email  the three-sentence message that carries it
-- The screening (system_auto_apply_screening) and the contact hunt
-- (system_email_finder) already have their own system rows.
--
-- The old `auto_apply` row stays: ai_usage rows reference it with ON DELETE
-- RESTRICT, and deleting the price an old charge was made at would rewrite
-- history. It is simply no longer called.

insert into public.ai_action_costs (action, credits, model, max_tokens, max_input_chars, enabled, limits)
values (
  'system_auto_apply',
  0,
  'anthropic/claude-sonnet-4.5',
  8192,
  5500,
  true,
  jsonb_build_object(
    'models',     jsonb_build_object('cv', 'anthropic/claude-sonnet-4.5', 'email', 'deepseek/deepseek-chat'),
    'max_tokens', jsonb_build_object('cv', 8192, 'email', 256)
  )
)
on conflict (action) do update
  set credits         = excluded.credits,
      model           = excluded.model,
      max_tokens      = excluded.max_tokens,
      max_input_chars = excluded.max_input_chars,
      enabled         = excluded.enabled,
      limits          = excluded.limits;


do $$
declare
  v_row public.ai_action_costs%rowtype;
begin
  select * into v_row from public.ai_action_costs where action = 'system_auto_apply';

  if v_row.action is null then
    raise exception 'system_auto_apply is missing from the catalogue';
  end if;

  if v_row.credits is distinct from 0 then
    raise exception 'system_auto_apply must cost zero credits: an application spends its quota, not credits';
  end if;

  if (v_row.limits -> 'models' ->> 'cv') is null
     or (v_row.limits -> 'models' ->> 'email') is null then
    raise exception 'system_auto_apply is missing a step model';
  end if;

  -- The margin view only sees system_ actions. If this ever stops matching,
  -- the cost disappears from the report without anything failing.
  if v_row.action not like 'system\_%' then
    raise exception 'the action name must start with system_ or its cost leaves cost_system_usd';
  end if;
end;
$$;
