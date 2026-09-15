-- AI credits: a ledger action of its own for letter template adaptation.
--
-- Step 2a priced letter-templates/[id]/adapt as `application`: same model,
-- same ceilings, same credit. The cost profile was right, but ai_usage is
-- readable by the user, and their history would show "application" for what
-- was only a template adaptation — wrong, and a support question waiting to
-- happen. letter_adapt differs from application by meaning, not by price, and
-- the meaning is visible to the customer.

insert into public.ai_action_costs (action, credits, model, max_tokens, max_input_chars, limits) values
  ('letter_adapt', 1, 'anthropic/claude-sonnet-4.6', 1024, 12000, '{}')
on conflict (action) do update set
  credits         = excluded.credits,
  model           = excluded.model,
  max_tokens      = excluded.max_tokens,
  max_input_chars = excluded.max_input_chars,
  limits          = excluded.limits,
  updated_at      = now();


-- ─── Assert the outcome ──────────────────────────────────────────────────────
--
-- The catalogue count guard moves from 12 (step 2a) to 13, and letter_adapt
-- must match application on everything but its name.

do $$
begin
  if (select count(*) from public.ai_action_costs) <> 13 then
    raise exception 'ai_action_costs: expected 13 actions, found %', (select count(*) from public.ai_action_costs);
  end if;

  if not exists (
    select 1
      from public.ai_action_costs l
      join public.ai_action_costs a on a.action = 'application'
     where l.action          = 'letter_adapt'
       and l.credits         = 1
       and l.credits         = a.credits
       and l.model           = a.model
       and l.max_tokens      = a.max_tokens
       and l.max_input_chars = a.max_input_chars
       and l.limits          = a.limits
       and l.enabled
  ) then
    raise exception 'ai_action_costs: letter_adapt does not match application on credits, model and ceilings';
  end if;
end;
$$;
