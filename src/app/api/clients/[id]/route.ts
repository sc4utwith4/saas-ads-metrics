// =============================================================================
// src/app/api/clients/[id]/route.ts
// PATCH  — atualiza um cliente (conta vinculada, nome ou senha)  [admin]
// DELETE — remove o login do cliente                              [admin]
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

// ---------------------------------------------------------------------------
// PATCH — { connectionId?, fullName?, password? }
// ---------------------------------------------------------------------------
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  let body: { connectionId?: string | null; fullName?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  // Atualiza perfil (conta vinculada / nome)
  const profilePatch: Record<string, unknown> = {};
  if (body.connectionId !== undefined) profilePatch.connection_id = body.connectionId || null;
  if (typeof body.fullName === 'string' && body.fullName.trim()) profilePatch.full_name = body.fullName.trim();

  if (Object.keys(profilePatch).length) {
    const { error } = await supabaseAdmin.from('profiles').update(profilePatch).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Atualiza senha e/ou nome no Auth
  const authPatch: { password?: string; user_metadata?: Record<string, unknown> } = {};
  if (typeof body.password === 'string' && body.password) {
    if (body.password.length < 6) return NextResponse.json({ error: 'A senha deve ter ao menos 6 caracteres.' }, { status: 400 });
    authPatch.password = body.password;
  }
  if (typeof body.fullName === 'string' && body.fullName.trim()) {
    authPatch.user_metadata = { name: body.fullName.trim(), full_name: body.fullName.trim() };
  }
  if (Object.keys(authPatch).length) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, authPatch);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  // Remove o usuário do Auth (o perfil cai junto via ON DELETE CASCADE).
  const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
