import { createClient } from '@/lib/supabase/server';
import { redirect }     from 'next/navigation';
import AdminDashboard   from '@/components/admin/AdminDashboard';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'hamzadehamnia@gmail.com';

export default async function AdminPage({ params: { locale } }: { params: { locale: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    redirect(`/${locale}/dashboard`);
  }

  return <AdminDashboard userEmail={user.email ?? ''} />;
}
