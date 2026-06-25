import { redirect } from 'next/navigation';
import { getRequestContext } from '@/lib/auth/profile';
import { ClientPortal } from '@/components/ClientPortal';

export default async function PortalPage() {
  const { user } = await getRequestContext();
  if (!user) redirect('/login');
  // Admin também pode abrir o portal (pré-visualização); cliente é a regra.
  return <ClientPortal />;
}
