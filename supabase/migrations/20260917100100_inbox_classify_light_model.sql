-- The inbox classifier moves to the light model, by the rule set in advance.
--
-- Fifteen realistic emails covering every category the classifier must tell
-- apart, five of them ambiguous on purpose, run through both models on
-- 2026-09-17 (block e7, task 5):
--   anthropic/claude-sonnet-4.6   $0.152808  →  $14.26 a week at 200/day
--   google/gemini-3.8-flash       $0.038961  →   $3.64 a week at 200/day
--
-- One disagreement out of fifteen, on an ambiguous email (a shortlist notice
-- with no interview scheduled): both said `shortlist`, Sonnet also moved the
-- application to `interview`, Gemini left the status alone. None of the
-- clear-cut emails — rejection, interview invitation, firm offer — differed.
--
-- The rule fixed before the results: two disagreements or fewer AND none on a
-- clear-cut email → switch. It gives: switch.
--
-- The ceiling follows the measured answers: Gemini wrote up to 754 tokens on
-- these fifteen, so 1200 was under twice that. 2048.

update public.ai_action_costs
   set model      = 'google/gemini-3.8-flash',
       max_tokens = 2048
 where action = 'system_inbox_classify';


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
declare
  v_model  text;
  v_tokens integer;
begin
  select model, max_tokens into v_model, v_tokens
    from public.ai_action_costs where action = 'system_inbox_classify';

  if v_model is distinct from 'google/gemini-3.8-flash' or v_tokens < 2 * 754 then
    raise exception 'ai_action_costs: system_inbox_classify is % with % tokens', v_model, v_tokens;
  end if;
end;
$$;
