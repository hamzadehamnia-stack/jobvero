import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import KanbanBoard from '@/components/job-tracker/KanbanBoard';
import type { Job } from '@/components/job-tracker/types';

interface Props {
  params: { locale: string };
}

export default async function JobTrackerPage({ params: { locale } }: Props) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/auth/login`);
  }

  const { data: jobs } = await supabase
    .from('applications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <KanbanBoard
      initialJobs={(jobs as Job[]) ?? []}
      userId={user.id}
    />
  );
}
