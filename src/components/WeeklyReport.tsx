'use client';

import React, { useState, useEffect } from 'react';
import { FileBarChart, Sparkles, RefreshCw, ChevronDown, ChevronUp, Clock } from 'lucide-react';

interface Report {
  id?: string;
  title: string;
  content: string;
  period_start: string;
  period_end: string;
  anomaly_count: number;
  total_spend: number;
  generated_by: string;
  created_at?: string;
}

// Render de markdown básico (títulos, listas, negrito)
function md(text: string): React.ReactNode {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let list: string[] = [];

  const inline = (s: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let rem = s; let k = 0;
    while (rem.length) {
      const m = rem.match(/\*\*(.+?)\*\*/);
      if (!m) { parts.push(rem); break; }
      if (m.index! > 0) parts.push(rem.slice(0, m.index));
      parts.push(<strong key={k++}>{m[1]}</strong>);
      rem = rem.slice(m.index! + m[0].length);
    }
    return <>{parts}</>;
  };

  const flush = () => {
    if (!list.length) return;
    out.push(
      <ul key={`u${out.length}`} style={{ margin: '6px 0 10px 18px', padding: 0 }}>
        {list.map((it, i) => <li key={i} style={{ marginBottom: 4, lineHeight: 1.55 }}>{inline(it)}</li>)}
      </ul>
    );
    list = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('- ') || t.startsWith('* ')) { list.push(t.slice(2)); continue; }
    const num = t.match(/^\d+\.\s+(.+)/);
    if (num) { list.push(num[1]); continue; }
    flush();
    if (t.startsWith('## ')) out.push(<h4 key={i} style={{ fontSize: 14, fontWeight: 700, margin: '14px 0 6px', color: 'var(--text-primary)' }}>{t.slice(3)}</h4>);
    else if (t.startsWith('### ')) out.push(<h5 key={i} style={{ fontSize: 13, fontWeight: 600, margin: '10px 0 4px', color: 'var(--text-primary)' }}>{t.slice(4)}</h5>);
    else if (t === '') out.push(<div key={i} style={{ height: 6 }} />);
    else out.push(<p key={i} style={{ margin: '4px 0', lineHeight: 1.6, fontSize: 13.5 }}>{inline(lines[i])}</p>);
  }
  flush();
  return <>{out}</>;
}

export function WeeklyReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch('/api/reports/weekly');
        const json = await r.json();
        if (json.needsMigration) { if (active) setHidden(true); return; }
        if (active) setReport(json.report ?? null);
      } catch {
        if (active) setHidden(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const generateNow = async () => {
    setGenerating(true);
    try {
      const r = await fetch('/api/reports/weekly', { method: 'POST' });
      const json = await r.json();
      if (json.report) { setReport(json.report); setExpanded(true); }
    } catch { /* ignora */ } finally {
      setGenerating(false);
    }
  };

  if (hidden || loading) return null;

  const when = report?.created_at
    ? new Date(report.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="weekly-report">
      <div className="weekly-report-head">
        <div className="weekly-report-title">
          <div className="weekly-report-icon"><FileBarChart size={16} /></div>
          <div>
            <div className="weekly-report-name">
              Análise semanal por IA
              <span className="badge badge-accent" style={{ marginLeft: 8, fontSize: 10 }}>
                <Sparkles size={10} /> automática
              </span>
            </div>
            <div className="weekly-report-meta">
              {report
                ? <><Clock size={11} /> {report.generated_by === 'cron' ? 'Gerada automaticamente' : 'Gerada manualmente'}{when ? ` · ${when}` : ''}</>
                : 'Nenhuma análise gerada ainda. Toda segunda-feira uma é criada automaticamente.'}
            </div>
          </div>
        </div>
        <div className="weekly-report-actions">
          <button className="btn btn-secondary btn-sm" onClick={generateNow} disabled={generating}>
            <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
            {generating ? 'Gerando…' : report ? 'Atualizar' : 'Gerar agora'}
          </button>
          {report && (
            <button className="btn btn-icon btn-secondary" onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Recolher' : 'Expandir'}>
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          )}
        </div>
      </div>

      {report && expanded && (
        <div className="weekly-report-body">
          {md(report.content)}
        </div>
      )}
      {report && !expanded && (
        <button className="weekly-report-peek" onClick={() => setExpanded(true)}>
          Ver relatório completo <ChevronDown size={13} />
        </button>
      )}
    </div>
  );
}
