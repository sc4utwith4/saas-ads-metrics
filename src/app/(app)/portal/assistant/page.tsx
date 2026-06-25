import { redirect } from 'next/navigation';
import { getRequestContext } from '@/lib/auth/profile';
import { ClientAssistant } from '@/components/ClientAssistant';

export default async function PortalAssistantPage() {
  const { user } = await getRequestContext();
  if (!user) redirect('/login');
  return <ClientAssistant />;
}
