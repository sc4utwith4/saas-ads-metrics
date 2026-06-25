'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

/** Só permite redirecionar para um caminho interno (evita open redirect). */
function safeNext(raw: string | null): string {
  if (!raw) return '/';
  // Precisa começar com "/" e NÃO ser "//" nem "/\" (que viram URL externa).
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createBrowserSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : signInError.message
      );
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <div className="field">
        <label className="field-label">E-mail</label>
        <div className="login-input-wrap">
          <Mail size={14} className="login-input-icon" />
          <input
            type="email"
            className="input"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="email"
            style={{ paddingLeft: 34 }}
          />
        </div>
      </div>

      <div className="field">
        <label className="field-label">Senha</label>
        <div className="login-input-wrap">
          <Lock size={14} className="login-input-icon" />
          <input
            type="password"
            className="input"
            placeholder="••••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ paddingLeft: 34 }}
          />
        </div>
      </div>

      {error && (
        <div className="login-error">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <button type="submit" className="btn btn-primary login-submit" disabled={loading || !email || !password}>
        {loading ? (
          <>
            <span className="spinner" />
            Autenticando…
          </>
        ) : (
          <>
            Entrar
            <ArrowRight size={14} />
          </>
        )}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="login-screen">
      <div className="login-card fade-in">
        <div className="login-brand">
          <div className="login-brand-logo">AM</div>
          <div>
            <div className="login-brand-name">Ads Metrics</div>
            <div className="login-brand-tag">Dashboard de Marketing Digital</div>
          </div>
        </div>

        <div className="login-header">
          <h1 className="login-title">Bem-vindo de volta</h1>
          <p className="login-subtitle">Faça login para acessar o painel</p>
        </div>

        <Suspense fallback={<div className="skeleton" style={{ height: 180 }} />}>
          <LoginForm />
        </Suspense>

        <div className="login-footer">
          <p>Apenas usuários autorizados. Contate o administrador para criar uma conta.</p>
        </div>
      </div>

      <div className="login-bg-grid" />
    </div>
  );
}
