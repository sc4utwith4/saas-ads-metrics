// =============================================================================
// src/app/api/ai/chat/route.ts
// POST /api/ai/chat — conversa com function calling.
//
// Protocolo de resposta: NDJSON (uma linha JSON por evento)
//   {"type":"text","value":"..."}                — pedaço de texto
//   {"type":"pending_action","action":{...}}     — ação de escrita p/ confirmar
//   {"type":"error","value":"..."}
//   {"type":"done"}
//
// Ferramentas de LEITURA rodam automaticamente no loop.
// Ferramentas de ESCRITA param o loop e viram "pending_action".
//
// Caso especial: quando o body tem `postAction`, significa que uma ação
// já foi confirmada e executada → respondemos só com texto (stream simples).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  generateWithTools, streamGenerate,
  type ChatMessage, type GeminiContent,
} from '@/lib/ai/gemini';
import { buildCampaignContext, formatContextForLLM, SYSTEM_PROMPT } from '@/lib/ai/context';
import { allFunctionDeclarations, getTool } from '@/lib/ai/tools';
import { getRequestContext } from '@/lib/auth/profile';
import { rateLimit, clientIp } from '@/lib/security/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TOOL_MODE_ADDENDUM = `

# 🔧 VOCÊ GERENCIA A CONTA INTEIRA (campanha → conjunto → anúncio)
Você TEM ferramentas conectadas à Meta API e pode LER e AGIR em TODOS os níveis. NUNCA diga que "não tem acesso" a anúncios ou criativos — você TEM. Se precisar de um dado, busque com a ferramenta certa.

LEITURA (rode automaticamente, sem pedir permissão):
- list_campaigns / find_campaign — campanhas e seus IDs
- list_adsets — conjuntos de anúncios (de uma campanha ou da conta)
- list_ads — anúncios (de um conjunto, campanha ou conta) → descobre os ad_id
- get_ad_details — DETALHE de um anúncio: criativo (texto, título, CTA, link, imagem) + métricas. USE para analisar um anúncio individualmente (copy + performance).
- get_ad_insights — métricas por nível; ex.: desempenho de CADA anúncio de uma campanha (object_id = campanha, level = "ad"). Ideal para comparar anúncios.
- get_realtime_insights — métricas atualizadas de campanha/conta

ESCRITA (passam por card de confirmação do usuário):
- pause_campaign / activate_campaign / update_budget / create_campaign
- pause_adset / activate_adset / update_adset_budget
- pause_ad / activate_ad

Como atender "analise cada anúncio":
1. list_ads (ou list_adsets primeiro, se útil) para pegar os ad_id
2. Para cada anúncio relevante, get_ad_details (criativo + métricas) — ou use get_ad_insights com level="ad" para uma visão comparativa de todos de uma vez
3. Avalie copy (título, texto, CTA, oferta) E performance (CTR, CPC, conversões, ROAS), e aponte o que melhorar

# 🖼️ VOCÊ PODE MOSTRAR IMAGENS
Quando get_ad_details trouxer a imagem do criativo (image_url/thumbnail_url), EXIBA-A na resposta usando markdown de imagem: ![Criativo do anúncio](URL_DA_IMAGEM). A interface renderiza a imagem de verdade. Mostre o criativo ao analisá-lo, assim o usuário vê do que você está falando. Para criar links clicáveis use [texto](url).

# 🔄 MODO AGENTE (faça tudo de uma vez, COM EFICIÊNCIA)
Trabalhe de forma autônoma: quando o usuário pedir algo de vários passos (ex.: "analise todos os anúncios"), execute as ferramentas em SEQUÊNCIA, sem pedir permissão a cada passo nem dizer "vou começar...". O usuário vê seu progresso em tempo real. Só pare para confirmação em ações de ESCRITA.

EFICIÊNCIA É OBRIGATÓRIA (você tem ~6 chamadas de ferramenta no máximo e um tempo limitado):
- Para visão geral de vários anúncios, use get_ad_insights com level="ad" UMA vez (traz métricas de TODOS os anúncios de uma vez) — NÃO chame get_ad_details para cada anúncio.
- Use get_ad_details (que é mais pesado: criativo + imagem) só para os 1-3 anúncios MAIS relevantes (ex.: o de pior e o de melhor desempenho), não para todos.
- Se a conta tiver muitos anúncios, foque nos principais e diga ao usuário que aprofundou nesses; ofereça detalhar outros se ele quiser.
- Assim que tiver dados suficientes, ENTREGUE a análise. Não fique buscando indefinidamente.

Regras:
- Você precisa do ID do objeto para agir. Se o usuário citou um nome, use a ferramenta de listagem ANTES para achar o ID.
- Ações de escrita passam por confirmação automática — não pergunte "posso confirmar?" em texto, apenas chame a ferramenta que o sistema mostra o card.
- Antes de uma ação relevante, explique em 1-2 frases o porquê (ancorado nos números). Depois chame a ferramenta.
- Nunca invente IDs. Se não encontrar, diga ao usuário e ofereça listar.`;

function enc(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + '\n');
}

/** Rótulo amigável do passo (modo agente) para cada ferramenta de leitura. */
function toolLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'list_campaigns': return 'Listando campanhas';
    case 'find_campaign': return `Procurando campanha "${args.name ?? ''}"`;
    case 'list_adsets': return 'Listando conjuntos de anúncios';
    case 'list_ads': return 'Listando anúncios';
    case 'get_ad_details': return 'Analisando criativo e métricas do anúncio';
    case 'get_ad_insights': return 'Buscando métricas por anúncio';
    case 'get_realtime_insights': return 'Buscando métricas em tempo real';
    default: return `Executando ${name}`;
  }
}

/** Converte erros técnicos em mensagens claras para o usuário. */
function friendlyAiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/\b503\b|UNAVAILABLE|high demand|overloaded/i.test(msg)) {
    return '⚠️ A IA está sobrecarregada no momento (pico de uso no servidor do Google). Aguarde alguns segundos e envie de novo.';
  }
  if (/\b429\b|rate limit|quota|RESOURCE_EXHAUSTED/i.test(msg)) {
    return '⚠️ Muitas requisições em pouco tempo (limite por minuto do plano grátis da IA). Aguarde ~1 minuto e tente novamente. Para uso intenso sem limite, ative o faturamento da API.';
  }
  if (/\b50[024]\b/.test(msg)) {
    return '⚠️ Instabilidade temporária no servidor da IA. Tente novamente em instantes.';
  }
  return `⚠️ Erro ao falar com a IA: ${msg}`;
}

export async function POST(req: NextRequest) {
  const { user, role } = await getRequestContext();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (role !== 'admin') return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 });

  const rl = rateLimit(`aichat:${user.id}:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Muitas requisições. Aguarde ${rl.retryAfter}s.` }, { status: 429 });

  let body: {
    messages?: ChatMessage[];
    daysBack?: number;
    postAction?: { title: string; resultText: string; ok: boolean };
    attachments?: Array<{ mimeType: string; data: string }>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const { messages, daysBack, postAction, attachments } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages obrigatório.' }, { status: 400 });
  }

  const context = await buildCampaignContext(daysBack ?? 30);
  const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n${TOOL_MODE_ADDENDUM}\n\n${formatContextForLLM(context)}`;

  // -------------------------------------------------------------------------
  // Caso A: pós-execução de ação confirmada → só confirma ao usuário (stream texto)
  // -------------------------------------------------------------------------
  if (postAction) {
    const note: ChatMessage = {
      role: 'user',
      content: `[SISTEMA] A ação "${postAction.title}" foi ${postAction.ok ? 'EXECUTADA COM SUCESSO' : 'TENTADA MAS FALHOU'}. Resultado: ${postAction.resultText}. Confirme ao usuário de forma breve e natural (1-3 frases) e indique o próximo passo recomendado. Não chame ferramentas.`,
    };
    try {
      const stream = await streamGenerate({
        messages: [...messages, note],
        systemPrompt: fullSystemPrompt,
        temperature: 0.6,
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  // -------------------------------------------------------------------------
  // Caso B: conversa normal com loop de function calling → NDJSON
  // -------------------------------------------------------------------------
  const contents: GeminiContent[] = messages.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));

  // Anexa imagens/áudio/PDF (inlineData) ao último turno do usuário
  if (attachments && attachments.length > 0) {
    for (let i = contents.length - 1; i >= 0; i--) {
      if (contents[i].role === 'user') {
        for (const a of attachments) {
          if (a?.mimeType && a?.data) {
            contents[i].parts.push({ inlineData: { mimeType: a.mimeType, data: a.data } });
          }
        }
        break;
      }
    }
  }

  const declarations = allFunctionDeclarations();
  const MAX_ITERATIONS = 6;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let i = 0; i < MAX_ITERATIONS; i++) {
          const { text, functionCall } = await generateWithTools({
            contents,
            systemPrompt: fullSystemPrompt,
            tools: declarations,
            temperature: 0.5,
          });

          if (text) controller.enqueue(enc({ type: 'text', value: text }));

          if (!functionCall) {
            controller.enqueue(enc({ type: 'done' }));
            controller.close();
            return;
          }

          const tool = getTool(functionCall.name);
          if (!tool) {
            controller.enqueue(enc({ type: 'text', value: `\n\n_(ferramenta desconhecida: ${functionCall.name})_` }));
            controller.enqueue(enc({ type: 'done' }));
            controller.close();
            return;
          }

          // Registra a chamada do modelo no histórico
          contents.push({ role: 'model', parts: [{ functionCall }] });

          if (tool.kind === 'read') {
            // Mostra o passo ao vivo (modo agente)
            controller.enqueue(enc({ type: 'step', label: toolLabel(functionCall.name, functionCall.args) }));
            const result = await tool.execute(functionCall.args);
            contents.push({
              role: 'user',
              parts: [{ functionResponse: { name: functionCall.name, response: result as unknown as Record<string, unknown> } }],
            });
            continue; // modelo usa o dado na próxima iteração
          }

          // ESCRITA → não executa; emite ação pendente p/ confirmação
          const conf = tool.confirm?.(functionCall.args) ?? { title: functionCall.name, description: '' };
          controller.enqueue(enc({
            type: 'pending_action',
            action: {
              id: `${functionCall.name}-${Date.now()}`,
              tool: functionCall.name,
              args: functionCall.args,
              title: conf.title,
              description: conf.description,
              danger: conf.danger ?? false,
            },
          }));
          controller.enqueue(enc({ type: 'done' }));
          controller.close();
          return;
        }

        controller.enqueue(enc({ type: 'text', value: '\n\n_(limite de etapas atingido)_' }));
        controller.enqueue(enc({ type: 'done' }));
        controller.close();
      } catch (err) {
        controller.enqueue(enc({ type: 'error', value: friendlyAiError(err) }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
