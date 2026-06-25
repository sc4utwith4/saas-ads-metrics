// =============================================================================
// src/lib/auth/profile.ts
// Helpers de papel (role) e perfil do usuário no servidor.
//
// Fonte da verdade do papel: app_metadata.role no usuário do Auth (vai no JWT,
// sem custo de query). MENOR PRIVILÉGIO: só é admin quem tem role === 'admin'
// EXPLÍCITO; qualquer outro valor (inclusive ausente) é tratado como 'client'.
// Assim, contas auto-registradas ou sem papel NUNCA ganham acesso de admin —
// fecha o escalonamento de privilégio. Os admins reais recebem o role 'admin'
// explicitamente (ver script de bootstrap / criação).
//
// A tabela profiles guarda o vínculo cliente↔conta (connection_id), nome e email.
// =============================================================================

import type { User } from '@supabase/supabase-js';
import { createServerSupabaseClient, supabaseAdmin } from '@/lib/supabase/server';

export type Role = 'admin' | 'client';

/** Deriva o papel a partir do usuário do Auth (só admin explícito é admin). */
export function roleOf(user: User | null | undefined): Role {
  return user?.app_metadata?.role === 'admin' ? 'admin' : 'client';
}

export interface RequestContext {
  user: User | null;
  role: Role;
}

/** Usuário + papel da requisição atual (via sessão SSR). */
export async function getRequestContext(): Promise<RequestContext> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { user, role: roleOf(user) };
}

export interface Profile {
  id: string;
  role: Role;
  email: string | null;
  full_name: string | null;
  connection_id: string | null;
  created_at: string;
}

/** Lê a linha de perfil (vínculo de conta, nome) via service role. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id, role, email, full_name, connection_id, created_at')
    .eq('id', userId)
    .maybeSingle();
  return (data as Profile) ?? null;
}
