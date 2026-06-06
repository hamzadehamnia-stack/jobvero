import { NextResponse } from 'next/server';
import { requireAdmin } from '../_guard';
import { createAdminClient } from '@/lib/supabase/admin';

function groupByDay(rows: { created_at: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const day = (r.created_at ?? '').slice(0, 10);
    if (day) out[day] = (out[day] ?? 0) + 1;
  }
  return out;
}

function last7Labels(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  try {
    const admin = createAdminClient();

    const now       = new Date();
    const todayStr  = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const days7Str  = new Date(Date.now() - 7  * 86_400_000).toISOString();
    const days30Str = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [
      { count: totalUsers  },
      { count: trialUsers  },
      { count: proUsers    },
      { count: premiumUsers},
      { count: totalCvs    },
      { count: totalLetters},
      { count: totalApps   },
      { count: autoApply   },
      { count: interviews  },
      { count: aiMatches   },
      { count: messages    },
      { count: atsScores   },
      // Daily data for charts
      { data: dailyCvData    },
      { data: dailyLetData   },
      { data: dailyAppData   },
      { data: dailyApplyData },
    ] = await Promise.all([
      admin.from('profiles').select('id',  { count: 'exact', head: true }),
      admin.from('profiles').select('id',  { count: 'exact', head: true }).eq('subscription_plan', 'trial'),
      admin.from('profiles').select('id',  { count: 'exact', head: true }).eq('subscription_plan', 'pro'),
      admin.from('profiles').select('id',  { count: 'exact', head: true }).eq('subscription_plan', 'premium'),
      admin.from('cvs').select('id',       { count: 'exact', head: true }),
      admin.from('cover_letters').select('id', { count: 'exact', head: true }),
      admin.from('applications').select('id',  { count: 'exact', head: true }),
      admin.from('auto_apply_logs').select('id',       { count: 'exact', head: true }),
      admin.from('interview_sessions').select('id',    { count: 'exact', head: true }),
      admin.from('ai_job_matches_cache').select('user_id', { count: 'exact', head: true }),
      admin.from('message_threads').select('id',       { count: 'exact', head: true }),
      admin.from('feature_usage').select('user_id',    { count: 'exact', head: true }).eq('feature_key', 'ATS_SCORE'),
      // 7-day daily data
      admin.from('cvs').select('created_at').gte('created_at', days7Str),
      admin.from('cover_letters').select('created_at').gte('created_at', days7Str),
      admin.from('applications').select('created_at').gte('created_at', days7Str),
      admin.from('auto_apply_logs').select('created_at').gte('created_at', days7Str),
    ]);

    // New-user counts via auth admin API
    const { data: { users: allAuthUsers } } = await admin.auth.admin.listUsers({ page: 1, perPage: 10_000 });
    const newToday = allAuthUsers.filter(u => u.created_at >= todayStr).length;
    const new7d    = allAuthUsers.filter(u => u.created_at >= days7Str).length;
    const new30d   = allAuthUsers.filter(u => u.created_at >= days30Str).length;

    const mrr = ((proUsers ?? 0) * 27) + ((premiumUsers ?? 0) * 49);

    const labels       = last7Labels();
    const cvByDay      = groupByDay(dailyCvData   ?? []);
    const letByDay     = groupByDay(dailyLetData  ?? []);
    const appByDay     = groupByDay(dailyAppData  ?? []);
    const applyByDay   = groupByDay(dailyApplyData ?? []);
    const dailyChart   = labels.map(d => ({
      date: d,
      cvs:         cvByDay[d]    ?? 0,
      letters:     letByDay[d]   ?? 0,
      applications:appByDay[d]   ?? 0,
      autoApply:   applyByDay[d] ?? 0,
    }));

    return NextResponse.json({
      users: {
        total: totalUsers ?? 0,
        trial: trialUsers ?? 0,
        pro: proUsers ?? 0,
        premium: premiumUsers ?? 0,
        free: Math.max(0, (totalUsers ?? 0) - (trialUsers ?? 0) - (proUsers ?? 0) - (premiumUsers ?? 0)),
        newToday, new7d, new30d, mrr,
      },
      features: {
        cvs: totalCvs ?? 0,
        coverLetters: totalLetters ?? 0,
        applications: totalApps ?? 0,
        autoApply: autoApply ?? 0,
        interviews: interviews ?? 0,
        aiMatches: aiMatches ?? 0,
        messages: messages ?? 0,
        atsScores: atsScores ?? 0,
      },
      dailyChart,
    });
  } catch (err) {
    console.error('[admin/stats]', err);
    const msg = err instanceof Error ? err.message : 'Stats failed';
    return NextResponse.json({ error: msg }, { status: msg.includes('SERVICE_ROLE') ? 503 : 500 });
  }
}
