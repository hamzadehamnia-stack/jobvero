import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { dropMalformedAuthCookies } from './cookies';

export async function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return dropMalformedAuthCookies(cookieStore.getAll());
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component — cookies set by middleware
          }
        },
      },
    }
  );
}
