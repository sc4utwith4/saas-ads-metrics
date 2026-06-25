// =============================================================================
// src/app/api/meta/connections/discover/route.ts
// POST — recebe um token e retorna as contas de anúncios que ele acessa.
// Usado na aba de Conexões para o usuário escolher a conta antes de salvar.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { discoverAdAccounts, accountStatusLabel } from '@/lib/meta/credentials';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  let body: { token?: string; apiVersion?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) return NextResponse.json({ error: 'token é obrigatório.' }, { status: 400 });

  const result = await discoverAdAccounts(token, body.apiVersion?.trim() || 'v19.0');
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    user: result.user ?? null,
    accounts: result.accounts.map((a) => ({
      ...a,
      statusLabel: accountStatusLabel(a.status),
    })),
  });
}
