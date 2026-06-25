'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Megaphone, Image as ImageIcon,
  BarChart3, RefreshCw, Settings, HelpCircle, LogOut,
} from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const MAIN_NAV: NavItem[] = [
  { label: 'Dashboard',  href: '/',           icon: LayoutDashboard },
  { label: 'Campanhas',  href: '/campaigns',  icon: Megaphone },
  { label: 'Anúncios',   href: '/ads',        icon: ImageIcon },
  { label: 'Relatórios', href: '/reports',    icon: BarChart3 },
];

const WORKSPACE_NAV: NavItem[] = [
  { label: 'Sincronização', href: '/sync',     icon: RefreshCw },
  { label: 'Configurações', href: '/settings', icon: Settings },
];

interface SidebarProps {
  user: { email: string; name: string };
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

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

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-logo">AM</div>
        <div className="flex-1">
          <div className="sidebar-brand-name">Ads Metrics</div>
        </div>
      </div>

      {/* Main navigation */}
      <nav className="flex flex-col gap-0.5">
        {MAIN_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href} className={`sidebar-item ${active ? 'active' : ''}`}>
              <Icon size={15} className="sidebar-item-icon" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Workspace section */}
      <div className="sidebar-section-label">Workspace</div>
      <nav className="flex flex-col gap-0.5">
        {WORKSPACE_NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href} className={`sidebar-item ${active ? 'active' : ''}`}>
              <Icon size={15} className="sidebar-item-icon" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <a
          href="https://developers.facebook.com/docs/marketing-api/"
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-item"
        >
          <HelpCircle size={15} className="sidebar-item-icon" />
          <span>Documentação</span>
        </a>

        <button onClick={handleLogout} className="sidebar-item" style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', font: 'inherit', cursor: 'pointer' }}>
          <LogOut size={15} className="sidebar-item-icon" />
          <span>Sair</span>
        </button>

        <div className="sidebar-user" style={{ marginTop: 8 }}>
          <div className="sidebar-user-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user.name}</div>
            <div className="sidebar-user-meta">{user.email}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
