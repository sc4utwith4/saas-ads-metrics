// =============================================================================
// src/app/api/insights/live/route.ts
// GET — visão geral AO VIVO da conta ATIVA (admin). Mesma fonte do portal do
// cliente, garantindo que o Dashboard bata 100% com o Meta Ads Manager.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/profile';
import { getActiveMetaCredentials } from '@/lib/meta/credentials';
import { getAccountOverview, daysToPreset } from '@/lib/meta/overview';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { user, role } = await getRequestContext();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (role !== 'admin') return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10) || 30, 1), 365);

  try {
    const creds = await getActiveMetaCredentials();
    const overview = await getAccountOverview(creds, daysToPreset(days));
    return NextResponse.json({ overview, days });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
