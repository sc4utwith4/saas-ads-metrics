'use client';

// =============================================================================
// src/components/ConnectionsManager.tsx
// Aba de Conexões: conecta/troca qualquer conta de anúncios do Facebook.
// Fluxo: cola o token → busca as contas que ele acessa → escolhe a conta →
// dá um nome → salva. Ativar uma conexão troca a conta usada por TODO o app.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Check, Trash2, RefreshCw, Search, AlertTriangle,
  CheckCircle2, Loader2, X, Power,
} from 'lucide-react';

interface Connection {
  id: string;
  label: string;
  adAccountId: string;
  accountName: string | null;
  tokenMasked: string;
  apiVersion: string;
  isActive: boolean;
  tokenExpiresAt: string | null;
  createdAt: string;
}

interface DiscoveredAccount {
  id: string;
  accountId: string;
  name: string;
  currency?: string;
  status: number;
  statusLabel: string;
}

export function ConnectionsManager() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // --- formulário de adição ---
  const [token, setToken] = useState('');
  const [apiVersion, setApiVersion] = useState('v19.0');
  const [discovering, setDiscovering] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [detectedUser, setDetectedUser] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<DiscoveredAccount[]>([]);
  const [selectedAcct, setSelectedAcct] = useState<string>('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/meta/connections');
      const json = await r.json();
      if (json.needsMigration) { setNeedsMigration(true); setConnections([]); }
      else setConnections(json.connections ?? []);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setToken(''); setApiVersion('v19.0'); setAccounts([]); setSelectedAcct('');
    setLabel(''); setDetectedUser(null); setDiscoverError(null); setSaveError(null);
  };

  const closeForm = () => { setAdding(false); resetForm(); };

  const discover = async () => {
    if (!token.trim()) return;
    setDiscovering(true); setDiscoverError(null); setAccounts([]); setSelectedAcct('');
    try {
      const r = await fetch('/api/meta/connections/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), apiVersion }),
      });
      const json = await r.json();
      if (!r.ok) { setDiscoverError(json.error || 'Falha ao validar o token.'); return; }
      setDetectedUser(json.user ?? null);
      setAccounts(json.accounts ?? []);
      if ((json.accounts ?? []).length === 1) {
        setSelectedAcct(json.accounts[0].accountId);
        setLabel(json.accounts[0].name);
      }
    } catch (e) {
      setDiscoverError(e instanceof Error ? e.message : String(e));
    } finally {
      setDiscovering(false);
    }
  };

  const onSelectAccount = (accountId: string) => {
    setSelectedAcct(accountId);
    const acc = accounts.find((a) => a.accountId === accountId);
    if (acc && !label.trim()) setLabel(acc.name);
  };

  const save = async () => {
    if (!selectedAcct || !label.trim()) return;
    const acc = accounts.find((a) => a.accountId === selectedAcct);
    setSaving(true); setSaveError(null);
    try {
      const r = await fetch('/api/meta/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token.trim(),
          adAccountId: selectedAcct,
          accountName: acc?.name,
          label: label.trim(),
          apiVersion,
        }),
      });
      const json = await r.json();
      if (!r.ok) { setSaveError(json.error || 'Falha ao salvar.'); return; }
      closeForm();
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const activate = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/meta/connections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activate: true }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Remover a conexão "${name}"? Esta ação não pode ser desfeita.`)) return;
    setBusyId(id);
    try {
      await fetch(`/api/meta/connections/${id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card mb-6">
      <div className="card-header">
        <div className="flex items-center gap-3">
          <div style={{ width: 32, height: 32, borderRadius: 6, background: '#1877F2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 13 }}>f</div>
          <div>
            <div className="card-title">Conexões Meta</div>
            <div className="card-subtitle">Conecte e troque a conta de anúncios usada pelo app</div>
          </div>
        </div>
        {!adding && !needsMigration && (
          <button className="btn btn-accent btn-sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> Conectar conta
          </button>
        )}
      </div>

      <div className="card-body">
        {/* Aviso de migração */}
        {needsMigration && (
          <div className="conn-alert conn-alert-warn">
            <AlertTriangle size={16} />
            <div>
              <strong>Tabela de conexões ainda não existe.</strong>
              <div style={{ marginTop: 4, opacity: 0.9 }}>
                Rode a migração <code>migrations/004_meta_connections.sql</code> no SQL Editor do Supabase.
                Enquanto isso, o app usa a conta configurada via variável de ambiente.
              </div>
            </div>
          </div>
        )}

        {/* Formulário de adição */}
        {adding && (
          <div className="conn-form">
            <div className="conn-form-header">
              <span>Nova conexão</span>
              <button className="btn btn-icon btn-secondary btn-sm" onClick={closeForm} aria-label="Fechar">
                <X size={14} />
              </button>
            </div>

            <div className="field">
              <label className="field-label">Access Token</label>
              <textarea
                className="input mono"
                style={{ minHeight: 70, resize: 'vertical', fontSize: 12, lineHeight: 1.5 }}
                placeholder="Cole aqui o token de acesso da Meta (System User token de preferência)…"
                value={token}
                onChange={(e) => { setToken(e.target.value); setAccounts([]); setSelectedAcct(''); }}
              />
              <div className="conn-token-row">
                <div className="field" style={{ margin: 0, width: 130 }}>
                  <input
                    className="input mono"
                    style={{ fontSize: 12 }}
                    value={apiVersion}
                    onChange={(e) => setApiVersion(e.target.value)}
                    placeholder="v19.0"
                    aria-label="Versão da API"
                  />
                </div>
                <button className="btn btn-secondary btn-sm" onClick={discover} disabled={!token.trim() || discovering}>
                  {discovering ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
                  {discovering ? 'Buscando…' : 'Buscar contas'}
                </button>
              </div>
            </div>

            {discoverError && (
              <div className="conn-alert conn-alert-error">
                <AlertTriangle size={15} /> <span>{discoverError}</span>
              </div>
            )}

            {accounts.length > 0 && (
              <>
                {detectedUser && (
                  <div className="conn-detected">
                    <CheckCircle2 size={14} /> Token válido — perfil: <strong>{detectedUser}</strong> · {accounts.length} conta(s) disponível(is)
                  </div>
                )}
                <div className="field">
                  <label className="field-label">Conta de anúncios</label>
                  <select className="input" value={selectedAcct} onChange={(e) => onSelectAccount(e.target.value)}>
                    <option value="">Selecione uma conta…</option>
                    {accounts.map((a) => (
                      <option key={a.accountId} value={a.accountId}>
                        {a.name} — act_{a.accountId} ({a.statusLabel}{a.currency ? `, ${a.currency}` : ''})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">Nome amigável (apelido do cliente)</label>
                  <input
                    className="input"
                    placeholder="Ex.: Davi, Loja XPTO…"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </div>

                {saveError && (
                  <div className="conn-alert conn-alert-error">
                    <AlertTriangle size={15} /> <span>{saveError}</span>
                  </div>
                )}

                <div className="conn-form-actions">
                  <button className="btn btn-secondary btn-sm" onClick={closeForm}>Cancelar</button>
                  <button className="btn btn-accent btn-sm" onClick={save} disabled={!selectedAcct || !label.trim() || saving}>
                    {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                    {saving ? 'Salvando…' : 'Salvar e ativar'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Lista de conexões */}
        {loading ? (
          <div className="conn-empty"><Loader2 size={18} className="spin" /> Carregando…</div>
        ) : connections.length === 0 && !needsMigration && !adding ? (
          <div className="conn-empty">
            <div style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Nenhuma conexão cadastrada</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              O app está usando a conta da variável de ambiente. Clique em <strong>Conectar conta</strong> para gerenciar contas pela interface.
            </div>
          </div>
        ) : (
          <div className="conn-list">
            {connections.map((c) => (
              <div key={c.id} className={`conn-item ${c.isActive ? 'active' : ''}`}>
                <div className="conn-item-main">
                  <div className="conn-item-top">
                    <span className="conn-item-label">{c.label}</span>
                    {c.isActive
                      ? <span className="badge badge-success"><span className="status-dot online" /> Ativa</span>
                      : <span className="badge badge-muted">Inativa</span>}
                  </div>
                  <div className="conn-item-meta">
                    {c.accountName ? <span>{c.accountName}</span> : null}
                    <span className="mono">act_{c.adAccountId}</span>
                    <span className="mono" style={{ opacity: 0.7 }}>{c.tokenMasked}</span>
                    <span style={{ opacity: 0.7 }}>{c.apiVersion}</span>
                  </div>
                </div>
                <div className="conn-item-actions">
                  {!c.isActive && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => activate(c.id)}
                      disabled={busyId === c.id}
                    >
                      {busyId === c.id ? <Loader2 size={13} className="spin" /> : <Power size={13} />}
                      Ativar
                    </button>
                  )}
                  <button
                    className="btn btn-icon btn-secondary btn-sm conn-del"
                    onClick={() => remove(c.id, c.label)}
                    disabled={busyId === c.id}
                    aria-label="Remover"
                    title="Remover"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Dica pós-troca */}
        {connections.length > 0 && (
          <div className="conn-hint">
            <RefreshCw size={13} />
            Ao trocar a conta ativa, <strong>sincronize os dados</strong> para o dashboard refletir a nova conta.
          </div>
        )}
      </div>
    </div>
  );
}
