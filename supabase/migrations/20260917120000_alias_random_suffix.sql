-- The two aliases that could be guessed.
--
-- Block e9a changed generateEmailAlias to draw four random hex characters, but
-- only for addresses created after it. Two existing aliases still carried the
-- old form -- a bare name, with a counter on collision -- which is what makes a
-- mailbox enumerable: a script walking common first names hits live addresses
-- on the first try, and every hit is a quota to burn and a bill to run up.
--
-- The base is taken from the alias itself, not from full_name: the alias is
-- already the cleaned, lowercase, ASCII form of the name, so rebuilding it from
-- full_name would have to redo the accent folding in SQL and could mangle a
-- first name the owner recognises. Any trailing collision digits go.
--
-- md5(random()) rather than gen_random_bytes: pgcrypto is not guaranteed here,
-- and this is anti-enumeration, not a secret. New aliases come from
-- crypto.randomBytes in src/lib/userIdentity.ts.
--
-- Mail already in flight to an old alias will no longer route. These are the
-- owner's own accounts, migrated on their instruction.
--
-- Re-running does nothing: the WHERE excludes aliases that already carry a
-- suffix, so a second run cannot re-randomise an address someone is using.

update public.profiles p
   set email_alias = regexp_replace(p.email_alias, '[0-9]+$', '')
                     || '-'
                     || substr(md5(random()::text || p.id::text || clock_timestamp()::text), 1, 4)
 where p.email_alias is not null
   and p.email_alias !~ '-[0-9a-f]{4,}$';


do $$
declare
  v_guessable integer;
  v_duplicate integer;
begin
  select count(*) into v_guessable
    from public.profiles
   where email_alias is not null
     and email_alias !~ '-[0-9a-f]{4,}$';

  if v_guessable > 0 then
    raise exception '% alias(es) are still guessable', v_guessable;
  end if;

  select count(*) into v_duplicate
    from (select email_alias from public.profiles
           where email_alias is not null
           group by email_alias having count(*) > 1) d;

  if v_duplicate > 0 then
    raise exception 'the migration produced % duplicate alias(es)', v_duplicate;
  end if;
end;
$$;
