-- Output ceilings: at least twice the largest answer measured.
--
-- A model that runs out of tokens does not fail loudly: it stops mid-sentence.
-- What follows depends on the caller — a JSON answer becomes unparseable and
-- the route refunds after paying for the call, a plain-text answer is saved
-- half-written and the user keeps a truncated letter. Two of those were found
-- in two days (match_score, then the auto-apply screening), so the whole
-- catalogue was measured on 2026-09-16 and the same rule applied to all of it.
--
-- Measured output, ceiling before → after:
--   system_auto_apply_screening   61 tokens, CUT OFF (finish_reason=length,
--                                 the answer was empty and unparseable)   64 → 256
--   application                   541 tokens (11 real calls)            1024 → 2048
--   auto_apply                    2102 tokens (adaptCVForJob, measured)  4000 → 8192
--
-- Left as they are, already over twice their largest measured answer:
--   chat 2048/33 · quick_write 2048/85 · cv_import 2048/192 ·
--   interview_session 1024/350 · system_interview_report_retry 1024/335 ·
--   letter_adapt 1024/390 · system_inbox_classify 1200/436 ·
--   cv_transform 5000/688 · match_score 2048/1020 (raised yesterday) ·
--   cv_generation 8000/1437 · system_email_finder 300/19
--
-- The measurements for chat and quick_write come from short test prompts and
-- are not a worst case; their ceilings are generous for another reason — the
-- answers are streamed to the user, who sees the cut.

update public.ai_action_costs set max_tokens = 256  where action = 'system_auto_apply_screening';
update public.ai_action_costs set max_tokens = 2048 where action = 'application';
update public.ai_action_costs set max_tokens = 8192 where action = 'auto_apply';


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
declare
  v_bad text;
begin
  select string_agg(action || ' = ' || max_tokens, ', ')
    into v_bad
    from public.ai_action_costs
   where (action = 'system_auto_apply_screening' and max_tokens <> 256)
      or (action = 'application'                 and max_tokens <> 2048)
      or (action = 'auto_apply'                  and max_tokens <> 8192);

  if v_bad is not null then
    raise exception 'ai_action_costs: ceilings not raised: %', v_bad;
  end if;

  -- No action may sit under the largest answer the ledger has actually seen,
  -- doubled. This checks the rule against real data, now and on every later run.
  select string_agg(format('%s (ceiling %s, largest answer %s)', c.action, c.max_tokens, s.max_out), ', ')
    into v_bad
    from public.ai_action_costs c
    join lateral (
      select max(k.completion_tokens) as max_out
        from public.ai_usage_calls k
        join public.ai_usage u on u.id = k.usage_id
       where u.action = c.action and k.kind = 'model'
    ) s on true
   where s.max_out is not null
     and c.max_tokens < s.max_out * 2;

  if v_bad is not null then
    raise exception 'ai_action_costs: ceiling below twice the largest measured answer: %', v_bad;
  end if;
end;
$$;
