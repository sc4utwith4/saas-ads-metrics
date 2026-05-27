-- =============================================================================
-- SAAS ADS METRICS — SUPABASE SCHEMA
-- Versao: 1.1.0 (corrigido para Supabase/PostgreSQL)
-- Execute este script no SQL Editor do painel do Supabase.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- EXTENSOES
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- TABELA: campaigns
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id            TEXT        PRIMARY KEY,
  name          TEXT        NOT NULL,
  status        TEXT,
  objective     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.campaigns IS 'Campanhas do Facebook Ads.';

-- -----------------------------------------------------------------------------
-- TABELA: ad_sets
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_sets (
  id            TEXT        PRIMARY KEY,
  campaign_id   TEXT        REFERENCES public.campaigns(id) ON DELETE SET NULL,
  name          TEXT        NOT NULL,
  status        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ad_sets IS 'Conjuntos de anuncios (Ad Sets) do Facebook Ads.';

-- -----------------------------------------------------------------------------
-- TABELA: ads
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ads (
  id            TEXT        PRIMARY KEY,
  ad_set_id     TEXT        REFERENCES public.ad_sets(id) ON DELETE SET NULL,
  campaign_id   TEXT        REFERENCES public.campaigns(id) ON DELETE SET NULL,
  name          TEXT        NOT NULL,
  status        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ads IS 'Anuncios individuais do Facebook Ads.';

-- -----------------------------------------------------------------------------
-- TABELA: ad_insights_daily
-- Metricas diarias sem breakdown.
-- UNIQUE em (date_start, level, object_id) evita duplicatas em re-execucoes.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_insights_daily (
  id                UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  date_start        DATE           NOT NULL,
  date_stop         DATE           NOT NULL,
  level             TEXT           NOT NULL CHECK (level IN ('campaign', 'adset', 'ad')),
  object_id         TEXT           NOT NULL,
  object_name       TEXT,
  campaign_id       TEXT,
  campaign_name     TEXT,
  ad_set_id         TEXT,
  ad_set_name       TEXT,
  ad_id             TEXT,
  ad_name           TEXT,
  impressions       BIGINT         NOT NULL DEFAULT 0,
  clicks            BIGINT         NOT NULL DEFAULT 0,
  reach             BIGINT         NOT NULL DEFAULT 0,
  spend             NUMERIC(14, 4) NOT NULL DEFAULT 0,
  frequency         NUMERIC(10, 6) NOT NULL DEFAULT 0,
  ctr               NUMERIC(10, 6),
  cpm               NUMERIC(14, 4),
  cpc               NUMERIC(14, 4),
  actions           JSONB,
  roas              NUMERIC(10, 4),
  synced_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ad_insights_daily UNIQUE (date_start, level, object_id)
);

COMMENT ON TABLE public.ad_insights_daily IS 'Metricas diarias do Facebook Ads por nivel.';

-- -----------------------------------------------------------------------------
-- TABELA: ad_insights_breakdown
-- Metricas diarias COM breakdown (idade, genero, plataforma, posicionamento).
-- O indice unico eh criado separadamente pois usa COALESCE().
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_insights_breakdown (
  id                    UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  date_start            DATE           NOT NULL,
  date_stop             DATE           NOT NULL,
  level                 TEXT           NOT NULL CHECK (level IN ('campaign', 'adset', 'ad')),
  object_id             TEXT           NOT NULL,
  object_name           TEXT,
  campaign_id           TEXT,
  campaign_name         TEXT,
  ad_set_id             TEXT,
  ad_set_name           TEXT,
  ad_id                 TEXT,
  ad_name               TEXT,
  breakdown_type        TEXT           NOT NULL,
  breakdown_value       TEXT           NOT NULL,
  sub_breakdown_type    TEXT,
  sub_breakdown_value   TEXT,
  impressions           BIGINT         NOT NULL DEFAULT 0,
  clicks                BIGINT         NOT NULL DEFAULT 0,
  reach                 BIGINT         NOT NULL DEFAULT 0,
  spend                 NUMERIC(14, 4) NOT NULL DEFAULT 0,
  frequency             NUMERIC(10, 6) NOT NULL DEFAULT 0,
  ctr                   NUMERIC(10, 6),
  cpm                   NUMERIC(14, 4),
  cpc                   NUMERIC(14, 4),
  actions               JSONB,
  roas                  NUMERIC(10, 4),
  synced_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ad_insights_breakdown IS 'Metricas diarias do Facebook Ads com breakdown.';

-- Indice unico para ad_insights_breakdown usando COALESCE (nao suportado em CONSTRAINT)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_insights_breakdown
  ON public.ad_insights_breakdown (
    date_start,
    level,
    object_id,
    breakdown_type,
    breakdown_value,
    COALESCE(sub_breakdown_type, ''),
    COALESCE(sub_breakdown_value, '')
  );

-- -----------------------------------------------------------------------------
-- TABELA: sync_logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,
  status           TEXT        NOT NULL CHECK (status IN ('running', 'success', 'error')) DEFAULT 'running',
  date_synced      DATE        NOT NULL,
  level            TEXT,
  breakdown_type   TEXT,
  records_upserted INT         DEFAULT 0,
  error_message    TEXT,
  metadata         JSONB
);

COMMENT ON TABLE public.sync_logs IS 'Log de execucoes do job de sincronizacao.';

-- -----------------------------------------------------------------------------
-- INDICES de leitura
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_aid_date_start   ON public.ad_insights_daily (date_start);
CREATE INDEX IF NOT EXISTS idx_aid_level        ON public.ad_insights_daily (level);
CREATE INDEX IF NOT EXISTS idx_aid_campaign_id  ON public.ad_insights_daily (campaign_id);
CREATE INDEX IF NOT EXISTS idx_aid_ad_set_id    ON public.ad_insights_daily (ad_set_id);
CREATE INDEX IF NOT EXISTS idx_aid_object_id    ON public.ad_insights_daily (object_id);

CREATE INDEX IF NOT EXISTS idx_aib_date_start      ON public.ad_insights_breakdown (date_start);
CREATE INDEX IF NOT EXISTS idx_aib_level           ON public.ad_insights_breakdown (level);
CREATE INDEX IF NOT EXISTS idx_aib_object_id       ON public.ad_insights_breakdown (object_id);
CREATE INDEX IF NOT EXISTS idx_aib_breakdown_type  ON public.ad_insights_breakdown (breakdown_type);
CREATE INDEX IF NOT EXISTS idx_aib_campaign_id     ON public.ad_insights_breakdown (campaign_id);

CREATE INDEX IF NOT EXISTS idx_sl_started_at ON public.sync_logs (started_at DESC);

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.campaigns              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_sets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_insights_daily      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_insights_breakdown  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs              ENABLE ROW LEVEL SECURITY;

-- service_role: acesso total (backend Next.js)
CREATE POLICY "service_role_all" ON public.campaigns             FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.ad_sets               FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.ads                   FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.ad_insights_daily     FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.ad_insights_breakdown FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_all" ON public.sync_logs             FOR ALL USING (auth.role() = 'service_role');

-- authenticated: somente leitura
CREATE POLICY "authenticated_read" ON public.campaigns             FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON public.ad_sets               FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON public.ads                   FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON public.ad_insights_daily     FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON public.ad_insights_breakdown FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated_read" ON public.sync_logs             FOR SELECT USING (auth.role() = 'authenticated');

-- -----------------------------------------------------------------------------
-- TRIGGER: updated_at automatico
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_ad_sets_updated_at
  BEFORE UPDATE ON public.ad_sets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_ads_updated_at
  BEFORE UPDATE ON public.ads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- FIM DO SCHEMA
-- =============================================================================
