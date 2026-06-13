import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getEffectiveTier, toFeatureTierKey } from '@/lib/subscription/access';
import AutoApplyClient from '@/components/auto-apply/AutoApplyClient';

interface Props {
  params: { locale: string };
}

export default async function AutoApplyPage({ params: { locale } }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const now          = new Date();
  const startOfDay   = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

  const [
    { data: profile },
    { data: settings },
    { data: appsFeed },
    { count: sentToday },
    { count: sentMonth },
    { data: lastRunRow },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('subscription_plan, trial_ends_at')
      .eq('id', user.id)
      .single(),
    supabase
      .from('auto_apply_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('applications')
      .select('id, job_title, company_name, location, salary, contract_type, send_status, sent_at, cover_letter, thread_id, status, ats_score')
      .eq('user_id', user.id)
      .eq('application_type', 'auto')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('application_type', 'auto')
      .gte('sent_at', startOfDay.toISOString()),
    supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('application_type', 'auto')
      .gte('sent_at', startOfMonth.toISOString()),
    supabase
      .from('applications')
      .select('sent_at')
      .eq('user_id', user.id)
      .eq('application_type', 'auto')
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1),
  ]);

  const tier      = getEffectiveTier(profile?.subscription_plan ?? null, profile?.trial_ends_at ?? null);
  const tierKey   = toFeatureTierKey(tier);
  const isPremium = tierKey === 'premium';

  return (
    <AutoApplyClient
      userId={user.id}
      locale={locale}
      isPremium={isPremium}
      initialSettings={settings ?? null}
      applications={appsFeed ?? []}
      sentToday={sentToday ?? 0}
      sentMonth={sentMonth ?? 0}
      lastRunAt={(lastRunRow as { sent_at: string }[] | null)?.[0]?.sent_at ?? null}
    />
  );
}
