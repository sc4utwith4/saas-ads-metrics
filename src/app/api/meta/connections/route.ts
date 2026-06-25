// =============================================================================
// src/app/api/meta/connections/route.ts
// GET  — lista as conexões Meta (token mascarado)
// POST — cria uma nova conexão (e a ativa, se for a primeira / se solicitado)
//
// Toda a tabela meta_connections é acessada via service_role; a autorização é
// feita aqui exigindo uma sessão de usuário válida.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase/server';
import { discoverAdAccounts, maskToken } from '@/lib/meta/credentials';

export const runtime = 'nodejs';

const DEFAULT_VERSION = 'v19.0';

/** Garante usuário autenticado. */
async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Detecta erro de "tabela não existe" para orientar a rodar a migração. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '');
}

// ---------------------------------------------------------------------------
// GET — lista conexões
// ---------------------------------------------------------------------------
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('meta_connections')
    .select('id, label, ad_account_id, account_name, access_token, api_version, is_active, token_expires_at, created_at')
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ needsMigration: true, connections: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const connections = (data ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    adAccountId: c.ad_account_id,
    accountName: c.account_name,
    tokenMasked: maskToken(c.access_token),
    apiVersion: c.api_version,
    isActive: c.is_active,
    tokenExpiresAt: c.token_expires_at,
    createdAt: c.created_at,
  }));

  return NextResponse.json({ connections });
}

// ---------------------------------------------------------------------------
// POST — cria conexão
// body: { token, adAccountId, label, accountName?, apiVersion?, activate? }
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  let body: {
    token?: string;
    adAccountId?: string;
    label?: string;
    accountName?: string;
    apiVersion?: string;
    activate?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const token = body.token?.trim();
  const adAccountId = body.adAccountId?.trim().replace(/^act_/, '');
  const label = body.label?.trim();
  const apiVersion = body.apiVersion?.trim() || DEFAULT_VERSION;

  if (!token || !adAccountId || !label) {
    return NextResponse.json({ error: 'token, adAccountId e label são obrigatórios.' }, { status: 400 });
  }

  // Valida o token e confirma que ele enxerga a conta informada.
  const discovery = await discoverAdAccounts(token, apiVersion);
  if (!discovery.ok) {
    return NextResponse.json({ error: `Token inválido: ${discovery.error}` }, { status: 400 });
  }
  const match = discovery.accounts.find((a) => a.accountId === adAccountId);
  if (!match) {
    return NextResponse.json(
      { error: 'O token não tem acesso a essa conta de anúncios.' },
      { status: 400 },
    );
  }

  // É a primeira conexão? Então já ativa por padrão.
  const { count } = await supabaseAdmin
    .from('meta_connections')
    .select('id', { count: 'exact', head: true });
  const shouldActivate = body.activate ?? (count === 0);

  if (shouldActivate) {
    await supabaseAdmin.from('meta_connections').update({ is_active: false }).eq('is_active', true);
  }

  const { data, error } = await supabaseAdmin
    .from('meta_connections')
    .insert({
      label,
      ad_account_id: adAccountId,
      account_name: body.accountName?.trim() || match.name,
      access_token: token,
      api_version: apiVersion,
      is_active: shouldActivate,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ needsMigration: true }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id, activated: shouldActivate });
}
