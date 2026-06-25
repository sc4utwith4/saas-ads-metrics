-- =============================================================================
-- MIGRATION 005 — Perfis e papéis (admin / cliente)
-- Habilita acesso multi-cliente: o admin cria logins de clientes que veem,
-- somente leitura, as campanhas da conta de anúncios vinculada a eles.
-- Execute no SQL Editor do painel do Supabase.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- TABELA: profiles
-- Uma linha por usuário do Auth. 'admin' = equipe (acesso total);
-- 'client' = cliente final (somente visualização da conta vinculada).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
  email         TEXT,
  full_name     TEXT,
  connection_id UUID        REFERENCES public.meta_connections(id) ON DELETE SET NULL,
  created_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Perfil/papel de cada usuário. client = acesso somente leitura à conta vinculada.';

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_connection ON public.profiles (connection_id);

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Gestão (criar/listar/excluir clientes) acontece via API Routes com
-- service_role. O usuário só consegue ler o próprio perfil.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_service_all" ON public.profiles;
CREATE POLICY "profiles_service_all" ON public.profiles
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "profiles_self_select" ON public.profiles;
CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- TRIGGER: updated_at automático (reutiliza public.set_updated_at() do schema)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- SEED: todos os usuários JÁ EXISTENTES viram admin (a equipe).
-- Novos clientes criados pelo painel nascem com role 'client'.
-- -----------------------------------------------------------------------------
INSERT INTO public.profiles (id, email, role)
SELECT id, email, 'admin' FROM auth.users
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- =============================================================================
-- FIM DA MIGRATION 005
-- =============================================================================
