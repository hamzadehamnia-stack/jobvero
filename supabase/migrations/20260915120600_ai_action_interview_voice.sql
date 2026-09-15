-- interview_session: the speech models and voices, pinned in the catalogue.
--
-- Speech is part of an interview session: claim_ai_session_call counts stt and
-- tts calls against limits.stt_calls and limits.tts_calls. The models were
-- hard-coded in the routes, and both broke in production: text-to-speech named
-- openai/gpt-4o-mini-tts, which OpenRouter does not have, and speech-to-text
-- asked for a response format OpenRouter refuses. Decided and measured on
-- 2026-09-15:
--   · speech-to-text: openai/whisper-1 — $0.006 per minute, cost returned in
--     the response;
--   · text-to-speech: deepgram/aura-2 — $0.03 per 1,000 characters; no preview
--     model, no free tier. English voice aura-2-thalia-en (a Whisper round trip
--     of an interview question: 0 errors in 54 words), French aura-2-agathe-fr.
--     Aura-2 has Spanish voices, none chosen yet, and no Portuguese voice:
--     those interviews run without a spoken recruiter.
-- tts_estimated_cost_usd goes: each speech call's real cost is now recovered
-- from its generation id by the ai-ledger cron, and a setting nothing reads
-- would only mislead.

update public.ai_action_costs
   set limits = (limits - 'tts_estimated_cost_usd')
             || jsonb_build_object(
                  'models',     jsonb_build_object('stt', 'openai/whisper-1', 'tts', 'deepgram/aura-2'),
                  'tts_voices', jsonb_build_object('en', 'aura-2-thalia-en', 'fr', 'aura-2-agathe-fr')
                )
 where action = 'interview_session';


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
declare
  v_limits jsonb := (select limits from public.ai_action_costs where action = 'interview_session');
begin
  if v_limits is null then
    raise exception 'ai_action_costs: no interview_session row';
  end if;
  if v_limits #>> '{models,stt}' is distinct from 'openai/whisper-1'
     or v_limits #>> '{models,tts}' is distinct from 'deepgram/aura-2' then
    raise exception 'ai_action_costs: interview_session speech models not pinned';
  end if;
  if v_limits #>> '{tts_voices,en}' is distinct from 'aura-2-thalia-en'
     or v_limits #>> '{tts_voices,fr}' is distinct from 'aura-2-agathe-fr' then
    raise exception 'ai_action_costs: interview_session voices not pinned';
  end if;
  if v_limits ? 'tts_estimated_cost_usd' then
    raise exception 'ai_action_costs: tts_estimated_cost_usd remains';
  end if;
  -- The session ceilings this migration must not touch.
  if not (v_limits ? 'model_calls' and v_limits ? 'stt_calls' and v_limits ? 'tts_calls'
          and v_limits ? 'max_cost_usd' and v_limits ? 'max_tts_chars' and v_limits ? 'max_answer_chars') then
    raise exception 'ai_action_costs: an interview_session ceiling went missing';
  end if;
end;
$$;
