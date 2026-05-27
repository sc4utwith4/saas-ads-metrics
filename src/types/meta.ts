// =============================================================================
// src/types/meta.ts
// Tipos TypeScript para a Meta Marketing API e o banco de dados Supabase.
// =============================================================================

// ---------------------------------------------------------------------------
// META API — Tipos de resposta da Graph API
// ---------------------------------------------------------------------------

/** Uma "action" retornada pela Graph API (ex: purchase, lead, etc.) */
export interface MetaAction {
  action_type: string;
  value: string;
}

/** Dados brutos de insights retornados pela Graph API v19.0 */
export interface MetaInsightRaw {
  date_start: string;
  date_stop: string;

  // Identificadores de nível
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;

  // Métricas base
  impressions?: string;
  clicks?: string;
  reach?: string;
  spend?: string;
  frequency?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;

  // Arrays de conversões
  actions?: MetaAction[];
  action_values?: MetaAction[];

  // Breakdowns opcionais
  age?: string;
  gender?: string;
  publisher_platform?: string;
  platform_position?: string;
  impression_device?: string;
}

/** Resposta paginada da Graph API */
export interface MetaApiResponse {
  data: MetaInsightRaw[];
  paging?: {
    cursors?: { before: string; after: string };
    next?: string;
  };
}

// ---------------------------------------------------------------------------
// PARAMETROS de consulta
// ---------------------------------------------------------------------------

export type InsightLevel = 'campaign' | 'adset' | 'ad';

export type BreakdownType =
  | 'age'
  | 'gender'
  | 'publisher_platform'
  | 'platform_position'
  | 'impression_device'
  | 'none';

export interface FetchInsightsParams {
  /** Data inicial no formato YYYY-MM-DD */
  dateStart: string;
  /** Data final no formato YYYY-MM-DD */
  dateStop: string;
  /** Nível de agregação */
  level: InsightLevel;
  /** Tipo de breakdown (padrão: 'none') */
  breakdown?: BreakdownType;
  /** Cursor de paginação */
  after?: string;
}

// ---------------------------------------------------------------------------
// BANCO DE DADOS — Tipos para upsert no Supabase
// ---------------------------------------------------------------------------

export interface AdInsightDailyRow {
  date_start: string;
  date_stop: string;
  level: InsightLevel;
  object_id: string;
  object_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  ad_set_id: string | null;
  ad_set_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  impressions: number;
  clicks: number;
  reach: number;
  spend: number;
  frequency: number;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  actions: MetaAction[] | null;
  roas: number | null;
  synced_at: string;
}

export interface AdInsightBreakdownRow extends AdInsightDailyRow {
  breakdown_type: string;
  breakdown_value: string;
  sub_breakdown_type: string | null;
  sub_breakdown_value: string | null;
}

export interface SyncLogRow {
  date_synced: string;
  level: string | null;
  breakdown_type: string | null;
  records_upserted: number;
  status: 'running' | 'success' | 'error';
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
}
