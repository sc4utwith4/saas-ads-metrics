// =============================================================================
// src/lib/ai/gemini.ts
// Wrapper do Gemini API. Streaming + non-streaming + function calling.
// Estruturado de forma agnóstica para facilitar troca de provedor no futuro.
// =============================================================================

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.5-flash';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiInlineData {
  mimeType: string;
  data: string; // base64 (sem o prefixo data:)
}

export interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: { name: string; response: Record<string, unknown> };
  inlineData?: GeminiInlineData;
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeminiTool = { functionDeclarations: any[] };

interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[] };
  tools?: GeminiTool[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    thinkingConfig?: { thinkingBudget: number };
  };
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  usageMetadata?: { totalTokenCount?: number };
  error?: { message?: string };
}

export function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  return messages.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));
}

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY não configurada.');
  return k;
}

// ---------------------------------------------------------------------------
// Resiliência: retry com backoff + fallback de modelo.
// O Gemini retorna 503 (UNAVAILABLE / "high demand") em picos de uso. Em vez de
// estourar o erro, tentamos algumas vezes com espera e, se persistir, caímos
// para um modelo alternativo estável.
// ---------------------------------------------------------------------------
// Fallback DEVE ter cota própria no plano grátis. O gemini-2.0-flash tem
// limit:0 nesta conta — usamos o 2.5-flash-lite, que tem um balde de cota
// SEPARADO do 2.5-flash (logo, quando o flash satura por requisições/min,
// o lite ainda responde, dobrando a capacidade no plano grátis).
const FALLBACK_MODELS = ['gemini-2.5-flash-lite'];
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// Orçamento de "raciocínio" (thinking) do Gemini 2.5 no loop de ferramentas.
// >0 = pensa antes de responder/decidir ferramenta (melhor qualidade);
// 0 = desligado (mais rápido, porém responde no impulso). -1 = dinâmico.
const TOOL_THINKING_BUDGET = 1536;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Modelos a tentar em ordem: principal + fallbacks (sem duplicar). */
function modelCandidates(model: string): string[] {
  return [model, ...FALLBACK_MODELS.filter((m) => m !== model)];
}

/**
 * Serializa o corpo para um modelo específico. Modelos sem suporte a "thinking"
 * (ex.: gemini-2.0-flash) não aceitam thinkingConfig — removemos para eles.
 */
function bodyForModel(model: string, body: unknown): string {
  if (model.includes('2.5')) return JSON.stringify(body);
  const clone = JSON.parse(JSON.stringify(body)) as { generationConfig?: { thinkingConfig?: unknown } };
  if (clone.generationConfig) delete clone.generationConfig.thinkingConfig;
  return JSON.stringify(clone);
}

/**
 * POST resiliente ao Gemini. Tenta cada modelo com retry/backoff em erros
 * transitórios (503 sobrecarga, 429 rate limit, 5xx). Retorna a 1ª resposta OK;
 * se todas falharem, devolve a última resposta (o chamador formata o erro).
 * @param endpoint 'generateContent' | 'streamGenerateContent?alt=sse'
 */
async function geminiFetch(
  endpoint: string,
  body: unknown,
  model: string,
  { retriesPerModel = 1, baseDelay = 600, timeoutMs = 28000 }:
    { retriesPerModel?: number; baseDelay?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const sep = endpoint.includes('?') ? '&' : '?';
  const isStream = endpoint.includes('streamGenerate');
  const models = modelCandidates(model);
  let last: Response | null = null;

  for (let mi = 0; mi < models.length; mi++) {
    const url = `${GEMINI_API_BASE}/models/${models[mi]}:${endpoint}${sep}key=${apiKey()}`;
    const payload = bodyForModel(models[mi], body);
    for (let attempt = 0; attempt <= retriesPerModel; attempt++) {
      // Timeout por tentativa — evita travar o loop esperando resposta que não
      // vem. No streaming não abortamos por timeout (a leitura é contínua).
      const ctrl = new AbortController();
      const timer = isStream ? null : setTimeout(() => ctrl.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: ctrl.signal,
        });
      } catch (err) {
        if (timer) clearTimeout(timer);
        // timeout (abort) ou erro de rede → tenta de novo / próximo modelo
        if (attempt < retriesPerModel) { await sleep(baseDelay * 2 ** attempt); continue; }
        if (mi < models.length - 1) break;
        throw err;
      }
      if (timer) clearTimeout(timer);
      // Sucesso OU erro definitivo (400/401/403/404…): devolve com o corpo INTACTO.
      if (res.ok || !RETRYABLE_STATUS.has(res.status)) return res;
      // Erro transitório (503/429/5xx): guarda e tenta de novo (não consome o corpo).
      last = res;
      if (attempt < retriesPerModel) {
        await sleep(baseDelay * 2 ** attempt + Math.random() * 250);
      }
      // esgotou as tentativas deste modelo → loop externo passa ao próximo
    }
  }
  // Todas as tentativas falharam: devolve a última resposta com o corpo intacto,
  // para o chamador conseguir ler a mensagem de erro e formatá-la.
  return last as Response;
}

// ---------------------------------------------------------------------------
// generate — resposta completa (sem streaming, sem tools)
// ---------------------------------------------------------------------------
export async function generate({
  messages, systemPrompt, model = DEFAULT_MODEL,
  temperature = 0.7, maxOutputTokens = 4096, disableThinking = true,
}: {
  messages: ChatMessage[]; systemPrompt?: string; model?: string;
  temperature?: number; maxOutputTokens?: number; disableThinking?: boolean;
}): Promise<{ text: string; tokens: number }> {
  const body: GeminiRequest = {
    contents: toGeminiContents(messages),
    generationConfig: {
      temperature, maxOutputTokens,
      ...(disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

  const res = await geminiFetch('generateContent', body, model);
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as GeminiResponse;
  if (data.error) throw new Error(`Gemini: ${data.error.message ?? 'erro'}`);

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return { text, tokens: data.usageMetadata?.totalTokenCount ?? 0 };
}

// ---------------------------------------------------------------------------
// generateWithTools — uma rodada do loop de function calling.
// Recebe `contents` já montado (suporta histórico com functionCall/Response).
// Retorna a primeira parte relevante: functionCall OU texto.
// ---------------------------------------------------------------------------
export async function generateWithTools({
  contents, systemPrompt, tools, model = DEFAULT_MODEL,
  temperature = 0.5, maxOutputTokens = 4096, thinkingBudget = TOOL_THINKING_BUDGET,
}: {
  contents: GeminiContent[];
  systemPrompt?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  thinkingBudget?: number;
}): Promise<{ text: string; functionCall: GeminiFunctionCall | null; tokens: number }> {
  const body: GeminiRequest = {
    contents,
    generationConfig: { temperature, maxOutputTokens, thinkingConfig: { thinkingBudget } },
  };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
  if (tools && tools.length) body.tools = [{ functionDeclarations: tools }];

  const res = await geminiFetch('generateContent', body, model);
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as GeminiResponse;
  if (data.error) throw new Error(`Gemini: ${data.error.message ?? 'erro'}`);

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  let text = '';
  let functionCall: GeminiFunctionCall | null = null;
  for (const p of parts) {
    if (p.functionCall && !functionCall) functionCall = p.functionCall;
    else if (p.text) text += p.text;
  }
  return { text, functionCall, tokens: data.usageMetadata?.totalTokenCount ?? 0 };
}

// ---------------------------------------------------------------------------
// streamGenerate — SSE do Gemini transformado em stream de texto puro.
// ---------------------------------------------------------------------------
export async function streamGenerate({
  messages, systemPrompt, model = DEFAULT_MODEL,
  temperature = 0.7, maxOutputTokens = 4096, disableThinking = true,
  contents,
}: {
  messages?: ChatMessage[]; systemPrompt?: string; model?: string;
  temperature?: number; maxOutputTokens?: number; disableThinking?: boolean;
  contents?: GeminiContent[];
}): Promise<ReadableStream<Uint8Array>> {
  const body: GeminiRequest = {
    contents: contents ?? toGeminiContents(messages ?? []),
    generationConfig: {
      temperature, maxOutputTokens,
      ...(disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

  const res = await geminiFetch('streamGenerateContent?alt=sse', body, model);
  if (!res.ok || !res.body) throw new Error(`Gemini stream ${res.status}: ${await res.text()}`);

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader();
      let buffer = '';
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr || jsonStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(jsonStr) as GeminiResponse;
              const chunk = parsed.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
              if (chunk) controller.enqueue(encoder.encode(chunk));
            } catch { /* ignora linha inválida */ }
          }
        }
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });
}
