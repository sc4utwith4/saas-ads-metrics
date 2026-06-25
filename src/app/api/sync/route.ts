// =============================================================================
// src/app/api/sync/route.ts
// API Route Next.js — POST /api/sync
//
// Dispara a sincronização dos dados do Facebook Ads para o Supabase.
// Protegida por um segredo em header para evitar chamadas não autorizadas.
//
// Corpo esperado (JSON):
// {
//   "dateStart": "2024-01-01",      // obrigatório
//   "dateStop": "2024-01-31",       // obrigatório
//   "level": "campaign",            // opcional (padrão: "campaign")
//   "breakdown": "none"             // opcional (padrão: "none")
// }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { syncDailyInsights, syncBreakdownInsights } from '@/lib/meta-api';
import { getRequestContext } from '@/lib/auth/profile';
import type { InsightLevel, BreakdownType } from '@/types/meta';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Validação simples do token de acesso interno
// Adicione SYNC_SECRET no seu .env.local para proteger o endpoint
// ---------------------------------------------------------------------------
const SYNC_SECRET = process.env.SYNC_SECRET;

export async function POST(req: NextRequest) {
  // Apenas admin pode disparar sync manual.
  const { user, role } = await getRequestContext();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (role !== 'admin') return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 });

  // Verificação adicional opcional por segredo (defense-in-depth).
  if (SYNC_SECRET) {
    const authHeader = req.headers.get('x-sync-secret');
    if (authHeader && authHeader !== SYNC_SECRET) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corpo JSON inválido.' }, { status: 400 });
  }

  const { dateStart, dateStop, level = 'campaign', breakdown = 'none' } =
    body as {
      dateStart?: string;
      dateStop?: string;
      level?: InsightLevel;
      breakdown?: BreakdownType;
    };

  // Validações
  if (!dateStart || !dateStop) {
    return NextResponse.json(
      { error: 'dateStart e dateStop são obrigatórios no formato YYYY-MM-DD.' },
      { status: 400 }
    );
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStart) || !dateRegex.test(dateStop)) {
    return NextResponse.json(
      { error: 'Formato de data inválido. Use YYYY-MM-DD.' },
      { status: 400 }
    );
  }

  const validLevels: InsightLevel[] = ['campaign', 'adset', 'ad'];
  if (!validLevels.includes(level)) {
    return NextResponse.json(
      { error: `Nível inválido. Use: ${validLevels.join(', ')}.` },
      { status: 400 }
    );
  }

  const validBreakdowns: BreakdownType[] = [
    'none',
    'age',
    'gender',
    'publisher_platform',
    'platform_position',
    'impression_device',
  ];
  if (!validBreakdowns.includes(breakdown)) {
    return NextResponse.json(
      { error: `Breakdown inválido. Use: ${validBreakdowns.join(', ')}.` },
      { status: 400 }
    );
  }

  try {
    const result =
      breakdown === 'none'
        ? await syncDailyInsights(dateStart, dateStop, level)
        : await syncBreakdownInsights(dateStart, dateStop, level, breakdown);

    return NextResponse.json({
      success: true,
      message: `Sincronização concluída.`,
      dateStart,
      dateStop,
      level,
      breakdown,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

// Método GET: retorna status do endpoint
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/sync',
    description: 'POST para sincronizar métricas do Facebook Ads com o Supabase.',
    params: {
      dateStart: 'YYYY-MM-DD (obrigatório)',
      dateStop: 'YYYY-MM-DD (obrigatório)',
      level: 'campaign | adset | ad (padrão: campaign)',
      breakdown: 'none | age | gender | publisher_platform | platform_position | impression_device (padrão: none)',
    },
  });
}
