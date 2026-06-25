'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Megaphone, Image as ImageIcon,
  BarChart3, Search, RefreshCw, Settings, LogOut, ChevronDown,
  Sparkles, Users, Eye,
} from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { ThemeToggle } from '@/components/ThemeToggle';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',  href: '/',          icon: LayoutDashboard },
  { label: 'Campanhas',  href: '/campaigns', icon: Megaphone },
  { label: 'Anúncios',   href: '/ads',       icon: ImageIcon },
  { label: 'Relatórios', href: '/reports',   icon: BarChart3 },
  { label: 'Assistente', href: '/assistant', icon: Sparkles },
  { label: 'Clientes',   href: '/clients',   icon: Users },
];

type Role = 'admin' | 'client';

interface HeaderProps {
  user: { email: string; name: string };
  role?: Role;
  accountLabel?: string | null;
}

interface ActiveAccount {
  connected: boolean;
  label?: string;
  adAccountId?: string;
  source?: 'db' | 'env';
}

export function Header({ user, role = 'admin', accountLabel }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isClient = role === 'client';
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [account, setAccount] = React.useState<ActiveAccount | null>(null);

  // Conta Meta ativa — só para admin (cliente vê só a conta dele)
  React.useEffect(() => {
    if (isClient) return;
    let alive = true;
    fetch('/api/meta/active')
      .then((r) => r.json())
      .then((j) => { if (alive) setAccount(j); })
      .catch(() => { if (alive) setAccount(null); });
    return () => { alive = false; };
  }, [pathname, isClient]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href);

  const handleLogout = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const brand = (
    <Link href={isClient ? '/portal' : '/'} className="header-brand">
      <div className="header-brand-logo">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M3 12h3l3-9 6 18 3-9h3" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <span className="header-brand-name">Ads Metrics</span>
    </Link>
  );

  const userMenu = (
    <div style={{ position: 'relative' }}>
      <button
        className="user-chip"
        onClick={() => setMenuOpen(!menuOpen)}
        onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
      >
        <div className="user-chip-avatar">{initials}</div>
        <span className="user-chip-name">{user.name}</span>
        <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
      </button>

      {menuOpen && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
            minWidth: 220, padding: 6, zIndex: 50,
          }}
          className="fade-in"
        >
          <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{user.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{user.email}</div>
            {isClient && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Eye size={11} /> Acesso somente leitura
              </div>
            )}
          </div>
          {!isClient && (
            <Link
              href="/settings"
              className="header-nav-item"
              style={{ width: '100%', borderRadius: 'var(--radius)', padding: '7px 10px' }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <Settings size={14} />
              Configurações
            </Link>
          )}
          <button
            onClick={handleLogout}
            onMouseDown={(e) => e.preventDefault()}
            className="header-nav-item"
            style={{
              width: '100%', borderRadius: 'var(--radius)', padding: '7px 10px',
              background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer',
              color: 'var(--danger)', fontFamily: 'inherit',
            }}
          >
            <LogOut size={14} />
            Sair
          </button>
        </div>
      )}
    </div>
  );

  // -------------------------------------------------------------------------
  // HEADER DO CLIENTE — minimalista, somente leitura
  // -------------------------------------------------------------------------
  if (isClient) {
    const clientNav = [
      { label: 'Painel', href: '/portal', icon: LayoutDashboard },
      { label: 'Assistente', href: '/portal/assistant', icon: Sparkles },
    ];
    const clientActive = (href: string) =>
      href === '/portal' ? pathname === '/portal' : pathname?.startsWith(href);
    return (
      <header className="header">
        {brand}
        <nav className="header-nav">
          {clientNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={`header-nav-item ${clientActive(item.href) ? 'active' : ''}`}>
                <Icon size={14} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="header-client-tag">
          <Eye size={13} />
          {accountLabel || 'Portal do cliente'}
        </div>
        <div className="header-actions" style={{ marginLeft: 'auto' }}>
          <ThemeToggle />
          {userMenu}
        </div>
      </header>
    );
  }

  return (
    <header className="header">
      {/* Brand */}
      {brand}

      {/* Nav */}
      <nav className="header-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`header-nav-item ${active ? 'active' : ''}`}
            >
              <Icon size={14} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Search */}
      <div className="header-search">
        <Search size={14} className="header-search-icon" />
        <input type="text" placeholder="Buscar campanhas, anúncios…" />
      </div>

      {/* Actions */}
      <div className="header-actions">
        {/* Conta Meta ativa */}
        {account && (
          <Link
            href="/settings"
            className="account-chip"
            title={account.connected
              ? `Conta ativa: ${account.label} (act_${account.adAccountId}) — clique para gerenciar`
              : 'Nenhuma conta conectada — clique para conectar'}
          >
            <span className={`account-chip-dot ${account.connected ? 'online' : 'offline'}`} />
            <span className="account-chip-fb">f</span>
            <span className="account-chip-label">
              {account.connected ? account.label : 'Sem conta'}
            </span>
          </Link>
        )}

        <ThemeToggle />
        <Link href="/sync" className="btn btn-secondary btn-sm">
          <RefreshCw size={13} />
          Sincronizar
        </Link>

        {userMenu}
      </div>
    </header>
  );
}
