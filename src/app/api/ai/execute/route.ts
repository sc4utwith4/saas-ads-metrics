// =============================================================================
// src/app/api/ai/execute/route.ts
// POST /api/ai/execute — executa uma ação de ESCRITA já confirmada pelo usuário.
//   body: { tool: string, args: Record<string, unknown> }
//   resp: { ok: boolean, resultText: string }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getTool } from '@/lib/ai/tools';
import { getRequestContext } from '@/lib/auth/profile';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { user, role } = await getRequestContext();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (role !== 'admin') return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 });

  let body: { tool?: string; args?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const { tool: toolName, args } = body;
  if (!toolName) return NextResponse.json({ error: 'tool obrigatório.' }, { status: 400 });

  const tool = getTool(toolName);
  if (!tool) return NextResponse.json({ error: `Ferramenta desconhecida: ${toolName}` }, { status: 400 });
  if (tool.kind !== 'write') {
    return NextResponse.json({ error: 'Apenas ações de escrita passam por este endpoint.' }, { status: 400 });
  }

  const result = await tool.execute(args ?? {});

  if (!result.ok) {
    return NextResponse.json({ ok: false, resultText: result.error ?? 'Falha desconhecida na Meta API.' });
  }

  // Monta um texto de resultado legível conforme a ação
  let resultText = 'Ação concluída com sucesso.';
  const data = result.data as Record<string, unknown> | undefined;
  if (toolName === 'create_campaign' && data?.id) {
    resultText = `Campanha criada com sucesso (ID: ${data.id}), em estado PAUSADO.`;
  } else if (data?.success != null || data?.id) {
    resultText = `Operação confirmada pela Meta API${data?.id ? ` (ID: ${data.id})` : ''}.`;
  }

  return NextResponse.json({ ok: true, resultText, data: result.data });
}
