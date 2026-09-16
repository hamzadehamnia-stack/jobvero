import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  if (!key)  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to .env.local (Supabase Dashboard → Settings → API → service_role key).');
  // Two formats are server-side keys, and both are valid here: the legacy
  // service_role JWT ("eyJ…") and the new secret key ("sb_secret_…"). The
  // rotation puts one in place of the other, so a check that knows only the old
  // shape would cry wolf on every request once the new key is in.
  //
  // What is never valid here is a browser key. Pasted in this slot it fails at
  // the first RLS-bypassing call, far from the paste that caused it — hence the
  // warning, said plainly.
  const isServerKey = key.startsWith('eyJ') || key.startsWith('sb_secret_');
  if (!isServerKey) {
    console.warn(
      key.startsWith('sb_publishable_')
        ? '[admin] SUPABASE_SERVICE_ROLE_KEY holds a publishable key (sb_publishable_…), which is the browser key. Use the secret key (sb_secret_…) or the legacy service_role JWT (eyJ…): Supabase Dashboard → Settings → API keys.'
        : '[admin] SUPABASE_SERVICE_ROLE_KEY is neither a secret key (sb_secret_…) nor a service_role JWT (eyJ…). Get it from: Supabase Dashboard → Settings → API keys → secret.',
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
