// =============================================================================
// src/app/api/meta/active/route.ts
// GET — resumo da conta Meta ATIVA (para o chip no header).
// Reflete a conexão ativa do banco ou o fallback do .env.
// =============================================================================

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getActiveMetaCredentials } from '@/lib/meta/credentials';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  try {
    const c = await getActiveMetaCredentials();
    return NextResponse.json({
      connected: true,
      label: c.label,
      adAccountId: c.adAccountId,
      source: c.source, // 'db' | 'env'
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
