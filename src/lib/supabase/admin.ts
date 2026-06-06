import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  if (!key)  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to .env.local (Supabase Dashboard → Settings → API → service_role key).');
  // Service role keys are JWTs — they start with "eyJ". Warn early if the wrong key was pasted.
  if (!key.startsWith('eyJ')) {
    console.warn('[admin] SUPABASE_SERVICE_ROLE_KEY looks invalid — it should start with "eyJ" (it\'s a JWT). You likely pasted the publishable/anon key instead. Get the service_role key from: Supabase Dashboard → Settings → API → service_role (secret).');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
