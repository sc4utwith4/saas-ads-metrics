// =============================================================================
// src/lib/supabase/server.ts
// Cliente Supabase para uso no servidor.
// - supabaseAdmin: service role, total acesso (uso interno API routes)
// - createServerSupabaseClient: cliente SSR com sessão de usuário via cookies
// =============================================================================
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL não definida.');
if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY não definida.');
if (!supabaseAnonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY não definida.');

/**
 * Cliente Supabase com permissões de service_role (acesso total).
 * Use APENAS em API Routes / Server Actions internas.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Cliente Supabase server-side com sessão de usuário via cookies (SSR).
 * Use em Server Components / Server Actions que precisam do usuário logado.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl!, supabaseAnonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components não podem setar cookies; ignorado.
        }
      },
    },
  });
}
