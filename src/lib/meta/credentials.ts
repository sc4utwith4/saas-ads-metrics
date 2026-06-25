// =============================================================================
// src/lib/meta/credentials.ts
// Resolve as credenciais da Meta API a partir da CONEXÃO ATIVA no banco
// (tabela meta_connections). Se não houver conexão ativa — ou a tabela ainda
// não existir — cai no fallback das variáveis de ambiente (.env), mantendo a
// conta atual funcionando até a primeira conexão ser cadastrada.
//
// Também expõe helpers para descobrir as contas de anúncios de um token e
// validar um token, usados pela aba de Conexões.
// =============================================================================

import { supabaseAdmin } from '@/lib/supabase/server';

export interface MetaCredentials {
  accessToken: string;
  adAccountId: string;   // numérico, SEM o prefixo act_
  apiVersion: string;
  baseUrl: string;       // https://graph.facebook.com/<version>
  label: string;         // rótulo da conexão (ou "Ambiente (.env)")
  source: 'db' | 'env';
}

const DEFAULT_VERSION = 'v19.0';

function graphBase(version: string): string {
  return `https://graph.facebook.com/${version}`;
}

/** Credenciais vindas das variáveis de ambiente (conta legada / fallback). */
function envCredentials(): MetaCredentials | null {
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) return null;
  const apiVersion = process.env.META_API_VERSION || DEFAULT_VERSION;
  return {
    accessToken,
    adAccountId: adAccountId.replace(/^act_/, ''),
    apiVersion,
    baseUrl: graphBase(apiVersion),
    label: 'Ambiente (.env)',
    source: 'env',
  };
}

/**
 * Retorna as credenciais da conta ATIVA.
 * Prioridade: conexão ativa no banco → variáveis de ambiente.
 * Lança erro apenas se não houver nenhuma das duas.
 */
export async function getActiveMetaCredentials(): Promise<MetaCredentials> {
  try {
    const { data, error } = await supabaseAdmin
      .from('meta_connections')
      .select('label, ad_account_id, access_token, api_version')
      .eq('is_active', true)
      .maybeSingle();

    // Erro de "tabela não existe" (42P01) ou similar → usa fallback do .env
    if (!error && data) {
      const apiVersion = data.api_version || DEFAULT_VERSION;
      return {
        accessToken: data.access_token,
        adAccountId: String(data.ad_account_id).replace(/^act_/, ''),
        apiVersion,
        baseUrl: graphBase(apiVersion),
        label: data.label,
        source: 'db',
      };
    }
  } catch {
    // ignora — cai no fallback
  }

  const env = envCredentials();
  if (env) return env;

  throw new Error(
    'Nenhuma conta Meta conectada. Adicione uma conexão em Configurações → Conexões.',
  );
}

/**
 * Credenciais de uma conexão específica (por id) — usado no portal do cliente,
 * que vê a conta vinculada a ele (não a conexão "ativa" global).
 */
export async function getMetaCredentialsForConnection(
  connectionId: string,
): Promise<MetaCredentials | null> {
  const { data, error } = await supabaseAdmin
    .from('meta_connections')
    .select('label, ad_account_id, access_token, api_version')
    .eq('id', connectionId)
    .maybeSingle();
  if (error || !data) return null;
  const apiVersion = data.api_version || DEFAULT_VERSION;
  return {
    accessToken: data.access_token,
    adAccountId: String(data.ad_account_id).replace(/^act_/, ''),
    apiVersion,
    baseUrl: graphBase(apiVersion),
    label: data.label,
    source: 'db',
  };
}

// ---------------------------------------------------------------------------
// Descoberta de contas de anúncios a partir de um token (aba de Conexões)
// ---------------------------------------------------------------------------
export interface DiscoveredAccount {
  id: string;            // act_XXXX
  accountId: string;     // numérico
  name: string;
  currency?: string;
  status: number;        // account_status (1 = ativo)
}

const ACCOUNT_STATUS_LABEL: Record<number, string> = {
  1: 'Ativa',
  2: 'Desativada',
  3: 'Pendência de pagamento',
  7: 'Em revisão',
  9: 'Em período de carência',
  101: 'Fechada',
};

export function accountStatusLabel(status: number): string {
  return ACCOUNT_STATUS_LABEL[status] ?? `Status ${status}`;
}

/**
 * Lista as contas de anúncios que um token consegue acessar.
 * Serve tanto para validar o token quanto para o usuário escolher a conta.
 */
export async function discoverAdAccounts(
  token: string,
  apiVersion = DEFAULT_VERSION,
): Promise<{ ok: true; accounts: DiscoveredAccount[]; user?: string } | { ok: false; error: string }> {
  const base = graphBase(apiVersion);
  try {
    // Nome do usuário/perfil dono do token (informativo)
    let user: string | undefined;
    try {
      const meRes = await fetch(`${base}/me?fields=name&access_token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      const me = await meRes.json();
      if (meRes.ok) user = me?.name;
    } catch { /* opcional */ }

    const url = new URL(`${base}/me/adaccounts`);
    url.searchParams.set('access_token', token);
    url.searchParams.set('fields', 'account_id,name,currency,account_status');
    url.searchParams.set('limit', '200');

    const res = await fetch(url.toString(), { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) {
      return { ok: false, error: json?.error?.message || `Graph API ${res.status}` };
    }

    const raw = (json?.data ?? []) as Array<{ account_id: string; name: string; currency?: string; account_status?: number }>;
    const accounts: DiscoveredAccount[] = raw.map((a) => ({
      id: `act_${a.account_id}`,
      accountId: a.account_id,
      name: a.name,
      currency: a.currency,
      status: a.account_status ?? 0,
    }));
    return { ok: true, accounts, user };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Mascara um token para exibição (primeiros 8 + últimos 4). */
export function maskToken(token: string): string {
  if (token.length <= 14) return '••••••';
  return `${token.slice(0, 8)}••••••${token.slice(-4)}`;
}
