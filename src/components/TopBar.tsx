'use client';

import React from 'react';

interface TopBarProps {
  title: string;
  breadcrumb?: string[];
  actions?: React.ReactNode;
}

export function TopBar({ title, breadcrumb, actions }: TopBarProps) {
  return (
    <div className="topbar">
      <div className="topbar-title">
        {breadcrumb?.map((crumb, i) => (
          <React.Fragment key={i}>
            <span style={{ color: 'var(--text-muted)' }}>{crumb}</span>
            <span className="topbar-breadcrumb-sep">/</span>
          </React.Fragment>
        ))}
        <span>{title}</span>
      </div>
      <div className="topbar-actions">{actions}</div>
    </div>
  );
}
