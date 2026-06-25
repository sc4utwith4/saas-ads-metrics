-- =============================================================================
-- MIGRATION 004 — Conexões Meta (multi-conta)
-- Permite conectar/trocar qualquer conta de anúncios do Facebook pela UI,
-- sem editar variáveis de ambiente nem fazer redeploy.
-- Execute no SQL Editor do painel do Supabase.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- TABELA: meta_connections
-- Cada linha é uma conta de anúncios conectada. Apenas UMA pode estar ativa.
-- O backend lê a conexão ativa para todas as chamadas à Meta API.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meta_connections (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  label            TEXT        NOT NULL,                       -- nome amigável (ex.: "Davi", "Cliente X")
  ad_account_id    TEXT        NOT NULL,                       -- numérico, SEM o prefixo act_
  account_name     TEXT,                                       -- nome da conta na Meta (exibição)
  access_token     TEXT        NOT NULL,                       -- token de acesso (sensível)
  api_version      TEXT        NOT NULL DEFAULT 'v19.0',
  is_active        BOOLEAN     NOT NULL DEFAULT FALSE,
  token_expires_at TIMESTAMPTZ,                                -- validade do token, se conhecida
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.meta_connections IS 'Contas de anúncios da Meta conectadas. Apenas uma ativa por vez.';

-- Garante no máximo UMA conexão ativa em toda a tabela.
CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_conn_single_active
  ON public.meta_connections (is_active)
  WHERE is_active = TRUE;

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- A tabela guarda tokens sensíveis. Todo acesso passa pelas API Routes do app
-- usando o service_role (que valida a sessão do usuário antes). O cliente nunca
-- consulta esta tabela diretamente — por isso liberamos apenas o service_role.
-- -----------------------------------------------------------------------------
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_conn_service_all" ON public.meta_connections;
CREATE POLICY "meta_conn_service_all" ON public.meta_connections
  FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- TRIGGER: updated_at automático (reutiliza public.set_updated_at() do schema.sql)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_meta_conn_updated_at ON public.meta_connections;
CREATE TRIGGER trg_meta_conn_updated_at
  BEFORE UPDATE ON public.meta_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- FIM DA MIGRATION 004
-- =============================================================================
