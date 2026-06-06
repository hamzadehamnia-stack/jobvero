import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ChatClient from '@/components/assistant/ChatClient';

interface Props {
  params: { locale: string };
}

export default async function AssistantPage({ params: { locale } }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/${locale}/auth/login`);

  // Load messages + avatar in parallel
  const [{ data: messages }, { data: profile }] = await Promise.all([
    supabase
      .from('chat_messages')
      .select('id, role, content, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(60),
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single(),
  ]);

  const displayName =
    user.user_metadata?.full_name || user.email?.split('@')[0] || 'You';

  return (
    <ChatClient
      userId={user.id}
      displayName={displayName}
      initialMessages={messages ?? []}
      avatarUrl={profile?.avatar_url ?? null}
    />
  );
}
