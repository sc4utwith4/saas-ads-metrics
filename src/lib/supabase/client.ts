// =============================================================================
// src/lib/supabase/client.ts
// Cliente Supabase para uso no browser (componentes React Client Side).
// Usa a ANON_KEY — sem permissões elevadas.
// =============================================================================
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Cliente Supabase com permissões de anon (públicas/autenticadas via RLS).
 * Seguro para uso em componentes Client Side.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
