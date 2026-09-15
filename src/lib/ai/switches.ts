import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminSwitches } from './rules';

/**
 * The admin switches from admin_settings.global, read with the service role:
 * the table is closed to every other role. null when there is no settings row —
 * nothing was ever switched off. Throws when the read fails: a switch that
 * cannot be read is not assumed to be on.
 */
export async function loadAdminSwitches(admin: SupabaseClient): Promise<AdminSwitches | null> {
  const { data, error } = await admin
    .from('admin_settings')
    .select('value')
    .eq('key', 'global')
    .maybeSingle();

  if (error) throw new Error(`admin_settings read failed: ${error.message}`);

  const value = data?.value;
  if (!value || typeof value !== 'object') return null;

  const { ai_enabled, features } = value as { ai_enabled?: unknown; features?: unknown };
  return {
    ai_enabled,
    features: features && typeof features === 'object' ? (features as Record<string, unknown>) : null,
  };
}
