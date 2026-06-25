'use client';

import React, { useState } from 'react';
import { RefreshCw, CheckCircle2, XCircle, Clock, Calendar } from 'lucide-react';
import { daysAgoStr, todayStr } from '@/lib/utils';

interface SyncResult {
  success: boolean;
  upserted?: number;
  error?: string;
  message?: string;
}

export default function SyncPage() {
  const [dateStart, setDateStart] = useState(daysAgoStr(30));
  const [dateStop, setDateStop] = useState(todayStr());
  const [level, setLevel] = useState('campaign');
  const [breakdown, setBreakdown] = useState('none');
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState<Array<SyncResult & { timestamp: string }>>([]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateStart, dateStop, level, breakdown }),
      });
      const data = await r.json();
      setResults((prev) => [{ ...data, timestamp: new Date().toLocaleString('pt-BR') }, ...prev]);
    } catch (e) {
      setResults((prev) => [{ success: false, error: String(e), timestamp: new Date().toLocaleString('pt-BR') }, ...prev]);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <div className="page">
        <div className="page-hero">
          <h1 className="page-hero-title">Sincronização</h1>
          <p className="page-hero-subtitle">
            Configure e execute a sincronização de dados do Facebook Ads para o Supabase.
            Defina o período, nível de agregação e segmentações desejadas.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-2">
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Nova sincronização</div>
                  <div className="card-subtitle">Buscar dados da Meta Marketing API e salvar no banco</div>
                </div>
              </div>
              <div className="card-body">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">
                      <Calendar size={11} style={{ display: 'inline', marginRight: 4, opacity: 0.6 }} />
                      Data inicial
                    </label>
                    <input type="date" className="input" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">
                      <Calendar size={11} style={{ display: 'inline', marginRight: 4, opacity: 0.6 }} />
                      Data final
                    </label>
                    <input type="date" className="input" value={dateStop} onChange={(e) => setDateStop(e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">Nível</label>
                    <select className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
                      <option value="campaign">Campanha</option>
                      <option value="adset">Conjunto de Anúncios</option>
                      <option value="ad">Anúncio</option>
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label">Segmentação</label>
                    <select className="select" value={breakdown} onChange={(e) => setBreakdown(e.target.value)}>
                      <option value="none">Sem segmentação</option>
                      <option value="age">Idade</option>
                      <option value="gender">Gênero</option>
                      <option value="publisher_platform">Plataforma</option>
                      <option value="platform_position">Posicionamento</option>
                      <option value="impression_device">Dispositivo</option>
                    </select>
                  </div>
                </div>

                <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
                  {syncing ? <><span className="spinner" /> Sincronizando…</> : <><RefreshCw size={14} /> Iniciar sincronização</>}
                </button>
              </div>
            </div>
          </div>

          {/* Status */}
          <div>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Status das conexões</div>
              </div>
              <div className="card-body">
                <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Supabase</span>
                  <span className="badge badge-success">
                    <span className="status-dot online" /> Conectado
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Facebook Ads API</span>
                  <span className="badge badge-success">
                    <span className="status-dot online" /> Conectado
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Versão da API</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>v19.0</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Logs */}
        {results.length > 0 && (
          <div className="card mt-6">
            <div className="card-header">
              <div>
                <div className="card-title">Histórico desta sessão</div>
                <div className="card-subtitle">Operações de sincronização recentes</div>
              </div>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  {r.success ? (
                    <CheckCircle2 size={16} style={{ color: 'var(--success)', marginTop: 2, flexShrink: 0 }} />
                  ) : (
                    <XCircle size={16} style={{ color: 'var(--danger)', marginTop: 2, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {r.success ? `${r.upserted ?? 0} registros sincronizados` : 'Falha na sincronização'}
                    </div>
                    {r.error && (
                      <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                        {r.error}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-faint)' }}>
                    <Clock size={11} />
                    {r.timestamp}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
