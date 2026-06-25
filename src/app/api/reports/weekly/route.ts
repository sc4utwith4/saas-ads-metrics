// =============================================================================
// src/app/api/reports/weekly/route.ts
// GET  /api/reports/weekly  — retorna o relatório semanal mais recente
// POST /api/reports/weekly  — gera um novo relatório agora (botão manual)
// Ambos exigem usuário autenticado.
// =============================================================================

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { generateWeeklyReport } from '@/lib/ai/report';
import { getRequestContext } from '@/lib/auth/profile';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  const { user, role } = await getRequestContext();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (role !== 'admin') return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from('ai_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ report: null, needsMigration: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ report: data ?? null });
}

export async function POST() {
  const { user, role } = await getRequestContext();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (role !== 'admin') return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 });

  try {
    const report = await generateWeeklyReport('manual');
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
