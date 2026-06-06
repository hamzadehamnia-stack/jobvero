import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import InboxClient from '@/components/dashboard/InboxClient';

interface Props {
  params: { locale: string };
}

export default async function InboxPage({ params: { locale } }: Props) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('email_alias, full_name')
    .eq('id', user.id)
    .single();

  const userName = (profile?.full_name as string | null)
    ?? (user.user_metadata?.full_name as string | undefined)
    ?? user.email?.split('@')[0]
    ?? 'Utilisateur';

  return (
    <InboxClient
      emailAlias={profile?.email_alias ?? null}
      userName={userName}
      userId={user.id}
    />
  );
}
