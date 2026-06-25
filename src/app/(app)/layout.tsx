import { redirect } from 'next/navigation';
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase/server';
import { Header } from '@/components/Header';
import { roleOf, getProfile } from '@/lib/auth/profile';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const role = roleOf(user);

  // Para o cliente, busca o rótulo da conta vinculada (exibido no header).
  let accountLabel: string | null = null;
  if (role === 'client') {
    const profile = await getProfile(user.id);
    if (profile?.connection_id) {
      const { data } = await supabaseAdmin
        .from('meta_connections')
        .select('label')
        .eq('id', profile.connection_id)
        .maybeSingle();
      accountLabel = data?.label ?? null;
    }
  }

  return (
    <div className="app-shell">
      <Header
        role={role}
        accountLabel={accountLabel}
        user={{ email: user.email ?? '', name: (user.user_metadata?.name as string) ?? (role === 'client' ? 'Cliente' : 'Admin') }}
      />
      <div className="main-content">{children}</div>
    </div>
  );
}
