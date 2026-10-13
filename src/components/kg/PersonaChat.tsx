'use client';

/**
 * 「和我聊」：数字职人对话（迁移 027）。知识来自平方知识图谱（/api/lab/spaces/:id/chat 或 /api/kg/chat），
 * 回答里的 [J1] [S2] 渲染成可点的来源。样式全在本文件，不依赖 /lab 的 CSS。
 *   usePersonaChat     对话状态（开场白、提问、追问建议）
 *   ChatBody           对话区（消息 + 来源 + 追问 + 输入框），theme：dark | light
 *   ChatLauncher       右下角浮动按钮（头像 + 和我聊 / 聊聊这一行），百业里点了进独立对话页 /lab/:id/chat
 *   PersonaChat        后台用的侧边抽屉（数据工厂职业页）
 */
import React, { useEffect, useRef, useState } from 'react';

export interface ChatSource { id: string; type: string; title: string; url?: string | null; ref?: { kind: string; id: number; section?: string } }
export interface ChatMsg { role: 'user' | 'assistant'; content: string; sources?: ChatSource[] }
export interface ChatPersona { name: string; role: string; avatar?: string | null; tagline?: string | null }

const TYPE_LABEL: Record<string, string> = { job: '在招岗位', standard: '行业标准', task: '典型任务', data: '平方数据', company: '企业' };
const THEMES = {
  dark: { panel: 'rgba(14,16,28,.96)', border: 'rgba(255,255,255,.1)', ink: '#eef0ff', ink3: 'rgba(238,240,255,.55)', me: 'linear-gradient(120deg,#6a5cff,#8b5cf6)', them: 'rgba(255,255,255,.07)', chip: 'rgba(106,92,255,.16)', chipInk: '#c9c3ff', input: 'rgba(255,255,255,.06)' },
  light: { panel: '#ffffff', border: '#e8eaf2', ink: '#1f2233', ink3: '#8a8fa3', me: 'linear-gradient(120deg,#6055f5,#8b5cf6)', them: '#f4f5fa', chip: 'rgba(96,85,245,.08)', chipInk: '#5b50e6', input: '#f7f8fb' },
};
const qsOf = (extra: Record<string, any>) => new URLSearchParams(Object.fromEntries(Object.entries(extra).filter(([, v]) => v != null && typeof v !== 'object').map(([k, v]) => [k, String(v)]))).toString();

export function usePersonaChat(endpoint: string, extraBody: Record<string, any> = {}, enabled = true) {
  const [meta, setMeta] = useState<{ persona: ChatPersona; occupation?: { id: number; name: string }; scene?: string | null; title?: string } | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [sugs, setSugs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const qs = qsOf(extraBody);
  useEffect(() => {
    if (!enabled || meta || err) return;
    fetch(`${endpoint}${qs ? `?${qs}` : ''}`).then(r => r.json()).then(j => {
      if (!j.success) { setErr(j.error || '暂时聊不了'); return; }
      setMeta({ persona: j.persona, occupation: j.occupation, scene: j.scene, title: j.title });
      setMsgs([{ role: 'assistant', content: j.hello }]); setSugs(j.suggestions || []);
    }).catch(e => setErr(e.message));
  }, [enabled, meta, err, endpoint, qs]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy || !meta) return;
    setSugs([]); setBusy(true);
    const history = msgs.map(m => ({ role: m.role, content: m.content }));
    setMsgs(m => [...m, { role: 'user', content: question }]);
    try {
      const j = await (await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...extraBody, question, history, chatId }) })).json();
      if (!j.success) throw new Error(j.error);
      setChatId(j.chatId || chatId);
      setMsgs(m => [...m, { role: 'assistant', content: j.reply, sources: j.sources }]);
      setSugs(j.suggestions || []);
    } catch (e: any) {
      setMsgs(m => [...m, { role: 'assistant', content: `（信号不太好：${e.message}）` }]);
    } finally { setBusy(false); }
  };
  return { meta, msgs, sugs, busy, err, ask };
}

export function PersonaAvatar({ name, avatar, size, ring = '#fff' }: { name: string; avatar?: string | null; size: number; ring?: string }) {
  return avatar
    ? <img src={avatar} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center 12%', flexShrink: 0, border: `2px solid ${ring}`, background: '#eef0ff' }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: THEMES.light.me, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.42, flexShrink: 0 }}>{name.slice(0, 1)}</div>;
}

export function ChatBody({ chat, theme = 'light', fallbackName, onOpen, activeId, displayName }: { chat: ReturnType<typeof usePersonaChat>; theme?: 'dark' | 'light'; fallbackName?: string; onOpen?: (s: ChatSource) => void; activeId?: string | null; displayName?: string }) {
  const C = THEMES[theme];
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const { meta, msgs, sugs, busy, err, ask } = chat;
  const name = displayName || meta?.persona.name || fallbackName || '我';
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);
  const send = (q: string) => { if (!q.trim()) return; setInput(''); ask(q); };

  /** 回答里的 [J1] → 上标链接 */
  const render = (m: ChatMsg) => m.content.split(/(\[[JSTDC]\d+\])/g).map((p, i) => {
    const hit = p.match(/^\[([JSTDC]\d+)\]$/);
    if (!hit) return <React.Fragment key={i}>{p}</React.Fragment>;
    const s = m.sources?.find(x => x.id === hit[1]);
    return <sup key={i} title={s?.title} style={{ color: C.chipInk, fontWeight: 600, cursor: s && (s.ref || s.url) ? 'pointer' : 'default', margin: '0 1px' }} onClick={() => s && open(s)}>{hit[1]}</sup>;
  });
  /** 有资料面板就在右侧展开，否则才跳外链 */
  const open = (s: ChatSource) => { if (onOpen && s.ref) onOpen(s); else if (s.url) window.open(s.url, '_blank'); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: C.ink }}>
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {err && <div style={{ color: C.ink3, fontSize: 13, textAlign: 'center', marginTop: 40 }}>{err}</div>}
        {!err && !meta && <div style={{ color: C.ink3, fontSize: 13, textAlign: 'center', marginTop: 40 }}>{name}正在过来…</div>}
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end' }}>
            {m.role === 'assistant' && <PersonaAvatar name={name} avatar={meta?.persona.avatar} size={30} ring={C.border} />}
            <div style={{ maxWidth: '84%' }}>
              <div style={{ padding: '11px 14px', borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', fontSize: 14.5, lineHeight: 1.75, whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? C.me : C.them, color: m.role === 'user' ? '#fff' : C.ink }}>{m.role === 'assistant' ? render(m) : m.content}</div>
              {!!m.sources?.length && <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {m.sources.map(s => (
                  <a key={s.id} href={s.url || undefined} target="_blank" rel="noreferrer" onClick={e => { e.preventDefault(); open(s); }}
                    style={{ fontSize: 12, color: C.ink3, textDecoration: 'none', display: 'flex', gap: 6, alignItems: 'baseline', cursor: s.ref || s.url ? 'pointer' : 'default',
                      background: activeId === s.id ? C.chip : 'transparent', borderRadius: 6, padding: '2px 4px', margin: '0 -4px' }}>
                    <span style={{ color: C.chipInk, fontWeight: 700, minWidth: 22 }}>{s.id}</span>
                    <span style={{ padding: '0 6px', borderRadius: 4, background: C.chip, color: C.chipInk, fontSize: 11, flexShrink: 0 }}>{TYPE_LABEL[s.type] || s.type}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                    {s.ref && onOpen && <span style={{ color: C.chipInk, flexShrink: 0 }}>›</span>}
                  </a>
                ))}
              </div>}
            </div>
          </div>
        ))}
        {busy && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><PersonaAvatar name={name} avatar={meta?.persona.avatar} size={30} ring={C.border} /><span style={{ color: C.ink3, fontSize: 13 }}>{name}在想…（会先核对资料，稍等）</span></div>}
      </div>
      {!!sugs.length && !busy && <div style={{ padding: '0 16px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {sugs.map(s => <button key={s} onClick={() => send(s)} style={{ border: 0, borderRadius: 999, padding: '7px 12px', fontSize: 13, cursor: 'pointer', background: C.chip, color: C.chipInk, fontFamily: 'inherit', textAlign: 'left' }}>{s}</button>)}
      </div>}
      <div style={{ display: 'flex', gap: 8, padding: 14, borderTop: `1px solid ${C.border}` }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(input); }}
          placeholder={`问问${name}…`} disabled={!meta || busy}
          style={{ flex: 1, border: `1px solid ${C.border}`, background: C.input, color: C.ink, borderRadius: 12, padding: '11px 13px', fontSize: 14.5, outline: 'none', fontFamily: 'inherit' }} />
        <button onClick={() => send(input)} disabled={!meta || busy || !input.trim()}
          style={{ border: 0, borderRadius: 12, padding: '0 18px', background: C.me, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: !meta || busy || !input.trim() ? 0.5 : 1, fontFamily: 'inherit' }}>发送</button>
      </div>
    </div>
  );
}

/** 浮动按钮：给 href 就是进独立对话页，否则走 onClick */
export function ChatLauncher({ name, avatar, href, onClick, bottom = 22 }: { name?: string; avatar?: string | null; href?: string; onClick?: () => void; bottom?: number }) {
  const style: React.CSSProperties = { position: 'fixed', right: 22, bottom, zIndex: 1000, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px 8px 8px', borderRadius: 999, border: 0, cursor: 'pointer',
    background: THEMES.light.me, color: '#fff', boxShadow: '0 10px 30px rgba(96,85,245,.45)', fontFamily: 'inherit', textDecoration: 'none' };
  const inner = <>
    <PersonaAvatar name={name || '我'} avatar={avatar} size={40} />
    <span style={{ textAlign: 'left', lineHeight: 1.25 }}>
      <span style={{ display: 'block', fontSize: 15, fontWeight: 800 }}>和我聊</span>
      <span style={{ display: 'block', fontSize: 11.5, opacity: .85 }}>聊聊这一行</span>
    </span>
  </>;
  return href ? <a href={href} aria-label="和我聊" style={style}>{inner}</a> : <button onClick={onClick} aria-label="和我聊" style={style}>{inner}</button>;
}

/** 后台（数据工厂职业页）用的侧边抽屉 */
export function PersonaChat({ endpoint, extraBody = {}, theme = 'light', top = 16 }: { endpoint: string; extraBody?: Record<string, any>; theme?: 'dark' | 'light'; top?: number }) {
  const [open, setOpen] = useState(false);
  const chat = usePersonaChat(endpoint, extraBody, open);
  const C = THEMES[theme];
  const p = chat.meta?.persona;
  if (!open) return <ChatLauncher onClick={() => setOpen(true)} name={p?.name} avatar={p?.avatar} />;
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, top, width: 'min(440px, calc(100vw - 32px))', zIndex: 1000, display: 'flex', flexDirection: 'column',
      background: C.panel, color: C.ink, border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,.25)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
        <PersonaAvatar name={p?.name || '我'} avatar={p?.avatar} size={46} ring={C.border} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{p?.name || '…'}</div>
          <div style={{ fontSize: 12, color: C.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.role || ''} · 聊聊{chat.meta?.occupation?.name || '这'}一行</div>
        </div>
        <button onClick={() => setOpen(false)} aria-label="收起" style={{ background: 'transparent', border: 0, color: C.ink3, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}><ChatBody chat={chat} theme={theme} /></div>
    </div>
  );
}
