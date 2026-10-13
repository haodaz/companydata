'use client';

/**
 * 「和我聊」：数字职人对话面板（迁移 027）。右下角浮动按钮（职人头像 + 和我聊 / 聊聊这一行），点开是侧边对话。
 * 知识来自平方知识图谱（/api/lab/spaces/:id/chat 或 /api/kg/chat），回答里的 [J1] [S2] 渲染成可点的来源。
 * theme：dark（体验百业 / 百业工厂的深色空间）| light（数据工厂后台）。样式全在本文件，不依赖 /lab 的 CSS。
 */
import React, { useEffect, useRef, useState } from 'react';

interface Source { id: string; type: string; title: string; url?: string | null }
interface Msg { role: 'user' | 'assistant'; content: string; sources?: Source[] }
interface Persona { name: string; role: string; avatar?: string | null; tagline?: string | null }

const TYPE_LABEL: Record<string, string> = { job: '在招岗位', standard: '行业标准', task: '典型任务', data: '平方数据', company: '企业' };

export function PersonaChat({ endpoint, extraBody = {}, theme = 'dark', fallbackName, fallbackAvatar, defaultOpen = false, bottom = 22, top = 16 }: {
  endpoint: string;                         // GET 开场白、POST 回答
  extraBody?: Record<string, any>;          // 如 { occupationId } / { surface: 'studio' }
  theme?: 'dark' | 'light';
  fallbackName?: string; fallbackAvatar?: string | null;
  defaultOpen?: boolean;
  bottom?: number;
  top?: number;                             // 面板上沿（百业页面顶上有导航栏，要让开）                          // 按钮离底边多远（空间首页底下有一排入口卡片，要抬高）
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [occName, setOccName] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [sugs, setSugs] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(extraBody).filter(([, v]) => v != null && typeof v !== 'object').map(([k, v]) => [k, String(v)]))).toString();

  useEffect(() => {
    if (!open || persona || err) return;
    fetch(`${endpoint}${qs ? `?${qs}` : ''}`).then(r => r.json()).then(j => {
      if (!j.success) { setErr(j.error || '暂时聊不了'); return; }
      setPersona(j.persona); setOccName(j.occupation?.name || '');
      setMsgs([{ role: 'assistant', content: j.hello }]); setSugs(j.suggestions || []);
    }).catch(e => setErr(e.message));
  }, [open, persona, err, endpoint, qs]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput(''); setSugs([]); setBusy(true);
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

  const dark = theme === 'dark';
  const C = dark
    ? { panel: 'rgba(14,16,28,.96)', border: 'rgba(255,255,255,.1)', ink: '#eef0ff', ink3: 'rgba(238,240,255,.55)', me: 'linear-gradient(120deg,#6a5cff,#8b5cf6)', them: 'rgba(255,255,255,.07)', chip: 'rgba(106,92,255,.16)', chipInk: '#c9c3ff', input: 'rgba(255,255,255,.06)' }
    : { panel: '#ffffff', border: '#e8eaf2', ink: '#1f2233', ink3: '#8a8fa3', me: 'linear-gradient(120deg,#6055f5,#8b5cf6)', them: '#f4f5fa', chip: 'rgba(96,85,245,.08)', chipInk: '#5b50e6', input: '#f7f8fb' };
  const name = persona?.name || fallbackName || '我';
  const avatar = persona?.avatar || fallbackAvatar || null;

  /** 回答里的 [J1] → 上标链接 */
  const render = (m: Msg) => {
    const parts = m.content.split(/(\[[JSTDC]\d+\])/g);
    return parts.map((p, i) => {
      const hit = p.match(/^\[([JSTDC]\d+)\]$/);
      if (!hit) return <React.Fragment key={i}>{p}</React.Fragment>;
      const s = m.sources?.find(x => x.id === hit[1]);
      return <sup key={i} title={s?.title} style={{ color: C.chipInk, fontWeight: 600, cursor: s?.url ? 'pointer' : 'default', margin: '0 1px' }}
        onClick={() => s?.url && window.open(s.url, '_blank')}>{hit[1]}</sup>;
    });
  };
  const Avatar = ({ size }: { size: number }) => avatar
    ? <img src={avatar} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `2px solid ${dark ? 'rgba(255,255,255,.25)' : '#fff'}` }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: C.me, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.42, flexShrink: 0 }}>{name.slice(0, 1)}</div>;

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="和我聊"
          style={{ position: 'fixed', right: 22, bottom, zIndex: 1000, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px 8px 8px', borderRadius: 999, border: 0, cursor: 'pointer',
            background: C.me, color: '#fff', boxShadow: '0 10px 30px rgba(96,85,245,.45)', fontFamily: 'inherit' }}>
          <Avatar size={40} />
          <span style={{ textAlign: 'left', lineHeight: 1.25 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 800 }}>和我聊</span>
            <span style={{ display: 'block', fontSize: 11.5, opacity: .85 }}>聊聊这一行</span>
          </span>
        </button>
      )}
      {open && (
        <div style={{ position: 'fixed', right: 16, bottom: 16, top, width: 'min(420px, calc(100vw - 32px))', zIndex: 1000, display: 'flex', flexDirection: 'column',
          background: C.panel, color: C.ink, border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: '0 20px 60px rgba(0,0,0,.35)', backdropFilter: 'blur(14px)', overflow: 'hidden', fontFamily: 'inherit' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
            <Avatar size={46} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{name}</div>
              <div style={{ fontSize: 12, color: C.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{persona?.role || ''}{occName ? ` · 聊聊${occName}这一行` : ' · 聊聊这一行'}</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="收起" style={{ background: 'transparent', border: 0, color: C.ink3, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>

          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {err && <div style={{ color: C.ink3, fontSize: 13, textAlign: 'center', marginTop: 40 }}>{err}</div>}
            {!err && !persona && <div style={{ color: C.ink3, fontSize: 13, textAlign: 'center', marginTop: 40 }}>{name}正在过来…</div>}
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end' }}>
                {m.role === 'assistant' && <Avatar size={28} />}
                <div style={{ maxWidth: '82%' }}>
                  <div style={{ padding: '10px 13px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                    background: m.role === 'user' ? C.me : C.them, color: m.role === 'user' ? '#fff' : C.ink }}>{m.role === 'assistant' ? render(m) : m.content}</div>
                  {!!m.sources?.length && <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {m.sources.map(s => (
                      <a key={s.id} href={s.url || undefined} target="_blank" rel="noreferrer" onClick={e => { if (!s.url) e.preventDefault(); }}
                        style={{ fontSize: 11.5, color: C.ink3, textDecoration: 'none', display: 'flex', gap: 6, alignItems: 'baseline', cursor: s.url ? 'pointer' : 'default' }}>
                        <span style={{ color: C.chipInk, fontWeight: 700, minWidth: 22 }}>{s.id}</span>
                        <span style={{ padding: '0 6px', borderRadius: 4, background: C.chip, color: C.chipInk, fontSize: 10.5, flexShrink: 0 }}>{TYPE_LABEL[s.type] || s.type}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                      </a>
                    ))}
                  </div>}
                </div>
              </div>
            ))}
            {busy && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Avatar size={28} /><span style={{ color: C.ink3, fontSize: 13 }}>{name}在想…</span></div>}
          </div>

          {!!sugs.length && !busy && <div style={{ padding: '0 14px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sugs.map(s => <button key={s} onClick={() => ask(s)} style={{ border: 0, borderRadius: 999, padding: '6px 11px', fontSize: 12.5, cursor: 'pointer', background: C.chip, color: C.chipInk, fontFamily: 'inherit', textAlign: 'left' }}>{s}</button>)}
          </div>}
          <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${C.border}` }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) ask(input); }}
              placeholder={`问问${name}…`} disabled={!persona || busy}
              style={{ flex: 1, border: `1px solid ${C.border}`, background: C.input, color: C.ink, borderRadius: 12, padding: '10px 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
            <button onClick={() => ask(input)} disabled={!persona || busy || !input.trim()}
              style={{ border: 0, borderRadius: 12, padding: '0 16px', background: C.me, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: !persona || busy || !input.trim() ? 0.5 : 1, fontFamily: 'inherit' }}>发送</button>
          </div>
        </div>
      )}
    </>
  );
}
