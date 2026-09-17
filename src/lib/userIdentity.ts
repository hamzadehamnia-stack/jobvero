import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── The address a recruiter writes to ────────────────────────────────────────
//
// Every account gets one, Free included: it is the product's hook. The user
// puts hamza-a7f3@getjobvero.com on their CV, applies by hand, and watches the
// replies get sorted without paying (reference §1).
//
// The suffix is random, and that is the whole point. The previous form was
// `firstnamelastname`, with a counter on collision — `hamzadehamnia`, then
// `hamzadehamnia2`. Nothing had to be guessed: a script walking a list of
// common first and last names would have hit live addresses on the first try,
// and every hit is a mailbox to flood, a quota to burn and a bill to run up.
// Four random hex characters turn a guess into 65,536 guesses per name, on an
// alias that answers nothing when it is wrong.

function cleanPart(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/[^a-z0-9]/g, '')       // keep only alphanumeric
    .slice(0, 24);                   // an address a human can read aloud
}

/** Four hex characters from a cryptographic source — never a counter, never a date. */
function randomSuffix(): string {
  return randomBytes(2).toString('hex');
}

export async function generateEmailAlias(
  firstName: string,
  lastName: string,
  supabase: SupabaseClient,
): Promise<string> {
  // The first name alone: it reads well in front of a recruiter, and the suffix
  // is what makes it unique — not the surname.
  const base = cleanPart(firstName) || cleanPart(lastName) || 'user';

  // A collision is a coincidence, not a sequence: each attempt draws again. Ten
  // attempts against 65,536 suffixes per base is already far past unlikely.
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `${base}-${randomSuffix()}`;
    const { count, error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('email_alias', candidate);

    // A read that failed is not proof the alias is free: taking it anyway could
    // hand one mailbox to two people.
    if (error) throw new Error(`alias availability check failed: ${error.message}`);
    if ((count ?? 0) === 0) return candidate;
  }

  // Ten collisions in a row means something is wrong with the source of
  // randomness, not with this account. Widening the suffix is safe; guessable
  // fallbacks are not.
  return `${base}-${randomBytes(4).toString('hex')}`;
}

export async function generateJobveroId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('generate_jobvero_id');
  if (error) throw new Error(`generate_jobvero_id RPC failed: ${error.message}`);
  return data as string;
}
