// =============================================================================
// src/app/api/meta/connections/[id]/route.ts
// PATCH  — ativa esta conexão (desativa as demais) ou renomeia o label
// DELETE — remove a conexão
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ---------------------------------------------------------------------------
// PATCH — { activate?: true, label?: string }
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { id } = await params;
  let body: { activate?: boolean; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  // Renomear
  if (typeof body.label === 'string' && body.label.trim()) {
    const { error } = await supabaseAdmin
      .from('meta_connections')
      .update({ label: body.label.trim() })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Ativar (exclusivo) — desativa todas e ativa só esta
  if (body.activate) {
    const { error: deErr } = await supabaseAdmin
      .from('meta_connections')
      .update({ is_active: false })
      .eq('is_active', true);
    if (deErr) return NextResponse.json({ error: deErr.message }, { status: 500 });

    const { error: actErr } = await supabaseAdmin
      .from('meta_connections')
      .update({ is_active: true })
      .eq('id', id);
    if (actErr) return NextResponse.json({ error: actErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { id } = await params;

  // Descobre se era a ativa para, se for, promover outra automaticamente.
  const { data: target } = await supabaseAdmin
    .from('meta_connections')
    .select('is_active')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabaseAdmin.from('meta_connections').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Se removeu a conexão ativa, ativa a mais recente das restantes.
  if (target?.is_active) {
    const { data: next } = await supabaseAdmin
      .from('meta_connections')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (next?.id) {
      await supabaseAdmin.from('meta_connections').update({ is_active: true }).eq('id', next.id);
    }
  }

  return NextResponse.json({ ok: true });
}
