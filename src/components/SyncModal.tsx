'use client';

import React, { useState } from 'react';
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

interface SyncResult {
  success: boolean;
  upserted?: number;
  error?: string;
}

interface SyncModalProps {
  dateStart: string;
  dateStop: string;
  onClose: (result?: SyncResult) => void;
}

export function SyncModal({ dateStart, dateStop, onClose }: SyncModalProps) {
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
      // Lê como texto primeiro: se o servidor demorar/expirar, o corpo pode vir
      // vazio — aí mostramos uma mensagem clara em vez de "Unexpected end of JSON".
      const raw = await r.text();
      let data: SyncResult;
      if (!raw) {
        data = {
          success: false,
          error: r.ok
            ? 'A sincronização demorou demais e a resposta não chegou. Os dados podem ter sido salvos mesmo assim — feche e clique em Atualizar. Se persistir, sincronize um período menor.'
            : `Erro ${r.status} no servidor. Tente novamente.`,
        };
      } else {
        try { data = JSON.parse(raw) as SyncResult; }
        catch { data = { success: false, error: 'Resposta inválida do servidor. Tente novamente.' }; }
      }
      setResult(data);
      if (data.success) setTimeout(() => onClose(data), 1200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({ success: false, error: `Falha de conexão: ${msg}` });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={() => !syncing && onClose()}>
      <div className="modal fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Sincronizar dados</h3>
          <p className="modal-desc">
            Buscar dados do Facebook Ads para o período de{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{dateStart}</strong> até{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{dateStop}</strong>.
          </p>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label">Nível de agregação</label>
            <select className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="campaign">Campanha</option>
              <option value="adset">Conjunto de Anúncios</option>
              <option value="ad">Anúncio</option>
            </select>
          </div>
          <div className="field">
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

          {result && (
            <div
              className={`flex items-start gap-2.5 p-3 rounded-lg`}
              style={{
                background: result.success ? 'var(--success-bg)' : 'var(--danger-bg)',
                border: `1px solid ${result.success ? '#BBF7D0' : '#FECACA'}`,
              }}
            >
              {result.success ? (
                <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 1 }} />
              ) : (
                <XCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
              )}
              <div style={{ fontSize: 13, color: result.success ? 'var(--success)' : 'var(--danger)' }}>
                <div style={{ fontWeight: 500 }}>
                  {result.success ? 'Sincronização concluída' : 'Falha na sincronização'}
                </div>
                <div style={{ marginTop: 2, opacity: 0.9, lineHeight: 1.4 }}>
                  {result.success
                    ? `${result.upserted} ${result.upserted === 1 ? 'registro atualizado' : 'registros atualizados'}.`
                    : result.error}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={() => onClose()} disabled={syncing}>
            Cancelar
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSync} disabled={syncing}>
            {syncing ? (
              <>
                <span className="spinner" /> Sincronizando…
              </>
            ) : (
              <>
                <RefreshCw size={13} /> Sincronizar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
