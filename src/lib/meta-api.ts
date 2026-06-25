// =============================================================================
// src/lib/meta-api.ts
// Serviço de integração com a Meta Marketing API (Graph API v19.0+).
//
// Responsabilidades:
//   1. Ler credenciais do .env (FACEBOOK_ACCESS_TOKEN, FACEBOOK_AD_ACCOUNT_ID)
//   2. Construir e executar chamadas ao endpoint /insights com paginação
//   3. Transformar os dados brutos em registros tipados para o Supabase
//   4. Salvar via upsert usando as constraints de unicidade do schema.sql
// =============================================================================

import { supabaseAdmin } from '@/lib/supabase/server';
import { getActiveMetaCredentials, type MetaCredentials } from '@/lib/meta/credentials';
import type {
  MetaInsightRaw,
  MetaApiResponse,
  MetaAction,
  AdInsightDailyRow,
  AdInsightBreakdownRow,
  FetchInsightsParams,
  InsightLevel,
  BreakdownType,
  SyncLogRow,
} from '@/types/meta';

// Credenciais resolvidas em runtime a partir da conexão ATIVA (banco → .env).

// Campos solicitados ao endpoint de insights
const INSIGHT_FIELDS = [
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',
  'impressions',
  'clicks',
  'reach',
  'spend',
  'frequency',
  'ctr',
  'cpm',
  'cpc',
  'actions',
  'action_values',
].join(',');

// Mapeamento de breakdown → campo retornado pela API
const BREAKDOWN_FIELD_MAP: Partial<Record<BreakdownType, string>> = {
  age: 'age',
  gender: 'gender',
  publisher_platform: 'publisher_platform',
  platform_position: 'platform_position',
  impression_device: 'impression_device',
};

// ---------------------------------------------------------------------------
// Helpers de conversão numérica
// ---------------------------------------------------------------------------
function toNum(val: string | undefined | null): number {
  if (!val) return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function toInt(val: string | undefined | null): number {
  if (!val) return 0;
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Calcula o ROAS a partir dos action_values do tipo 'purchase'.
 * ROAS = soma de purchase value / spend total
 */
function calcRoas(
  actionValues: MetaAction[] | undefined,
  spend: number
): number | null {
  if (!actionValues || spend === 0) return null;
  const purchaseValue = actionValues
    .filter((av) => av.action_type === 'purchase' || av.action_type === 'offsite_conversion.fb_pixel_purchase')
    .reduce((sum, av) => sum + toNum(av.value), 0);
  return purchaseValue > 0 ? parseFloat((purchaseValue / spend).toFixed(4)) : null;
}

// ---------------------------------------------------------------------------
// Determina o object_id e object_name com base no nível
// ---------------------------------------------------------------------------
function resolveObjectId(
  raw: MetaInsightRaw,
  level: InsightLevel
): { object_id: string; object_name: string | null } {
  switch (level) {
    case 'campaign':
      return { object_id: raw.campaign_id || '', object_name: raw.campaign_name || null };
    case 'adset':
      return { object_id: raw.adset_id || '', object_name: raw.adset_name || null };
    case 'ad':
      return { object_id: raw.ad_id || '', object_name: raw.ad_name || null };
  }
}

// ---------------------------------------------------------------------------
// Transforma um registro bruto da API em uma linha para ad_insights_daily
// ---------------------------------------------------------------------------
function transformToDaily(
  raw: MetaInsightRaw,
  level: InsightLevel
): AdInsightDailyRow {
  const spend = toNum(raw.spend);
  const { object_id, object_name } = resolveObjectId(raw, level);

  return {
    date_start: raw.date_start,
    date_stop: raw.date_stop,
    level,
    object_id,
    object_name,
    campaign_id: raw.campaign_id || null,
    campaign_name: raw.campaign_name || null,
    ad_set_id: raw.adset_id || null,
    ad_set_name: raw.adset_name || null,
    ad_id: raw.ad_id || null,
    ad_name: raw.ad_name || null,
    impressions: toInt(raw.impressions),
    clicks: toInt(raw.clicks),
    reach: toInt(raw.reach),
    spend,
    frequency: toNum(raw.frequency),
    ctr: raw.ctr ? toNum(raw.ctr) : null,
    cpm: raw.cpm ? toNum(raw.cpm) : null,
    cpc: raw.cpc ? toNum(raw.cpc) : null,
    actions: raw.actions || null,
    roas: calcRoas(raw.action_values, spend),
    synced_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Transforma um registro bruto com breakdown em uma linha para ad_insights_breakdown
// ---------------------------------------------------------------------------
function transformToBreakdown(
  raw: MetaInsightRaw,
  level: InsightLevel,
  breakdownType: BreakdownType
): AdInsightBreakdownRow {
  const base = transformToDaily(raw, level);
  const field = BREAKDOWN_FIELD_MAP[breakdownType] as keyof MetaInsightRaw;
  const breakdownValue = field ? (raw[field] as string) || 'unknown' : 'unknown';

  return {
    ...base,
    breakdown_type: breakdownType,
    breakdown_value: breakdownValue,
    sub_breakdown_type: null,
    sub_breakdown_value: null,
  };
}

// ---------------------------------------------------------------------------
// Busca UMA página de dados da Meta API
// ---------------------------------------------------------------------------
async function fetchInsightsPage(
  params: FetchInsightsParams,
  creds: MetaCredentials,
): Promise<MetaApiResponse> {
  const { dateStart, dateStop, level, breakdown, after } = params;

  const url = new URL(`${creds.baseUrl}/act_${creds.adAccountId}/insights`);
  url.searchParams.set('access_token', creds.accessToken);
  url.searchParams.set('fields', INSIGHT_FIELDS);
  url.searchParams.set('level', level);
  url.searchParams.set('time_range', JSON.stringify({ since: dateStart, until: dateStop }));
  url.searchParams.set('time_increment', '1'); // granularidade diária
  url.searchParams.set('limit', '500');

  if (breakdown && breakdown !== 'none') {
    url.searchParams.set('breakdowns', breakdown);

    // Adiciona campos extras de breakdown nos fields (se não estiver já incluído)
    const field = BREAKDOWN_FIELD_MAP[breakdown];
    if (field && !INSIGHT_FIELDS.includes(field)) {
      url.searchParams.set('fields', `${INSIGHT_FIELDS},${field}`);
    }
  }

  if (after) {
    url.searchParams.set('after', after);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    // next: { revalidate: 0 } — desabilita cache para sempre buscar dados frescos
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Meta API Error ${response.status}: ${response.statusText} — ${errorBody}`
    );
  }

  return response.json() as Promise<MetaApiResponse>;
}

// ---------------------------------------------------------------------------
// Busca TODOS os dados com paginação automática
// ---------------------------------------------------------------------------
async function fetchAllInsights(
  params: Omit<FetchInsightsParams, 'after'>,
  creds: MetaCredentials,
): Promise<MetaInsightRaw[]> {
  const allData: MetaInsightRaw[] = [];
  let after: string | undefined;
  let pageCount = 0;
  const MAX_PAGES = 50; // safety limit

  do {
    const response = await fetchInsightsPage({ ...params, after }, creds);
    allData.push(...response.data);
    after = response.paging?.cursors?.after;
    pageCount++;

    console.log(
      `[meta-api] Página ${pageCount} — ${response.data.length} registros. Total: ${allData.length}`
    );
  } while (after && pageCount < MAX_PAGES);

  return allData;
}

// ---------------------------------------------------------------------------
// FUNÇÃO PRINCIPAL: Sincroniza insights diários (sem breakdown)
// ---------------------------------------------------------------------------
export async function syncDailyInsights(
  dateStart: string,
  dateStop: string,
  level: InsightLevel = 'campaign'
): Promise<{ upserted: number; errors: number }> {
  console.log(`[meta-api] Iniciando sync diário: ${dateStart} → ${dateStop} | nível: ${level}`);

  const creds = await getActiveMetaCredentials();
  console.log(`[meta-api] Conta ativa: ${creds.label} (act_${creds.adAccountId})`);

  // Inicia log no banco
  const { data: logData } = await supabaseAdmin
    .from('sync_logs')
    .insert({
      date_synced: dateStart,
      level,
      breakdown_type: null,
      status: 'running',
      records_upserted: 0,
    } satisfies Partial<SyncLogRow>)
    .select('id')
    .single();

  const logId = logData?.id;

  try {
    const rawData = await fetchAllInsights({ dateStart, dateStop, level }, creds);

    if (rawData.length === 0) {
      console.log('[meta-api] Nenhum dado retornado pela API.');
      await updateSyncLog(logId, 'success', 0);
      return { upserted: 0, errors: 0 };
    }

    // Transforma os dados
    const rows: AdInsightDailyRow[] = rawData.map((raw) =>
      transformToDaily(raw, level)
    );

    // Filtra linhas sem object_id
    const validRows = rows.filter((r) => r.object_id);

    // Upsert em lotes de 100
    const BATCH_SIZE = 100;
    let upserted = 0;
    let errors = 0;

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabaseAdmin
        .from('ad_insights_daily')
        .upsert(batch, {
          onConflict: 'date_start,level,object_id',
          ignoreDuplicates: false, // atualiza mesmo se duplicado
        });

      if (error) {
        console.error('[meta-api] Erro no upsert:', error.message);
        errors++;
      } else {
        upserted += batch.length;
      }
    }

    console.log(`[meta-api] Sync concluído: ${upserted} registros, ${errors} lotes com erro.`);
    await updateSyncLog(logId, 'success', upserted);
    return { upserted, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[meta-api] Falha crítica no sync:', message);
    await updateSyncLog(logId, 'error', 0, message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// FUNÇÃO: Sincroniza insights com breakdown
// ---------------------------------------------------------------------------
export async function syncBreakdownInsights(
  dateStart: string,
  dateStop: string,
  level: InsightLevel = 'campaign',
  breakdown: BreakdownType = 'age'
): Promise<{ upserted: number; errors: number }> {
  if (breakdown === 'none') {
    return syncDailyInsights(dateStart, dateStop, level);
  }

  console.log(
    `[meta-api] Iniciando sync breakdown: ${dateStart} → ${dateStop} | nível: ${level} | breakdown: ${breakdown}`
  );

  const creds = await getActiveMetaCredentials();

  const { data: logData } = await supabaseAdmin
    .from('sync_logs')
    .insert({
      date_synced: dateStart,
      level,
      breakdown_type: breakdown,
      status: 'running',
      records_upserted: 0,
    } satisfies Partial<SyncLogRow>)
    .select('id')
    .single();

  const logId = logData?.id;

  try {
    const rawData = await fetchAllInsights({ dateStart, dateStop, level, breakdown }, creds);

    if (rawData.length === 0) {
      await updateSyncLog(logId, 'success', 0);
      return { upserted: 0, errors: 0 };
    }

    const rows: AdInsightBreakdownRow[] = rawData.map((raw) =>
      transformToBreakdown(raw, level, breakdown)
    );

    const validRows = rows.filter((r) => r.object_id && r.breakdown_value);

    const BATCH_SIZE = 100;
    let upserted = 0;
    let errors = 0;

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabaseAdmin
        .from('ad_insights_breakdown')
        .upsert(batch, {
          onConflict:
            'date_start,level,object_id,breakdown_type,breakdown_value,sub_breakdown_type,sub_breakdown_value',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('[meta-api] Erro no upsert (breakdown):', error.message);
        errors++;
      } else {
        upserted += batch.length;
      }
    }

    await updateSyncLog(logId, 'success', upserted);
    return { upserted, errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateSyncLog(logId, 'error', 0, message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Helper: Atualiza o registro de log ao final do processo
// ---------------------------------------------------------------------------
async function updateSyncLog(
  logId: string | undefined,
  status: 'success' | 'error',
  records: number,
  errorMessage?: string
): Promise<void> {
  if (!logId) return;
  await supabaseAdmin
    .from('sync_logs')
    .update({
      status,
      records_upserted: records,
      finished_at: new Date().toISOString(),
      error_message: errorMessage || null,
    })
    .eq('id', logId);
}
