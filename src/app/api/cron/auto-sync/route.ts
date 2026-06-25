// =============================================================================
// src/app/api/cron/auto-sync/route.ts
// GET — sincroniza automaticamente os dados RECENTES da conta ativa no banco
// (alimenta o histórico para anomalias e relatórios). Pensado para rodar a cada
// ~10 min via Vercel Cron OU um cron externo (cron-job.org).
// Protegido por CRON_SECRET (header Authorization: Bearer, ou ?secret=).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { syncDailyInsights } from '@/lib/meta-api';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // sem segredo configurado → não bloqueia (dev)
  const auth = req.headers.get('authorization') || '';
  const qs = req.nextUrl.searchParams.get('secret') || '';
  return auth === `Bearer ${secret}` || qs === secret;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  // Sincroniza os últimos 3 dias (cobre o dia corrente + atrasos de atribuição).
  const dateStart = daysAgo(3);
  const dateStop = daysAgo(0);

  try {
    const result = await syncDailyInsights(dateStart, dateStop, 'campaign');
    return NextResponse.json({ ok: true, dateStart, dateStop, ...result, at: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
