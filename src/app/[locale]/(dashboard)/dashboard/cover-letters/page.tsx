import { createClient } from '@/lib/supabase/server';
import CoverLetterClient from '@/components/cover-letter/CoverLetterClient';

export default async function CoverLettersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const userName  = user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';
  const userEmail = user?.email ?? '';

  // Fresh credit fetch — never from cache
  let initialCredits = 0;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('ai_credits_remaining')
      .eq('id', user.id)
      .single();
    initialCredits = profile?.ai_credits_remaining ?? 0;
  }

  return (
    <CoverLetterClient
      userName={userName}
      userEmail={userEmail}
      initialCredits={initialCredits}
    />
  );
}
