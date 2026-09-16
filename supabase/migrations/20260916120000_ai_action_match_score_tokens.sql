-- The ATS score needs room to answer.
--
-- Migration 20260916100000 moved match_score off a preview model onto
-- google/gemini-3.8-flash. The new model writes more: measured on 2026-09-16,
-- 853, 865 and 1,020 completion tokens on comparable work, against a ceiling of
-- 1,024. The answer was cut mid-string often enough to be caught by the
-- end-to-end test twice in five runs — JSON.parse then failed, the route
-- answered 500 and the credit went back. The user paid nothing, which is right,
-- but the call was billed by OpenRouter and the feature looked broken.
--
-- 2,048 tokens: twice the largest answer measured. At $3.75 per million output
-- tokens, a full answer of that size costs $0.0077; the ones measured cost
-- $0.0034 to $0.0040, and a ceiling nobody reaches costs nothing at all.

update public.ai_action_costs
   set max_tokens = 2048
 where action = 'match_score';


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
declare
  v_tokens integer := (select max_tokens from public.ai_action_costs where action = 'match_score');
begin
  if v_tokens is distinct from 2048 then
    raise exception 'ai_action_costs: match_score max_tokens is %, expected 2048', v_tokens;
  end if;
end;
$$;
