import { redirect } from 'next/navigation';
import { getRequestContext } from '@/lib/auth/profile';
import { ClientsManager } from '@/components/ClientsManager';

export default async function ClientsPage() {
  // Guarda extra no servidor: cliente nunca acessa esta página.
  const { user, role } = await getRequestContext();
  if (!user) redirect('/login');
  if (role !== 'admin') redirect('/portal');

  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <div className="page-hero">
        <h1 className="page-hero-title">Clientes</h1>
        <p className="page-hero-subtitle">
          Crie e gerencie acessos para seus clientes. Cada cliente entra com o próprio
          email e senha e vê, em tempo real e somente leitura, as campanhas da conta vinculada a ele.
        </p>
      </div>

      <ClientsManager />
    </div>
  );
}
