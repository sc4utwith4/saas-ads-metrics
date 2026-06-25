'use client';

import React, { useEffect, useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as ReTooltip, Cell,
} from 'recharts';
import type { AdInsightDailyRow } from '@/types/meta';
import { formatCurrency, daysAgoStr, todayStr } from '@/lib/utils';

export default function ReportsPage() {
  const [rows, setRows] = useState<AdInsightDailyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({
      dateStart: daysAgoStr(30),
      dateStop: todayStr(),
      level: 'campaign',
    });
    fetch(`/api/insights?${params}`)
      .then((r) => r.json())
      .then((json) => setRows(json.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  // Top 10 campanhas por spend
  const top10 = React.useMemo(() => {
    const map = new Map<string, { name: string; spend: number; roas: number; clicks: number }>();
    for (const r of rows) {
      if (!map.has(r.object_id)) {
        map.set(r.object_id, { name: r.object_name ?? r.object_id, spend: 0, roas: 0, clicks: 0 });
      }
      const a = map.get(r.object_id)!;
      a.spend += r.spend;
      a.clicks += r.clicks;
      if (r.roas) a.roas = Number(r.roas);
    }
    return Array.from(map.values())
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10)
      .map((c) => ({ ...c, shortName: c.name.length > 22 ? c.name.slice(0, 22) + '…' : c.name }));
  }, [rows]);

  const handleExport = () => {
    const headers = ['Data', 'Nome', 'Gasto', 'Impressões', 'Cliques', 'CTR', 'CPC', 'ROAS'];
    const data = rows.map((r) => [
      r.date_start,
      r.object_name ?? r.object_id,
      r.spend,
      r.impressions,
      r.clicks,
      r.ctr ?? '',
      r.cpc ?? '',
      r.roas ?? '',
    ]);
    const csv = [headers.join(','), ...data.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ads-metrics-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="page">
        <div className="page-hero">
          <h1 className="page-hero-title">Relatórios</h1>
          <p className="page-hero-subtitle">
            Análises comparativas e exportação de dados em CSV para uso em planilhas externas, Power BI ou outras ferramentas de BI.
          </p>
        </div>

        <div className="flex justify-end mb-6">
          <button className="btn btn-accent btn-sm" onClick={handleExport} disabled={loading || rows.length === 0}>
            <Download size={13} />
            Exportar CSV
          </button>
        </div>

        <div className="card mb-6">
          <div className="card-header">
            <div>
              <div className="card-title">Top 10 Campanhas por Gasto</div>
              <div className="card-subtitle">Últimos 30 dias · ordenadas por investimento total</div>
            </div>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="skeleton" style={{ height: 320 }} />
            ) : top10.length === 0 ? (
              <div className="empty-state" style={{ height: 320 }}>
                <div className="empty-state-icon"><BarChart3 size={18} /></div>
                <p className="empty-state-title">Sem dados para comparar</p>
                <p className="empty-state-desc">Sincronize seus dados para gerar relatórios.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(320, top10.length * 38)}>
                <BarChart data={top10} layout="vertical" margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="0" stroke="var(--chart-grid)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} axisLine={false} tickLine={false}
                    tickFormatter={(v) => formatCurrency(v).replace(/R\$\s?/, 'R$')} />
                  <YAxis type="category" dataKey="shortName" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
                    axisLine={false} tickLine={false} width={180} />
                  <ReTooltip
                    cursor={{ fill: 'var(--bg-hover)' }}
                    contentStyle={{
                      background: 'var(--chart-tooltip-bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 12,
                      boxShadow: 'var(--shadow-md)',
                    }}
                    labelStyle={{ color: 'var(--text-primary)' }}
                    formatter={(v) => [formatCurrency(Number(v)), 'Gasto']}
                  />
                  <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                    {top10.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? '#EAB308' : `rgba(234, 179, 8, ${0.85 - i * 0.07})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card">
            <div className="card-header">
              <div className="card-title">Exportar dados</div>
            </div>
            <div className="card-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Exporte todos os registros do período em formato CSV para análise externa em Excel, Google Sheets ou Power BI.
              </p>
              <button className="btn btn-secondary" onClick={handleExport} disabled={loading || rows.length === 0}>
                <Download size={14} />
                Baixar {rows.length} registros (.csv)
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Próximas funcionalidades</div>
            </div>
            <div className="card-body">
              <ul style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, paddingLeft: 16, margin: 0 }}>
                <li>Comparação de períodos (semana vs. semana)</li>
                <li>Relatórios agendados por e-mail</li>
                <li>Dashboards customizados</li>
                <li>Análise de coorte por audiência</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
