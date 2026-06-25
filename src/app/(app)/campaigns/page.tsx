'use client';

import React, { useEffect, useState } from 'react';
import {
  Megaphone, Search, MapPin, Users, ChevronRight,
  Calendar, ArrowUpRight, SlidersHorizontal,
} from 'lucide-react';
import type { AdInsightDailyRow } from '@/types/meta';
import { formatCurrency, formatPercent, formatCompact, daysAgoStr, todayStr } from '@/lib/utils';

type AggregatedCampaign = AdInsightDailyRow & { _count: number };

const PERFORMANCE_FILTERS = [
  { label: 'Alto desempenho (ROAS > 2x)', key: 'high' },
  { label: 'Médio desempenho (1-2x)', key: 'medium' },
  { label: 'Baixo desempenho (< 1x)', key: 'low' },
  { label: 'Sem ROAS', key: 'none' },
];

const SPEND_RANGES = [
  { label: 'Até R$ 1.000', min: 0, max: 1000, key: 'r1' },
  { label: 'R$ 1.000 - 5.000', min: 1000, max: 5000, key: 'r2' },
  { label: 'R$ 5.000 - 20.000', min: 5000, max: 20000, key: 'r3' },
  { label: 'Acima de R$ 20.000', min: 20000, max: Infinity, key: 'r4' },
];

const SORT_OPTIONS = [
  { label: 'Maior gasto', value: 'spend-desc' },
  { label: 'Menor gasto', value: 'spend-asc' },
  { label: 'Melhor ROAS', value: 'roas-desc' },
  { label: 'Mais cliques', value: 'clicks-desc' },
  { label: 'Mais impressões', value: 'impressions-desc' },
];

const GRADIENTS = ['gradient-1', 'gradient-2', 'gradient-3', 'gradient-4', 'gradient-5', 'gradient-6'];

function performanceBucket(roas: number | null | undefined): string {
  if (!roas || Number(roas) === 0) return 'none';
  const r = Number(roas);
  if (r > 2) return 'high';
  if (r >= 1) return 'medium';
  return 'low';
}

function CampaignCard({ campaign, gradient }: { campaign: AggregatedCampaign; gradient: string }) {
  const bucket = performanceBucket(campaign.roas);
  const statusLabel = bucket === 'high' ? 'Top performer' : bucket === 'low' ? 'Otimizar' : 'Em andamento';
  const statusClass = bucket === 'high' ? 'badge-success' : bucket === 'low' ? 'badge-warning' : 'badge-dark';

  return (
    <div className="campaign-card fade-in">
      <div className={`campaign-card-banner ${gradient}`}>
        <div className="campaign-card-banner-status">
          <span className={`badge ${statusClass}`}>{statusLabel}</span>
        </div>
        <h3 className="campaign-card-banner-title">
          {campaign.object_name ?? `Campanha ${campaign.object_id.slice(-6)}`}
        </h3>
      </div>

      <div className="campaign-card-body">
        <div className="campaign-card-meta">
          <span className="campaign-card-meta-item">
            <MapPin size={11} />
            BR
          </span>
          <span className="campaign-card-meta-item">
            <Users size={11} />
            {formatCompact(campaign.reach)} pessoas
          </span>
          <span className="campaign-card-meta-item">
            <ArrowUpRight size={11} />
            {campaign.ctr ? formatPercent(Number(campaign.ctr)) : '—'} CTR
          </span>
        </div>

        <p className="campaign-card-desc">
          {formatCompact(campaign.impressions)} impressões e {formatCompact(campaign.clicks)} cliques no período selecionado.
        </p>

        <span className="badge badge-accent campaign-card-tag">
          {campaign.level === 'campaign' ? 'Campanha' : campaign.level === 'adset' ? 'Conjunto' : 'Anúncio'}
        </span>

        <div className="campaign-card-detail">
          <div className="campaign-card-detail-row">
            <span className="campaign-card-detail-label">
              Investimento total
              <ChevronRight size={11} style={{ opacity: 0.4 }} />
            </span>
          </div>
          <div className="campaign-card-detail-row">
            <span className="campaign-card-detail-value">{formatCurrency(campaign.spend)}</span>
            <span className="campaign-card-detail-meta" style={{ marginBottom: 0 }}>
              <Calendar size={11} />
              {new Date(campaign.date_start).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>

        <div className="campaign-card-footer">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="mono">{campaign.object_id.slice(-8)}</span>
          </div>
          <button className="btn btn-secondary btn-sm">
            Detalhes
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  const [rows, setRows] = useState<AdInsightDailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [perfFilters, setPerfFilters] = useState<Set<string>>(new Set());
  const [spendFilters, setSpendFilters] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState('spend-desc');

  useEffect(() => {
    const params = new URLSearchParams({
      dateStart: daysAgoStr(90),
      dateStop: todayStr(),
      level: 'campaign',
    });
    fetch(`/api/insights?${params}`)
      .then((r) => r.json())
      .then((json) => setRows(json.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const grouped: AggregatedCampaign[] = React.useMemo(() => {
    const map = new Map<string, AggregatedCampaign>();
    for (const r of rows) {
      if (!map.has(r.object_id)) {
        map.set(r.object_id, { ...r, impressions: 0, clicks: 0, reach: 0, spend: 0, frequency: 0, ctr: 0, cpm: 0, cpc: 0, roas: 0, _count: 0 });
      }
      const agg = map.get(r.object_id)!;
      agg.impressions += r.impressions;
      agg.clicks += r.clicks;
      agg.reach += r.reach;
      agg.spend += r.spend;
      agg._count++;
      agg.ctr = (agg.ctr! * (agg._count - 1) + (r.ctr ?? 0)) / agg._count;
      agg.cpm = (agg.cpm! * (agg._count - 1) + (r.cpm ?? 0)) / agg._count;
      agg.cpc = (agg.cpc! * (agg._count - 1) + (r.cpc ?? 0)) / agg._count;
      agg.roas = (agg.roas! * (agg._count - 1) + (r.roas ?? 0)) / agg._count;
    }
    return Array.from(map.values());
  }, [rows]);

  const filtered = grouped
    .filter((c) => (c.object_name ?? c.object_id).toLowerCase().includes(search.toLowerCase()))
    .filter((c) => {
      if (perfFilters.size === 0) return true;
      return perfFilters.has(performanceBucket(c.roas));
    })
    .filter((c) => {
      if (spendFilters.size === 0) return true;
      return SPEND_RANGES.some((r) => spendFilters.has(r.key) && c.spend >= r.min && c.spend < r.max);
    })
    .sort((a, b) => {
      switch (sort) {
        case 'spend-asc': return a.spend - b.spend;
        case 'roas-desc': return Number(b.roas ?? 0) - Number(a.roas ?? 0);
        case 'clicks-desc': return b.clicks - a.clicks;
        case 'impressions-desc': return b.impressions - a.impressions;
        default: return b.spend - a.spend;
      }
    });

  const togglePerf = (k: string) => {
    const next = new Set(perfFilters);
    next.has(k) ? next.delete(k) : next.add(k);
    setPerfFilters(next);
  };

  const toggleSpend = (k: string) => {
    const next = new Set(spendFilters);
    next.has(k) ? next.delete(k) : next.add(k);
    setSpendFilters(next);
  };

  const clearFilters = () => {
    setPerfFilters(new Set());
    setSpendFilters(new Set());
    setSearch('');
  };

  const hasFilters = perfFilters.size > 0 || spendFilters.size > 0 || search.length > 0;

  return (
    <div className="page">
      {/* Hero */}
      <div className="page-hero">
        <h1 className="page-hero-title">Suas campanhas</h1>
        <p className="page-hero-subtitle">
          Explore o desempenho de cada campanha individualmente nos últimos 90 dias.
          Use os filtros para identificar oportunidades de otimização e top performers.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div style={{ position: 'relative', flex: 1, minWidth: 240, maxWidth: 420 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="input"
            placeholder="Buscar campanha por nome…"
            style={{ paddingLeft: 36, borderRadius: 'var(--radius-full)', height: 40 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{filtered.length}</strong> {filtered.length === 1 ? 'campanha' : 'campanhas'}
          </span>
          <select className="select select-pill" style={{ width: 200, height: 40 }} value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Layout 2 cols */}
      <div className="layout-with-filters">
        {/* Filters */}
        <aside className="filters-sidebar">
          <div className="filters-header">
            <div className="filters-title">
              <SlidersHorizontal size={14} />
              Filtros
            </div>
            {hasFilters && (
              <button className="filters-clear" onClick={clearFilters}>Limpar</button>
            )}
          </div>

          <div className="filter-group">
            <div className="filter-group-label">Desempenho</div>
            <div className="filter-group-items">
              {PERFORMANCE_FILTERS.map((f) => (
                <label key={f.key} className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={perfFilters.has(f.key)}
                    onChange={() => togglePerf(f.key)}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <div className="filter-group-label">Faixa de investimento</div>
            <div className="filter-group-items">
              {SPEND_RANGES.map((r) => (
                <label key={r.key} className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={spendFilters.has(r.key)}
                    onChange={() => toggleSpend(r.key)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>
        </aside>

        {/* Cards Grid */}
        <div>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 380, borderRadius: 16 }} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon"><Megaphone size={20} /></div>
                <p className="empty-state-title">Nenhuma campanha encontrada</p>
                <p className="empty-state-desc">
                  {hasFilters ? 'Tente ajustar os filtros ou limpar a busca.' : 'Sincronize seus dados no Dashboard para popular esta lista.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((c, i) => (
                <CampaignCard key={c.object_id} campaign={c} gradient={GRADIENTS[i % GRADIENTS.length]} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
