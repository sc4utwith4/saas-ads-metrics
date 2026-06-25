// =============================================================================
// src/app/api/insights/route.ts
// API Route Next.js — GET /api/insights
//
// Consulta os dados já sincronizados no Supabase e retorna para o frontend.
//
// Query params:
//   dateStart   — YYYY-MM-DD (obrigatório)
//   dateStop    — YYYY-MM-DD (obrigatório)
//   level       — campaign | adset | ad (padrão: campaign)
//   breakdown   — none | age | gender | publisher_platform | platform_position | impression_device
//   campaignId  — filtra por campanha específica
//   adSetId     — filtra por ad set específico
//   adId        — filtra por anúncio específico
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { getRequestContext } from '@/lib/auth/profile';

export async function GET(req: NextRequest) {
  const { user, role } = await getRequestContext();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (role !== 'admin') return NextResponse.json({ error: 'Acesso restrito.' }, { status: 403 });

  const { searchParams } = req.nextUrl;

  const dateStart = searchParams.get('dateStart');
  const dateStop = searchParams.get('dateStop');
  const level = searchParams.get('level') || 'campaign';
  const breakdown = searchParams.get('breakdown') || 'none';
  const campaignId = searchParams.get('campaignId');
  const adSetId = searchParams.get('adSetId');
  const adId = searchParams.get('adId');

  if (!dateStart || !dateStop) {
    return NextResponse.json(
      { error: 'dateStart e dateStop são obrigatórios.' },
      { status: 400 }
    );
  }

  try {
    const table = breakdown === 'none' ? 'ad_insights_daily' : 'ad_insights_breakdown';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabaseAdmin
      .from(table)
      .select('*')
      .eq('level', level)
      .gte('date_start', dateStart)
      .lte('date_stop', dateStop)
      .order('date_start', { ascending: true });

    // Filtros opcionais
    if (campaignId) query = query.eq('campaign_id', campaignId);
    if (adSetId) query = query.eq('ad_set_id', adSetId);
    if (adId) query = query.eq('ad_id', adId);

    // Filtro de breakdown
    if (breakdown !== 'none') {
      query = query.eq('breakdown_type', breakdown);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data,
      count: count ?? data?.length ?? 0,
      filters: { dateStart, dateStop, level, breakdown, campaignId, adSetId, adId },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
