'use client';

// =============================================================================
// src/components/ClientAssistant.tsx
// Assistente IA do cliente — somente leitura, ancorado nos dados da conta dele.
// Conversa simples (texto), sem ferramentas/ações. Stream de texto puro.
// =============================================================================

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Send, Bot, User as UserIcon, Square, RotateCcw } from 'lucide-react';

interface Message { role: 'user' | 'assistant'; content: string; }

const SUGGESTIONS = [
  'Como estão minhas campanhas no geral?',
  'Qual anúncio está indo melhor e por quê?',
  'O que pode ser melhorado nos meus resultados?',
  'Explique o que significa CTR e como está o meu.',
];

// Renderizador de markdown leve (negrito, listas, títulos, parágrafos)
function md(text: string): React.ReactNode {
  const inline = (s: string): React.ReactNode => {
    const out: React.ReactNode[] = [];
    let rem = s, k = 0;
    while (rem.length) {
      const b = rem.match(/\*\*(.+?)\*\*/);
      if (!b) { out.push(rem); break; }
      if (b.index! > 0) out.push(rem.slice(0, b.index));
      out.push(<strong key={k++} style={{ color: 'var(--text-primary)' }}>{b[1]}</strong>);
      rem = rem.slice(b.index! + b[0].length);
    }
    return <>{out}</>;
  };
  const els: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    els.push(<ul key={`u${els.length}`} style={{ margin: '8px 0 8px 18px', listStyle: 'disc' }}>{list.map((it, i) => <li key={i} style={{ marginBottom: 4, lineHeight: 1.55 }}>{inline(it)}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('- ') || t.startsWith('* ')) { list.push(t.slice(2)); continue; }
    const nm = t.match(/^(\d+)\.\s+(.+)/); if (nm) { list.push(nm[2]); continue; }
    flush();
    if (t.startsWith('### ')) els.push(<h4 key={els.length} style={{ fontSize: 14, fontWeight: 600, marginTop: 12, marginBottom: 5 }}>{t.slice(4)}</h4>);
    else if (t.startsWith('## ')) els.push(<h3 key={els.length} style={{ fontSize: 15, fontWeight: 600, marginTop: 14, marginBottom: 6 }}>{t.slice(3)}</h3>);
    else if (t === '') els.push(<div key={els.length} style={{ height: 8 }} />);
    else els.push(<p key={els.length} style={{ margin: '4px 0', lineHeight: 1.6 }}>{inline(line)}</p>);
  }
  flush();
  return <>{els}</>;
}

export function ClientAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    const newMsgs = [...messages, { role: 'user' as const, content: text }];
    setMessages([...newMsgs, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const r = await fetch('/api/client/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMsgs }),
        signal: controller.signal,
      });
      if (!r.ok || !r.body) {
        let msg = `Erro ${r.status}`;
        try { const j = await r.json(); msg = j.error || msg; } catch { /* */ }
        setMessages((p) => { const n = [...p]; n[n.length - 1] = { role: 'assistant', content: `⚠️ ${msg}` }; return n; });
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages((p) => { const n = [...p]; n[n.length - 1] = { role: 'assistant', content: acc }; return n; });
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (!err.includes('abort')) {
        setMessages((p) => { const n = [...p]; const l = n[n.length - 1]; if (l?.role === 'assistant' && !l.content) n[n.length - 1] = { role: 'assistant', content: `⚠️ ${err}` }; return n; });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [messages, streaming]);

  const stop = () => abortRef.current?.abort();

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  return (
    <div className="assistant-page">
      <div className="assistant-header">
        <div>
          <h1 className="page-hero-title" style={{ fontSize: 26 }}>
            Assistente IA
            <span className="badge badge-accent" style={{ marginLeft: 12, verticalAlign: 'middle', fontSize: 11 }}>
              <Sparkles size={11} /> Tire suas dúvidas
            </span>
          </h1>
          <p className="page-hero-subtitle" style={{ marginTop: 6 }}>
            Pergunte qualquer coisa sobre o desempenho dos seus anúncios. A IA analisa seus dados em tempo real.
          </p>
        </div>
        {messages.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={() => setMessages([])}>
            <RotateCcw size={13} /> Nova conversa
          </button>
        )}
      </div>

      <div className="assistant-body">
        <div className="assistant-messages" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="assistant-empty">
              <div className="assistant-empty-icon"><Sparkles size={28} /></div>
              <h2 className="assistant-empty-title">Como posso ajudar?</h2>
              <p className="assistant-empty-desc">Pergunte sobre suas campanhas e anúncios — ou escolha uma sugestão:</p>
              <div className="assistant-suggestions">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} className="assistant-suggestion" onClick={() => send(s)}>
                    <div className="assistant-suggestion-content">
                      <div className="assistant-suggestion-title">{s}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="assistant-messages-inner">
              {messages.map((m, i) => (
                <div key={i} className={`assistant-message ${m.role}`}>
                  <div className="assistant-message-avatar">
                    {m.role === 'user' ? <UserIcon size={14} /> : <Bot size={14} />}
                  </div>
                  <div className="assistant-message-content">
                    {m.content ? md(m.content) : <div className="assistant-thinking"><span /><span /><span /></div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="assistant-input-area">
          <div className="assistant-input-wrap">
            <textarea
              className="assistant-input"
              placeholder="Pergunte algo sobre seus anúncios…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              rows={1}
              disabled={streaming}
            />
            {streaming ? (
              <button className="btn btn-icon btn-secondary" onClick={stop} aria-label="Parar"><Square size={13} /></button>
            ) : (
              <button className="btn btn-icon btn-accent" onClick={() => send(input)} disabled={!input.trim()} aria-label="Enviar"><Send size={14} /></button>
            )}
          </div>
          <p className="assistant-disclaimer">
            A IA tem acesso somente leitura aos seus dados. Para mudanças nas campanhas, fale com seu gestor.
          </p>
        </div>
      </div>
    </div>
  );
}
