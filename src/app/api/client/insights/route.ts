// =============================================================================
// src/app/api/client/insights/route.ts
// GET — visão geral AO VIVO da conta vinculada ao cliente logado.
// Somente leitura. Escopo: a conexão Meta amarrada ao perfil do usuário.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext, getProfile } from '@/lib/auth/profile';
import { getMetaCredentialsForConnection } from '@/lib/meta/credentials';
import { getAccountOverview, daysToPreset } from '@/lib/meta/overview';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const { user } = await getRequestContext();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const profile = await getProfile(user.id);
  if (!profile?.connection_id) {
    return NextResponse.json(
      { error: 'not_linked', message: 'Sua conta ainda não foi vinculada a uma conta de anúncios. Fale com o seu gestor.' },
      { status: 200 },
    );
  }

  const creds = await getMetaCredentialsForConnection(profile.connection_id);
  if (!creds) {
    return NextResponse.json(
      { error: 'connection_missing', message: 'A conta vinculada não está mais disponível. Fale com o seu gestor.' },
      { status: 200 },
    );
  }

  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10) || 30, 1), 365);

  try {
    const overview = await getAccountOverview(creds, daysToPreset(days));
    return NextResponse.json({ overview, days });
  } catch (err) {
    return NextResponse.json(
      { error: 'meta_error', message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
