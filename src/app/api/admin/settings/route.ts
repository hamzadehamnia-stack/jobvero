import { NextResponse } from 'next/server';
import { requireAdmin } from '../_guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { FEATURE_SWITCH } from '@/lib/ai/rules';

// admin_settings.global holds more than this screen edits — trial credits,
// monthly credit quotas, the inbox classification cap — and the AI routes read
// its switches on every request. A save therefore merges what the screen sends
// into the stored value and never replaces it, and it takes only what the
// screen owns: ai_enabled, one toggle per feature, the auto-apply guard.
// Anything else in the request is ignored.

type Json = Record<string, unknown>;

const TOGGLES = new Set<string>([...Object.values(FEATURE_SWITCH), 'ai_matches']);
const LIMITS  = [
  'auto_apply_monthly_guard',
  'inbox_classify_per_alias_per_day',
  'inbox_classify_global_per_day',
] as const;

function asObject(value: unknown): Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

// What the screen shows: a switch that was never set is on.
function forScreen(value: Json) {
  return {
    ai_enabled: value.ai_enabled !== false,
    features:   asObject(value.features),
    limits:     asObject(value.limits),
  };
}

function failure(err: unknown, message: string) {
  console.error('[admin/settings]', err);
  const detail = err instanceof Error ? err.message : '';
  return NextResponse.json({ error: message }, { status: detail.includes('SERVICE_ROLE') ? 503 : 500 });
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('admin_settings')
      .select('value')
      .eq('key', 'global')
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json(forScreen(asObject(data?.value)));
  } catch (err) {
    return failure(err, 'Settings could not be read');
  }
}

export async function PUT(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  try {
    const body = asObject(await req.json().catch(() => null));

    const features: Json = {};
    for (const [key, on] of Object.entries(asObject(body.features))) {
      if (TOGGLES.has(key) && typeof on === 'boolean') features[key] = on;
    }

    const limits: Json = {};
    const sentLimits = asObject(body.limits);
    for (const key of LIMITS) {
      const value = sentLimits[key];
      if (typeof value === 'number' && Number.isInteger(value) && value >= 0) limits[key] = value;
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('admin_settings')
      .select('value')
      .eq('key', 'global')
      .maybeSingle();
    if (error) throw new Error(error.message);

    const current = asObject(data?.value);
    const value: Json = {
      ...current,
      ...(typeof body.ai_enabled === 'boolean' ? { ai_enabled: body.ai_enabled } : {}),
      features: { ...asObject(current.features), ...features },
      limits:   { ...asObject(current.limits), ...limits },
    };

    const { error: saveError } = await admin
      .from('admin_settings')
      .upsert({ key: 'global', value }, { onConflict: 'key' });
    if (saveError) throw new Error(saveError.message);

    return NextResponse.json({ ok: true, settings: forScreen(value) });
  } catch (err) {
    return failure(err, 'Save failed');
  }
}
