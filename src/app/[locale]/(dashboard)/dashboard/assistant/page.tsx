import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ChatClient from '@/components/assistant/ChatClient';

interface Props {
  params: { locale: string };
}

// The conversation is not stored: the assistant starts empty on each visit.
export default async function AssistantPage({ params: { locale } }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .single();

  const displayName =
    user.user_metadata?.full_name || user.email?.split('@')[0] || 'You';

  return (
    <ChatClient
      displayName={displayName}
      avatarUrl={profile?.avatar_url ?? null}
    />
  );
}
