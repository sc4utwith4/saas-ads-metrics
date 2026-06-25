// =============================================================================
// src/app/api/cron/weekly-analysis/route.ts
// GET /api/cron/weekly-analysis — disparado pelo Vercel Cron (toda segunda).
// Protegido por CRON_SECRET (header Authorization: Bearer <secret>).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { generateWeeklyReport } from '@/lib/ai/report';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Em produção o Vercel envia Authorization: Bearer <CRON_SECRET>
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }
  }

  try {
    const report = await generateWeeklyReport('cron');
    return NextResponse.json({ ok: true, reportId: report.id, title: report.title });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
