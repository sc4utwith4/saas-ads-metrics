'use client';

import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Search } from 'lucide-react';
import type { AdInsightDailyRow } from '@/types/meta';
import { formatCurrency, formatPercent, formatCompact, daysAgoStr, todayStr } from '@/lib/utils';

export default function AdsPage() {
  const [rows, setRows] = useState<AdInsightDailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({
      dateStart: daysAgoStr(30),
      dateStop: todayStr(),
      level: 'ad',
    });
    fetch(`/api/insights?${params}`)
      .then((r) => r.json())
      .then((json) => setRows(json.data ?? []))
      .finally(() => setLoading(false));
  }, []);

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
      agg.cpc = (agg.cpc! * (agg._count - 1) + (r.cpc ?? 0)) / agg._count;
      agg.roas = (agg.roas! * (agg._count - 1) + (r.roas ?? 0)) / agg._count;
    }
    return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
  }, [rows]);

  const filtered = grouped.filter((a) =>
    (a.object_name ?? a.object_id).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="page">
        <div className="page-hero">
          <h1 className="page-hero-title">Anúncios</h1>
          <p className="page-hero-subtitle">
            Performance individual de cada criativo dos últimos 30 dias. Identifique quais anúncios estão performando melhor e onde alocar mais investimento.
          </p>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input"
              placeholder="Buscar anúncio…"
              style={{ paddingLeft: 32 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
            {filtered.length} {filtered.length === 1 ? 'anúncio' : 'anúncios'}
          </div>
        </div>

        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            {loading ? (
              <div style={{ padding: 20 }}>
                {[...Array(5)].map((_, i) => <div key={i} className="skeleton" style={{ height: 40, marginBottom: 8 }} />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><ImageIcon size={18} /></div>
                <p className="empty-state-title">Nenhum anúncio encontrado</p>
                <p className="empty-state-desc">
                  {search ? 'Tente outro termo.' : 'Sincronize com nível "Anúncio" no Dashboard para popular esta lista.'}
                </p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Anúncio</th>
                    <th>Campanha</th>
                    <th className="text-right">Gasto</th>
                    <th className="text-right">Impressões</th>
                    <th className="text-right">Cliques</th>
                    <th className="text-right">CTR</th>
                    <th className="text-right">CPC</th>
                    <th className="text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.object_id}>
                      <td>
                        <div style={{ fontWeight: 500, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.object_name ?? a.object_id}
                        </div>
                        <div className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                          {a.object_id}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{a.campaign_name ?? '—'}</td>
                      <td className="text-right" style={{ fontWeight: 500 }}>{formatCurrency(a.spend)}</td>
                      <td className="text-right">{formatCompact(a.impressions)}</td>
                      <td className="text-right">{formatCompact(a.clicks)}</td>
                      <td className="text-right">{a.ctr ? formatPercent(Number(a.ctr)) : '—'}</td>
                      <td className="text-right">{a.cpc ? formatCurrency(Number(a.cpc)) : '—'}</td>
                      <td className="text-right">
                        {a.roas && Number(a.roas) > 0
                          ? <span className="badge badge-success">{Number(a.roas).toFixed(2)}x</span>
                          : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
