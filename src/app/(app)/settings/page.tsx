'use client';

import React from 'react';
import { Key, Database, Globe, ExternalLink } from 'lucide-react';
import { ConnectionsManager } from '@/components/ConnectionsManager';

export default function SettingsPage() {
  return (
    <>
      <div className="page" style={{ maxWidth: 880 }}>
        <div className="page-hero">
          <h1 className="page-hero-title">Configurações</h1>
          <p className="page-hero-subtitle">
            Gerencie integrações, credenciais e preferências do workspace.
            Conecte e troque a conta de anúncios do Facebook sem mexer em código.
          </p>
        </div>

        {/* Conexões Meta (multi-conta) */}
        <ConnectionsManager />

        {/* Supabase */}
        <div className="card mb-6">
          <div className="card-header">
            <div className="flex items-center gap-3">
              <div style={{ width: 32, height: 32, borderRadius: 6, background: '#3ECF8E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Database size={16} color="white" />
              </div>
              <div>
                <div className="card-title">Supabase</div>
                <div className="card-subtitle">Banco de dados PostgreSQL para armazenar métricas</div>
              </div>
            </div>
            <span className="badge badge-success">
              <span className="status-dot online" /> Conectado
            </span>
          </div>
          <div className="card-body">
            <div className="field">
              <label className="field-label">URL do projeto</label>
              <div className="input mono" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>
                https://sosmfgxmtdmnvqkutwiy.supabase.co
              </div>
            </div>

            <a
              href="https://supabase.com/dashboard/project/sosmfgxmtdmnvqkutwiy"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
            >
              <ExternalLink size={13} />
              Abrir no Supabase
            </a>
          </div>
        </div>

        {/* Variáveis de ambiente */}
        <div className="card mb-6">
          <div className="card-header">
            <div className="flex items-center gap-3">
              <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Key size={16} style={{ color: 'var(--text-secondary)' }} />
              </div>
              <div>
                <div className="card-title">Variáveis de ambiente</div>
                <div className="card-subtitle">Configuradas no Vercel</div>
              </div>
            </div>
          </div>
          <div style={{ padding: 0 }}>
            <table className="data-table">
              <tbody>
                {[
                  'NEXT_PUBLIC_SUPABASE_URL',
                  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
                  'SUPABASE_SERVICE_ROLE_KEY',
                  'FACEBOOK_ACCESS_TOKEN',
                  'FACEBOOK_AD_ACCOUNT_ID',
                  'META_API_VERSION',
                ].map((v) => (
                  <tr key={v}>
                    <td className="mono" style={{ fontSize: 12 }}>{v}</td>
                    <td className="text-right">
                      <span className="badge badge-success">configurada</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Deployment */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-3">
              <div style={{ width: 32, height: 32, borderRadius: 6, background: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Globe size={16} color="white" />
              </div>
              <div>
                <div className="card-title">Deployment</div>
                <div className="card-subtitle">Hospedagem e domínio</div>
              </div>
            </div>
          </div>
          <div className="card-body">
            <div className="field">
              <label className="field-label">URL de produção</label>
              <div className="input mono" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>
                https://saas-ads-metrics.vercel.app
              </div>
            </div>
            <a
              href="https://vercel.com/sc4utwith4s-projects/saas-ads-metrics"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
            >
              <ExternalLink size={13} />
              Abrir no Vercel
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
