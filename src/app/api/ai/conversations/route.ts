// =============================================================================
// src/app/api/ai/conversations/route.ts
// GET  /api/ai/conversations        — lista conversas do usuário (sem mensagens)
// POST /api/ai/conversations        — cria ou atualiza uma conversa
//                                      body: { id?, title?, messages }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ChatMessage } from '@/lib/ai/gemini';

export const runtime = 'nodejs';

/** Deriva um título a partir da primeira mensagem do usuário */
function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'Nova conversa';
  const t = firstUser.content.trim().replace(/\s+/g, ' ');
  return t.length > 50 ? t.slice(0, 50) + '…' : t;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, title, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) {
    // Tabela ainda não existe → devolve lista vazia (feature degrada graciosamente)
    if (error.code === '42P01') return NextResponse.json({ conversations: [], needsMigration: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversations: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  let body: { id?: string; title?: string; messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const { id, title, messages } = body;
  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'messages obrigatório.' }, { status: 400 });
  }

  const finalTitle = title?.trim() || deriveTitle(messages);

  // UPDATE se veio id, senão INSERT
  if (id) {
    const { data, error } = await supabase
      .from('ai_conversations')
      .update({ title: finalTitle, messages })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, title, updated_at')
      .single();

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ error: 'Tabela não existe. Rode a migration 002.', needsMigration: true }, { status: 503 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ conversation: data });
  }

  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({ user_id: user.id, title: finalTitle, messages })
    .select('id, title, updated_at')
    .single();

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ error: 'Tabela não existe. Rode a migration 002.', needsMigration: true }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ conversation: data });
}
