// =============================================================================
// src/lib/ai/report.ts
// Geração da análise semanal automática (usada pelo cron e pelo botão manual).
// Junta contexto das campanhas + anomalias, pede à IA um relatório executivo
// e salva em ai_reports.
// =============================================================================

import { supabaseAdmin } from '@/lib/supabase/server';
import { generate } from '@/lib/ai/gemini';
import { buildCampaignContext, formatContextForLLM, SYSTEM_PROMPT } from '@/lib/ai/context';
import { detectAnomalies, type Anomaly } from '@/lib/insights/anomalies';
import type { AdInsightDailyRow } from '@/types/meta';

export interface WeeklyReport {
  id?: string;
  title: string;
  content: string;
  period_start: string;
  period_end: string;
  anomaly_count: number;
  total_spend: number;
  generated_by: string;
  created_at?: string;
}

const REPORT_PROMPT = `Gere um RELATÓRIO SEMANAL EXECUTIVO de tráfego pago, em português brasileiro, com base nos dados abaixo.

Estruture exatamente assim (use Markdown):

## 📊 Resumo da semana
2-3 frases com o panorama geral (investimento, volume, direção dos resultados).

## ✅ Destaques
O que foi bem — campanhas/ métricas positivas. Se houver oportunidades de escala, aponte.

## ⚠️ Pontos de atenção
Problemas, quedas e desperdícios. Seja específico com números. Se houver anomalias, incorpore-as.

## 🎯 Recomendações para a próxima semana
3 a 5 ações priorizadas e concretas (o que fazer, em qual campanha, por quê).

Regras:
- Seja conciso e direto — é um resumo executivo, não um tratado.
- Ancore tudo nos números fornecidos. Não invente dados.
- Se não houver dados suficientes, diga isso claramente e oriente sincronizar.`;

/** Gera o relatório semanal e salva no banco. */
export async function generateWeeklyReport(generatedBy: 'cron' | 'manual'): Promise<WeeklyReport> {
  const ctx = await buildCampaignContext(7);

  // Anomalias (14 dias para comparar 7 vs 7)
  const today = new Date();
  const start = new Date();
  start.setDate(today.getDate() - 14 + 1);
  const { data } = await supabaseAdmin
    .from('ad_insights_daily')
    .select('*')
    .eq('level', 'campaign')
    .gte('date_start', start.toISOString().slice(0, 10))
    .lte('date_stop', today.toISOString().slice(0, 10));

  const anomalies: Anomaly[] = detectAnomalies((data ?? []) as AdInsightDailyRow[], 7);

  const periodStart = ctx?.periodStart ?? start.toISOString().slice(0, 10);
  const periodEnd = ctx?.periodEnd ?? today.toISOString().slice(0, 10);

  // Monta o prompt do usuário com contexto + anomalias
  let userContent = `${formatContextForLLM(ctx)}\n\n`;
  if (anomalies.length > 0) {
    userContent += `## Anomalias detectadas (7 dias vs 7 anteriores)\n`;
    userContent += anomalies.slice(0, 15)
      .map((a) => `- [${a.severity}] ${a.campaignName}: ${a.message}`)
      .join('\n');
    userContent += '\n\n';
  }
  userContent += REPORT_PROMPT;

  let content: string;
  try {
    const { text } = await generate({
      messages: [{ role: 'user', content: userContent }],
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.6,
      maxOutputTokens: 2048,
    });
    content = text || '_Não foi possível gerar o relatório._';
  } catch (err) {
    content = `_Erro ao gerar relatório: ${err instanceof Error ? err.message : String(err)}_`;
  }

  const report: WeeklyReport = {
    title: `Análise semanal — ${new Date(periodEnd).toLocaleDateString('pt-BR')}`,
    content,
    period_start: periodStart,
    period_end: periodEnd,
    anomaly_count: anomalies.length,
    total_spend: ctx?.totalSpend ?? 0,
    generated_by: generatedBy,
  };

  // Salva (ignora silenciosamente se a tabela ainda não existir)
  const { data: saved, error } = await supabaseAdmin
    .from('ai_reports')
    .insert(report)
    .select('id, created_at')
    .single();

  if (!error && saved) {
    report.id = saved.id as string;
    report.created_at = saved.created_at as string;
  }

  return report;
}
