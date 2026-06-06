import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SettingsClient from '@/components/settings/SettingsClient';

interface Props {
  params: { locale: string };
}

export default async function SettingsPage({ params: { locale } }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return (
    <SettingsClient
      userId={user.id}
      email={user.email ?? ''}
      profile={profile ?? null}
    />
  );
}
