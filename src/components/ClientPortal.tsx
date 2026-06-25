'use client';

// =============================================================================
// src/components/ClientPortal.tsx
// Dashboard SOMENTE LEITURA do cliente — dados ao vivo da conta vinculada.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, DollarSign, MousePointerClick, Eye, Target,
  Users, BarChart2, Zap, Activity, RefreshCw, Loader2, Info,
  CheckCircle2, Coins, Award, AlertTriangle, Sparkles,
} from 'lucide-react';
import {
  CartesianGrid, ResponsiveContainer, Area, AreaChart,
  Tooltip as ReTooltip, XAxis, YAxis,
} from 'recharts';
import { formatCurrency, formatPercent, formatCompact } from '@/lib/utils';

type MetricKey = 'spend' | 'impressions' | 'clicks' | 'roas' | 'ctr' | 'cpm' | 'cpc' | 'reach';

interface Daily { date: string; spend: number; impressions: number; clicks: number; reach: number; ctr: number; cpc: number; cpm: number; roas: number; }
interface Campaign { id: string; name: string; status: string; spend: number; impressions: number; clicks: number; reach: number; ctr: number; cpc: number; roas: number; }
interface Ad { id: string; name: string; status: string; campaignName: string; spend: number; impressions: number; clicks: number; ctr: number; results: number; }
interface Overview {
  account: string; adAccountId: string;
  totals: {
    spend: number; impressions: number; clicks: number; reach: number;
    ctr: number; cpc: number; cpm: number; roas: number; campaigns: number;
    results: number; resultLabel: string; costPerResult: number;
  };
  daily: Daily[]; campaigns: Campaign[]; ads: Ad[];
  deltas: { spend: number; results: number; ctr: number; costPerResult: number } | null;
}

/** Selo de variação ▲/▼ vs período anterior. */
function DeltaBadge({ value, lowerIsBetter = false }: { value: number; lowerIsBetter?: boolean }) {
  if (!value || Math.abs(value) < 0.5) return null;
  const up = value > 0;
  const good = lowerIsBetter ? !up : up;
  const color = good ? 'var(--success)' : 'var(--danger)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 600, color, marginTop: 3 }}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(0)}%
    </span>
  );
}

/** Resumo inteligente: melhor anúncio, ponto de atenção e tendência. */
function Highlights({ data }: { data: Overview }) {
  const items: { icon: React.ElementType; text: React.ReactNode; tone: 'good' | 'warn' }[] = [];
  const withSpend = data.ads.filter((a) => a.spend > 0);

  const best = [...withSpend].sort((a, b) => b.results - a.results)[0];
  if (best && best.results > 0) {
    items.push({ icon: Award, tone: 'good', text: <>Seu melhor anúncio é <strong>{best.name}</strong> — {formatCompact(best.results)} resultado(s).</> });
  } else {
    const topCtr = [...withSpend].sort((a, b) => b.ctr - a.ctr)[0];
    if (topCtr && topCtr.ctr > 0) items.push({ icon: Award, tone: 'good', text: <>Maior engajamento: <strong>{topCtr.name}</strong> com CTR de {topCtr.ctr.toFixed(2)}%.</> });
  }

  const waste = withSpend.find((a) => a.status.toUpperCase() === 'ACTIVE' && a.results === 0);
  if (waste) {
    items.push({ icon: AlertTriangle, tone: 'warn', text: <>O anúncio <strong>{waste.name}</strong> está ativo e gastou {formatCurrency(waste.spend)} sem resultados ainda.</> });
  }

  if (data.deltas) {
    const d = data.deltas;
    if (Math.abs(d.results) >= 5) {
      items.push({ icon: TrendingUp, tone: d.results > 0 ? 'good' : 'warn', text: <>Seus resultados <strong>{d.results > 0 ? 'subiram' : 'caíram'} {Math.abs(d.results).toFixed(0)}%</strong> vs. o período anterior.</> });
    } else if (Math.abs(d.costPerResult) >= 5) {
      items.push({ icon: Coins, tone: d.costPerResult < 0 ? 'good' : 'warn', text: <>O custo por resultado <strong>{d.costPerResult < 0 ? 'caiu' : 'subiu'} {Math.abs(d.costPerResult).toFixed(0)}%</strong> vs. o período anterior.</> });
    }
  }

  if (!items.length) return null;
  return (
    <div className="card mb-6">
      <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={15} style={{ color: 'var(--accent)' }} /> Destaques
        </div>
      </div>
      <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, i) => {
          const Icon = it.icon;
          const color = it.tone === 'good' ? 'var(--success)' : 'var(--accent)';
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13.5, lineHeight: 1.5 }}>
              <Icon size={15} style={{ color, flexShrink: 0, marginTop: 1 }} />
              <span>{it.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const KPIS: { key: MetricKey; label: string; icon: React.ElementType; fmt: (v: number) => string; accent?: boolean }[] = [
  { key: 'spend', label: 'Gasto total', icon: DollarSign, fmt: formatCurrency, accent: true },
  { key: 'roas', label: 'ROAS', icon: TrendingUp, fmt: (v) => v > 0 ? `${v.toFixed(2)}x` : '—' },
  { key: 'impressions', label: 'Impressões', icon: Eye, fmt: formatCompact },
  { key: 'clicks', label: 'Cliques', icon: MousePointerClick, fmt: formatCompact },
  { key: 'ctr', label: 'CTR', icon: Target, fmt: formatPercent },
  { key: 'cpc', label: 'CPC', icon: Zap, fmt: formatCurrency },
  { key: 'cpm', label: 'CPM', icon: BarChart2, fmt: formatCurrency },
  { key: 'reach', label: 'Alcance', icon: Users, fmt: formatCompact },
];

const CHART_OPTS: { label: string; value: MetricKey }[] = [
  { label: 'Gasto', value: 'spend' },
  { label: 'Cliques', value: 'clicks' },
  { label: 'CTR', value: 'ctr' },
  { label: 'ROAS', value: 'roas' },
];

const PRESETS = [
  { label: '7 dias', days: 7 },
  { label: '14 dias', days: 14 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
];

function statusBadge(status: string) {
  const s = status.toUpperCase();
  if (s === 'ACTIVE') return <span className="badge badge-success"><span className="status-dot online" /> Ativa</span>;
  if (s.includes('PAUSED')) return <span className="badge badge-muted">Pausada</span>;
  if (s === 'UNKNOWN') return <span className="badge badge-muted">—</span>;
  return <span className="badge badge-muted">{s.replace('CAMPAIGN_PAUSED', 'Pausada')}</span>;
}

export function ClientPortal() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>('spend');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setNotice(null);
    try {
      const r = await fetch(`/api/client/insights?days=${days}`);
      const json = await r.json();
      if (json.error) { setNotice(json.message || 'Não foi possível carregar os dados.'); setData(null); return; }
      setData(json.overview);
      setLastUpdated(new Date());
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Erro ao carregar.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Atualização automática: a cada 5 min e ao voltar para a aba (silenciosa).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchData(true);
    }, 5 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === 'visible') fetchData(true); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [fetchData]);

  const chartConf = KPIS.find((k) => k.key === metric)!;
  const chartData = (data?.daily ?? []).map((d) => ({
    date: new Date(d.date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
    value: d[metric],
  }));

  return (
    <div className="page">
      <div className="page-hero">
        <h1 className="page-hero-title">Resumo</h1>
        <p className="page-hero-subtitle">
          {data?.account ? <><strong>{data.account}</strong> · </> : ''}
          Acompanhe o desempenho das suas campanhas em tempo real.
        </p>
      </div>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="segmented">
          {PRESETS.map((p) => (
            <button key={p.days} className={`segmented-item ${days === p.days ? 'active' : ''}`} onClick={() => setDays(p.days)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Atualizado {lastUpdated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · automático
            </span>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => fetchData()} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {notice ? (
        <div className="card"><div className="card-body">
          <div className="conn-empty">
            <div className="empty-state-icon"><Info size={20} /></div>
            <p className="empty-state-title" style={{ marginTop: 8 }}>Aguardando configuração</p>
            <p className="empty-state-desc" style={{ maxWidth: 420 }}>{notice}</p>
          </div>
        </div></div>
      ) : (
        <>
          {/* Destaques (resumo inteligente) */}
          {!loading && data && <Highlights data={data} />}

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {/* Resultado principal (conversões: compras, leads ou conversas) */}
            <div className="stat-card fade-in stat-card-accent">
              <div className="stat-label">
                <div className="stat-icon accent"><CheckCircle2 size={13} /></div>
                {data?.totals.resultLabel || 'Resultados'}
              </div>
              {loading ? <div className="skeleton" style={{ height: 30, width: '60%' }} /> : <>
                <div className="stat-value">{formatCompact(data?.totals.results ?? 0)}</div>
                {data?.deltas && <DeltaBadge value={data.deltas.results} />}
              </>}
            </div>
            <div className="stat-card fade-in">
              <div className="stat-label">
                <div className="stat-icon"><Coins size={13} /></div>
                Custo por resultado
              </div>
              {loading ? <div className="skeleton" style={{ height: 30, width: '60%' }} /> : <>
                <div className="stat-value">{(data?.totals.costPerResult ?? 0) > 0 ? formatCurrency(data!.totals.costPerResult) : '—'}</div>
                {data?.deltas && <DeltaBadge value={data.deltas.costPerResult} lowerIsBetter />}
              </>}
            </div>

            {KPIS
              // Esconde ROAS quando não há receita (campanha de lead/WhatsApp, não venda)
              .filter((k) => !(k.key === 'roas' && (data?.totals.roas ?? 0) === 0))
              .map((k) => {
                const Icon = k.icon;
                const v = data?.totals[k.key] ?? 0;
                const delta = data?.deltas && k.key === 'spend' ? data.deltas.spend
                  : data?.deltas && k.key === 'ctr' ? data.deltas.ctr : null;
                return (
                  <div key={k.key} className={`stat-card fade-in ${k.accent ? 'stat-card-accent' : ''}`}>
                    <div className="stat-label">
                      <div className={`stat-icon ${k.accent ? 'accent' : ''}`}><Icon size={13} /></div>
                      {k.label}
                    </div>
                    {loading ? <div className="skeleton" style={{ height: 30, width: '60%' }} /> : <>
                      <div className="stat-value">{k.fmt(v)}</div>
                      {delta !== null && <DeltaBadge value={delta} lowerIsBetter={k.key === 'cpc'} />}
                    </>}
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
                      <linearGradient id="cgrad" x1="0" y1="0" x2="0" y2="1">
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
                    <Area type="monotone" dataKey="value" stroke="#EAB308" strokeWidth={2.5} fill="url(#cgrad)" dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: '#EAB308' }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Tabela de campanhas */}
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
                      <th className="text-right">ROAS</th>
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
                        <td className="text-right mono">{c.roas > 0 ? `${c.roas.toFixed(2)}x` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Anúncios */}
          <div className="card" style={{ marginTop: 24 }}>
            <div className="card-header">
              <div>
                <div className="card-title">Anúncios</div>
                <div className="card-subtitle">{data?.ads.length ?? 0} anúncio(s) no período</div>
              </div>
            </div>
            <div style={{ padding: 0, overflowX: 'auto' }}>
              {loading ? (
                <div style={{ padding: 16 }}><div className="skeleton" style={{ height: 140, width: '100%' }} /></div>
              ) : (data?.ads.length ?? 0) === 0 ? (
                <div className="conn-empty" style={{ padding: 32 }}>Nenhum anúncio com dados no período.</div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Anúncio</th>
                      <th className="text-right">Gasto</th>
                      <th className="text-right">Impr.</th>
                      <th className="text-right">Cliques</th>
                      <th className="text-right">CTR</th>
                      <th className="text-right">Resultados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.ads.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {statusBadge(a.status)}
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 500 }}>{a.name}</div>
                              {a.campaignName && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.campaignName}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="text-right mono">{formatCurrency(a.spend)}</td>
                        <td className="text-right mono">{formatCompact(a.impressions)}</td>
                        <td className="text-right mono">{formatCompact(a.clicks)}</td>
                        <td className="text-right mono">{formatPercent(a.ctr)}</td>
                        <td className="text-right mono">{formatCompact(a.results)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
