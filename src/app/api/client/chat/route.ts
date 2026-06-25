// =============================================================================
// src/app/api/client/chat/route.ts
// POST — Assistente IA do CLIENTE (somente leitura).
// Ancorado nos dados AO VIVO da conta vinculada ao cliente. SEM ferramentas e
// SEM ações de escrita: a IA apenas explica/analisa os resultados.
// Resposta: stream de texto puro.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext, getProfile } from '@/lib/auth/profile';
import { getMetaCredentialsForConnection } from '@/lib/meta/credentials';
import { getAccountOverview, type AccountOverview } from '@/lib/meta/overview';
import { streamGenerate, type ChatMessage } from '@/lib/ai/gemini';
import { rateLimit, clientIp } from '@/lib/security/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const money = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const compact = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

function buildContext(o: AccountOverview): string {
  const t = o.totals;
  const campLines = o.campaigns.slice(0, 15).map((c) =>
    `- ${c.name} [${c.status}] — gasto ${money(c.spend)}, ${compact(c.impressions)} impressões, ${compact(c.clicks)} cliques, CTR ${c.ctr.toFixed(2)}%`).join('\n');
  const adLines = o.ads.slice(0, 15).map((a) =>
    `- ${a.name} [${a.status}] (campanha: ${a.campaignName}) — gasto ${money(a.spend)}, ${compact(a.impressions)} impressões, CTR ${a.ctr.toFixed(2)}%, ${a.results} resultado(s)`).join('\n');

  return `## Dados da conta "${o.account}" (últimos 30 dias)

### Totais
- Investimento: ${money(t.spend)}
- ${t.resultLabel}: ${compact(t.results)}  (custo por resultado: ${t.costPerResult > 0 ? money(t.costPerResult) : '—'})
- Impressões: ${compact(t.impressions)} | Cliques: ${compact(t.clicks)} | Alcance: ${compact(t.reach)}
- CTR: ${t.ctr.toFixed(2)}% | CPC: ${money(t.cpc)} | CPM: ${money(t.cpm)}
- Campanhas: ${t.campaigns}${t.roas > 0 ? ` | ROAS: ${t.roas.toFixed(2)}x` : ''}

### Campanhas
${campLines || '(sem campanhas no período)'}

### Anúncios
${adLines || '(sem anúncios no período)'}`;
}

const CLIENT_SYSTEM_PROMPT = `Você é o assistente de inteligência artificial que ajuda o CLIENTE a entender o desempenho das campanhas de anúncios DELE.

Seu papel:
- Explicar os resultados de forma clara, simples e didática (o cliente pode não ser técnico).
- Analisar o que está indo bem e o que pode melhorar, com base SOMENTE nos dados fornecidos.
- Traduzir métricas (CTR, CPC, resultados, etc.) em linguagem que qualquer pessoa entende.
- Ser positivo e transparente: se algo está ruim, diga com tato e explique o porquê.

REGRAS IMPORTANTES:
- Você é SOMENTE LEITURA. NÃO executa nenhuma ação (não pausa, ativa, nem altera orçamento/campanhas). Se o cliente pedir uma mudança, oriente-o a falar com o gestor de tráfego responsável.
- Use EXCLUSIVAMENTE os números fornecidos no contexto. NUNCA invente métricas, valores ou nomes.
- Responda em português brasileiro, com markdown (títulos, listas, **negrito**) para clareza.
- Se perguntarem algo fora dos dados disponíveis, explique gentilmente que você só tem acesso aos dados das campanhas da conta dele.`;

export async function POST(req: NextRequest) {
  const { user } = await getRequestContext();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const rl = rateLimit(`cchat:${user.id}:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Muitas requisições. Aguarde ${rl.retryAfter}s.` }, { status: 429 });

  let body: { messages?: ChatMessage[] };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 }); }

  const messages = body.messages;
  if (!messages?.length) return NextResponse.json({ error: 'messages obrigatório.' }, { status: 400 });

  const profile = await getProfile(user.id);
  if (!profile?.connection_id) {
    return NextResponse.json({ error: 'Sua conta ainda não foi vinculada a uma conta de anúncios. Fale com o seu gestor.' }, { status: 400 });
  }
  const creds = await getMetaCredentialsForConnection(profile.connection_id);
  if (!creds) return NextResponse.json({ error: 'A conta vinculada não está disponível.' }, { status: 400 });

  try {
    const overview = await getAccountOverview(creds, 'last_30d');
    const systemPrompt = `${CLIENT_SYSTEM_PROMPT}\n\n${buildContext(overview)}`;
    const stream = await streamGenerate({ messages, systemPrompt, temperature: 0.6 });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const friendly = /\b503\b|UNAVAILABLE|high demand/i.test(msg)
      ? 'A IA está sobrecarregada no momento. Tente novamente em alguns segundos.'
      : /\b429\b|quota|rate limit/i.test(msg)
      ? 'Muitas requisições agora. Aguarde um instante e tente de novo.'
      : msg;
    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}
