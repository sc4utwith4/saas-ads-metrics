// =============================================================================
// src/lib/insights/anomalies.ts
// Detecção de anomalias: compara um período recente com o período anterior
// de mesmo tamanho e sinaliza variações relevantes por campanha.
//
// Tudo é computado sobre ad_insights_daily — não requer schema novo.
// =============================================================================

import type { AdInsightDailyRow } from '@/types/meta';

export type AnomalySeverity = 'critical' | 'warning' | 'positive';

export type AnomalyMetric = 'spend' | 'roas' | 'ctr' | 'cpc' | 'cpm' | 'conversions';

export interface Anomaly {
  id: string;
  campaignId: string;
  campaignName: string;
  metric: AnomalyMetric;
  severity: AnomalySeverity;
  /** valor no período recente */
  current: number;
  /** valor no período anterior */
  previous: number;
  /** variação percentual (pode ser negativa) */
  changePct: number;
  /** mensagem pronta para exibição */
  message: string;
}

interface CampaignAgg {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  ctrSum: number;
  ctrCount: number;
  cpcSum: number;
  cpcCount: number;
  cpmSum: number;
  cpmCount: number;
  roasSum: number;
  roasCount: number;
  conversions: number;
}

function emptyAgg(id: string, name: string): CampaignAgg {
  return {
    id, name,
    spend: 0, impressions: 0, clicks: 0, reach: 0,
    ctrSum: 0, ctrCount: 0, cpcSum: 0, cpcCount: 0,
    cpmSum: 0, cpmCount: 0, roasSum: 0, roasCount: 0,
    conversions: 0,
  };
}

/** Soma o número de conversões (purchase/lead) de um array de actions */
function countConversions(row: AdInsightDailyRow): number {
  if (!row.actions || !Array.isArray(row.actions)) return 0;
  let total = 0;
  for (const a of row.actions) {
    if (/purchase|lead|complete_registration|add_to_cart|initiate_checkout/i.test(a.action_type)) {
      total += Number(a.value) || 0;
    }
  }
  return total;
}

function aggregate(rows: AdInsightDailyRow[]): Map<string, CampaignAgg> {
  const map = new Map<string, CampaignAgg>();
  for (const r of rows) {
    const id = r.object_id;
    if (!map.has(id)) map.set(id, emptyAgg(id, r.object_name ?? id));
    const a = map.get(id)!;
    a.spend += Number(r.spend) || 0;
    a.impressions += Number(r.impressions) || 0;
    a.clicks += Number(r.clicks) || 0;
    a.reach += Number(r.reach) || 0;
    a.conversions += countConversions(r);
    if (r.ctr != null && Number(r.ctr) > 0) { a.ctrSum += Number(r.ctr); a.ctrCount++; }
    if (r.cpc != null && Number(r.cpc) > 0) { a.cpcSum += Number(r.cpc); a.cpcCount++; }
    if (r.cpm != null && Number(r.cpm) > 0) { a.cpmSum += Number(r.cpm); a.cpmCount++; }
    if (r.roas != null && Number(r.roas) > 0) { a.roasSum += Number(r.roas); a.roasCount++; }
  }
  return map;
}

function avg(sum: number, count: number): number {
  return count > 0 ? sum / count : 0;
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

// Limiares de variação que disparam alerta (em %)
const THRESHOLDS = {
  spendSpike: 40,      // gasto subiu muito
  roasDrop: -25,       // ROAS caiu
  roasJump: 30,        // ROAS subiu (positivo)
  ctrDrop: -30,        // CTR caiu (fadiga criativa)
  cpcSpike: 35,        // CPC encareceu
  cpmSpike: 40,        // CPM encareceu
  convDrop: -35,       // conversões caíram
};

// Gasto mínimo no período pra considerar a campanha (evita ruído de campanhas paradas)
const MIN_SPEND = 5;

/**
 * Divide as linhas em dois períodos (recente x anterior) com base na mediana
 * de datas e detecta anomalias por campanha.
 *
 * @param rows linhas de ad_insights_daily cobrindo 2x o período de análise
 * @param windowDays tamanho de cada janela (ex: 7 = últimos 7 vs 7 anteriores)
 */
export function detectAnomalies(rows: AdInsightDailyRow[], windowDays = 7): Anomaly[] {
  if (rows.length === 0) return [];

  // Determina a data de corte: hoje - windowDays
  const dates = rows.map((r) => r.date_start).sort();
  const maxDate = dates[dates.length - 1];
  const cutoff = new Date(maxDate + 'T00:00:00');
  cutoff.setDate(cutoff.getDate() - windowDays + 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const recentRows = rows.filter((r) => r.date_start >= cutoffStr);
  const previousRows = rows.filter((r) => r.date_start < cutoffStr);

  if (previousRows.length === 0) return []; // sem base de comparação

  const recent = aggregate(recentRows);
  const previous = aggregate(previousRows);

  const anomalies: Anomaly[] = [];
  const fmtMoney = (n: number) => `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
  const fmtPct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

  for (const [id, cur] of recent) {
    const prev = previous.get(id);
    if (!prev) continue; // campanha nova, sem comparação
    if (cur.spend < MIN_SPEND && prev.spend < MIN_SPEND) continue;

    const name = cur.name;
    const push = (
      metric: AnomalyMetric,
      severity: AnomalySeverity,
      current: number,
      previous: number,
      changePct: number,
      message: string,
    ) => anomalies.push({ id: `${id}-${metric}`, campaignId: id, campaignName: name, metric, severity, current, previous, changePct, message });

    // ROAS
    const curRoas = avg(cur.roasSum, cur.roasCount);
    const prevRoas = avg(prev.roasSum, prev.roasCount);
    if (prevRoas > 0 && curRoas > 0) {
      const ch = pctChange(curRoas, prevRoas);
      if (ch <= THRESHOLDS.roasDrop) {
        push('roas', curRoas < 1 ? 'critical' : 'warning', curRoas, prevRoas, ch,
          `ROAS caiu ${fmtPct(Math.abs(ch))} (de ${prevRoas.toFixed(2)}x para ${curRoas.toFixed(2)}x).`);
      } else if (ch >= THRESHOLDS.roasJump) {
        push('roas', 'positive', curRoas, prevRoas, ch,
          `ROAS subiu ${fmtPct(ch)} (de ${prevRoas.toFixed(2)}x para ${curRoas.toFixed(2)}x). Considere escalar o orçamento.`);
      }
    }

    // CTR (fadiga criativa)
    const curCtr = avg(cur.ctrSum, cur.ctrCount);
    const prevCtr = avg(prev.ctrSum, prev.ctrCount);
    if (prevCtr > 0 && curCtr > 0) {
      const ch = pctChange(curCtr, prevCtr);
      if (ch <= THRESHOLDS.ctrDrop) {
        push('ctr', 'warning', curCtr, prevCtr, ch,
          `CTR caiu ${fmtPct(Math.abs(ch))} (de ${fmtPct(prevCtr)} para ${fmtPct(curCtr)}). Pode indicar fadiga criativa — teste novos criativos.`);
      }
    }

    // CPC (encarecimento)
    const curCpc = avg(cur.cpcSum, cur.cpcCount);
    const prevCpc = avg(prev.cpcSum, prev.cpcCount);
    if (prevCpc > 0 && curCpc > 0) {
      const ch = pctChange(curCpc, prevCpc);
      if (ch >= THRESHOLDS.cpcSpike) {
        push('cpc', 'warning', curCpc, prevCpc, ch,
          `CPC subiu ${fmtPct(ch)} (de ${fmtMoney(prevCpc)} para ${fmtMoney(curCpc)}). O tráfego está mais caro.`);
      }
    }

    // CPM
    const curCpm = avg(cur.cpmSum, cur.cpmCount);
    const prevCpm = avg(prev.cpmSum, prev.cpmCount);
    if (prevCpm > 0 && curCpm > 0) {
      const ch = pctChange(curCpm, prevCpm);
      if (ch >= THRESHOLDS.cpmSpike) {
        push('cpm', 'warning', curCpm, prevCpm, ch,
          `CPM subiu ${fmtPct(ch)} (de ${fmtMoney(prevCpm)} para ${fmtMoney(curCpm)}). O custo por mil impressões aumentou.`);
      }
    }

    // Gasto (spike)
    if (prev.spend > 0) {
      const ch = pctChange(cur.spend, prev.spend);
      if (ch >= THRESHOLDS.spendSpike && cur.spend > MIN_SPEND) {
        push('spend', 'warning', cur.spend, prev.spend, ch,
          `Gasto aumentou ${fmtPct(ch)} (de ${fmtMoney(prev.spend)} para ${fmtMoney(cur.spend)}). Verifique se o retorno acompanhou.`);
      }
    }

    // Conversões (queda)
    if (prev.conversions > 0) {
      const ch = pctChange(cur.conversions, prev.conversions);
      if (ch <= THRESHOLDS.convDrop) {
        push('conversions', cur.conversions === 0 ? 'critical' : 'warning', cur.conversions, prev.conversions, ch,
          `Conversões caíram ${fmtPct(Math.abs(ch))} (de ${prev.conversions.toFixed(0)} para ${cur.conversions.toFixed(0)}).`);
      }
    }
  }

  // Ordena: critical → warning → positive, e dentro de cada, maior variação absoluta
  const sevRank: Record<AnomalySeverity, number> = { critical: 0, warning: 1, positive: 2 };
  anomalies.sort((a, b) =>
    sevRank[a.severity] - sevRank[b.severity] || Math.abs(b.changePct) - Math.abs(a.changePct)
  );

  return anomalies;
}
