// =============================================================================
// src/app/api/clients/route.ts
// GET  — lista os clientes (admin)
// POST — cria um login de cliente (admin) via Supabase Admin API e vincula
//        a uma conta de anúncios (conexão Meta). O cliente nasce com papel
//        'client' e acesso somente leitura ao portal.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getRequestContext } from '@/lib/auth/profile';

export const runtime = 'nodejs';

async function requireAdmin() {
  const { user, role } = await getRequestContext();
  if (!user) return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };
  if (role !== 'admin') return { error: NextResponse.json({ error: 'Acesso restrito a administradores.' }, { status: 403 }) };
  return { user };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// GET — lista clientes (com a conexão vinculada)
// ---------------------------------------------------------------------------
export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, connection_id, created_at, connection:meta_connections(label, account_name, ad_account_id)')
    .eq('role', 'client')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clients = (data ?? []).map((c) => {
    const conn = Array.isArray(c.connection) ? c.connection[0] : c.connection;
    return {
      id: c.id,
      email: c.email,
      fullName: c.full_name,
      connectionId: c.connection_id,
      accountLabel: conn?.label ?? null,
      accountName: conn?.account_name ?? null,
      adAccountId: conn?.ad_account_id ?? null,
      createdAt: c.created_at,
    };
  });

  return NextResponse.json({ clients });
}

// ---------------------------------------------------------------------------
// POST — cria cliente
// body: { fullName, email, password, connectionId? }
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  let body: { fullName?: string; email?: string; password?: string; connectionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const fullName = body.fullName?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? '';
  const connectionId = body.connectionId?.trim() || null;

  if (!fullName) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 });
  if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: 'Email inválido.' }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: 'A senha deve ter ao menos 6 caracteres.' }, { status: 400 });

  // Cria o usuário já confirmado, marcado como cliente.
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'client' },
    user_metadata: { name: fullName, full_name: fullName },
  });

  if (createErr || !created?.user) {
    const msg = createErr?.message || 'Falha ao criar usuário.';
    const friendly = /already.*registered|exists/i.test(msg) ? 'Já existe um usuário com esse email.' : msg;
    return NextResponse.json({ error: friendly }, { status: 400 });
  }

  // Cria o perfil vinculado. Se falhar, remove o usuário órfão.
  const { error: profileErr } = await supabaseAdmin.from('profiles').insert({
    id: created.user.id,
    role: 'client',
    email,
    full_name: fullName,
    connection_id: connectionId,
    created_by: auth.user.id,
  });

  if (profileErr) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: `Falha ao salvar perfil: ${profileErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: created.user.id });
}
