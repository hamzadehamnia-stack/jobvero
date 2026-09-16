-- No preview model behind a feature we bill.
--
-- match_score (the ATS score, one credit) and system_auto_apply_screening both
-- pinned google/gemini-3-flash-preview. A preview id changes or disappears
-- without notice, and this catalogue has already been broken that way once.
--
-- GET https://openrouter.ai/api/v1/models on 2026-09-16 lists
-- google/gemini-3.8-flash (added 2026-09-02) as the newest stable Gemini Flash:
-- $0.75 per million input tokens and $3.75 per million output, against $0.50
-- and $3.00 for the preview it replaces. The :batch variants are not used: they
-- trade a lower price for asynchronous delivery, which a request route cannot
-- wait for.

update public.ai_action_costs
   set model = 'google/gemini-3.8-flash'
 where action in ('match_score', 'system_auto_apply_screening');


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
declare
  v_bad text;
begin
  if (select count(*) from public.ai_action_costs
       where action in ('match_score', 'system_auto_apply_screening')
         and model = 'google/gemini-3.8-flash') <> 2 then
    raise exception 'ai_action_costs: match_score and system_auto_apply_screening are not on google/gemini-3.8-flash';
  end if;

  -- The rule itself, over every id the catalogue holds: the action's model and
  -- the models pinned in limits.models (the interview's speech models).
  select string_agg(id, ', ')
    into v_bad
    from (
      select c.action || ' = ' || c.model as id, c.model as model from public.ai_action_costs c
      union all
      select c.action || '.' || m.key || ' = ' || m.value, m.value
        from public.ai_action_costs c, lateral jsonb_each_text(coalesce(c.limits -> 'models', '{}'::jsonb)) m
    ) ids
   where model ~* 'preview'
      or model ~* ':free'
      or model ~* '(^|[-_./:])exp(erimental)?([-_./:]|$)';

  if v_bad is not null then
    raise exception 'ai_action_costs: preview, experimental or free model(s): %', v_bad;
  end if;
end;
$$;
