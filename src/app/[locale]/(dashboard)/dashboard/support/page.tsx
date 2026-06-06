import { createClient } from '@/lib/supabase/server';
import { redirect }     from 'next/navigation';
import SupportClient    from '@/components/support/SupportClient';

export default async function SupportPage({ params: { locale } }: { params: { locale: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  return <SupportClient />;
}
