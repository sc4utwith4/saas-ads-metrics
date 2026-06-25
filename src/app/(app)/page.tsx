'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, DollarSign, MousePointerClick, Eye, Target,
  Users, BarChart2, Zap, Activity, RefreshCw, CheckCircle2, Coins,
} from 'lucide-react';
import {
  CartesianGrid, ResponsiveContainer, Area, AreaChart,
  Tooltip as ReTooltip, XAxis, YAxis,
} from 'recharts';
import { formatCurrency, formatPercent, formatCompact, daysAgoStr, todayStr } from '@/lib/utils';
import { SyncModal } from '@/components/SyncModal';
import { AnomalyAlerts } from '@/components/AnomalyAlerts';
import { WeeklyReport } from '@/components/WeeklyReport';

type DatePreset = '7d' | '14d' | '30d' | '90d';
type MetricKey = 'spend' | 'impressions' | 'clicks' | 'roas' | 'ctr' | 'cpm' | 'cpc' | 'reach';

interface Daily { date: string; spend: number; impressions: number; clicks: number; reach: number; ctr: number; cpc: number; cpm: number; roas: number; }
interface Campaign { id: string; name: string; status: string; spend: number; impressions: number; clicks: number; reach: number; ctr: number; cpc: number; roas: number; }
interface Overview {
  account: string; adAccountId: string;
  totals: {
    spend: number; impressions: number; clicks: number; reach: number;
    ctr: number; cpc: number; cpm: number; roas: number; campaigns: number;
    results: number; resultLabel: string; costPerResult: number;
  };
  daily: Daily[]; campaigns: Campaign[];
}

const KPIS: { key: MetricKey; label: string; icon: React.ElementType; fmt: (v: number) => string; accent?: boolean }[] = [
  { key: 'spend',       label: 'Gasto total', icon: DollarSign,        fmt: formatCurrency, accent: true },
  { key: 'roas',        label: 'ROAS',        icon: TrendingUp,        fmt: (v) => v > 0 ? `${v.toFixed(2)}x` : '—' },
  { key: 'impressions', label: 'Impressões',  icon: Eye,               fmt: formatCompact },
  { key: 'clicks',      label: 'Cliques',     icon: MousePointerClick, fmt: formatCompact },
  { key: 'ctr',         label: 'CTR',         icon: Target,            fmt: formatPercent },
  { key: 'cpc',         label: 'CPC',         icon: Zap,               fmt: formatCurrency },
  { key: 'cpm',         label: 'CPM',         icon: BarChart2,         fmt: formatCurrency },
  { key: 'reach',       label: 'Alcance',     icon: Users,             fmt: formatCompact },
];

const CHART_OPTS: { label: string; value: MetricKey }[] = [
  { label: 'Gasto',      value: 'spend' },
  { label: 'Impressões', value: 'impressions' },
  { label: 'Cliques',    value: 'clicks' },
  { label: 'CTR',        value: 'ctr' },
  { label: 'CPC',        value: 'cpc' },
];

const PRESETS: { label: string; value: DatePreset; days: number }[] = [
  { label: '7 dias',  value: '7d',  days: 7  },
  { label: '14 dias', value: '14d', days: 14 },
  { label: '30 dias', value: '30d', days: 30 },
  { label: '90 dias', value: '90d', days: 90 },
];

function statusBadge(status: string) {
  const s = (status || '').toUpperCase();
  if (s === 'ACTIVE') return <span className="badge badge-success"><span className="status-dot online" /> Ativa</span>;
  if (s.includes('PAUSED')) return <span className="badge badge-muted">Pausada</span>;
  return <span className="badge badge-muted">—</span>;
}

export default function DashboardPage() {
  const [preset, setPreset] = useState<DatePreset>('30d');
  const [dateStart, setDateStart] = useState(daysAgoStr(30));
  const [dateStop, setDateStop] = useState(todayStr());
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>('spend');
  const [showSync, setShowSync] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const days = PRESETS.find((p) => p.value === preset)?.days ?? 30;
      const r = await fetch(`/api/insights/live?days=${days}`);
      const json = await r.json();
      if (json.error) { setError(json.message || json.error); setData(null); }
      else setData(json.overview);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [preset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Atualização automática a cada 5 min e ao voltar para a aba.
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') fetchData(true); }, 5 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === 'visible') fetchData(true); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [fetchData]);

  const handlePreset = (p: DatePreset) => {
    const conf = PRESETS.find((d) => d.value === p);
    if (conf) { setDateStart(daysAgoStr(conf.days)); setDateStop(todayStr()); }
    setPreset(p);
  };

  const chartConf = KPIS.find((k) => k.key === metric)!;
  const chartData = (data?.daily ?? []).map((d) => ({
    date: new Date(d.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    value: d[metric],
  }));

  return (
    <>
      <div className="page">
        <div className="page-hero">
          <h1 className="page-hero-title">Visão geral</h1>
          <p className="page-hero-subtitle">
            Desempenho das campanhas {data?.account ? <strong>de {data.account}</strong> : ''} em tempo real,
            direto do Facebook Ads. Os números batem com o que você vê no Gerenciador de Anúncios.
          </p>
        </div>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="segmented">
            {PRESETS.map((p) => (
              <button key={p.value} className={`segmented-item ${preset === p.value ? 'active' : ''}`} onClick={() => handlePreset(p.value)}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {lastSync && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Última sync: {lastSync}</span>}
            <button className="btn btn-secondary btn-sm" onClick={() => fetchData()} disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
            <button className="btn btn-accent btn-sm" onClick={() => setShowSync(true)}>
              <RefreshCw size={13} />
              Sincronizar histórico
            </button>
          </div>
        </div>

        {error && (
          <div className="card mb-6"><div className="card-body">
            <div className="conn-empty">
              <div className="empty-state-icon"><Activity size={20} /></div>
              <p className="empty-state-title" style={{ marginTop: 8 }}>Não foi possível carregar os dados ao vivo</p>
              <p className="empty-state-desc" style={{ maxWidth: 460 }}>{error}</p>
            </div>
          </div></div>
        )}

        <AnomalyAlerts windowDays={7} />
        <WeeklyReport />

        {/* KPIs ao vivo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="stat-card fade-in stat-card-accent">
            <div className="stat-label">
              <div className="stat-icon accent"><CheckCircle2 size={13} /></div>
              {data?.totals.resultLabel || 'Resultados'}
            </div>
            {loading ? <div className="skeleton" style={{ height: 30, width: '60%' }} /> : <div className="stat-value">{formatCompact(data?.totals.results ?? 0)}</div>}
          </div>
          <div className="stat-card fade-in">
            <div className="stat-label">
              <div className="stat-icon"><Coins size={13} /></div>
              Custo por resultado
            </div>
            {loading ? <div className="skeleton" style={{ height: 30, width: '60%' }} /> : <div className="stat-value">{(data?.totals.costPerResult ?? 0) > 0 ? formatCurrency(data!.totals.costPerResult) : '—'}</div>}
          </div>
          {KPIS
            .filter((k) => !(k.key === 'roas' && (data?.totals.roas ?? 0) === 0))
            .map((k) => {
              const Icon = k.icon;
              const v = data?.totals[k.key] ?? 0;
              return (
                <div key={k.key} className={`stat-card fade-in ${k.accent ? 'stat-card-accent' : ''}`}>
                  <div className="stat-label">
                    <div className={`stat-icon ${k.accent ? 'accent' : ''}`}><Icon size={13} /></div>
                    {k.label}
                  </div>
                  {loading ? <div className="skeleton" style={{ height: 30, width: '60%' }} /> : <div className="stat-value">{k.fmt(v)}</div>}
                </div>
              );
            })}
        </div>

        {/* Gráfico */}
        <div className="card mb-6">
          <div className="card-header">
            <div>
              <div className="card-title">Evolução no período</div>
              <div className="card-subtitle">Variação diária da métrica selecionada</div>
            </div>
            <div className="segmented">
              {CHART_OPTS.map((m) => (
                <button key={m.value} className={`segmented-item ${metric === m.value ? 'active' : ''}`} onClick={() => setMetric(m.value)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: 16 }}>
            {loading ? (
              <div className="skeleton" style={{ height: 300, width: '100%' }} />
            ) : chartData.length === 0 ? (
              <div className="empty-state" style={{ height: 300 }}>
                <div className="empty-state-icon"><Activity size={20} /></div>
                <p className="empty-state-title">Sem dados no período</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FACC15" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#FACC15" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="0" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false} width={60}
                    tickFormatter={(v) => chartConf.fmt(Number(v)).replace(/R\$\s?/, 'R$')} />
                  <ReTooltip
                    contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, boxShadow: 'var(--shadow-md)', padding: '8px 12px' }}
                    labelStyle={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}
                    formatter={(v) => [chartConf.fmt(Number(v ?? 0)), chartConf.label]}
                  />
                  <Area type="monotone" dataKey="value" stroke="#EAB308" strokeWidth={2.5} fill="url(#gradient)" dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: '#EAB308' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Campanhas */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Campanhas</div>
              <div className="card-subtitle">{data?.totals.campaigns ?? 0} campanha(s) no período</div>
            </div>
          </div>
          <div style={{ padding: 0, overflowX: 'auto' }}>
            {loading ? (
              <div style={{ padding: 16 }}><div className="skeleton" style={{ height: 160, width: '100%' }} /></div>
            ) : (data?.campaigns.length ?? 0) === 0 ? (
              <div className="conn-empty" style={{ padding: 32 }}>Nenhuma campanha com dados no período.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Campanha</th>
                    <th className="text-right">Gasto</th>
                    <th className="text-right">Impr.</th>
                    <th className="text-right">Cliques</th>
                    <th className="text-right">CTR</th>
                    <th className="text-right">CPC</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.campaigns.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {statusBadge(c.status)}
                          <span style={{ fontWeight: 500 }}>{c.name}</span>
                        </div>
                      </td>
                      <td className="text-right mono">{formatCurrency(c.spend)}</td>
                      <td className="text-right mono">{formatCompact(c.impressions)}</td>
                      <td className="text-right mono">{formatCompact(c.clicks)}</td>
                      <td className="text-right mono">{formatPercent(c.ctr)}</td>
                      <td className="text-right mono">{formatCurrency(c.cpc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showSync && (
        <SyncModal
          dateStart={dateStart}
          dateStop={dateStop}
          onClose={(result) => {
            setShowSync(false);
            if (result?.success) {
              setLastSync(new Date().toLocaleTimeString('pt-BR'));
              fetchData();
            }
          }}
        />
      )}
    </>
  );
}
