'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, Send, Bot, User as UserIcon,
  TrendingUp, FileText, Lightbulb, RotateCcw, Square,
  Plus, MessageSquare, Trash2, PanelLeftClose, PanelLeftOpen,
  ShieldAlert, Zap, Check, X, Loader2,
  Paperclip, ImageIcon, Music, FileText as FileIcon,
} from 'lucide-react';

interface PendingAction {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  title: string;
  description: string;
  danger?: boolean;
}

interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  data: string;        // base64 sem prefixo (enviado à IA)
  previewUrl: string;  // data URL para exibição
  kind: 'image' | 'audio' | 'file';
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** anexos enviados nesta mensagem (apenas exibição) */
  attachments?: Attachment[];
  /** passos que a IA executou (modo agente — apenas exibição) */
  steps?: string[];
  /** ação de escrita aguardando confirmação */
  pendingAction?: PendingAction;
  /** estado da ação após decisão do usuário */
  actionState?: 'confirmed' | 'cancelled' | 'failed';
}

interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

const SUGGESTIONS = [
  {
    icon: TrendingUp,
    title: 'Auditar lucratividade',
    prompt: 'Faça uma auditoria das minhas campanhas dos últimos 30 dias com foco em lucro: quais estão acima do break-even, quais estão queimando dinheiro e onde está o maior desperdício de orçamento? Priorize por impacto financeiro.',
  },
  {
    icon: Lightbulb,
    title: 'Plano de escala',
    prompt: 'Quais campanhas eu deveria escalar e quais cortar para aumentar meu lucro líquido? Me dê um plano de ação priorizado, com quanto aumentar/reduzir de orçamento em cada uma e por quê.',
  },
  {
    icon: FileText,
    title: 'Gerar copy que vende',
    prompt: 'Crie 5 variações de copy de anúncio (headline, texto principal e CTA) com ângulos diferentes (dor, desejo, prova social, urgência, autoridade). Antes, me pergunte os detalhes do produto/oferta que você precisa saber.',
  },
  {
    icon: Sparkles,
    title: 'Diagnóstico de gargalo',
    prompt: 'Analise o funil das minhas campanhas e identifique onde está o gargalo (criativo, público, oferta ou página). Me diga, métrica por métrica, o que está travando o resultado e como destravar.',
  },
];

function formatMarkdown(text: string): React.ReactNode {
  // Renderização básica de markdown: negrito, listas, headings, code inline
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    elements.push(
      <ul key={`ul-${elements.length}`} style={{ margin: '8px 0 8px 18px', padding: 0, listStyle: 'disc' }}>
        {listBuffer.map((item, i) => (
          <li key={i} style={{ marginBottom: 4, lineHeight: 1.55 }}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  const renderInline = (s: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let remaining = s;
    let key = 0;
    // Ordem importa: imagem antes de link (img é "![..](..)", link é "[..](..)").
    const patterns: { name: string; re: RegExp }[] = [
      { name: 'img', re: /!\[([^\]]*)\]\(([^)]+)\)/ },
      { name: 'link', re: /\[([^\]]+)\]\(([^)]+)\)/ },
      { name: 'bold', re: /\*\*(.+?)\*\*/ },
      { name: 'code', re: /`([^`]+)`/ },
    ];
    while (remaining.length > 0) {
      let best: { name: string; m: RegExpMatchArray } | null = null;
      for (const p of patterns) {
        const m = remaining.match(p.re);
        if (m && (best === null || m.index! < best.m.index!)) best = { name: p.name, m };
      }
      if (!best) { parts.push(remaining); break; }
      const { name, m } = best;
      if (m.index! > 0) parts.push(remaining.slice(0, m.index));
      if (name === 'img') {
        parts.push(
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={key++}
            src={m[2]}
            alt={m[1] || 'imagem'}
            className="chat-img"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        );
      } else if (name === 'link') {
        parts.push(
          <a key={key++} href={m[2]} target="_blank" rel="noopener noreferrer" className="chat-link">{m[1]}</a>
        );
      } else if (name === 'bold') {
        parts.push(<strong key={key++} style={{ color: 'var(--text-primary)' }}>{m[1]}</strong>);
      } else {
        parts.push(<code key={key++} className="mono" style={{ background: 'var(--bg-strong)', padding: '1px 5px', borderRadius: 3, fontSize: '0.9em' }}>{m[1]}</code>);
      }
      remaining = remaining.slice(m.index! + m[0].length);
    }
    return <>{parts}</>;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listBuffer.push(trimmed.slice(2));
      continue;
    }

    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      listBuffer.push(numMatch[2]);
      continue;
    }

    flushList();

    if (trimmed.startsWith('### ')) {
      elements.push(<h4 key={i} style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginTop: 14, marginBottom: 6 }}>{trimmed.slice(4)}</h4>);
    } else if (trimmed.startsWith('## ')) {
      elements.push(<h3 key={i} style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>{trimmed.slice(3)}</h3>);
    } else if (trimmed.startsWith('# ')) {
      elements.push(<h2 key={i} style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginTop: 16, marginBottom: 8 }}>{trimmed.slice(2)}</h2>);
    } else if (trimmed === '') {
      elements.push(<div key={i} style={{ height: 8 }} />);
    } else {
      elements.push(<p key={i} style={{ margin: '4px 0', lineHeight: 1.6 }}>{renderInline(line)}</p>);
    }
  }
  flushList();

  return <>{elements}</>;
}

function inlineBold(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let rem = text;
  let k = 0;
  while (rem.length) {
    const m = rem.match(/\*\*(.+?)\*\*/);
    if (!m) { parts.push(rem); break; }
    if (m.index! > 0) parts.push(rem.slice(0, m.index));
    parts.push(<strong key={k++}>{m[1]}</strong>);
    rem = rem.slice(m.index! + m[0].length);
  }
  return <>{parts}</>;
}

function ActionCard({ action, state, busy, onConfirm, onCancel }: {
  action: PendingAction;
  state?: 'confirmed' | 'cancelled' | 'failed';
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const decided = state === 'confirmed' || state === 'cancelled' || state === 'failed';

  return (
    <div className={`action-card ${action.danger ? 'danger' : ''} ${decided ? 'decided' : ''}`}>
      <div className="action-card-head">
        <div className="action-card-icon">
          {action.danger ? <ShieldAlert size={15} /> : <Zap size={15} />}
        </div>
        <div className="action-card-title">{action.title}</div>
        <span className="action-card-badge">requer confirmação</span>
      </div>
      <div className="action-card-desc">{inlineBold(action.description)}</div>

      {state === 'confirmed' && <div className="action-card-status ok"><Check size={13} /> Ação executada</div>}
      {state === 'failed' && <div className="action-card-status fail"><X size={13} /> Falha ao executar</div>}
      {state === 'cancelled' && <div className="action-card-status cancel"><X size={13} /> Cancelada</div>}

      {!decided && (
        <div className="action-card-actions">
          <button className="btn btn-secondary btn-sm" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            className={`btn btn-sm ${action.danger ? 'btn-danger' : 'btn-accent'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            <Check size={13} />
            Confirmar e executar
          </button>
        </div>
      )}
    </div>
  );
}

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyEnabled, setHistoryEnabled] = useState(true);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentIdRef = useRef<string | null>(null);

  useEffect(() => { currentIdRef.current = currentId; }, [currentId]);

  // ---- Anexos (imagem / áudio / PDF) ----
  const MAX_FILE_MB = 12;
  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        alert(`"${file.name}" excede ${MAX_FILE_MB}MB e foi ignorado.`);
        continue;
      }
      const dataUrl: string = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result as string);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(',')[1] ?? '';
      const kind: Attachment['kind'] = file.type.startsWith('image/')
        ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'file';
      next.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: base64,
        previewUrl: dataUrl,
        kind,
      });
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  // Carrega lista de conversas ao montar
  const loadConversations = useCallback(async () => {
    try {
      const r = await fetch('/api/ai/conversations');
      const json = await r.json();
      if (json.needsMigration) { setHistoryEnabled(false); return; }
      setConversations(json.conversations ?? []);
    } catch {
      setHistoryEnabled(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Auto scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Persiste a conversa (cria ou atualiza) — salva só role/content (sem cards)
  const persist = useCallback(async (msgs: Message[]) => {
    if (!historyEnabled || msgs.length === 0) return;
    const clean = msgs
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));
    if (clean.length === 0) return;
    try {
      const r = await fetch('/api/ai/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentIdRef.current ?? undefined, messages: clean }),
      });
      const json = await r.json();
      if (json.needsMigration) { setHistoryEnabled(false); return; }
      if (json.conversation?.id) {
        if (!currentIdRef.current) setCurrentId(json.conversation.id);
        loadConversations();
      }
    } catch {
      /* silencioso — não atrapalha o chat */
    }
  }, [historyEnabled, loadConversations]);

  /** Lê um stream NDJSON do /api/ai/chat e atualiza a última msg do assistente. */
  const runNdjson = async (
    convMessages: Message[],
    signal: AbortSignal,
    atts?: Attachment[],
  ) => {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: convMessages.map((m) => ({ role: m.role, content: m.content })),
        attachments: atts?.map((a) => ({ mimeType: a.mimeType, data: a.data })),
      }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error((await res.text()) || `HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let acc = '';
    const steps: string[] = [];
    let pending: PendingAction | null = null;

    const handleEvent = (evt: { type: string; value?: string; label?: string; action?: PendingAction }) => {
      if (evt.type === 'text' && evt.value) {
        acc += evt.value;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], role: 'assistant', content: acc };
          return next;
        });
      } else if (evt.type === 'step' && evt.label) {
        steps.push(evt.label);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], role: 'assistant', content: acc, steps: [...steps] };
          return next;
        });
      } else if (evt.type === 'pending_action' && evt.action) {
        pending = evt.action;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], role: 'assistant', content: acc, pendingAction: evt.action };
          return next;
        });
      } else if (evt.type === 'error' && evt.value) {
        acc += `\n\n⚠️ Erro: ${evt.value}`;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], role: 'assistant', content: acc };
          return next;
        });
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        try { handleEvent(JSON.parse(t)); } catch { /* linha parcial */ }
      }
    }
    return { acc, pending };
  };

  const send = async (text: string) => {
    if ((!text.trim() && attachments.length === 0) || streaming) return;

    const sentAtts = attachments;
    const userMsg: Message = {
      role: 'user',
      content: text.trim() || (sentAtts.length ? '(analise o anexo)' : ''),
      attachments: sentAtts.length ? sentAtts : undefined,
    };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setAttachments([]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Backstop: se passar de ~70s sem concluir, aborta e avisa (em vez de travar).
    let timedOut = false;
    const killer = setTimeout(() => { timedOut = true; controller.abort(); }, 70000);

    let result: { acc: string; pending: PendingAction | null } = { acc: '', pending: null };
    try {
      result = await runNdjson(newMessages, controller.signal, sentAtts);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (timedOut) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: '⚠️ A análise demorou demais e foi interrompida. Tente pedir algo mais específico (ex.: "analise os anúncios da campanha X" ou "compare o desempenho dos anúncios").' };
          return next;
        });
      } else if (!err.includes('abort')) {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant' && !last.content) {
            next[next.length - 1] = { role: 'assistant', content: `⚠️ Erro: ${err}` };
          }
          return next;
        });
      }
    } finally {
      clearTimeout(killer);
      setStreaming(false);
      abortRef.current = null;
      // Se terminou sem texto e sem ação pendente (ex.: função expirou no servidor),
      // mostra um aviso em vez de deixar a bolha vazia/travada.
      if (!result.acc && !result.pending && !timedOut) {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant' && !last.content) {
            next[next.length - 1] = { ...last, content: '⚠️ Não consegui concluir a resposta (o servidor pode ter atingido o tempo limite). Tente novamente ou faça uma pergunta mais específica.' };
          }
          return next;
        });
      }
      // Só persiste se gerou texto e não há ação pendente aguardando decisão
      if (result.acc && !result.pending) {
        persist([...newMessages, { role: 'assistant', content: result.acc }]);
      }
    }
  };

  // Confirma e executa uma ação pendente, depois pede o "ok" da IA
  const confirmAction = async (msgIndex: number, action: PendingAction) => {
    if (streaming) return;
    setStreaming(true);

    // marca o card como confirmado (some os botões)
    setMessages((prev) => {
      const next = [...prev];
      if (next[msgIndex]) next[msgIndex] = { ...next[msgIndex], actionState: 'confirmed' };
      return next;
    });

    let ok = false;
    let resultText = '';
    try {
      const r = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: action.tool, args: action.args }),
      });
      const json = await r.json();
      ok = !!json.ok;
      resultText = json.resultText ?? json.error ?? 'Sem detalhes.';
    } catch (e) {
      resultText = e instanceof Error ? e.message : String(e);
    }

    if (!ok) {
      setMessages((prev) => {
        const next = [...prev];
        if (next[msgIndex]) next[msgIndex] = { ...next[msgIndex], actionState: 'failed' };
        return next;
      });
    }

    // Conversa visível até aqui (sem cards), pra IA confirmar naturalmente
    const convPlain = messages
      .slice(0, msgIndex + 1)
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));

    // Nova bolha do assistente pra resposta de confirmação
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    let ackText = '';
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: convPlain, postAction: { title: action.title, resultText, ok } }),
      });
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          ackText += decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: ackText };
            return next;
          });
        }
      }
    } catch { /* ignora */ }

    setStreaming(false);
    if (ackText) {
      persist([...messages.slice(0, msgIndex + 1), { role: 'assistant', content: ackText }]);
    }
  };

  const cancelAction = (msgIndex: number) => {
    setMessages((prev) => {
      const next = [...prev];
      if (next[msgIndex]) next[msgIndex] = { ...next[msgIndex], actionState: 'cancelled' };
      return next;
    });
  };

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const newChat = () => {
    if (streaming) stop();
    setMessages([]);
    setCurrentId(null);
    currentIdRef.current = null;
    setInput('');
    inputRef.current?.focus();
  };

  const loadConversation = async (id: string) => {
    if (streaming) stop();
    if (id === currentId) return;
    try {
      const r = await fetch(`/api/ai/conversations/${id}`);
      const json = await r.json();
      if (json.conversation) {
        setMessages(json.conversation.messages ?? []);
        setCurrentId(id);
        currentIdRef.current = id;
      }
    } catch { /* ignora */ }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/ai/conversations/${id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === currentId) newChat();
    } catch { /* ignora */ }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="assistant-layout">
      {/* Sidebar de histórico */}
      {historyEnabled && sidebarOpen && (
        <aside className="assistant-sidebar">
          <button className="assistant-newchat" onClick={newChat}>
            <Plus size={15} />
            Nova conversa
          </button>
          <div className="assistant-conv-list">
            {conversations.length === 0 ? (
              <p className="assistant-conv-empty">Nenhuma conversa salva ainda.</p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  className={`assistant-conv-item ${c.id === currentId ? 'active' : ''}`}
                  onClick={() => loadConversation(c.id)}
                >
                  <MessageSquare size={13} className="assistant-conv-icon" />
                  <span className="assistant-conv-title">{c.title}</span>
                  <span
                    className="assistant-conv-del"
                    onClick={(e) => deleteConversation(c.id, e)}
                    role="button"
                    aria-label="Excluir conversa"
                  >
                    <Trash2 size={12} />
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>
      )}

      <div className="assistant-page">
        <div className="assistant-header">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {historyEnabled && (
              <button
                className="btn btn-icon btn-secondary"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                aria-label={sidebarOpen ? 'Recolher histórico' : 'Expandir histórico'}
                title={sidebarOpen ? 'Recolher histórico' : 'Expandir histórico'}
                style={{ marginTop: 2 }}
              >
                {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
              </button>
            )}
            <div>
              <h1 className="page-hero-title" style={{ fontSize: 28 }}>
                Assistente IA
                <span className="badge badge-accent" style={{ marginLeft: 12, verticalAlign: 'middle', fontSize: 11 }}>
                  <Sparkles size={11} /> Gemini 2.5
                </span>
              </h1>
              <p className="page-hero-subtitle" style={{ marginTop: 6 }}>
                Analise performance, gere copy de anúncios e receba sugestões inteligentes de otimização.
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={newChat}>
              <RotateCcw size={13} />
              Nova conversa
            </button>
          )}
        </div>

        <div className="assistant-body">
          <div className="assistant-messages" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="assistant-empty">
              <div className="assistant-empty-icon">
                <Sparkles size={28} />
              </div>
              <h2 className="assistant-empty-title">Como posso ajudar hoje?</h2>
              <p className="assistant-empty-desc">
                Tenho acesso aos dados das suas campanhas dos últimos 30 dias. Pergunte qualquer coisa ou escolha uma sugestão:
              </p>
              <div className="assistant-suggestions">
                {SUGGESTIONS.map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <button key={i} className="assistant-suggestion" onClick={() => send(s.prompt)}>
                      <div className="assistant-suggestion-icon">
                        <Icon size={15} />
                      </div>
                      <div className="assistant-suggestion-content">
                        <div className="assistant-suggestion-title">{s.title}</div>
                        <div className="assistant-suggestion-desc">{s.prompt.slice(0, 80)}…</div>
                      </div>
                    </button>
                  );
                })}
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
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="msg-attachments">
                        {m.attachments.map((a) => (
                          a.kind === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={a.id} src={a.previewUrl} alt={a.name} className="msg-attachment-img" />
                          ) : a.kind === 'audio' ? (
                            <audio key={a.id} src={a.previewUrl} controls className="msg-attachment-audio" />
                          ) : (
                            <div key={a.id} className="msg-attachment-file">
                              <FileIcon size={14} /> {a.name}
                            </div>
                          )
                        ))}
                      </div>
                    )}
                    {m.role === 'assistant' && m.steps && m.steps.length > 0 && (
                      <div className="agent-steps">
                        {m.steps.map((s, si) => {
                          const running = streaming && i === messages.length - 1 && si === m.steps!.length - 1 && !m.content;
                          return (
                            <div key={si} className="agent-step">
                              {running ? <Loader2 size={12} className="spin" /> : <Check size={12} className="agent-step-check" />}
                              <span>{s}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {m.content
                      ? formatMarkdown(m.content)
                      : (!m.pendingAction && (!m.steps || m.steps.length === 0) && <div className="assistant-thinking"><span /><span /><span /></div>)}
                    {m.pendingAction && (
                      <ActionCard
                        action={m.pendingAction}
                        state={m.actionState}
                        busy={streaming}
                        onConfirm={() => confirmAction(i, m.pendingAction!)}
                        onCancel={() => cancelAction(i)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="assistant-input-area">
          {attachments.length > 0 && (
            <div className="attach-previews">
              {attachments.map((a) => (
                <div key={a.id} className={`attach-chip ${a.kind}`}>
                  {a.kind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.previewUrl} alt={a.name} className="attach-chip-thumb" />
                  ) : (
                    <span className="attach-chip-icon">
                      {a.kind === 'audio' ? <Music size={14} /> : <FileIcon size={14} />}
                    </span>
                  )}
                  <span className="attach-chip-name">{a.name}</span>
                  <button className="attach-chip-remove" onClick={() => removeAttachment(a.id)} aria-label="Remover">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="assistant-input-wrap">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,audio/*,application/pdf"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleFiles(e.target.files)}
            />
            <button
              className="btn btn-icon btn-ghost-attach"
              onClick={() => fileRef.current?.click()}
              disabled={streaming}
              aria-label="Anexar imagem, áudio ou PDF"
              title="Anexar imagem, áudio ou PDF"
            >
              <Paperclip size={15} />
            </button>
            <textarea
              ref={inputRef}
              className="assistant-input"
              placeholder="Pergunte algo ou anexe um criativo para analisar…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              disabled={streaming}
            />
            {streaming ? (
              <button className="btn btn-icon btn-secondary" onClick={stop} aria-label="Parar">
                <Square size={13} />
              </button>
            ) : (
              <button
                className="btn btn-icon btn-accent"
                onClick={() => send(input)}
                disabled={!input.trim() && attachments.length === 0}
                aria-label="Enviar"
              >
                <Send size={14} />
              </button>
            )}
          </div>
          <p className="assistant-disclaimer">
            Envie criativos (imagem), áudios ou PDFs para a IA analisar. A IA pode cometer erros — verifique informações importantes.
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}
