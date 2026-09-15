-- cv_import: room for a dense CV.
--
-- parse-cv fits the CV text into what max_input_chars leaves after its
-- extraction prompt (about 3,700 characters). At 12,000 that left about 8,300
-- characters of CV, short for a dense CV — and a legitimate CV cut or refused
-- costs a customer. 16,000 input characters stay well within what one credit
-- pays for (decision of 2026-09-15).

update public.ai_action_costs
   set max_input_chars = 16000
 where action = 'cv_import'
   and max_input_chars = 12000;


-- ─── Assert the outcome ──────────────────────────────────────────────────────

do $$
begin
  if (select max_input_chars from public.ai_action_costs where action = 'cv_import') is distinct from 16000 then
    raise exception 'ai_action_costs: cv_import max_input_chars is not 16000';
  end if;
end;
$$;
