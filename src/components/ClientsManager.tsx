'use client';

// =============================================================================
// src/components/ClientsManager.tsx
// Painel do admin para criar/gerenciar logins de clientes (somente leitura).
// Cada cliente é vinculado a uma conexão Meta (conta de anúncios) e acessa o
// portal com o email/senha definidos aqui.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Loader2, X, Check, Users, Link2, Mail, Eye, EyeOff, KeyRound,
} from 'lucide-react';

interface ClientRow {
  id: string;
  email: string | null;
  fullName: string | null;
  connectionId: string | null;
  accountLabel: string | null;
  adAccountId: string | null;
  createdAt: string;
}

interface ConnectionOpt {
  id: string;
  label: string;
  adAccountId: string;
  isActive: boolean;
}

export function ClientsManager() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [connections, setConnections] = useState<ConnectionOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [connId, setConnId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cr, conr] = await Promise.all([
        fetch('/api/clients').then((r) => r.json()),
        fetch('/api/meta/connections').then((r) => r.json()),
      ]);
      setClients(cr.clients ?? []);
      setConnections((conr.connections ?? []).map((c: ConnectionOpt) => ({
        id: c.id, label: c.label, adAccountId: c.adAccountId, isActive: c.isActive,
      })));
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setFullName(''); setEmail(''); setPassword(''); setConnId(''); setError(null); setShowPwd(false);
  };
  const closeForm = () => { setAdding(false); resetForm(); };

  const genPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let p = '';
    for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setPassword(p); setShowPwd(true);
  };

  const save = async () => {
    if (!fullName.trim() || !email.trim() || password.length < 6) return;
    setSaving(true); setError(null);
    try {
      const r = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim(), email: email.trim(), password, connectionId: connId || null }),
      });
      const json = await r.json();
      if (!r.ok) { setError(json.error || 'Falha ao criar cliente.'); return; }
      closeForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const reassign = async (id: string, connectionId: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connectionId || null }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Remover o acesso de "${name}"? O login deixará de funcionar imediatamente.`)) return;
    setBusyId(id);
    try {
      await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const canSave = fullName.trim() && email.trim() && password.length >= 6;

  return (
    <div className="card mb-6">
      <div className="card-header">
        <div className="flex items-center gap-3">
          <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={16} color="#0A0A0A" />
          </div>
          <div>
            <div className="card-title">Clientes</div>
            <div className="card-subtitle">Crie acessos somente leitura para seus clientes acompanharem as campanhas</div>
          </div>
        </div>
        {!adding && (
          <button className="btn btn-accent btn-sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> Novo cliente
          </button>
        )}
      </div>

      <div className="card-body">
        {connections.length === 0 && !loading && (
          <div className="conn-alert conn-alert-warn">
            <Link2 size={16} />
            <div>
              <strong>Nenhuma conta de anúncios conectada ainda.</strong>
              <div style={{ marginTop: 4, opacity: 0.9 }}>
                Conecte ao menos uma conta na aba <strong>Conexões</strong> para vincular ao cliente.
              </div>
            </div>
          </div>
        )}

        {/* Formulário */}
        {adding && (
          <div className="conn-form">
            <div className="conn-form-header">
              <span>Novo cliente</span>
              <button className="btn btn-icon btn-secondary btn-sm" onClick={closeForm} aria-label="Fechar"><X size={14} /></button>
            </div>

            <div className="client-form-grid">
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Nome do cliente</label>
                <input className="input" placeholder="Ex.: João da Loja XPTO" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Email (login)</label>
                <input className="input" type="email" placeholder="cliente@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Senha</label>
                <div className="client-pwd">
                  <input className="input" type={showPwd ? 'text' : 'password'} placeholder="mín. 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" className="btn btn-icon btn-secondary btn-sm" onClick={() => setShowPwd((s) => !s)} aria-label="Mostrar senha">
                    {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={genPassword} title="Gerar senha">
                    <KeyRound size={13} /> Gerar
                  </button>
                </div>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="field-label">Conta de anúncios que ele vai ver</label>
                <select className="input" value={connId} onChange={(e) => setConnId(e.target.value)}>
                  <option value="">— Selecionar depois —</option>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>{c.label} (act_{c.adAccountId})</option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="conn-alert conn-alert-error" style={{ marginTop: 12 }}>
                <X size={15} /> <span>{error}</span>
              </div>
            )}

            <div className="conn-form-actions">
              <button className="btn btn-secondary btn-sm" onClick={closeForm}>Cancelar</button>
              <button className="btn btn-accent btn-sm" onClick={save} disabled={!canSave || saving}>
                {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                {saving ? 'Criando…' : 'Criar acesso'}
              </button>
            </div>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="conn-empty"><Loader2 size={18} className="spin" /> Carregando…</div>
        ) : clients.length === 0 && !adding ? (
          <div className="conn-empty">
            <div style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Nenhum cliente cadastrado</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Clique em <strong>Novo cliente</strong> para criar o primeiro acesso.</div>
          </div>
        ) : (
          <div className="conn-list">
            {clients.map((c) => (
              <div key={c.id} className="conn-item">
                <div className="conn-item-main">
                  <div className="conn-item-top">
                    <span className="conn-item-label">{c.fullName || '—'}</span>
                    {c.accountLabel
                      ? <span className="badge badge-accent"><Link2 size={11} /> {c.accountLabel}</span>
                      : <span className="badge badge-muted">Sem conta vinculada</span>}
                  </div>
                  <div className="conn-item-meta">
                    <span><Mail size={11} style={{ verticalAlign: -1, marginRight: 3 }} />{c.email}</span>
                    {c.adAccountId && <span className="mono">act_{c.adAccountId}</span>}
                  </div>
                </div>
                <div className="conn-item-actions">
                  <select
                    className="input client-reassign"
                    value={c.connectionId ?? ''}
                    onChange={(e) => reassign(c.id, e.target.value)}
                    disabled={busyId === c.id}
                    title="Trocar a conta vinculada"
                  >
                    <option value="">Sem conta</option>
                    {connections.map((cn) => (
                      <option key={cn.id} value={cn.id}>{cn.label}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-icon btn-secondary btn-sm conn-del"
                    onClick={() => remove(c.id, c.fullName || c.email || 'cliente')}
                    disabled={busyId === c.id}
                    aria-label="Remover"
                    title="Remover acesso"
                  >
                    {busyId === c.id ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
