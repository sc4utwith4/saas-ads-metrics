-- =============================================================================
-- MIGRATION 003 — Relatórios semanais gerados pela IA (análise programada)
-- Execute num tab NOVO do SQL Editor do Supabase. Idempotente.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.ai_reports (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title         TEXT        NOT NULL,
  content       TEXT        NOT NULL,
  period_start  DATE,
  period_end    DATE,
  anomaly_count INT         NOT NULL DEFAULT 0,
  total_spend   NUMERIC(14, 4) NOT NULL DEFAULT 0,
  generated_by  TEXT        NOT NULL DEFAULT 'cron'
);

CREATE INDEX IF NOT EXISTS idx_ai_reports_created ON public.ai_reports (created_at DESC);

ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_reports_service_all" ON public.ai_reports;
CREATE POLICY "ai_reports_service_all" ON public.ai_reports
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "ai_reports_auth_read" ON public.ai_reports;
CREATE POLICY "ai_reports_auth_read" ON public.ai_reports
  FOR SELECT USING (auth.role() = 'authenticated');

-- =============================================================================
-- FIM DA MIGRATION 003
-- =============================================================================
