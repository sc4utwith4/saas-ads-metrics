// =============================================================================
// src/app/api/insights/anomalies/route.ts
// GET /api/insights/anomalies?window=7
// Compara o período recente (window dias) com o anterior e retorna anomalias.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { detectAnomalies } from '@/lib/insights/anomalies';
import { getRequestContext } from '@/lib/auth/profile';
import type { AdInsightDailyRow } from '@/types/meta';

export async function GET(req: NextRequest) {
  const { user, role } = await getRequestContext();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (role !== 'admin') return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 });

  const windowDays = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get('window')) || 7));

  // Busca 2x a janela pra ter base de comparação
  const today = new Date();
  const start = new Date();
  start.setDate(today.getDate() - windowDays * 2 + 1);
  const dateStart = start.toISOString().slice(0, 10);
  const dateStop = today.toISOString().slice(0, 10);

  try {
    const { data, error } = await supabaseAdmin
      .from('ad_insights_daily')
      .select('*')
      .eq('level', 'campaign')
      .gte('date_start', dateStart)
      .lte('date_stop', dateStop);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const anomalies = detectAnomalies((data ?? []) as AdInsightDailyRow[], windowDays);

    return NextResponse.json({
      anomalies,
      window: windowDays,
      period: { dateStart, dateStop },
      counts: {
        critical: anomalies.filter((a) => a.severity === 'critical').length,
        warning: anomalies.filter((a) => a.severity === 'warning').length,
        positive: anomalies.filter((a) => a.severity === 'positive').length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
