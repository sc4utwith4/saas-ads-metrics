'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle, TrendingUp, TrendingDown, ChevronDown, ChevronUp,
  ShieldAlert, Sparkles, X,
} from 'lucide-react';

type AnomalySeverity = 'critical' | 'warning' | 'positive';

interface Anomaly {
  id: string;
  campaignId: string;
  campaignName: string;
  metric: string;
  severity: AnomalySeverity;
  current: number;
  previous: number;
  changePct: number;
  message: string;
}

interface AnomalyResponse {
  anomalies: Anomaly[];
  counts: { critical: number; warning: number; positive: number };
}

const SEVERITY_META: Record<AnomalySeverity, { label: string; icon: React.ElementType; cls: string }> = {
  critical: { label: 'Crítico',   icon: ShieldAlert,   cls: 'anomaly-critical' },
  warning:  { label: 'Atenção',   icon: AlertTriangle, cls: 'anomaly-warning' },
  positive: { label: 'Oportunidade', icon: Sparkles,   cls: 'anomaly-positive' },
};

export function AnomalyAlerts({ windowDays = 7 }: { windowDays?: number }) {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch(`/api/insights/anomalies?window=${windowDays}`);
        const json = (await r.json()) as AnomalyResponse;
        if (active) setAnomalies(json.anomalies ?? []);
      } catch {
        if (active) setAnomalies([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [windowDays]);

  if (loading || dismissed || anomalies.length === 0) return null;

  const critical = anomalies.filter((a) => a.severity === 'critical').length;
  const warning = anomalies.filter((a) => a.severity === 'warning').length;
  const positive = anomalies.filter((a) => a.severity === 'positive').length;

  const visible = expanded ? anomalies : anomalies.slice(0, 3);

  const headerSeverity: AnomalySeverity = critical > 0 ? 'critical' : warning > 0 ? 'warning' : 'positive';
  const HeaderIcon = SEVERITY_META[headerSeverity].icon;

  return (
    <div className={`anomaly-banner ${SEVERITY_META[headerSeverity].cls}`}>
      <div className="anomaly-banner-head">
        <div className="anomaly-banner-title">
          <HeaderIcon size={16} />
          <span>
            {anomalies.length} {anomalies.length === 1 ? 'alerta detectado' : 'alertas detectados'}
            <span className="anomaly-banner-sub"> · últimos {windowDays} dias vs anteriores</span>
          </span>
        </div>
        <div className="anomaly-banner-actions">
          {critical > 0 && <span className="anomaly-pill anomaly-pill-critical">{critical} crítico{critical > 1 ? 's' : ''}</span>}
          {warning > 0 && <span className="anomaly-pill anomaly-pill-warning">{warning} atenção</span>}
          {positive > 0 && <span className="anomaly-pill anomaly-pill-positive">{positive} oportunidade{positive > 1 ? 's' : ''}</span>}
          <button className="anomaly-dismiss" onClick={() => setDismissed(true)} aria-label="Dispensar">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="anomaly-list">
        {visible.map((a) => {
          const meta = SEVERITY_META[a.severity];
          const Icon = meta.icon;
          const DirIcon = a.changePct >= 0 ? TrendingUp : TrendingDown;
          return (
            <div key={a.id} className={`anomaly-item ${meta.cls}`}>
              <div className="anomaly-item-icon"><Icon size={14} /></div>
              <div className="anomaly-item-body">
                <div className="anomaly-item-campaign">
                  {a.campaignName}
                  <span className={`anomaly-item-change ${a.changePct >= 0 ? 'up' : 'down'}`}>
                    <DirIcon size={11} />
                    {Math.abs(a.changePct).toFixed(0)}%
                  </span>
                </div>
                <div className="anomaly-item-message">{a.message}</div>
              </div>
            </div>
          );
        })}
      </div>

      {anomalies.length > 3 && (
        <button className="anomaly-toggle" onClick={() => setExpanded(!expanded)}>
          {expanded ? (
            <>Mostrar menos <ChevronUp size={13} /></>
          ) : (
            <>Ver todos os {anomalies.length} alertas <ChevronDown size={13} /></>
          )}
        </button>
      )}
    </div>
  );
}
