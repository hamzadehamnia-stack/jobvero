import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardShell from '@/components/dashboard/DashboardShell';
import { generateEmailAlias, generateJobveroId } from '@/lib/userIdentity';

interface DashboardLayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export default async function DashboardLayout({
  children,
  params: { locale },
}: DashboardLayoutProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/auth/login`);
  }

  // Fetch profile + check if welcome notification already exists (parallel)
  const [{ data: profile }, { count: welcomeCount }] = await Promise.all([
    supabase
      .from('profiles')
      .select('onboarding_completed, avatar_url, email_alias, jobvero_id')
      .eq('id', user.id)
      .single(),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('type', 'welcome'),
  ]);

  // Create welcome notification on very first login (fire-and-forget)
  if ((welcomeCount ?? 0) === 0) {
    supabase.from('notifications').insert({
      user_id: user.id,
      type:    'welcome',
      title:   'Welcome to Jobvero! 🎉',
      message: 'Start by building your CV or exploring job matches.',
    }).then(() => {});
  }

  // Auto-provision identity for users who signed up via Google OAuth or missed the signup API
  if (!profile?.email_alias || !profile?.jobvero_id) {
    const name   = ((profile as Record<string, unknown> | null)?.full_name as string | undefined)
      ?? (user.user_metadata?.full_name as string | undefined)
      ?? '';
    const parts  = name.trim().split(/\s+/);
    try {
      const alias = (profile?.email_alias as string | undefined)
        ?? await generateEmailAlias(parts[0] ?? '', parts.slice(1).join('') ?? '', supabase);
      const jvId  = (profile?.jobvero_id as string | undefined)
        ?? await generateJobveroId(supabase);
      supabase.from('profiles').update({ email_alias: alias, jobvero_id: jvId }).eq('id', user.id).then(() => {});
    } catch {
      // Non-fatal — user can still use the app
    }
  }

  const needsOnboarding    = !profile?.onboarding_completed;
  const initialAvatarUrl   = profile?.avatar_url  ?? null;
  const initialEmailAlias  = (profile?.email_alias as string | undefined) ?? null;

  return (
    <DashboardShell
      locale={locale}
      user={user}
      needsOnboarding={needsOnboarding}
      initialAvatarUrl={initialAvatarUrl}
      initialEmailAlias={initialEmailAlias}
    >
      {children}
    </DashboardShell>
  );
}
