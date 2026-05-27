// =============================================================================
// src/lib/supabase/server.ts
// Cliente Supabase para uso no servidor (API Routes, Server Actions).
// Usa a SERVICE_ROLE_KEY para ter permissão total de leitura/escrita.
// =============================================================================
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Variável de ambiente NEXT_PUBLIC_SUPABASE_URL não definida.');
}
if (!supabaseServiceKey) {
  throw new Error('Variável de ambiente SUPABASE_SERVICE_ROLE_KEY não definida.');
}

/**
 * Cliente Supabase com permissões de service_role.
 * Use APENAS em contextos server-side (API Routes, Server Actions).
 * NUNCA exponha este cliente no browser.
 */
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
