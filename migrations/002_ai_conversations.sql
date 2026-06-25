-- =============================================================================
-- MIGRATION 002 — Histórico de conversas do Assistente IA
-- Execute no SQL Editor do painel do Supabase.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- TABELA: ai_conversations
-- Cada linha é uma conversa, com as mensagens armazenadas como JSONB.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL DEFAULT 'Nova conversa',
  messages    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_conversations IS 'Histórico de conversas do Assistente IA por usuário.';

CREATE INDEX IF NOT EXISTS idx_ai_conv_user_updated
  ON public.ai_conversations (user_id, updated_at DESC);

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY — cada usuário só acessa as próprias conversas.
-- -----------------------------------------------------------------------------
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

-- service_role: acesso total (backend)
DROP POLICY IF EXISTS "ai_conv_service_all" ON public.ai_conversations;
CREATE POLICY "ai_conv_service_all" ON public.ai_conversations
  FOR ALL USING (auth.role() = 'service_role');

-- authenticated: CRUD apenas nas próprias linhas
DROP POLICY IF EXISTS "ai_conv_owner_select" ON public.ai_conversations;
CREATE POLICY "ai_conv_owner_select" ON public.ai_conversations
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_conv_owner_insert" ON public.ai_conversations;
CREATE POLICY "ai_conv_owner_insert" ON public.ai_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_conv_owner_update" ON public.ai_conversations;
CREATE POLICY "ai_conv_owner_update" ON public.ai_conversations
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ai_conv_owner_delete" ON public.ai_conversations;
CREATE POLICY "ai_conv_owner_delete" ON public.ai_conversations
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- TRIGGER: updated_at automático
-- (reutiliza a função public.set_updated_at() criada no schema.sql)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_ai_conv_updated_at ON public.ai_conversations;
CREATE TRIGGER trg_ai_conv_updated_at
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- FIM DA MIGRATION 002
-- =============================================================================
