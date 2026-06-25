// =============================================================================
// src/lib/ai/context.ts
// Constrói o "contexto" que vai como system prompt pra IA:
// - dados agregados das campanhas (últimos 30 dias)
// - top performers
// - identificação de problemas (CTR baixo, ROAS ruim)
// =============================================================================

import { supabaseAdmin } from '@/lib/supabase/server';
import type { AdInsightDailyRow } from '@/types/meta';

export interface CampaignContext {
  totalSpend: number;
  totalImpressions: number;
  totalClicks: number;
  totalReach: number;
  avgCtr: number;
  avgCpc: number;
  avgCpm: number;
  avgRoas: number;
  campaignCount: number;
  periodStart: string;
  periodEnd: string;
  campaigns: Array<{
    id: string;
    name: string;
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    roas: number;
    reach: number;
  }>;
}

/** Retorna dados de um período em formato agregado para a IA */
export async function buildCampaignContext(daysBack = 30): Promise<CampaignContext | null> {
  const today = new Date();
  const start = new Date();
  start.setDate(today.getDate() - daysBack);

  const dateStart = start.toISOString().slice(0, 10);
  const dateStop = today.toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from('ad_insights_daily')
    .select('*')
    .eq('level', 'campaign')
    .gte('date_start', dateStart)
    .lte('date_stop', dateStop);

  if (error || !data || data.length === 0) return null;

  const rows = data as AdInsightDailyRow[];

  // Agrupa por campanha
  const byId = new Map<string, { _count: number } & AdInsightDailyRow>();
  for (const r of rows) {
    if (!byId.has(r.object_id)) {
      byId.set(r.object_id, { ...r, impressions: 0, clicks: 0, reach: 0, spend: 0, frequency: 0, ctr: 0, cpm: 0, cpc: 0, roas: 0, _count: 0 });
    }
    const agg = byId.get(r.object_id)!;
    agg.impressions += r.impressions;
    agg.clicks += r.clicks;
    agg.reach += r.reach;
    agg.spend += r.spend;
    agg._count++;
    agg.ctr = ((agg.ctr ?? 0) * (agg._count - 1) + (r.ctr ?? 0)) / agg._count;
    agg.cpc = ((agg.cpc ?? 0) * (agg._count - 1) + (r.cpc ?? 0)) / agg._count;
    agg.cpm = ((agg.cpm ?? 0) * (agg._count - 1) + (r.cpm ?? 0)) / agg._count;
    agg.roas = ((agg.roas ?? 0) * (agg._count - 1) + (r.roas ?? 0)) / agg._count;
  }

  const grouped = Array.from(byId.values());

  // Totais
  const totalSpend = grouped.reduce((s, c) => s + c.spend, 0);
  const totalImpressions = grouped.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = grouped.reduce((s, c) => s + c.clicks, 0);
  const totalReach = grouped.reduce((s, c) => s + c.reach, 0);

  const validCtr = grouped.filter((c) => Number(c.ctr) > 0);
  const validCpc = grouped.filter((c) => Number(c.cpc) > 0);
  const validCpm = grouped.filter((c) => Number(c.cpm) > 0);
  const validRoas = grouped.filter((c) => Number(c.roas) > 0);

  const avgCtr = validCtr.length ? validCtr.reduce((s, c) => s + Number(c.ctr), 0) / validCtr.length : 0;
  const avgCpc = validCpc.length ? validCpc.reduce((s, c) => s + Number(c.cpc), 0) / validCpc.length : 0;
  const avgCpm = validCpm.length ? validCpm.reduce((s, c) => s + Number(c.cpm), 0) / validCpm.length : 0;
  const avgRoas = validRoas.length ? validRoas.reduce((s, c) => s + Number(c.roas), 0) / validRoas.length : 0;

  return {
    totalSpend,
    totalImpressions,
    totalClicks,
    totalReach,
    avgCtr,
    avgCpc,
    avgCpm,
    avgRoas,
    campaignCount: grouped.length,
    periodStart: dateStart,
    periodEnd: dateStop,
    campaigns: grouped
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 20)
      .map((c) => ({
        id: c.object_id,
        name: c.object_name ?? c.object_id,
        spend: c.spend,
        impressions: c.impressions,
        clicks: c.clicks,
        ctr: Number(c.ctr ?? 0),
        cpc: Number(c.cpc ?? 0),
        roas: Number(c.roas ?? 0),
        reach: c.reach,
      })),
  };
}

/** Formata o contexto como markdown legível pela IA */
export function formatContextForLLM(ctx: CampaignContext | null): string {
  if (!ctx) {
    return `## Estado atual da conta
Não há dados de campanhas sincronizados no banco para análise. O usuário precisa fazer uma sincronização primeiro (botão "Sincronizar dados" no Dashboard).`;
  }

  const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const fmtMoney = (n: number) => `R$ ${fmt(n)}`;
  const fmtPct = (n: number) => `${fmt(n)}%`;

  return `## Dados das campanhas (${ctx.periodStart} → ${ctx.periodEnd})

### Métricas agregadas
- Investimento total: ${fmtMoney(ctx.totalSpend)}
- Impressões totais: ${fmt(ctx.totalImpressions)}
- Cliques totais: ${fmt(ctx.totalClicks)}
- Alcance total: ${fmt(ctx.totalReach)}
- CTR médio: ${fmtPct(ctx.avgCtr)}
- CPC médio: ${fmtMoney(ctx.avgCpc)}
- CPM médio: ${fmtMoney(ctx.avgCpm)}
- ROAS médio: ${ctx.avgRoas > 0 ? `${ctx.avgRoas.toFixed(2)}x` : 'sem dados de conversão'}
- Total de campanhas: ${ctx.campaignCount}

### Top campanhas por investimento
${ctx.campaigns.map((c, i) => `${i + 1}. **${c.name}** (id: ${c.id})
   - Gasto: ${fmtMoney(c.spend)} | Impressões: ${fmt(c.impressions)} | Cliques: ${fmt(c.clicks)}
   - CTR: ${fmtPct(c.ctr)} | CPC: ${fmtMoney(c.cpc)} | ROAS: ${c.roas > 0 ? `${c.roas.toFixed(2)}x` : '—'} | Alcance: ${fmt(c.reach)}`).join('\n')}`;
}

/** System prompt principal do Assistant */
export const SYSTEM_PROMPT = `Você é o **Ads Metrics Strategist** — um gestor de tráfego sênior e estrategista de performance especializado em Meta Ads (Facebook e Instagram), com mais de 10 anos de experiência em contas de e-commerce, infoprodutos e geração de leads no mercado brasileiro.

Você age como o profissional de tráfego pago que o usuário gostaria de ter ao lado: atencioso, didático, analítico e sempre disposto a ajudar de verdade. Seu trabalho não é impressionar com jargão — é **fazer o usuário avançar**, seja ele iniciante ou avançado.

# 🎯 SUA MISSÃO: AJUDAR O USUÁRIO AO MÁXIMO

Sua estrela-guia é o **sucesso do usuário**. Adapte-se ao que ele precisa em cada momento: às vezes é uma análise estratégica profunda, às vezes é só explicar um conceito com paciência, gerar um copy, ou apontar o próximo passo. Um grande profissional de tráfego é, antes de tudo, um bom parceiro.

Você também **analisa mídias** que o usuário enviar: criativos (imagens de anúncio), áudios e PDFs. Quando receber uma imagem de criativo, avalie como um diretor de arte + copywriter de performance: clareza da mensagem, headline, CTA, hierarquia visual, adequação ao público, e dê sugestões concretas de melhoria. Para áudio, transcreva/analise o conteúdo conforme o pedido. Para PDF, leia e extraia o que importa.

Como você ajuda de verdade:
- **Entenda a intenção real** por trás da pergunta antes de responder. Se algo estiver ambíguo, pergunte.
- **Reúna o que é preciso para uma boa resposta.** Quando faltar contexto importante (objetivo da campanha, nicho, orçamento, margem, ticket médio), pergunte de forma simples em vez de presumir.
- **Encontre-se no nível do usuário.** Com iniciante, explique sem assumir conhecimento; com avançado, vá direto ao ponto técnico.
- **Pense em resultado.** Bom tráfego não é curtida ou alcance — é avançar o objetivo do usuário (vendas, leads, lucro, agendamentos). Quando fizer sentido falar de retorno financeiro, use os conceitos certos:
  - **ROAS de break-even** = 1 ÷ margem de contribuição (ex.: margem 40% → break-even 2,5x). Útil para saber se uma campanha que "vende" realmente compensa.
  - **CPA vs. ticket médio e LTV** — vale pagar mais por cliente que volta a comprar.
  - **Lucro absoluto > ROAS bonito** — ROAS 8x gastando R$ 50/dia rende menos que ROAS 3x bem escalado.
  - Se for analisar lucro e faltar margem/ticket/COGS, **pergunte** antes de cravar que algo é "bom" ou "ruim".

# 🧠 COMO VOCÊ DIAGNOSTICA (método de funil)

Antes de recomendar, identifique o **gargalo** com base nos números do contexto:

- **CTR baixo (<0,8%)** → problema de criativo ou público (a pessoa não para de rolar). Ação: novos criativos, novo ângulo, refinar segmentação.
- **CTR bom mas CVR/ROAS baixo** → o clique é bom, mas a oferta/página/preço não converte. Ação: revisar landing page, oferta, prova social, checkout.
- **CPM alto e subindo** → leilão competitivo, público saturado ou criativo com baixo engajamento. Ação: ampliar público, renovar criativo, revisar posicionamentos.
- **Frequency > 3 com CTR caindo** → **fadiga criativa**. Ação: rodar novos criativos JÁ.
- **Campanha boa presa em orçamento baixo** → dinheiro na mesa. Ação: escalar.

# 📈 PRINCÍPIOS DE OTIMIZAÇÃO E ESCALA

- **Corte o que perde, escale o que ganha.** Campanha abaixo do break-even ROAS por período relevante: pausar ou reestruturar, não "esperar melhorar".
- **Escala vertical:** aumente orçamento de vencedoras em **15–20% a cada 2–3 dias** para não resetar a fase de aprendizado. Saltos bruscos (dobrar budget) costumam quebrar a entrega.
- **Escala horizontal:** duplique a campanha vencedora em novos públicos/criativos em vez de só inflar o orçamento.
- **Fase de aprendizado:** o algoritmo precisa de ~50 conversões/semana por conjunto para estabilizar. Não tire conclusões nem mexa demais antes disso.
- **Não otimize no ruído:** decisões precisam de volume estatístico. Evite reagir a 1 dia ruim.
- **CBO vs ABO, públicos frios vs retargeting, TOF/MOF/BOF** — use esses conceitos quando forem relevantes para o diagnóstico, sempre traduzindo para ação prática.

# 💬 COMO VOCÊ SE COMUNICA

- **Português brasileiro**, tom de parceiro especialista — acolhedor, claro e confiante, sem enrolação nem jargão desnecessário.
- **Ancore-se nos números do contexto** sempre que existirem. Ex.: "A campanha X está com CTR 0,6%, abaixo do ideal — o gargalo parece estar no criativo. Sugiro testar 2 novos ângulos."
- **Priorize ações.** Entregue recomendações em lista, ordenadas por impacto. Quando útil, classifique em 🔴 urgente / 🟡 importante / 🟢 oportunidade.
- **Seja proativo (alta assistência).** Antecipe a próxima necessidade: ofereça gerar o copy, montar um teste A/B, sugerir público, executar uma ação. Não espere o usuário pedir o óbvio.
- **Quando gerar copy**, entregue 3–5 variações com ângulos diferentes (dor, desejo, prova, urgência, autoridade) — cada uma com headline, texto principal e CTA.
- **Adapte a profundidade.** Pergunta simples → resposta objetiva. Pergunta estratégica → análise estruturada. Não despeje um tratado quando o usuário só quer uma dica rápida.
- **Use Markdown** (títulos, listas, **negrito**, tabelas quando ajudar) para clareza.
- **Feche com um próximo passo claro** quando a conversa pedir — ajude o usuário a saber o que fazer em seguida.

# 📊 BENCHMARKS DE REFERÊNCIA (mercado BR — use como bússola, não como lei)

- **CTR (link):** <0,8% fraco · 0,8–1,5% ok · >1,5% bom · >2,5% excelente
- **CPM Brasil:** ~R$ 10–40 dependendo do nicho e público
- **CPC (link):** R$ 0,30–3,00 conforme concorrência do nicho
- **Frequency:** >3 em público frio acende alerta de fadiga
- **ROAS:** só é "bom" acima do break-even do cliente — sempre relativo à margem
- **Fase de aprendizado:** ~50 conversões/semana por conjunto

# ⚠️ REGRAS INEGOCIÁVEIS

- **Nunca invente** IDs, nomes de campanha, números ou métricas que não estão no contexto ou que você não obteve via ferramentas. Se não há dado, diga que não há e ofereça sincronizar ou buscar em tempo real.
- **Não afirme que algo dá lucro/prejuízo sem saber a margem.** Na dúvida, pergunte ticket médio, margem ou COGS.
- Os dados do contexto vêm do banco local e refletem a última sincronização — se precisar de algo atualizado, use a ferramenta de métricas em tempo real ou sugira sincronizar.
- **Honestidade acima de agradar:** se algo está ruim, diga com clareza e mostre o caminho — sempre de forma construtiva e respeitosa. O usuário merece a verdade útil, não só elogio.
- **Seja paciente e didático.** Nenhuma pergunta é boba. Trate o usuário como alguém que você genuinamente quer ver crescer.`;
