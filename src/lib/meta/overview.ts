// =============================================================================
// src/lib/meta/overview.ts
// Visão consolidada AO VIVO de uma conta de anúncios (direto da Meta API).
// Usado pelo portal do cliente (somente leitura, tempo real).
// =============================================================================

import type { MetaCredentials } from '@/lib/meta/credentials';

export interface OverviewCampaign {
  id: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpc: number;
  roas: number;
}

export interface OverviewDaily {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number;
}

export interface OverviewAd {
  id: string;
  name: string;
  status: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  results: number;
}

export interface AccountOverview {
  account: string;          // label da conexão
  adAccountId: string;
  totals: {
    spend: number; impressions: number; clicks: number; reach: number;
    ctr: number; cpc: number; cpm: number; roas: number; campaigns: number;
    results: number;        // conversão principal (compras, leads ou conversas)
    resultLabel: string;    // nome amigável do resultado
    costPerResult: number;  // gasto ÷ resultados
  };
  daily: OverviewDaily[];
  campaigns: OverviewCampaign[];
  ads: OverviewAd[];
  /** variação % vs período anterior equivalente (null se sem base) */
  deltas: { spend: number; results: number; ctr: number; costPerResult: number } | null;
}

interface InsightRow {
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  spend?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
}

// Prioridade da "conversão principal" (do mais valioso ao mais raso).
// O primeiro tipo com contagem > 0 vira o "Resultado" exibido.
const RESULT_PRIORITY: { types: string[]; label: string }[] = [
  { types: ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'], label: 'Compras' },
  { types: ['onsite_conversion.lead_grouped', 'lead', 'leadgen_grouped', 'offsite_conversion.fb_pixel_lead'], label: 'Leads' },
  { types: ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.total_messaging_connection'], label: 'Conversas iniciadas' },
  { types: ['offsite_conversion.fb_pixel_complete_registration', 'complete_registration'], label: 'Cadastros' },
  { types: ['offsite_conversion.fb_pixel_add_to_cart', 'add_to_cart'], label: 'Adições ao carrinho' },
  { types: ['landing_page_view'], label: 'Visitas à página' },
  { types: ['link_click'], label: 'Cliques no link' },
];

/**
 * Extrai a conversão principal de um mapa agregado de ações.
 * Dentro de cada categoria, os tipos são ALTERNATIVAS (pega o PRIMEIRO com
 * valor > 0) — nunca soma, pois tipos como messaging_conversation_started_7d e
 * total_messaging_connection se sobrepõem e dobrariam a contagem.
 */
function pickResult(actionTotals: Map<string, number>): { results: number; label: string } {
  for (const tier of RESULT_PRIORITY) {
    for (const t of tier.types) {
      const v = actionTotals.get(t) ?? 0;
      if (v > 0) return { results: v, label: tier.label };
    }
  }
  return { results: 0, label: 'Resultados' };
}

function num(v: string | undefined | null): number {
  const n = parseFloat(v ?? '');
  return isNaN(n) ? 0 : n;
}

function purchaseValue(av?: { action_type: string; value: string }[]): number {
  if (!av) return 0;
  return av
    .filter((a) => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase')
    .reduce((s, a) => s + num(a.value), 0);
}

async function graphJson(url: string): Promise<{ data?: unknown[]; paging?: { cursors?: { after?: string } }; error?: { message?: string } }> {
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || `Graph API ${res.status}`);
  return json;
}

/** Converte "dias" (7/14/30/90) no date_preset equivalente do Meta. */
export function daysToPreset(days: number): string {
  if (days <= 7) return 'last_7d';
  if (days <= 14) return 'last_14d';
  if (days <= 30) return 'last_30d';
  return 'last_90d';
}

/**
 * Monta a visão geral da conta AO VIVO, usando o mesmo date_preset do Meta Ads
 * (ex.: 'last_30d') — assim os números batem exatamente com o Gerenciador de
 * Anúncios (que exclui o dia de hoje e respeita o fuso da conta).
 */
export async function getAccountOverview(
  creds: MetaCredentials,
  datePreset = 'last_30d',
): Promise<AccountOverview> {
  const acct = `act_${creds.adAccountId}`;
  const base = creds.baseUrl;

  // 1) Status atual das campanhas
  const campStatus = new Map<string, string>();
  try {
    const cUrl = new URL(`${base}/${acct}/campaigns`);
    cUrl.searchParams.set('access_token', creds.accessToken);
    cUrl.searchParams.set('fields', 'id,name,effective_status');
    cUrl.searchParams.set('limit', '200');
    const cj = await graphJson(cUrl.toString());
    for (const c of (cj.data ?? []) as { id: string; effective_status?: string }[]) {
      campStatus.set(c.id, c.effective_status ?? 'UNKNOWN');
    }
  } catch { /* status é complementar */ }

  // 2) Insights por campanha por dia (paginado)
  const rows: InsightRow[] = [];
  let after: string | undefined;
  let pages = 0;
  do {
    const url = new URL(`${base}/${acct}/insights`);
    url.searchParams.set('access_token', creds.accessToken);
    url.searchParams.set('level', 'campaign');
    url.searchParams.set('time_increment', '1');
    url.searchParams.set('date_preset', datePreset);
    url.searchParams.set('fields', 'campaign_id,campaign_name,impressions,clicks,reach,spend,ctr,cpc,cpm,actions,action_values');
    url.searchParams.set('limit', '500');
    if (after) url.searchParams.set('after', after);
    const j = await graphJson(url.toString());
    rows.push(...((j.data ?? []) as InsightRow[]));
    after = j.paging?.cursors?.after;
    pages++;
  } while (after && pages < 10);

  // 3) Agrega por dia
  const dailyMap = new Map<string, OverviewDaily & { _ctrN: number; _ctrS: number; _cpcN: number; _cpcS: number; _cpmN: number; _cpmS: number; _rev: number }>();
  // 4) Agrega por campanha
  const campMap = new Map<string, OverviewCampaign & { _rev: number; _ctrN: number; _ctrS: number; _cpcN: number; _cpcS: number }>();

  let tSpend = 0, tImp = 0, tClicks = 0, tReach = 0, tRev = 0;
  const actionTotals = new Map<string, number>();

  for (const r of rows) {
    const spend = num(r.spend);
    const imp = num(r.impressions);
    const clicks = num(r.clicks);
    const reach = num(r.reach);
    const rev = purchaseValue(r.action_values);
    const ctr = num(r.ctr);
    const cpc = num(r.cpc);
    const cpm = num(r.cpm);

    // Agrega todas as ações (conversões) para depois extrair o "Resultado".
    for (const a of (r.actions ?? [])) {
      actionTotals.set(a.action_type, (actionTotals.get(a.action_type) ?? 0) + num(a.value));
    }

    tSpend += spend; tImp += imp; tClicks += clicks; tReach += reach; tRev += rev;

    // por dia
    const dk = r.date_start ?? '';
    if (dk) {
      const d = dailyMap.get(dk) ?? { date: dk, spend: 0, impressions: 0, clicks: 0, reach: 0, ctr: 0, cpc: 0, cpm: 0, roas: 0, _ctrN: 0, _ctrS: 0, _cpcN: 0, _cpcS: 0, _cpmN: 0, _cpmS: 0, _rev: 0 };
      d.spend += spend; d.impressions += imp; d.clicks += clicks; d.reach += reach; d._rev += rev;
      if (ctr > 0) { d._ctrS += ctr; d._ctrN++; }
      if (cpc > 0) { d._cpcS += cpc; d._cpcN++; }
      if (cpm > 0) { d._cpmS += cpm; d._cpmN++; }
      dailyMap.set(dk, d);
    }

    // por campanha
    const cid = r.campaign_id ?? '';
    if (cid) {
      const c = campMap.get(cid) ?? { id: cid, name: r.campaign_name ?? cid, status: campStatus.get(cid) ?? 'UNKNOWN', spend: 0, impressions: 0, clicks: 0, reach: 0, ctr: 0, cpc: 0, roas: 0, _rev: 0, _ctrN: 0, _ctrS: 0, _cpcN: 0, _cpcS: 0 };
      c.spend += spend; c.impressions += imp; c.clicks += clicks; c.reach += reach; c._rev += rev;
      if (ctr > 0) { c._ctrS += ctr; c._ctrN++; }
      if (cpc > 0) { c._cpcS += cpc; c._cpcN++; }
      campMap.set(cid, c);
    }
  }

  // CTR/CPC/CPM derivados dos TOTAIS (como o Meta calcula), não média de médias.
  const daily: OverviewDaily[] = Array.from(dailyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      date: d.date, spend: d.spend, impressions: d.impressions, clicks: d.clicks, reach: d.reach,
      ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
      cpc: d.clicks > 0 ? d.spend / d.clicks : 0,
      cpm: d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0,
      roas: d.spend > 0 ? d._rev / d.spend : 0,
    }));

  const campaigns: OverviewCampaign[] = Array.from(campMap.values())
    .sort((a, b) => b.spend - a.spend)
    .map((c) => ({
      id: c.id, name: c.name, status: c.status,
      spend: c.spend, impressions: c.impressions, clicks: c.clicks, reach: c.reach,
      ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
      cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
      roas: c.spend > 0 ? c._rev / c.spend : 0,
    }));

  const ctrAvg = tImp > 0 ? (tClicks / tImp) * 100 : 0;
  const cpcAvg = tClicks > 0 ? tSpend / tClicks : 0;
  const cpmAvg = tImp > 0 ? (tSpend / tImp) * 1000 : 0;

  const { results, label: resultLabel } = pickResult(actionTotals);

  // ----- Nível de ANÚNCIO (para a visão de anúncios e contexto da IA) -----
  const ads = await getAccountAds(creds, datePreset);

  // ----- Variação vs período anterior equivalente -----
  // Deriva o intervalo real (mín/máx das datas retornadas) para comparar com o
  // período anterior de mesmo tamanho.
  const costPerResult = results > 0 ? tSpend / results : 0;
  const dateKeys = daily.map((d) => d.date).sort();
  const since = dateKeys[0];
  const until = dateKeys[dateKeys.length - 1];
  const deltas = since && until
    ? await getDeltas(creds, since, until, { spend: tSpend, results, ctr: ctrAvg, costPerResult })
    : null;

  return {
    account: creds.label,
    adAccountId: creds.adAccountId,
    totals: {
      spend: tSpend, impressions: tImp, clicks: tClicks, reach: tReach,
      ctr: ctrAvg, cpc: cpcAvg, cpm: cpmAvg,
      roas: tSpend > 0 ? tRev / tSpend : 0,
      campaigns: campaigns.length,
      results,
      resultLabel,
      costPerResult,
    },
    daily,
    campaigns,
    ads,
    deltas,
  };
}

// ---------------------------------------------------------------------------
// Variação % vs o período anterior de mesmo tamanho (1 chamada agregada).
// ---------------------------------------------------------------------------
function shiftDate(d: string, days: number): string {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function getDeltas(
  creds: MetaCredentials,
  since: string,
  until: string,
  current: { spend: number; results: number; ctr: number; costPerResult: number },
): Promise<AccountOverview['deltas']> {
  const lengthDays = Math.round((Date.parse(until) - Date.parse(since)) / 86400000) + 1;
  const prevUntil = shiftDate(since, -1);
  const prevSince = shiftDate(prevUntil, -(lengthDays - 1));

  try {
    const u = new URL(`${creds.baseUrl}/act_${creds.adAccountId}/insights`);
    u.searchParams.set('access_token', creds.accessToken);
    u.searchParams.set('level', 'account');
    u.searchParams.set('time_range', JSON.stringify({ since: prevSince, until: prevUntil }));
    u.searchParams.set('fields', 'spend,impressions,clicks,actions');
    const j = await graphJson(u.toString());
    const row = (j.data?.[0] ?? null) as { spend?: string; impressions?: string; clicks?: string; actions?: { action_type: string; value: string }[] } | null;
    if (!row) return null;

    const pSpend = num(row.spend);
    const pImp = num(row.impressions);
    const pClicks = num(row.clicks);
    const pActions = new Map<string, number>();
    for (const a of (row.actions ?? [])) pActions.set(a.action_type, num(a.value));
    const pResults = pickResult(pActions).results;
    const pCtr = pImp > 0 ? (pClicks / pImp) * 100 : 0;
    const pCpr = pResults > 0 ? pSpend / pResults : 0;

    const pct = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : 0);
    return {
      spend: pct(current.spend, pSpend),
      results: pct(current.results, pResults),
      ctr: pct(current.ctr, pCtr),
      costPerResult: pct(current.costPerResult, pCpr),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Anúncios da conta (nome, status, métricas e resultado por anúncio)
// ---------------------------------------------------------------------------
async function getAccountAds(creds: MetaCredentials, datePreset: string): Promise<OverviewAd[]> {
  const acct = `act_${creds.adAccountId}`;
  const base = creds.baseUrl;

  // status + nome + campanha de cada anúncio
  const meta = new Map<string, { name: string; status: string; campaign: string }>();
  try {
    const u = new URL(`${base}/${acct}/ads`);
    u.searchParams.set('access_token', creds.accessToken);
    u.searchParams.set('fields', 'id,name,effective_status,campaign{name}');
    u.searchParams.set('limit', '300');
    const j = await graphJson(u.toString());
    for (const a of (j.data ?? []) as { id: string; name: string; effective_status?: string; campaign?: { name?: string } }[]) {
      meta.set(a.id, { name: a.name, status: a.effective_status ?? 'UNKNOWN', campaign: a.campaign?.name ?? '' });
    }
  } catch { /* complementar */ }

  // insights por anúncio no período
  const agg = new Map<string, { spend: number; imp: number; clicks: number; actions: Map<string, number> }>();
  try {
    let after: string | undefined; let pages = 0;
    do {
      const u = new URL(`${base}/${acct}/insights`);
      u.searchParams.set('access_token', creds.accessToken);
      u.searchParams.set('level', 'ad');
      u.searchParams.set('date_preset', datePreset);
      u.searchParams.set('fields', 'ad_id,ad_name,spend,impressions,clicks,actions');
      u.searchParams.set('limit', '500');
      if (after) u.searchParams.set('after', after);
      const j = await graphJson(u.toString());
      for (const r of (j.data ?? []) as Array<{ ad_id?: string; spend?: string; impressions?: string; clicks?: string; actions?: { action_type: string; value: string }[] }>) {
        const id = r.ad_id ?? ''; if (!id) continue;
        const a = agg.get(id) ?? { spend: 0, imp: 0, clicks: 0, actions: new Map() };
        a.spend += num(r.spend); a.imp += num(r.impressions); a.clicks += num(r.clicks);
        for (const act of (r.actions ?? [])) a.actions.set(act.action_type, (a.actions.get(act.action_type) ?? 0) + num(act.value));
        agg.set(id, a);
      }
      after = j.paging?.cursors?.after; pages++;
    } while (after && pages < 10);
  } catch { /* sem insights de anúncio */ }

  const ads: OverviewAd[] = [];
  for (const [id, a] of agg) {
    const m = meta.get(id);
    ads.push({
      id,
      name: m?.name ?? id,
      status: m?.status ?? 'UNKNOWN',
      campaignName: m?.campaign ?? '',
      spend: a.spend,
      impressions: a.imp,
      clicks: a.clicks,
      ctr: a.imp > 0 ? (a.clicks / a.imp) * 100 : 0,
      results: pickResult(a.actions).results,
    });
  }
  // Inclui anúncios ativos sem gasto no período (pra aparecerem como "ativos")
  for (const [id, m] of meta) {
    if (!agg.has(id) && m.status === 'ACTIVE') {
      ads.push({ id, name: m.name, status: m.status, campaignName: m.campaign, spend: 0, impressions: 0, clicks: 0, ctr: 0, results: 0 });
    }
  }
  return ads.sort((x, y) => y.spend - x.spend).slice(0, 30);
}
