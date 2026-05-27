'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Minus,
  BarChart2, MousePointerClick, Eye, DollarSign,
  Users, Repeat2, Target, RefreshCw,
  ChevronDown, Calendar, AlertCircle, Activity,
  Zap, ArrowUpRight, Layers, CheckCircle2, XCircle
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, Legend, Area, AreaChart
} from 'recharts';
import type { AdInsightDailyRow } from '@/types/meta';
import { formatCurrency, formatPercent, formatCompact, daysAgoStr, todayStr } from '@/lib/utils';

// ─── Tipos ────────────────────────────────────────────────────────────────────
type DatePreset = '7d' | '14d' | '30d' | '90d' | 'custom';
type MetricKey = 'spend' | 'impressions' | 'clicks' | 'roas' | 'ctr' | 'cpm' | 'cpc' | 'reach';

interface KpiConfig {
  key: MetricKey;
  label: string;
  icon: React.ElementType;
  color: string;
  format: (v: number) => string;
  tooltip: string;
}

interface SyncResult {
  success: boolean;
  upserted?: number;
  error?: string;
}

// ─── Configuração dos KPIs ───────────────────────────────────────────────────
const KPI_CONFIG: KpiConfig[] = [
  { key: 'spend',       label: 'Gasto Total',    icon: DollarSign,       color: '#2563EB', format: (v) => formatCurrency(v),          tooltip: 'Valor total investido no período' },
  { key: 'roas',        label: 'ROAS',           icon: TrendingUp,       color: '#10B981', format: (v) => v > 0 ? `${v.toFixed(2)}x` : '—', tooltip: 'Retorno sobre o investimento em anúncios' },
  { key: 'impressions', label: 'Impressões',     icon: Eye,              color: '#8B5CF6', format: (v) => formatCompact(v),            tooltip: 'Total de vezes que o anúncio foi exibido' },
  { key: 'clicks',      label: 'Cliques',        icon: MousePointerClick,color: '#F59E0B', format: (v) => formatCompact(v),            tooltip: 'Total de cliques nos anúncios' },
  { key: 'ctr',         label: 'CTR',            icon: Target,           color: '#06B6D4', format: (v) => formatPercent(v),            tooltip: 'Taxa de clique: Cliques / Impressões × 100' },
  { key: 'cpm',         label: 'CPM',            icon: BarChart2,        color: '#EC4899', format: (v) => formatCurrency(v),           tooltip: 'Custo por Mil Impressões' },
  { key: 'cpc',         label: 'CPC',            icon: Zap,              color: '#F97316', format: (v) => formatCurrency(v),           tooltip: 'Custo por Clique' },
  { key: 'reach',       label: 'Alcance',        icon: Users,            color: '#0EA5E9', format: (v) => formatCompact(v),            tooltip: 'Pessoas únicas que viram o anúncio' },
];

// ─── Utilitários ─────────────────────────────────────────────────────────────
function sumMetric(rows: AdInsightDailyRow[], key: MetricKey): number {
  if (key === 'ctr' || key === 'cpm' || key === 'cpc' || key === 'roas') {
    const valid = rows.filter((r) => r[key] && Number(r[key]) > 0);
    if (!valid.length) return 0;
    return valid.reduce((s, r) => s + Number(r[key] ?? 0), 0) / valid.length;
  }
  return rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);
}

function buildChartData(rows: AdInsightDailyRow[], metric: MetricKey) {
  const byDate: Record<string, number[]> = {};
  for (const r of rows) {
    const val = Number(r[metric] ?? 0);
    (byDate[r.date_start] ??= []).push(val);
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date: new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      value: vals.reduce((s, v) => s + v, 0) / (metric === 'ctr' || metric === 'cpm' || metric === 'cpc' || metric === 'roas' ? vals.length : 1),
    }));
}

function getDelta(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

// ─── Componente: Header ───────────────────────────────────────────────────────
function Header({ onSync, syncing }: { onSync: () => void; syncing: boolean }) {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
      <div className="max-w-screen-xl mx-auto px-6 py-0 flex items-center justify-between h-16">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600">
            <Activity size={18} color="#fff" />
          </div>
          <div>
            <span className="font-bold text-base text-slate-900">Ads Metrics</span>
            <span className="hidden sm:inline text-xs ml-2 px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-600 border border-blue-100">
              Facebook Ads
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 border border-slate-200 bg-slate-50/50 py-1 px-2.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Supabase Conectado
          </div>
          <button
            className="btn btn-primary btn-sm rounded-lg"
            onClick={onSync}
            disabled={syncing}
            id="sync-button"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando…' : 'Sincronizar'}
          </button>
        </div>
      </div>
    </header>
  );
}

// ─── Componente: Filtros ──────────────────────────────────────────────────────
const DATE_PRESETS: { label: string; value: DatePreset; days?: number }[] = [
  { label: 'Últimos 7 dias',  value: '7d',  days: 7  },
  { label: 'Últimos 14 dias', value: '14d', days: 14 },
  { label: 'Últimos 30 dias', value: '30d', days: 30 },
  { label: 'Últimos 90 dias', value: '90d', days: 90 },
];

function FiltersBar({
  dateStart, dateStop, preset, level, campaignId, campaigns,
  onPreset, onDateChange, onLevel, onCampaign,
}: {
  dateStart: string; dateStop: string; preset: DatePreset;
  level: string; campaignId: string;
  campaigns: { id: string; name: string }[];
  onPreset: (p: DatePreset) => void;
  onDateChange: (start: string, stop: string) => void;
  onLevel: (l: string) => void;
  onCampaign: (id: string) => void;
}) {
  return (
    <div className="card p-4 mb-6 flex flex-wrap gap-4 items-center bg-white border border-slate-200">
      {/* Presets de período */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200/50">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.value}
              id={`preset-${p.value}`}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
              style={{
                background: preset === p.value ? '#ffffff' : 'transparent',
                color: preset === p.value ? '#0f172a' : '#475569',
                boxShadow: preset === p.value ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
              onClick={() => onPreset(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: '1px', background: 'var(--border)', height: '24px' }} className="hidden lg:block" />

      {/* Datas customizadas */}
      <div className="flex items-center gap-2">
        <Calendar size={14} className="text-slate-400 mr-1" />
        <input 
          id="date-start" 
          type="date" 
          className="input" 
          style={{ width: '135px', padding: '0.4rem 0.6rem', fontSize: '0.8125rem', height: '32px' }}
          value={dateStart} 
          onChange={(e) => onDateChange(e.target.value, dateStop)} 
        />
        <span className="text-slate-400 text-xs">até</span>
        <input 
          id="date-stop" 
          type="date" 
          className="input" 
          style={{ width: '135px', padding: '0.4rem 0.6rem', fontSize: '0.8125rem', height: '32px' }}
          value={dateStop} 
          onChange={(e) => onDateChange(dateStart, e.target.value)} 
        />
      </div>

      <div style={{ width: '1px', background: 'var(--border)', height: '24px' }} className="hidden lg:block" />

      {/* Nível */}
      <div className="flex items-center gap-2">
        <select 
          id="level-select" 
          className="select" 
          style={{ width: '150px', padding: '0.4rem 2rem 0.4rem 0.75rem', fontSize: '0.8125rem', height: '32px' }} 
          value={level} 
          onChange={(e) => onLevel(e.target.value)}
        >
          <option value="campaign">Campanha</option>
          <option value="adset">Conjunto de Anúncios</option>
          <option value="ad">Anúncio</option>
        </select>
      </div>

      {/* Campanha */}
      <div className="flex items-center gap-2 ml-auto lg:ml-0">
        <select 
          id="campaign-select" 
          className="select" 
          style={{ width: '200px', padding: '0.4rem 2rem 0.4rem 0.75rem', fontSize: '0.8125rem', height: '32px' }} 
          value={campaignId} 
          onChange={(e) => onCampaign(e.target.value)}
        >
          <option value="">Todas as campanhas</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ─── Componente: KPI Card ─────────────────────────────────────────────────────
function MetricCard({ config, value, delta, loading }: {
  config: KpiConfig; value: number; delta: number | null; loading: boolean;
}) {
  const Icon = config.icon;
  const isPositive = delta !== null && delta > 0;
  const isNegative = delta !== null && delta < 0;

  return (
    <div className="metric-card fade-in" style={{ '--accent-color': config.color } as React.CSSProperties} id={`kpi-${config.key}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: `${config.color}18` }}>
            <Icon size={16} style={{ color: config.color }} />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            {config.label}
          </span>
        </div>
        {delta !== null && (
          <span className={`badge ${isPositive ? 'badge-green' : isNegative ? 'badge-red' : 'badge-blue'}`}>
            {isPositive ? <TrendingUp size={10} /> : isNegative ? <TrendingDown size={10} /> : <Minus size={10} />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Value */}
      {loading ? (
        <div>
          <div className="skeleton h-8 w-28 mb-1" />
          <div className="skeleton h-3 w-20 mt-2" />
        </div>
      ) : (
        <div>
          <p className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {config.format(value)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{config.tooltip}</p>
        </div>
      )}
    </div>
  );
}

// ─── Componente: Chart ────────────────────────────────────────────────────────
const CHART_METRIC_OPTIONS: { label: string; value: MetricKey; color: string }[] = [
  { label: 'Gasto', value: 'spend', color: '#2563EB' },
  { label: 'Impressões', value: 'impressions', color: '#8B5CF6' },
  { label: 'Cliques', value: 'clicks', color: '#F59E0B' },
  { label: 'CTR (%)', value: 'ctr', color: '#06B6D4' },
  { label: 'CPC', value: 'cpc', color: '#F97316' },
  { label: 'ROAS', value: 'roas', color: '#10B981' },
];

function MetricsChart({ rows, loading }: { rows: AdInsightDailyRow[]; loading: boolean }) {
  const [chartMetric, setChartMetric] = useState<MetricKey>('spend');
  const metricConf = CHART_METRIC_OPTIONS.find((m) => m.value === chartMetric)!;
  const chartData = buildChartData(rows, chartMetric);
  const kpiConf = KPI_CONFIG.find((k) => k.key === chartMetric)!;

  return (
    <div className="card p-6 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
            Evolução Diária
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Acompanhe a variação da métrica ao longo do período selecionado
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CHART_METRIC_OPTIONS.map((m) => (
            <button
              key={m.value}
              id={`chart-metric-${m.value}`}
              className="btn btn-sm"
              style={{
                background: chartMetric === m.value ? `${m.color}18` : 'transparent',
                color: chartMetric === m.value ? m.color : 'var(--text-secondary)',
                border: chartMetric === m.value ? `1px solid ${m.color}40` : '1px solid transparent',
                fontWeight: chartMetric === m.value ? 600 : 400,
              }}
              onClick={() => setChartMetric(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="skeleton h-64 w-full" />
      ) : chartData.length === 0 ? (
        <div className="empty-state h-64">
          <Activity size={32} />
          <h3>Sem dados no período</h3>
          <p>Sincronize os dados do Facebook Ads para visualizar o gráfico.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={metricConf.color} stopOpacity={0.15} />
                <stop offset="95%" stopColor={metricConf.color} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false}
              tickFormatter={(v) => kpiConf.format(v).replace(/R\$\s?/, 'R$')} width={70} />
            <ReTooltip
              contentStyle={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '13px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
              formatter={(v) => [kpiConf.format(Number(v ?? 0)), metricConf.label]}
              labelStyle={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}
            />
            <Area type="monotone" dataKey="value" stroke={metricConf.color} strokeWidth={2.5}
              fill="url(#colorVal)" dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Componente: Tabela de Campanhas ──────────────────────────────────────────
type SortKey = 'object_name' | 'spend' | 'impressions' | 'clicks' | 'ctr' | 'cpm' | 'cpc' | 'roas' | 'reach';

function CampaignTable({ rows, loading }: { rows: AdInsightDailyRow[]; loading: boolean }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'spend', dir: 'desc' });

  // Agrupa por object_id
  const grouped = React.useMemo(() => {
    const map = new Map<string, AdInsightDailyRow & { _count: number }>();
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

  const sorted = [...grouped].sort((a, b) => {
    const va = sort.key === 'object_name' ? (a.object_name ?? '') : Number(a[sort.key] ?? 0);
    const vb = sort.key === 'object_name' ? (b.object_name ?? '') : Number(b[sort.key] ?? 0);
    if (va < vb) return sort.dir === 'asc' ? -1 : 1;
    if (va > vb) return sort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const toggle = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const SortIcon = ({ k }: { k: SortKey }) => sort.key === k
    ? <ArrowUpRight size={12} style={{ transform: sort.dir === 'asc' ? 'none' : 'rotate(90deg)', transition: 'transform 0.15s' }} />
    : <ChevronDown size={12} style={{ opacity: 0.3 }} />;

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
            Desempenho por Objeto
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {grouped.length} {grouped.length === 1 ? 'item' : 'itens'} encontrados
          </p>
        </div>
        <span className="badge badge-blue">
          <Layers size={10} /> Nível atual: {sorted[0]?.level ?? '—'}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="empty-state">
            <Layers size={32} />
            <h3>Nenhum dado disponível</h3>
            <p>Clique em "Sincronizar" para buscar os dados do Facebook Ads e preenchê-los aqui.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                {[
                  { k: 'object_name' as SortKey, label: 'Nome', align: 'left' },
                  { k: 'spend'       as SortKey, label: 'Gasto', align: 'right' },
                  { k: 'impressions' as SortKey, label: 'Impressões', align: 'right' },
                  { k: 'clicks'      as SortKey, label: 'Cliques', align: 'right' },
                  { k: 'ctr'         as SortKey, label: 'CTR', align: 'right' },
                  { k: 'cpm'         as SortKey, label: 'CPM', align: 'right' },
                  { k: 'cpc'         as SortKey, label: 'CPC', align: 'right' },
                  { k: 'roas'        as SortKey, label: 'ROAS', align: 'right' },
                  { k: 'reach'       as SortKey, label: 'Alcance', align: 'right' },
                ].map(({ k, label, align }) => (
                  <th key={k} className={align === 'right' ? 'text-right' : ''}>
                    <button onClick={() => toggle(k)} className="inline-flex items-center gap-1 hover:opacity-70 transition-opacity" style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'inherit', fontSize: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit' }}>
                      {label} <SortIcon k={k} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.object_id}>
                  <td>
                    <div className="font-medium" style={{ color: 'var(--text-primary)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.object_name ?? row.object_id}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>ID: {row.object_id}</div>
                  </td>
                  <td className="text-right font-semibold" style={{ color: 'var(--brand)' }}>{formatCurrency(row.spend)}</td>
                  <td className="text-right">{formatCompact(row.impressions)}</td>
                  <td className="text-right">{formatCompact(row.clicks)}</td>
                  <td className="text-right">{row.ctr ? formatPercent(Number(row.ctr)) : '—'}</td>
                  <td className="text-right">{row.cpm ? formatCurrency(Number(row.cpm)) : '—'}</td>
                  <td className="text-right">{row.cpc ? formatCurrency(Number(row.cpc)) : '—'}</td>
                  <td className="text-right">
                    {row.roas && Number(row.roas) > 0 ? (
                      <span className="badge badge-green">{Number(row.roas).toFixed(2)}x</span>
                    ) : '—'}
                  </td>
                  <td className="text-right">{formatCompact(row.reach)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Componente: Sync Panel ────────────────────────────────────────────────────
function SyncPanel({ onClose, dateStart, dateStop }: { onClose: (result?: SyncResult) => void; dateStart: string; dateStop: string; }) {
  const [level, setLevel] = useState('campaign');
  const [breakdown, setBreakdown] = useState('none');
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    try {
      const r = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateStart, dateStop, level, breakdown }),
      });
      const data = await r.json();
      setResult(data);
      if (data.success) setTimeout(() => onClose(data), 1500);
    } catch (e) {
      setResult({ success: false, error: String(e) });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm">
      <div className="card p-6 w-full max-w-md mx-4 bg-white border border-slate-200 shadow-xl fade-in">
        <h3 className="font-semibold text-base text-slate-900 mb-1">Sincronizar Facebook Ads</h3>
        <p className="text-xs text-slate-500 mb-6">
          Busca dados via API para o período <strong className="text-slate-700">{dateStart}</strong> até <strong className="text-slate-700">{dateStop}</strong>.
        </p>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nível de Agregação</label>
            <select id="sync-level" className="select text-xs py-2 h-9" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="campaign">Campanha</option>
              <option value="adset">Conjunto de Anúncios</option>
              <option value="ad">Anúncio</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Segmentação (Breakdown)</label>
            <select id="sync-breakdown" className="select text-xs py-2 h-9" value={breakdown} onChange={(e) => setBreakdown(e.target.value)}>
              <option value="none">Sem segmentação</option>
              <option value="age">Idade</option>
              <option value="gender">Gênero</option>
              <option value="publisher_platform">Plataforma</option>
              <option value="platform_position">Posicionamento</option>
              <option value="impression_device">Dispositivo</option>
            </select>
          </div>
        </div>

        {result && (
          <div 
            className={`flex items-start gap-3 p-4 rounded-lg mb-5 text-sm ${
              result.success 
                ? 'border border-emerald-100 text-emerald-800 bg-emerald-50/50' 
                : 'border border-rose-100 text-rose-800 bg-rose-50/50'
            }`}
          >
            {result.success ? (
              <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5 text-emerald-600" />
            ) : (
              <XCircle size={16} className="flex-shrink-0 mt-0.5 text-rose-600" />
            )}
            <div className="flex-1">
              <span className="font-semibold block">
                {result.success ? 'Sincronização realizada com sucesso' : 'Falha na sincronização'}
              </span>
              <span className="text-xs mt-1 block opacity-90 leading-normal">
                {result.success 
                  ? `${result.upserted} ${result.upserted === 1 ? 'registro foi atualizado' : 'registros foram atualizados'} no Supabase.`
                  : result.error}
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button id="sync-cancel" className="btn btn-secondary flex-1" onClick={() => onClose()} disabled={syncing}>Cancelar</button>
          <button id="sync-confirm" className="btn btn-primary flex-1" onClick={handleSync} disabled={syncing}>
            {syncing ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Buscando…</> : <><RefreshCw size={14} /> Sincronizar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Principal ──────────────────────────────────────────────────────
export default function DashboardPage() {
  const [preset, setPreset] = useState<DatePreset>('30d');
  const [dateStart, setDateStart] = useState(daysAgoStr(30));
  const [dateStop, setDateStop] = useState(todayStr());
  const [level, setLevel] = useState('campaign');
  const [campaignId, setCampaignId] = useState('');
  const [rows, setRows] = useState<AdInsightDailyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);

  // Busca dados do Supabase via /api/insights
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ dateStart, dateStop, level });
      if (campaignId) params.set('campaignId', campaignId);
      const r = await fetch(`/api/insights?${params}`);
      const json = await r.json();
      const data: AdInsightDailyRow[] = json.data ?? [];
      setRows(data);

      // Extrai campanhas únicas para o filtro
      const uniqueCampaigns = Array.from(
        new Map(data.filter((r) => r.campaign_id).map((r) => [r.campaign_id, { id: r.campaign_id!, name: r.campaign_name ?? r.campaign_id! }])).values()
      );
      if (uniqueCampaigns.length > 0) setCampaigns(uniqueCampaigns);
    } catch (e) {
      console.error('Erro ao buscar insights:', e);
    } finally {
      setLoading(false);
    }
  }, [dateStart, dateStop, level, campaignId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Handlers de filtro
  const handlePreset = (p: DatePreset) => {
    const presetConf = DATE_PRESETS.find((d) => d.value === p);
    if (presetConf?.days) {
      setDateStart(daysAgoStr(presetConf.days));
      setDateStop(todayStr());
    }
    setPreset(p);
  };

  const handleSyncClose = (result?: SyncResult) => {
    setShowSync(false);
    if (result?.success) {
      setLastSync(new Date().toLocaleTimeString('pt-BR'));
      fetchData();
    }
  };

  return (
    <>
      <Header onSync={() => setShowSync(true)} syncing={loading} />

      <main className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
            Dashboard de Métricas
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Conta: <strong>act_{process.env.NEXT_PUBLIC_ACCOUNT_LABEL ?? '1550784432315181'}</strong>
            {lastSync && <> · Última sincronização: {lastSync}</>}
          </p>
        </div>

        {/* Filtros */}
        <FiltersBar
          dateStart={dateStart} dateStop={dateStop} preset={preset}
          level={level} campaignId={campaignId} campaigns={campaigns}
          onPreset={handlePreset}
          onDateChange={(s, e) => { setDateStart(s); setDateStop(e); setPreset('custom'); }}
          onLevel={setLevel}
          onCampaign={setCampaignId}
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {KPI_CONFIG.map((config) => (
            <MetricCard
              key={config.key}
              config={config}
              value={sumMetric(rows, config.key)}
              delta={null}
              loading={loading}
            />
          ))}
        </div>

        {/* Chart */}
        <MetricsChart rows={rows} loading={loading} />

        {/* Table */}
        <CampaignTable rows={rows} loading={loading} />

        {/* Footer */}
        <footer className="text-center py-4">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Ads Metrics · Dados via Meta Marketing API v19.0 · {new Date().getFullYear()}
          </p>
        </footer>
      </main>

      {/* Sync Modal */}
      {showSync && <SyncPanel onClose={handleSyncClose} dateStart={dateStart} dateStop={dateStop} />}
    </>
  );
}
