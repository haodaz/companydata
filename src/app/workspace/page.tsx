'use client';

/**
 * 百业 ToB 工作台 /workspace（2026-10-20）：照 Claude 的骨架——左侧栏（新对话 + 功能入口 + 最近对话）、中间 AI 总控对话、右侧产物面板。
 * 企业用户绑定一家企业，AI 只围绕自己企业干活（工具层把关，见 src/lib/ws/tools.ts）。底色是淡淡的纸张色。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { App, ConfigProvider } from 'antd';
import { Md } from '@/components/ws/Md';
import { ArtifactPanel, artKey, type Art } from '@/components/ws/Artifact';
import { MODEL_OPTIONS } from '@/lib/model-options';

type Org = { id: string; name: string; company_id: number | null; company_name: string | null; role: string };
type Item =
  | { k: 'user'; text: string }
  | { k: 'text'; text: string }
  | { k: 'tool'; id: string; name: string; input: any; label?: string; ui?: any; error?: string; running: boolean; t0: number }
  | { k: 'ask'; id: string; question: string; options: string[]; answered?: string }
  | { k: 'error'; text: string };
type View = 'chat' | 'roles' | 'work' | 'spaces' | 'people';

const TOOL_RUNNING: Record<string, string> = { org_profile: '读企业画像', list_roles: '查本企业岗位', propose_problems: '从企业动态和岗位职责里找业务问题', create_work_task: '出真活：任务书、材料包、评分标准（1–2 分钟）', run_baseline: 'AI 先做一遍当基线（约 1 分钟）', list_work_tasks: '列本企业的真活', work_results: '看作答和报告', create_space: '准备建职业空间', list_spaces: '列本企业的职业空间' };
const CHAT_MODELS = MODEL_OPTIONS.filter(m => /^(claude-|gpt-|gemini-|qwen)/.test(m.id));
const DEFAULT_MODEL = 'claude-opus-5-5';
const SUGGEST = [
  { t: '出一道真活', d: '给一个在招岗位出一道此刻真实的业务题，看候选人怎么干', p: '帮我给一个岗位出一道真活' },
  { t: '建一个职业空间', d: '给岗位建数字职人和一天的练习，新人带教用', p: '帮我给一个岗位建职业空间，给新人练手' },
  { t: '看谁做得好', d: '汇总真活的作答，对比候选人，给录用建议', p: '最近的真活谁做得最好？帮我对比一下' },
  { t: '了解我们企业', d: '看平方数据里本企业的画像、动态和在招岗位', p: '平方数据里我们企业现在是什么样？' },
];

export default function WorkspacePage() {
  return <ConfigProvider theme={{ token: { colorPrimary: '#4f46c8', borderRadius: 10, fontFamily: "'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" } }}><App><Inner /></App></ConfigProvider>;
}

function Inner() {
  const [org, setOrg] = useState<Org | null | undefined>(undefined);
  const [user, setUser] = useState<{ email: string; role: string } | null>(null);
  const [bootErr, setBootErr] = useState('');
  const [view, setView] = useState<View>('chat');
  const [threads, setThreads] = useState<any[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [art, setArt] = useState<Art | null>(null);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [side, setSide] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { try { const m = localStorage.getItem('ws:model'); if (m && CHAT_MODELS.some(x => x.id === m)) setModel(m); } catch {} }, []);
  const loadOrg = useCallback(async () => {
    const r = await fetch('/api/ws/org'); if (r.status === 401) { location.href = '/lab/login?next=/workspace'; return; }
    const j = await r.json(); if (!j.ok) { setBootErr(j.error); setOrg(null); return; } setUser(j.user); setOrg(j.org);
  }, []);
  const loadThreads = useCallback(async () => { const j = await (await fetch('/api/ws/threads')).json(); if (j.ok) setThreads(j.threads); }, []);
  useEffect(() => { loadOrg(); }, [loadOrg]);
  useEffect(() => { if (org) loadThreads(); }, [org, loadThreads]);

  const openThread = async (id: string) => {
    abortRef.current?.abort(); setBusy(false); setView('chat'); setThreadId(id); setItems([]); setArt(null);
    const j = await (await fetch(`/api/ws/threads/${id}`)).json(); if (!j.ok) return;
    setItems(fromHistory(j.thread.messages || []));
    const lastArt = [...(j.thread.messages || [])].reverse().flatMap((m: any) => (m.role === 'tool' ? [...m.results].reverse() : [])).find((r: any) => r.ui && r.ui.kind !== 'problems');
    if (lastArt) setArt(lastArt.ui);
  };
  const newChat = () => { abortRef.current?.abort(); setBusy(false); setView('chat'); setThreadId(null); setItems([]); setArt(null); };

  const send = async (text: string) => {
    const t = text.trim(); if (!t || busy) return;
    setView('chat'); setBusy(true);
    setItems(it => [...it.map(x => (x.k === 'ask' && !x.answered ? { ...x, answered: t } : x)), { k: 'user', text: t }]);
    const ac = new AbortController(); abortRef.current = ac;
    try {
      const res = await fetch('/api/ws/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: threadId, text: t, model }), signal: ac.signal });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); setItems(it => [...it, { k: 'error', text: j.error || `出错了（${res.status}）` }]); return; }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let nl;
        while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (line.trim()) onEvent(JSON.parse(line)); }
      }
    } catch (e: any) { if (e?.name !== 'AbortError') setItems(it => [...it, { k: 'error', text: e.message }]); }
    finally { setBusy(false); setItems(it => it.map(x => (x.k === 'tool' && x.running ? { ...x, running: false, label: x.label || '中断了' } : x))); loadThreads(); }
  };
  const onEvent = (e: any) => {
    if (e.t === 'thread') { setThreadId(e.id); return; }
    if (e.t === 'text') setItems(it => { const last = it[it.length - 1]; return last?.k === 'text' ? [...it.slice(0, -1), { k: 'text', text: last.text + e.delta }] : [...it, { k: 'text', text: e.delta }]; });
    else if (e.t === 'tool_start') setItems(it => [...it, { k: 'tool', id: e.id, name: e.name, input: e.input, running: true, t0: Date.now() }]);
    else if (e.t === 'tool_end') { setItems(it => it.map(x => (x.k === 'tool' && x.id === e.id ? { ...x, running: false, label: e.label, ui: e.ui, error: e.error } : x))); if (e.ui && e.ui.kind !== 'problems') setArt(e.ui); }
    else if (e.t === 'ask') setItems(it => [...it, { k: 'ask', id: e.id, question: e.question, options: e.options }]);
    else if (e.t === 'error') setItems(it => [...it, { k: 'error', text: e.message }]);
  };
  const stop = () => { abortRef.current?.abort(); };

  if (org === undefined) return <Shell><div className="ws-center ws-muted">加载中…</div></Shell>;
  if (!org) return <Shell><Onboard err={bootErr} onDone={o => setOrg(o)} /></Shell>;

  return (
    <Shell>
      <div className={`ws-root${art ? ' with-art' : ''}${side ? '' : ' no-side'}`}>
        <Sidebar org={org} user={user} view={view} setView={v => { setView(v); if (v !== 'chat') setArt(null); }} threads={threads} threadId={threadId} openThread={openThread} newChat={newChat} onHide={() => setSide(false)} />
        <main className="ws-main">
          {!side && <button className="ws-ghost ws-showside" onClick={() => setSide(true)} aria-label="展开侧栏">☰</button>}
          {view === 'chat'
            ? <Chat org={org} items={items} busy={busy} send={send} stop={stop} model={model} setModel={m => { setModel(m); try { localStorage.setItem('ws:model', m); } catch {} }} openArt={setArt} activeArt={art ? artKey(art) : ''} />
            : <Lists view={view} org={org} openArt={setArt} ask={p => { newChat(); setTimeout(() => send(p), 0); }} />}
        </main>
        {art && <ArtifactPanel key={artKey(art)} art={art} onClose={() => setArt(null)} />}
      </div>
    </Shell>
  );
}

/** 存着的历史 → 界面条目 */
function fromHistory(ms: any[]): Item[] {
  const res = new Map<string, any>(); for (const m of ms) if (m.role === 'tool') for (const r of m.results) res.set(r.id, r);
  const out: Item[] = [];
  for (const m of ms) {
    if (m.role === 'user') out.push({ k: 'user', text: m.text });
    else if (m.role === 'assistant') {
      if (m.text) out.push({ k: 'text', text: m.text });
      for (const c of m.calls || []) {
        const r = res.get(c.id);
        if (c.name === 'ask_user') { const a = r ? (() => { try { return JSON.parse(r.content).answer; } catch { return '已回答'; } })() : undefined; out.push({ k: 'ask', id: c.id, question: c.input?.question || '', options: c.input?.options || [], answered: a }); if (a) out.push({ k: 'user', text: a }); }
        else out.push({ k: 'tool', id: c.id, name: c.name, input: c.input, label: r?.label, ui: r?.ui, error: r?.is_error ? (() => { try { return JSON.parse(r.content).error; } catch { return '出错了'; } })() : undefined, running: false, t0: 0 });
      }
    }
  }
  return out;
}

function Sidebar({ org, user, view, setView, threads, threadId, openThread, newChat, onHide }: { org: Org; user: any; view: View; setView: (v: View) => void; threads: any[]; threadId: string | null; openThread: (id: string) => void; newChat: () => void; onHide: () => void }) {
  const NAV: [View, string, string][] = [['chat', '对话', 'M4 5h16v11H8l-4 4z'], ['roles', '岗位', 'M4 7h16v12H4zM9 7V5h6v2'], ['work', '真活', 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5'], ['spaces', '职业空间', 'M12 3l8 4.5v9L12 21l-8-4.5v-9z'], ['people', '候选人', 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M17 11a2.5 2.5 0 1 0 0-5M21 19c0-2-1.5-3.5-4-4']];
  return (
    <nav className="ws-side">
      <div className="ws-side-top">
        <div className="ws-brand"><span className="ws-brand-mark">百</span><span>百业 AI <span className="ws-muted" style={{ fontWeight: 400 }}>企业版</span></span></div>
        <button className="ws-ghost" onClick={onHide} aria-label="收起侧栏" title="收起侧栏">⟨</button>
      </div>
      <div className="ws-org"><div className="ws-org-avatar">{org.name.slice(0, 1)}</div><div style={{ minWidth: 0 }}><div className="ws-org-name">{org.name}</div><div className="ws-cap">{org.role === 'owner' ? '管理员' : org.role === 'admin' ? '平台管理员' : '成员'}</div></div></div>
      <button className="ws-new" onClick={newChat}><span style={{ fontSize: 17, lineHeight: 1 }}>＋</span> 新对话</button>
      <div className="ws-sec">功能</div>
      {NAV.map(([v, t, d]) => <button key={v} className={`ws-nav${view === v ? ' on' : ''}`} onClick={() => (v === 'chat' ? newChat() : setView(v))}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>{t}</button>)}
      <div className="ws-sec">最近</div>
      <div className="ws-recents">
        {threads.length ? threads.map(t => <button key={t.id} className={`ws-recent${t.id === threadId && view === 'chat' ? ' on' : ''}`} onClick={() => openThread(t.id)} title={t.title}>{t.title || '未命名对话'}</button>) : <div className="ws-muted" style={{ padding: '4px 10px', fontSize: 12.5 }}>还没有对话</div>}
      </div>
      <div className="ws-side-foot">
        <div className="ws-muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
        <div style={{ display: 'flex', gap: 10, fontSize: 12 }}><Link href="/lab" className="ws-link">百业</Link><Link href="/work" className="ws-link">真活</Link></div>
      </div>
    </nav>
  );
}

function Chat({ org, items, busy, send, stop, model, setModel, openArt, activeArt }: { org: Org; items: Item[]; busy: boolean; send: (t: string) => void; stop: () => void; model: string; setModel: (m: string) => void; openArt: (a: Art) => void; activeArt: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [items]);
  const empty = !items.length;
  const hour = new Date().getHours(); const hello = hour < 11 ? '上午好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  const pendingAsk = [...items].reverse().find(x => x.k === 'ask' && !x.answered) as Extract<Item, { k: 'ask' }> | undefined;
  return (
    <div className={`ws-chat${empty ? ' empty' : ''}`}>
      {empty ? (
        <div className="ws-hero">
          <h1 className="ws-hello">{hello}，{org.name}</h1>
          <div className="ws-muted" style={{ marginBottom: 22, fontSize: 15 }}>招人、带人、看团队：说一句，AI 帮你干。</div>
          <Composer busy={busy} send={send} stop={stop} model={model} setModel={setModel} autoFocus />
          <div className="ws-sec" style={{ margin: '26px 2px 10px' }}>可以从这里开始</div>
          <div className="ws-suggest">{SUGGEST.map(s => <button key={s.t} className="ws-card" onClick={() => send(s.p)}><div style={{ fontWeight: 650, marginBottom: 4 }}>{s.t}</div><div className="ws-muted" style={{ fontSize: 13, lineHeight: 1.55 }}>{s.d}</div></button>)}</div>
        </div>
      ) : (
        <>
          <div className="ws-thread">
            {items.map((x, i) => <Row key={i} x={x} send={send} busy={busy} openArt={openArt} activeArt={activeArt} />)}
            {busy && !(items[items.length - 1]?.k === 'tool' && (items[items.length - 1] as any).running) && <div className="ws-typing"><i /><i /><i /></div>}
            <div ref={endRef} style={{ height: 8 }} />
          </div>
          <div className="ws-dock"><Composer busy={busy} send={send} stop={stop} model={model} setModel={setModel} placeholder={pendingAsk ? '选上面一个，或者直接说你的想法…' : '接着说…'} /></div>
        </>
      )}
    </div>
  );
}

function Row({ x, send, busy, openArt, activeArt }: { x: Item; send: (t: string) => void; busy: boolean; openArt: (a: Art) => void; activeArt: string }) {
  const [open, setOpen] = useState(false); const [, tick] = useState(0);
  useEffect(() => { if (x.k === 'tool' && x.running) { const iv = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(iv); } }, [x]);
  if (x.k === 'user') return <div className="ws-user"><div className="ws-bubble">{x.text}</div></div>;
  if (x.k === 'text') return <div className="ws-ai"><Md text={x.text} /></div>;
  if (x.k === 'error') return <div className="ws-err">{x.text}</div>;
  if (x.k === 'ask') return (
    <div className="ws-ask">
      <div style={{ fontWeight: 600, marginBottom: 10 }}>{x.question}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {x.options.map((o, i) => <button key={i} className={`ws-opt${x.answered === o ? ' on' : ''}`} disabled={!!x.answered || busy} onClick={() => send(o)}><span className="ws-opt-n">{i + 1}</span>{o}</button>)}
      </div>
      {x.answered && !x.options.includes(x.answered) && <div className="ws-muted" style={{ marginTop: 8, fontSize: 13 }}>你回答了：{x.answered}</div>}
    </div>
  );
  const sec = x.running ? Math.round((Date.now() - x.t0) / 1000) : 0;
  const ui = x.ui;
  return (
    <div className="ws-tool">
      <button className="ws-tool-line" onClick={() => setOpen(o => !o)}>
        <span className={`ws-tool-dot${x.running ? ' run' : x.error ? ' err' : ''}`} />
        <span>{x.running ? (TOOL_RUNNING[x.name] || x.name) : x.error ? `${TOOL_RUNNING[x.name] || x.name}：${x.error}` : x.label}</span>
        {x.running && <span className="ws-muted" style={{ fontSize: 12 }}>{sec}s</span>}
        <span className="ws-muted" style={{ marginLeft: 'auto', fontSize: 11 }}>{open ? '收起' : '详情'}</span>
      </button>
      {open && <pre className="ws-tool-detail">{JSON.stringify(x.input || {}, null, 2)}</pre>}
      {ui?.kind === 'problems' && <div className="ws-problems">{ui.items.map((p: any, i: number) => (
        <button key={i} className="ws-card ws-problem" disabled={busy} onClick={() => send(`就第 ${i + 1} 个：${p.title}——${p.statement}`)}>
          <div className="ws-cap">候选 {i + 1}</div><div style={{ fontWeight: 650, margin: '3px 0 6px' }}>{p.title}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{p.statement}</div>
          {p.why_now && <div className="ws-muted" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.55 }}>为什么是现在：{p.why_now}</div>}
          {!!p.evidence?.length && <div className="ws-muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>依据：{p.evidence.join('；')}</div>}
        </button>))}</div>}
      {ui && ui.kind !== 'problems' && <button className={`ws-artchip${activeArt === artKey(ui) ? ' on' : ''}`} onClick={() => openArt(ui)}>
        <span className="ws-artchip-ico">{ui.kind === 'space_build' || ui.kind === 'space' ? '◇' : ui.kind === 'results' ? '≡' : '▤'}</span>
        <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ui.title}</span><span className="ws-muted" style={{ fontSize: 12 }}>{ui.kind === 'work' ? '真活 · 任务书、材料包、评分标准、AI 基线' : ui.kind === 'results' ? '作答与报告' : '职业空间'}</span></span>
        <span className="ws-muted" style={{ marginLeft: 'auto', fontSize: 12 }}>打开 →</span>
      </button>}
    </div>
  );
}

function Composer({ busy, send, stop, model, setModel, placeholder, autoFocus }: { busy: boolean; send: (t: string) => void; stop: () => void; model: string; setModel: (m: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const [v, setV] = useState(''); const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(220, el.scrollHeight) + 'px'; }, [v]);
  const go = () => { if (!v.trim() || busy) return; send(v); setV(''); };
  return (
    <div className="ws-composer">
      <textarea ref={ta} value={v} autoFocus={autoFocus} rows={1} placeholder={placeholder || '比如：给供应链计划岗出一道真活'} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); go(); } }} />
      <div className="ws-composer-bar">
        <select className="ws-model" value={model} onChange={e => setModel(e.target.value)} title="总控用哪个模型">{CHAT_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        <span className="ws-muted" style={{ fontSize: 12, marginLeft: 8 }}>只围绕本企业</span>
        {busy ? <button className="ws-send stop" onClick={stop} aria-label="停止">■</button> : <button className="ws-send" onClick={go} disabled={!v.trim()} aria-label="发送">↑</button>}
      </div>
    </div>
  );
}

function Lists({ view, org, openArt, ask }: { view: View; org: Org; openArt: (a: Art) => void; ask: (p: string) => void }) {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { setD(null); fetch('/api/ws/overview').then(r => r.json()).then(j => (j.ok ? setD(j) : setErr(j.error))).catch(e => setErr(e.message)); }, [view]);
  const T: Record<string, [string, string]> = { roles: ['岗位', '本企业在平方岗位库里的岗位，以及出过真活、建过空间的岗位'], work: ['真活', '本企业出过的真活：参与链接发给候选人就能做'], spaces: ['职业空间', '本企业的数字职人与一天的练习，新人带教用'], people: ['候选人', '做过本企业真活的人和他们的分数'] };
  const [title, sub] = T[view];
  const fmt = (s: string) => (s ? new Date(s).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '');
  return (
    <div className="ws-page">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 18 }}>
        <div><h1 className="ws-title">{title}</h1><div className="ws-muted">{sub}</div></div>
        <button className="ws-primary" style={{ marginLeft: 'auto' }} onClick={() => ask(view === 'spaces' ? '帮我给一个岗位建职业空间' : view === 'people' ? '最近的真活谁做得最好？帮我对比一下' : '帮我给一个岗位出一道真活')}>{view === 'spaces' ? '建一个职业空间' : view === 'people' ? '让 AI 对比' : '出一道真活'}</button>
      </div>
      {err && <div className="ws-err">{err}</div>}
      {!d && !err && <div className="ws-muted">加载中…</div>}
      {d && view === 'roles' && <Table empty="岗位库里还没有本企业的岗位；在对话里直接说岗位名也能出题、建空间" head={['岗位', '职能', '城市', '真活', '空间', '']} rows={d.roles.map((r: any) => [<b key="t">{r.title}</b>, r.function || '—', r.city || '—', r.work || '—', r.spaces || '—', <span key="a" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}><button className="ws-ghost sm" onClick={() => ask(`给「${r.title}」出一道真活`)}>出真活</button><button className="ws-ghost sm" onClick={() => ask(`给「${r.title}」建一个职业空间，新人带教用`)}>建空间</button></span>])} />}
      {d && view === 'work' && <Table empty="还没有出过真活" head={['真活', '岗位', '参与 / 交卷', 'AI 基线', '日期']} rows={d.work.map((w: any) => [<a key="t" className="ws-rowlink" onClick={() => openArt({ kind: 'work', id: w.id, token: w.token, owner_key: w.owner_key, title: w.title })}>{w.title}</a>, w.role, `${w.joined} / ${w.submitted}`, w.baseline ?? '—', fmt(w.created_at)])} />}
      {d && view === 'spaces' && <Table empty="还没有建过职业空间" head={['职业空间', '岗位', '日期']} rows={d.spaces.map((s: any) => [<a key="t" className="ws-rowlink" onClick={() => openArt({ kind: 'space', id: s.id, title: s.title })}>{s.title}</a>, s.role || '—', fmt(s.created_at)])} />}
      {d && view === 'people' && <Table empty="还没有人做过本企业的真活" head={['姓名', '真活', '状态', '分数', '一句话']} rows={d.people.map((p: any) => [<b key="n">{p.name || '—'}</b>, <a key="t" className="ws-rowlink" onClick={() => openArt({ kind: 'results', task_id: p.task_id, token: p.token, owner_key: p.owner_key, title: p.task })}>{p.task}</a>, p.auditing ? 'AI 审计中' : p.submitted ? '已交卷' : '做题中', p.score ?? '—', <span key="s" className="ws-muted" style={{ fontSize: 12.5 }}>{p.summary || '—'}</span>])} />}
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <div className="ws-emptybox">{empty}</div>;
  return <div className="ws-table"><table><thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>;
}

function Onboard({ err, onDone }: { err: string; onDone: (o: Org) => void }) {
  const [q, setQ] = useState(''); const [list, setList] = useState<any[]>([]); const [pick, setPick] = useState<any>(null); const [busy, setBusy] = useState(false); const [e2, setE2] = useState('');
  useEffect(() => { if (!q.trim() || pick?.name === q) { setList([]); return; } const t = setTimeout(async () => { const j = await (await fetch(`/api/work/companies?q=${encodeURIComponent(q)}`)).json(); setList(j.companies || []); const exact = (j.companies || []).find((c: any) => c.name === q.trim() || c.brief_name === q.trim()); if (exact) setPick(exact); }, 250); return () => clearTimeout(t); }, [q]);   // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => {
    setBusy(true); setE2('');
    const j = await (await fetch('/api/ws/org', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pick ? { name: pick.brief_name || pick.name, company_id: pick.id, company_name: pick.name } : { name: q.trim() }) })).json();
    setBusy(false); if (!j.ok) { setE2(j.error); return; } onDone(j.org);
  };
  return (
    <div className="ws-center">
      <div style={{ width: 'min(520px, 92vw)' }}>
        <div className="ws-brand" style={{ marginBottom: 26 }}><span className="ws-brand-mark">百</span><span>百业 AI <span className="ws-muted" style={{ fontWeight: 400 }}>企业版</span></span></div>
        <h1 className="ws-hello" style={{ fontSize: 30 }}>你在哪家企业？</h1>
        <div className="ws-muted" style={{ margin: '6px 0 20px', lineHeight: 1.7 }}>工作台围绕你自己的企业干活：用平方数据里本企业的画像、动态和岗位来出真活、建职业空间。库里搜得到就选上；搜不到也可以，按新企业建。</div>
        {err && <div className="ws-err" style={{ marginBottom: 12 }}>{err}</div>}
        <input className="ws-input" value={q} onChange={e => { setQ(e.target.value); setPick(null); }} placeholder="输入企业名，比如 宁德时代" autoFocus />
        {!!list.length && !pick && <div className="ws-pick">{list.slice(0, 6).map(c => <button key={c.id} onClick={() => { setPick(c); setQ(c.name); setList([]); }}><b>{c.name}</b><span className="ws-muted"> {[c.industry, c.city].filter(Boolean).join(' · ')}{c.jobs ? ` · 在招 ${c.jobs}` : ''}</span></button>)}</div>}
        <div className="ws-muted" style={{ fontSize: 12.5, margin: '8px 2px 18px' }}>{pick ? `已匹配平方企业库：${pick.name}${pick.has_profile ? ' · 有企业画像' : ''}${pick.jobs ? ` · 在招 ${pick.jobs} 个岗位` : ''}` : q.trim() ? '库里没有完全一样的名字，会按新企业建（企业事实会少一些）' : ''}</div>
        <button className="ws-primary" disabled={!q.trim() || busy} onClick={go} style={{ width: '100%', height: 44 }}>{busy ? '正在建…' : '进入工作台'}</button>
        {e2 && <div className="ws-err" style={{ marginTop: 10 }}>{e2}</div>}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="ws">{children}<style>{CSS}</style></div>;
}

const CSS = `
.ws { --paper:#faf9f5; --side:#f2f0e9; --card:#fffefb; --line:#e6e2d6; --line2:#efece3; --ink:#26241f; --ink2:#5d5950; --ink3:#918c80; --accent:#4f46c8; --accent-soft:#ecebfa; --hover:#e9e6dc;
  min-height:100dvh; background:var(--paper); color:var(--ink); font-family:'PingFang SC',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14.5px; }
.ws * { box-sizing:border-box; }
.ws-muted { color:var(--ink3); }
.ws-cap { font-size:11.5px; color:var(--ink3); letter-spacing:.02em; }
.ws-center { min-height:100dvh; display:grid; place-items:center; padding:24px; }
.ws-root { display:grid; grid-template-columns:260px minmax(0,1fr); height:100dvh; transition:grid-template-columns .25s; }
.ws-root.with-art { grid-template-columns:260px minmax(0,1fr) minmax(420px,46%); }
.ws-root.no-side { grid-template-columns:0 minmax(0,1fr); }
.ws-root.no-side.with-art { grid-template-columns:0 minmax(0,1fr) minmax(420px,46%); }
.ws-root.no-side .ws-side { visibility:hidden; }
.ws-side { background:var(--side); border-right:1px solid var(--line); display:flex; flex-direction:column; padding:12px 10px; overflow:hidden; min-width:0; }
.ws-side-top { display:flex; align-items:center; justify-content:space-between; padding:4px 6px 12px; }
.ws-brand { display:flex; align-items:center; gap:9px; font-weight:700; font-size:15px; }
.ws-brand-mark { width:26px; height:26px; border-radius:8px; background:var(--ink); color:#faf9f5; display:grid; place-items:center; font-size:13px; font-family:var(--font-serif-sc),'Songti SC',serif; }
.ws-org { display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:12px; background:var(--card); border:1px solid var(--line); margin-bottom:10px; }
.ws-org-avatar { width:30px; height:30px; border-radius:9px; background:var(--accent-soft); color:var(--accent); display:grid; place-items:center; font-weight:700; flex-shrink:0; }
.ws-org-name { font-weight:650; font-size:13.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ws-new { display:flex; align-items:center; gap:8px; width:100%; padding:9px 10px; border-radius:10px; border:0; background:transparent; color:var(--ink); font-size:14px; font-weight:600; cursor:pointer; text-align:left; }
.ws-new:hover, .ws-nav:hover, .ws-recent:hover { background:var(--hover); }
.ws-sec { font-size:11.5px; color:var(--ink3); padding:14px 10px 6px; letter-spacing:.04em; }
.ws-nav { display:flex; align-items:center; gap:10px; width:100%; padding:7px 10px; border-radius:9px; border:0; background:transparent; color:var(--ink2); font-size:14px; cursor:pointer; text-align:left; }
.ws-nav.on { background:var(--hover); color:var(--ink); font-weight:600; }
.ws-recents { flex:1; overflow-y:auto; min-height:0; }
.ws-recent { display:block; width:100%; padding:6px 10px; border-radius:8px; border:0; background:transparent; color:var(--ink2); font-size:13.5px; cursor:pointer; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ws-recent.on { background:var(--hover); color:var(--ink); }
.ws-side-foot { border-top:1px solid var(--line); padding:10px 8px 2px; display:flex; flex-direction:column; gap:6px; }
.ws-link { color:var(--ink2); text-decoration:none; } .ws-link:hover { color:var(--ink); text-decoration:underline; }
.ws-main { position:relative; min-width:0; overflow:hidden; display:flex; flex-direction:column; }
.ws-showside { position:absolute; left:12px; top:12px; z-index:2; }
.ws-ghost { border:1px solid transparent; background:transparent; color:var(--ink2); border-radius:8px; padding:5px 9px; cursor:pointer; font-size:13px; text-decoration:none; white-space:nowrap; }
.ws-ghost:hover { background:var(--hover); color:var(--ink); }
.ws-ghost.sm { border-color:var(--line); padding:3px 9px; font-size:12.5px; }
.ws-primary { border:0; background:var(--ink); color:#faf9f5; border-radius:10px; padding:9px 16px; font-weight:600; font-size:14px; cursor:pointer; }
.ws-primary:disabled { opacity:.45; cursor:default; }
.ws-chat { flex:1; display:flex; flex-direction:column; min-height:0; }
.ws-chat.empty { justify-content:center; overflow-y:auto; }
.ws-hero { width:min(720px,92%); margin:0 auto; padding:40px 0 60px; }
.ws-hello { font-family:var(--font-serif-sc),'Songti SC',serif; font-weight:600; font-size:36px; letter-spacing:.01em; margin:0 0 8px; }
.ws-suggest { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
.ws-card { text-align:left; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px 16px; cursor:pointer; color:var(--ink); font-size:14px; transition:border-color .15s, box-shadow .15s; }
.ws-card:hover:not(:disabled) { border-color:#cfc9b8; box-shadow:0 4px 14px rgba(60,50,20,.06); }
.ws-card:disabled { cursor:default; opacity:.7; }
.ws-thread { flex:1; overflow-y:auto; padding:28px 0 12px; }
.ws-thread > * { width:min(760px,92%); margin-left:auto; margin-right:auto; }
.ws-dock { padding:8px 0 18px; } .ws-dock > * { width:min(760px,92%); margin:0 auto; }
.ws-user { display:flex; justify-content:flex-end; margin:14px auto; }
.ws-bubble { background:#ede9df; border-radius:16px; padding:10px 14px; max-width:80%; white-space:pre-wrap; line-height:1.65; }
.ws-ai { margin:10px auto 6px; line-height:1.8; font-size:15px; }
.ws-md p { margin:0 0 10px; } .ws-md ul, .ws-md ol { margin:0 0 10px; padding-left:22px; } .ws-md li { margin:2px 0; }
.ws-md .ws-h { font-weight:700; margin:14px 0 6px; } .ws-md a { color:var(--accent); }
.ws-code { background:#efece3; border-radius:5px; padding:1px 5px; font-size:.92em; font-family:ui-monospace,Menlo,monospace; }
.ws-err { color:#a33a2b; background:#fbeeea; border:1px solid #f1d6cf; border-radius:10px; padding:9px 12px; margin:10px auto; font-size:13.5px; }
.ws-tool { margin:6px auto; }
.ws-tool-line { display:flex; align-items:center; gap:9px; width:100%; border:1px solid var(--line2); background:transparent; border-radius:10px; padding:7px 11px; color:var(--ink2); font-size:13.5px; cursor:pointer; text-align:left; }
.ws-tool-line:hover { background:#f4f2eb; }
.ws-tool-dot { width:8px; height:8px; border-radius:50%; background:#5aa476; flex-shrink:0; }
.ws-tool-dot.run { background:var(--accent); animation:wspulse 1.2s ease-in-out infinite; }
.ws-tool-dot.err { background:#c0533f; }
@keyframes wspulse { 0%,100% { box-shadow:0 0 0 0 rgba(79,70,200,.35) } 50% { box-shadow:0 0 0 5px rgba(79,70,200,0) } }
.ws-tool-detail { margin:6px 0 0; background:#f4f2eb; border-radius:10px; padding:10px 12px; font-size:12px; color:var(--ink2); overflow:auto; max-height:200px; }
.ws-problems { display:grid; gap:8px; margin-top:8px; }
.ws-problem { padding:12px 14px; }
.ws-artchip { display:flex; align-items:center; gap:12px; width:100%; margin-top:8px; border:1px solid var(--line); background:var(--card); border-radius:12px; padding:10px 14px; cursor:pointer; text-align:left; color:var(--ink); font-size:14px; }
.ws-artchip:hover, .ws-artchip.on { border-color:#bdb6a2; }
.ws-artchip-ico { width:34px; height:34px; border-radius:9px; background:var(--accent-soft); color:var(--accent); display:grid; place-items:center; font-size:16px; flex-shrink:0; }
.ws-ask { border:1px solid var(--line); background:var(--card); border-radius:14px; padding:14px 16px; margin:10px auto; }
.ws-opt { display:flex; align-items:center; gap:10px; border:1px solid var(--line); background:var(--paper); border-radius:10px; padding:9px 12px; text-align:left; cursor:pointer; color:var(--ink); font-size:14px; line-height:1.5; }
.ws-opt:hover:not(:disabled) { border-color:#bdb6a2; background:#fff; }
.ws-opt:disabled { cursor:default; opacity:.6; } .ws-opt.on { opacity:1; border-color:var(--accent); background:var(--accent-soft); }
.ws-opt-n { width:22px; height:22px; border-radius:6px; background:#ece8de; display:grid; place-items:center; font-size:12px; color:var(--ink2); flex-shrink:0; }
.ws-typing { display:flex; gap:5px; padding:10px 2px; } .ws-typing i { width:6px; height:6px; border-radius:50%; background:var(--ink3); animation:wsdot 1.2s infinite; }
.ws-typing i:nth-child(2) { animation-delay:.15s } .ws-typing i:nth-child(3) { animation-delay:.3s }
@keyframes wsdot { 0%,80%,100% { opacity:.25 } 40% { opacity:1 } }
.ws-composer { background:#fff; border:1px solid var(--line); border-radius:18px; padding:12px 12px 8px 16px; box-shadow:0 2px 10px rgba(60,50,20,.05); }
.ws-composer:focus-within { border-color:#c9c2ae; }
.ws-composer textarea { width:100%; border:0; outline:0; resize:none; background:transparent; font:inherit; font-size:15px; line-height:1.6; color:var(--ink); min-height:26px; }
.ws-composer-bar { display:flex; align-items:center; margin-top:4px; }
.ws-model { border:0; background:transparent; color:var(--ink2); font:inherit; font-size:12.5px; cursor:pointer; padding:4px 2px; outline:0; }
.ws-send { margin-left:auto; width:32px; height:32px; border-radius:10px; border:0; background:var(--ink); color:#fff; font-size:16px; cursor:pointer; }
.ws-send:disabled { opacity:.25; cursor:default; } .ws-send.stop { background:#7a756a; font-size:11px; }
.ws-art { border-left:1px solid var(--line); background:#fffefb; display:flex; flex-direction:column; min-width:0; min-height:0; }
.ws-art-head { display:flex; align-items:center; gap:10px; padding:12px 14px 12px 18px; border-bottom:1px solid var(--line2); }
.ws-art-title { font-weight:650; font-size:15px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ws-art-body { flex:1; overflow:auto; padding:14px 18px; min-height:0; }
.ws-frame { width:100%; height:100%; min-height:70vh; border:0; border-radius:10px; background:#f5f6ff; }
.ws-build-dot { width:14px; height:14px; border-radius:50%; background:var(--accent); animation:wspulse 1.2s infinite; }
.ws-page { flex:1; overflow-y:auto; padding:36px max(28px, calc((100% - 980px) / 2)) 60px; }
.ws-title { font-family:var(--font-serif-sc),'Songti SC',serif; font-weight:600; font-size:28px; margin:0 0 4px; }
.ws-table { background:var(--card); border:1px solid var(--line); border-radius:14px; overflow:hidden; }
.ws-table table { width:100%; border-collapse:collapse; font-size:14px; }
.ws-table th { text-align:left; font-weight:500; color:var(--ink3); font-size:12.5px; padding:10px 14px; border-bottom:1px solid var(--line); background:#f7f5ef; }
.ws-table td { padding:11px 14px; border-bottom:1px solid var(--line2); vertical-align:top; }
.ws-table tr:last-child td { border-bottom:0; } .ws-table tr:hover td { background:#fbfaf6; }
.ws-rowlink { color:var(--ink); cursor:pointer; font-weight:600; text-decoration:none; } .ws-rowlink:hover { color:var(--accent); text-decoration:underline; }
.ws-emptybox { border:1px dashed #d8d2c2; border-radius:14px; padding:36px; text-align:center; color:var(--ink3); }
.ws-input { width:100%; height:46px; border:1px solid var(--line); border-radius:12px; padding:0 14px; font:inherit; font-size:15px; background:#fff; outline:0; color:var(--ink); }
.ws-input:focus { border-color:#c9c2ae; }
.ws-pick { margin-top:6px; border:1px solid var(--line); border-radius:12px; background:#fff; overflow:hidden; }
.ws-pick button { display:block; width:100%; text-align:left; border:0; background:transparent; padding:9px 14px; cursor:pointer; font-size:14px; color:var(--ink); }
.ws-pick button:hover { background:#f6f4ee; }
@media (max-width: 900px) {
  .ws-root, .ws-root.with-art { grid-template-columns:0 minmax(0,1fr); } .ws-side { visibility:hidden; }
  .ws-art { position:fixed; inset:0; z-index:20; } .ws-suggest { grid-template-columns:1fr; } .ws-hello { font-size:28px; }
}
`;
