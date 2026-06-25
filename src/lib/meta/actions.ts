// =============================================================================
// src/lib/meta/actions.ts
// Ações de LEITURA e ESCRITA na Meta Marketing API (Graph API v19.0+).
//
// LEITURA  → listar campanhas, insights em tempo real (auto-executáveis pela IA)
// ESCRITA  → pausar/ativar, ajustar orçamento, criar campanha (exigem confirmação)
//
// Todos os valores monetários da Graph API são em CENTAVOS da moeda da conta.
// =============================================================================

import { getActiveMetaCredentials, type MetaCredentials } from '@/lib/meta/credentials';

export interface MetaActionResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers HTTP — sempre operam sobre a CONEXÃO ATIVA (resolvida no banco/.env)
// ---------------------------------------------------------------------------
async function graphGet(
  path: string,
  params: Record<string, string>,
  creds?: MetaCredentials,
): Promise<MetaActionResult> {
  const c = creds ?? await getActiveMetaCredentials();
  const url = new URL(`${c.baseUrl}/${path}`);
  url.searchParams.set('access_token', c.accessToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  try {
    const res = await fetch(url.toString(), { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) {
      return { ok: false, error: json?.error?.message || `Graph API ${res.status}` };
    }
    return { ok: true, data: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function graphPost(
  path: string,
  body: Record<string, string>,
  creds?: MetaCredentials,
): Promise<MetaActionResult> {
  const c = creds ?? await getActiveMetaCredentials();
  const url = new URL(`${c.baseUrl}/${path}`);
  const form = new URLSearchParams();
  form.set('access_token', c.accessToken);
  for (const [k, v] of Object.entries(body)) form.set(k, v);

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      cache: 'no-store',
    });
    const json = await res.json();
    if (!res.ok) {
      return { ok: false, error: json?.error?.error_user_msg || json?.error?.message || `Graph API ${res.status}` };
    }
    return { ok: true, data: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------
function centsToMoney(cents?: string | number | null): number | null {
  if (cents == null) return null;
  const n = typeof cents === 'string' ? parseFloat(cents) : cents;
  return isNaN(n) ? null : n / 100;
}

// =============================================================================
// LEITURA
// =============================================================================

interface RawCampaign {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
}

/** Lista campanhas da conta com status e orçamento. */
export async function listCampaigns(limit = 50): Promise<MetaActionResult> {
  const c = await getActiveMetaCredentials();
  const r = await graphGet(`act_${c.adAccountId}/campaigns`, {
    fields: 'id,name,status,effective_status,objective,daily_budget,lifetime_budget',
    limit: String(limit),
  }, c);
  if (!r.ok) return r;

  const raw = (r.data as { data?: RawCampaign[] })?.data ?? [];
  const campaigns = raw.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    effectiveStatus: c.effective_status,
    objective: c.objective,
    dailyBudget: centsToMoney(c.daily_budget),
    lifetimeBudget: centsToMoney(c.lifetime_budget),
  }));
  return { ok: true, data: { campaigns, count: campaigns.length } };
}

/** Busca uma campanha por nome aproximado (case-insensitive, contém). */
export async function findCampaignByName(name: string): Promise<MetaActionResult> {
  const r = await listCampaigns(200);
  if (!r.ok) return r;
  const { campaigns } = r.data as { campaigns: Array<{ id: string; name: string }> };
  const needle = name.trim().toLowerCase();
  const matches = campaigns.filter((c) => c.name.toLowerCase().includes(needle));
  return { ok: true, data: { matches } };
}

/** Insights em tempo real de uma campanha (ou da conta toda). */
export async function getRealtimeInsights(
  campaignId: string | null,
  datePreset = 'last_7d',
): Promise<MetaActionResult> {
  const c = await getActiveMetaCredentials();
  const path = campaignId ? `${campaignId}/insights` : `act_${c.adAccountId}/insights`;
  const r = await graphGet(path, {
    date_preset: datePreset,
    fields: 'campaign_name,impressions,clicks,reach,spend,frequency,ctr,cpm,cpc,actions,action_values',
    level: 'campaign',
  }, c);
  if (!r.ok) return r;

  const rows = (r.data as { data?: Record<string, unknown>[] })?.data ?? [];
  return { ok: true, data: { insights: rows, datePreset } };
}

// =============================================================================
// ESCRITA (exigem confirmação do usuário)
// =============================================================================

/** Pausa uma campanha (status = PAUSED). */
export async function pauseCampaign(campaignId: string): Promise<MetaActionResult> {
  return graphPost(campaignId, { status: 'PAUSED' });
}

/** Reativa uma campanha (status = ACTIVE). */
export async function activateCampaign(campaignId: string): Promise<MetaActionResult> {
  return graphPost(campaignId, { status: 'ACTIVE' });
}

/** Ajusta o orçamento diário (recebe valor na moeda da conta, converte p/ centavos). */
export async function updateCampaignBudget(
  campaignId: string,
  dailyBudget: number,
): Promise<MetaActionResult> {
  if (!(dailyBudget > 0)) return { ok: false, error: 'Orçamento deve ser maior que zero.' };
  const cents = Math.round(dailyBudget * 100);
  return graphPost(campaignId, { daily_budget: String(cents) });
}

/**
 * Cria uma nova campanha (estrutura), por segurança SEMPRE em PAUSED.
 * objective deve ser um ODAX válido (OUTCOME_*).
 */
export async function createCampaign(params: {
  name: string;
  objective: string;
  dailyBudget?: number;
}): Promise<MetaActionResult> {
  const body: Record<string, string> = {
    name: params.name,
    objective: params.objective,
    status: 'PAUSED', // segurança: nunca cria já ativa
    special_ad_categories: '[]',
  };
  if (params.dailyBudget && params.dailyBudget > 0) {
    body.daily_budget = String(Math.round(params.dailyBudget * 100));
  }
  const c = await getActiveMetaCredentials();
  return graphPost(`act_${c.adAccountId}/campaigns`, body, c);
}

// =============================================================================
// LEITURA — nível de CONJUNTO DE ANÚNCIOS (ad set) e ANÚNCIO (ad)
// =============================================================================

interface RawAdSet {
  id: string; name: string; status: string; effective_status?: string;
  daily_budget?: string; lifetime_budget?: string; optimization_goal?: string; campaign_id?: string;
}

/** Lista conjuntos de anúncios (de uma campanha, ou de toda a conta). */
export async function listAdSets(campaignId?: string): Promise<MetaActionResult> {
  const c = await getActiveMetaCredentials();
  const path = campaignId ? `${campaignId}/adsets` : `act_${c.adAccountId}/adsets`;
  const r = await graphGet(path, {
    fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,campaign_id',
    limit: '200',
  }, c);
  if (!r.ok) return r;
  const raw = (r.data as { data?: RawAdSet[] })?.data ?? [];
  const adsets = raw.map((s) => ({
    id: s.id, name: s.name, status: s.status, effectiveStatus: s.effective_status,
    optimizationGoal: s.optimization_goal, campaignId: s.campaign_id,
    dailyBudget: centsToMoney(s.daily_budget), lifetimeBudget: centsToMoney(s.lifetime_budget),
  }));
  return { ok: true, data: { adsets, count: adsets.length } };
}

interface RawAd {
  id: string; name: string; status: string; effective_status?: string;
  adset_id?: string; campaign_id?: string;
}

/** Lista anúncios (de um conjunto, de uma campanha, ou de toda a conta). */
export async function listAds(opts: { campaignId?: string; adsetId?: string } = {}): Promise<MetaActionResult> {
  const c = await getActiveMetaCredentials();
  const path = opts.adsetId ? `${opts.adsetId}/ads`
    : opts.campaignId ? `${opts.campaignId}/ads`
    : `act_${c.adAccountId}/ads`;
  const r = await graphGet(path, {
    fields: 'id,name,status,effective_status,adset_id,campaign_id',
    limit: '200',
  }, c);
  if (!r.ok) return r;
  const raw = (r.data as { data?: RawAd[] })?.data ?? [];
  const ads = raw.map((a) => ({
    id: a.id, name: a.name, status: a.status, effectiveStatus: a.effective_status,
    adsetId: a.adset_id, campaignId: a.campaign_id,
  }));
  return { ok: true, data: { ads, count: ads.length } };
}

/**
 * Detalhe COMPLETO de um anúncio: criativo (texto, título, CTA, link, imagem)
 * + métricas do período. É o que permite a IA "analisar cada anúncio".
 */
export async function getAdDetails(adId: string, datePreset = 'last_7d'): Promise<MetaActionResult> {
  const c = await getActiveMetaCredentials();
  const adRes = await graphGet(adId, {
    fields: 'id,name,status,effective_status,adset_id,campaign_id,creative{id,name,title,body,image_url,thumbnail_url,call_to_action_type,object_story_spec,link_url}',
  }, c);
  if (!adRes.ok) return adRes;

  const insRes = await graphGet(`${adId}/insights`, {
    date_preset: datePreset,
    fields: 'impressions,clicks,reach,spend,frequency,ctr,cpm,cpc,actions,action_values',
  }, c);
  const insights = insRes.ok ? ((insRes.data as { data?: unknown[] })?.data ?? []) : [];

  return { ok: true, data: { ad: adRes.data, insights, datePreset } };
}

/**
 * Métricas por NÍVEL para um objeto. Ex.: insights de TODOS os anúncios de uma
 * campanha (objectId = campanha, level = 'ad'). Cada linha traz ad_id/ad_name.
 */
export async function getInsightsByLevel(
  objectId: string,
  level: 'campaign' | 'adset' | 'ad',
  datePreset = 'last_7d',
): Promise<MetaActionResult> {
  const r = await graphGet(`${objectId}/insights`, {
    date_preset: datePreset,
    level,
    fields: 'ad_id,ad_name,adset_id,adset_name,campaign_name,impressions,clicks,reach,spend,frequency,ctr,cpm,cpc,actions,action_values',
  });
  if (!r.ok) return r;
  const rows = (r.data as { data?: Record<string, unknown>[] })?.data ?? [];
  return { ok: true, data: { insights: rows, level, datePreset } };
}

// =============================================================================
// ESCRITA — nível de conjunto e anúncio (exigem confirmação)
// =============================================================================

/** Pausa/ativa um anúncio individual. */
export async function setAdStatus(adId: string, status: 'ACTIVE' | 'PAUSED'): Promise<MetaActionResult> {
  return graphPost(adId, { status });
}

/** Pausa/ativa um conjunto de anúncios. */
export async function setAdSetStatus(adsetId: string, status: 'ACTIVE' | 'PAUSED'): Promise<MetaActionResult> {
  return graphPost(adsetId, { status });
}

/** Ajusta o orçamento diário de um conjunto de anúncios (reais → centavos). */
export async function updateAdSetBudget(adsetId: string, dailyBudget: number): Promise<MetaActionResult> {
  if (!(dailyBudget > 0)) return { ok: false, error: 'Orçamento deve ser maior que zero.' };
  return graphPost(adsetId, { daily_budget: String(Math.round(dailyBudget * 100)) });
}

// Objetivos ODAX válidos (Graph API v19+)
export const VALID_OBJECTIVES = [
  'OUTCOME_SALES',
  'OUTCOME_LEADS',
  'OUTCOME_TRAFFIC',
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_AWARENESS',
  'OUTCOME_APP_PROMOTION',
] as const;
