import type { SupabaseClient } from '@supabase/supabase-js';

function cleanPart(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/[^a-z0-9]/g, '');     // keep only alphanumeric
}

export async function generateEmailAlias(
  firstName: string,
  lastName: string,
  supabase: SupabaseClient,
): Promise<string> {
  const base = (cleanPart(firstName) + cleanPart(lastName)) || 'user';

  const { count: baseCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('email_alias', base);

  if ((baseCount ?? 0) === 0) return base;

  for (let n = 2; n < 10_000; n++) {
    const candidate = `${base}${n}`;
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('email_alias', candidate);
    if ((count ?? 0) === 0) return candidate;
  }

  return `${base}${Date.now()}`;
}

export async function generateJobveroId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('generate_jobvero_id');
  if (error) throw new Error(`generate_jobvero_id RPC failed: ${error.message}`);
  return data as string;
}
