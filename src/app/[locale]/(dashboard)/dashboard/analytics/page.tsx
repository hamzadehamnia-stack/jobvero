import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AnalyticsClient, { type AnalyticsData } from '@/components/dashboard/AnalyticsClient';

interface Props {
  params: { locale: string };
}

export default async function AnalyticsPage({ params: { locale } }: Props) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const [{ data: appRows }, { data: eventRows }] = await Promise.all([
    supabase
      .from('applications')
      .select('id, job_title, company_name, location, status, job_source, sent_at, created_at, send_status, application_type')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('application_events')
      .select('id, application_id, event_type, description, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const data: AnalyticsData = {
    rawApps:   (appRows   ?? []) as AnalyticsData['rawApps'],
    rawEvents: (eventRows ?? []) as AnalyticsData['rawEvents'],
  };

  return <AnalyticsClient data={data} />;
}
