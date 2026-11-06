'use client';

/**
 * 百业工厂 · 聊着出空间（D，2026-11-06，照真活「聊着出任务」）：AI 全包，中间边聊边改，还能替人上下架、评审、邀请老师傅。
 * 左边对话，右边是正在做的空间（工作室嵌进来，iframe 里 LabShell 不画顶栏）。
 * 对话里的卡片：lab_build 生成进度（只在这一轮新出现时发起构建，翻历史不重发；做完自动接一句 space_id 给助理）、
 * lab_revision 局部改提案（改前 / 改后，采纳才写进章节）、lab_invite 邀请老师傅的链接。
 * 对话区是主区域，应用区是它的子集（11-06，照 Claude 桌面端）：对话区右上角只放各个应用区显不显示的开关（工作室 / 体验预览）；
 * 应用区自己的标题栏上放新窗口、全屏（盖住对话）、关闭；
 * 以后同时开两种操作也往这组开关里加。开了应用区、屏不够宽就让 workspace 侧栏临时收起。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Md } from '@/components/ws/Md';
import { CHAT_CSS, Composer, fromHistory, RUNNING, type Item } from '@/components/work/ChatKit';
import { useLabNav } from '@/components/lab/FactoryKit';
import { ExternalLink, Maximize2, Minimize2, PanelRight, Play, X } from 'lucide-react';

type Panel = { space_id: string; title: string; url: string; _n?: number };
const QUICK = [
  { t: '给高中生做一个职业体验', p: '给高中生做一个【职业】的生涯体验空间。' },
  { t: '照一份 JD 做空间', p: '照这份岗位 JD 做一个空间，给【谁】用：\n' },
  { t: '改我的一个空间', p: '我那个【空间名】的空间，【哪里】不满意：' },
  { t: '看看哪些空间要改', p: '帮我看看我的空间里哪些该改、哪些可以上架了。' },
];
Object.assign(RUNNING, { locate: '定位', create_space: '准备生成', my_spaces: '找空间', space_detail: '看空间', build_day: '排一天骨架', write_chapters: '安排写章节', revise: '出修改提案', review: 'AI 评审', fix_by_review: '安排按评审改', set_spec: '改生成要求', publish_chapters: '发布章节', set_listing: '改上架状态', invite_master: '生成邀请', jobs: '看进度', open_panel: '打开' });

export default function Page() {
  const router = useRouter(); const nav = useLabNav();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<{ id: string; title: string }[]>([]);
  const [items, setItems] = useState<(Item & { live?: boolean })[]>([]);
  const [busy, setBusy] = useState(false); const [text, setText] = useState(''); const [model, setModelRaw] = useState('claude-opus-5-5');
  // 百业对话自己记模型，默认 Claude；不跟数据工厂的全局选择（那边默认千问，千问不爱按规矩出选项卡）
  useEffect(() => { try { const m = localStorage.getItem('lab-chat-model'); if (m) setModelRaw(m); } catch {} }, []);
  const setModel = (m: string) => { setModelRaw(m); try { localStorage.setItem('lab-chat-model', m); } catch {} };
  const [panel, setPanel] = useState<Panel | null>(null);   // 当前在做的空间
  const [view, setView] = useState<'studio' | 'preview' | null>(null);   // 应用区显示什么；null = 对话占满
  const show = (p: Panel) => { setPanel(p); setView(v => v || 'studio'); };
  const flip = (v: 'studio' | 'preview') => { setFull(false); setView(cur => (cur === v ? null : v)); };
  const [full, setFull] = useState(false);
  const appOpen = !!(panel && view);
  useEffect(() => { window.dispatchEvent(new CustomEvent('lws-auto-collapse', { detail: appOpen && window.innerWidth < 1680 })); }, [appOpen]);
  useEffect(() => () => { window.dispatchEvent(new CustomEvent('lws-auto-collapse', { detail: false })); }, []);
  const abortRef = useRef<AbortController | null>(null); const endRef = useRef<HTMLDivElement>(null);
  const tidRef = useRef<string | null>(null); tidRef.current = threadId;
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [items]);
  const loadThreads = useCallback(() => fetch('/api/lab/chat').then(r => r.json()).then(j => j.ok && setThreads(j.data || [])).catch(() => {}), []);
  useEffect(() => { loadThreads(); }, [loadThreads]);
  // 在 workspace（/lab/ws/chat）里：侧栏点对话带 ?thread=，首页输入框写的话放 sessionStorage lws-pending；侧栏的「新对话」发 lws-open 事件
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('thread')) { openThread(q.get('thread')!); return; }
    let p: any = null; try { p = JSON.parse(sessionStorage.getItem('lws-pending') || 'null'); sessionStorage.removeItem('lws-pending'); } catch {}
    if (p?.text) setTimeout(() => sendRef.current(p.text), 0);
    const on = (e: Event) => { const id = (e as CustomEvent).detail; if (id) openThread(id); else newChat(); };
    window.addEventListener('lws-open', on); return () => window.removeEventListener('lws-open', on);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.dispatchEvent(new CustomEvent('lws-thread', { detail: threadId })); }, [threadId]);

  const openThread = async (id: string) => {
    abortRef.current?.abort(); setBusy(false); setThreadId(id); setItems([]); setPanel(null); setView(null); setFull(false);
    const j = await (await fetch(`/api/lab/chat?id=${id}`)).json(); if (!j.ok) return;
    setItems(fromHistory(j.thread.messages || []));
    const last = [...(j.thread.messages || [])].reverse().flatMap((m: any) => (m.role === 'tool' ? [...m.results].reverse() : [])).find((r: any) => r.ui?.url);
    if (last) show(last.ui);
  };
  const newChat = () => { abortRef.current?.abort(); setBusy(false); setThreadId(null); setItems([]); setPanel(null); setView(null); };

  const onEvent = (e: any) => {
    if (e.t === 'thread') { setThreadId(e.id); return; }
    if (e.t === 'text') setItems(it => { const last = it[it.length - 1]; return last?.k === 'text' ? [...it.slice(0, -1), { k: 'text', text: last.text + e.delta }] : [...it, { k: 'text', text: e.delta }]; });
    else if (e.t === 'tool_start') setItems(it => [...it, { k: 'tool', id: e.id, name: e.name, input: e.input, running: true }]);
    else if (e.t === 'tool_end') { setItems(it => it.map(x => (x.k === 'tool' && x.id === e.id ? { ...x, running: false, label: e.label, ui: e.ui, error: e.error, live: true } : x))); if (e.ui?.url) show({ ...e.ui, _n: Date.now() }); else if (!e.error && ['publish_chapters', 'set_listing', 'set_spec'].includes(e.name)) setPanel(p => p && { ...p, _n: Date.now() }); }
    else if (e.t === 'ask') setItems(it => [...it, { k: 'ask', id: e.id, question: e.question, options: e.options }]);
    else if (e.t === 'error') setItems(it => [...it, { k: 'error', text: e.message }]);
  };
  const send = async (raw: string) => {
    const t = raw.trim(); if (!t || busy) return;
    setText(''); setBusy(true);
    setItems(it => [...it.map(x => (x.k === 'ask' && !x.answered ? { ...x, answered: t } : x)), { k: 'user', text: t }]);
    const ac = new AbortController(); abortRef.current = ac;
    try {
      const res = await fetch('/api/lab/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: tidRef.current, text: t, model }), signal: ac.signal });
      if (res.status === 401) { location.href = `/lab/login?next=${encodeURIComponent('/lab/studio/chat')}`; return; }
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); setItems(it => [...it, { k: 'error', text: j.error || `出错了（${res.status}）` }]); return; }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let nl; while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (line.trim()) onEvent(JSON.parse(line)); } }
    } catch (e: any) { if (e?.name !== 'AbortError') setItems(it => [...it, { k: 'error', text: e.message }]); }
    finally { setBusy(false); setItems(it => it.map(x => (x.k === 'tool' && x.running ? { ...x, running: false, label: x.label || '中断了' } : x))); loadThreads(); window.dispatchEvent(new Event('lws-threads')); }
  };
  const sendRef = useRef(send); sendRef.current = send; const busyRef = useRef(busy); busyRef.current = busy;

  const pendingAsk = [...items].reverse().find(x => x.k === 'ask' && !x.answered) as Extract<Item, { k: 'ask' }> | undefined;
  const composer = (hero: boolean) => <Composer text={text} setText={setText} busy={busy} send={send} stop={() => abortRef.current?.abort()} model={model} setModel={setModel} autoFocus={hero}
    placeholder={pendingAsk ? '选一个，或者直接打字回答…' : hero ? '说你要做什么：给谁做一个什么职业的体验、改哪个空间…' : '接着说…'} />;

  return (
    <div className={`lc${appOpen ? ' with-p' : ''}${nav.ws ? ' in-ws' : ''}`}>
      <style>{CHAT_CSS + CSS}</style>
      <section className="lc-chat">
        {(!nav.ws || panel) && <div className="lc-top">
          {!nav.ws && <>
            <button className="lab-btn ghost sm" onClick={() => router.push('/lab/spaces')}>← 百业工厂</button>
            <select className="lab-input lc-sel" value={threadId || ''} onChange={e => (e.target.value ? openThread(e.target.value) : newChat())}>
              <option value="">新对话</option>{threads.map(t => <option key={t.id} value={t.id}>{t.title || '对话'}</option>)}
            </select>
            {threadId && <button className="lab-btn ghost sm" onClick={newChat}>＋ 新对话</button>}
          </>}
          {panel && <div className="lc-tools">
            <button className={view === 'studio' ? 'on' : ''} onClick={() => flip('studio')} title={view === 'studio' ? '收起工作室' : '显示工作室'}><PanelRight size={17} strokeWidth={1.7} /></button>
            <button className={view === 'preview' ? 'on' : ''} onClick={() => flip('preview')} title={view === 'preview' ? '收起体验预览' : '显示体验预览（学生看到的样子）'}><Play size={16} strokeWidth={1.7} /></button>
          </div>}
        </div>}
        {!items.length ? (
          <div className="lc-hero">
            <div className="lab-mono lab-cap">FACTORY · 聊着出空间</div>
            <h1>说你要做一个什么样的空间</h1>
            <p>定位、问清要求、生成、排一天、评审、改、上架——AI 一路跟着办，关键的地方停下来问你。</p>
            {composer(true)}
            <div className="wc-quick" style={{ marginTop: 14 }}>{QUICK.map(c => <button key={c.t} onClick={() => setText(c.p)}><b>{c.t}</b><span>{c.p.replace(/\n/g, ' ')}</span></button>)}</div>
          </div>
        ) : <>
          <div className="wc-thread">
            {items.map((x, i) => {
              if (x.k === 'user') return <div key={i} className="wc-user"><div className="wc-bubble">{x.text}</div></div>;
              if (x.k === 'text') return <div key={i} className="wc-ai"><span className="wc-ava">AI</span><div className="wc-ai-body"><Md text={x.text} /></div></div>;
              if (x.k === 'tool') return <React.Fragment key={x.id}>
                <div className="wc-tool"><span className={`wc-dot${x.running ? ' run' : x.error ? ' err' : ''}`} /><span className="wc-tool-t">{x.running ? `${RUNNING[x.name] || '处理中'}…` : x.error ? `${x.label || x.name}：${x.error}` : x.label || x.name}</span>{(x.ui as any)?.url && !x.running && <button className="wc-link" onClick={() => { setPanel({ ...(x.ui as any), _n: Date.now() }); setView('studio'); }}>打开 →</button>}</div>
                {(x.ui as any)?.kind === 'lab_build' && <BuildCard ui={x.ui as any} live={!!(x as any).live} onDone={(id, title) => { show({ space_id: id, title, url: `/lab/studio/${id}`, _n: Date.now() }); if ((x as any).live) setTimeout(() => sendRef.current(`空间生成好了：space_id=${id}。`), 300); }} />}
                {(x.ui as any)?.job_id && <JobCard ui={x.ui as any} live={!!(x as any).live} onDone={(msg) => { setPanel(p => p && { ...p, _n: Date.now() }); if ((x as any).live) setTimeout(() => sendRef.current(msg), 300); }} />}
                {(x.ui as any)?.kind === 'lab_revision' && <RevisionCard ui={x.ui as any} onApplied={() => setPanel(p => p && { ...p, _n: Date.now() })} onDecided={st => { if ((x as any).live && !busyRef.current) setTimeout(() => sendRef.current(st === 'adopted' ? '采纳了这版。' : '这版不要。'), 200); }} />}
                {(x.ui as any)?.kind === 'lab_invite' && <InviteCard ui={x.ui as any} />}
              </React.Fragment>;
              if (x.k === 'ask') return <div key={x.id} className="wc-ask"><div className="wc-ask-q">{x.question}</div><div className="wc-opts">{x.options.map((o, j) => <button key={o} className={`wc-opt${x.answered === o ? ' on' : ''}`} disabled={!!x.answered || busy} onClick={() => send(o)}><i>{j + 1}</i>{o}</button>)}</div></div>;
              return <div key={i} className="wc-error">{(x as any).text}</div>;
            })}
            {busy && items[items.length - 1]?.k !== 'text' && !(items[items.length - 1]?.k === 'tool' && (items[items.length - 1] as any).running) && <div className="wc-typing"><i /><i /><i /></div>}
            <div ref={endRef} style={{ height: 8 }} />
          </div>
          <div className="wc-dock">{composer(false)}</div>
        </>}
      </section>
      {panel && view && <aside className={`lc-p${full ? ' full' : ''}`} key={view + panel.url + (panel._n || '')}>
        <div className="lc-p-h"><span className="lab-mono lab-cap">{view === 'preview' ? '体验预览' : '工作室'}</span><b>{panel.title}</b>
          <div className="lc-p-act">
            <a href={view === 'preview' ? `/lab/${panel.space_id}?m=test` : panel.url} target="_blank" rel="noreferrer" title="新窗口打开"><ExternalLink size={15} strokeWidth={1.7} /></a>
            <button onClick={() => setFull(f => !f)} title={full ? '退出全屏' : '全屏'}>{full ? <Minimize2 size={15} strokeWidth={1.7} /> : <Maximize2 size={15} strokeWidth={1.7} />}</button>
            <button onClick={() => { setFull(false); setView(null); }} title="关闭"><X size={16} strokeWidth={1.7} /></button>
          </div></div>
        <iframe src={view === 'preview' ? `/lab/${panel.space_id}?m=test` : panel.url} title={panel.title} />
      </aside>}
    </div>
  );
}

/** 生成进度：只在这一轮新出现时发起构建（localStorage 记着发过的，刷新 / 翻历史都不重发），做完回调 */
function BuildCard({ ui, live, onDone }: { ui: { buildId: string; title: string; payload: any }; live: boolean; onDone: (id: string, title: string) => void }) {
  const [st, setSt] = useState<{ phase?: string; detail?: string; done?: boolean; id?: string; error?: string } | null>(null);
  const doneRef = useRef(false); const onRef = useRef(true);
  const fire = useCallback(() => {
    setSt(null);
    fetch('/api/lab/spaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ui.payload) }).then(r => r.json())
      .then(j => { if (!onRef.current) return; if (j.ok) setSt({ done: true, id: j.id }); else setSt({ done: true, error: j.error }); }).catch(() => {});
  }, [ui.payload]);
  useEffect(() => {
    let on = true; onRef.current = true; const key = 'lab-chat-builds';
    let started: string[] = []; try { started = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    if (live && !started.includes(ui.buildId)) {
      try { localStorage.setItem(key, JSON.stringify([...started, ui.buildId].slice(-50))); } catch {}
      fire();
    }
    const t = setInterval(async () => {
      const j = await fetch(`/api/lab/spaces?build=${ui.buildId}`).then(r => r.json()).catch(() => null);
      if (on && j?.build) setSt(s => (s?.done ? s : j.build));
    }, 2500);
    return () => { on = false; onRef.current = false; clearInterval(t); };
  }, [ui.buildId, live, fire]);
  useEffect(() => { if (st?.done && st.id && !doneRef.current) { doneRef.current = true; onDone(st.id, ui.title); } }, [st, ui.title, onDone]);
  return <div className="lc-card">
    <b>生成「{ui.title}」</b>
    {!st ? <span className="lc-mute">{live ? '开始…' : '这是之前发起的生成；结果去百业工厂里看'}</span>
      : st.error ? <span style={{ color: '#c4323a' }}>没成：{st.error.slice(0, 160)}{live && <> <button className="wc-link" onClick={fire}>再试一次</button></>}</span>
      : st.done ? <span style={{ color: '#0d7a52' }}>生成好了{st.id ? <> · <a className="wc-link" href={`/lab/studio/${st.id}`} target="_blank" rel="noreferrer">打开 ↗</a></> : null}</span>
      : <span className="lab-scan" style={{ color: 'var(--v)' }}>{st.phase}{st.detail ? ` · ${st.detail}` : ''}（约 2–4 分钟）</span>}
  </div>;
}

/** 后台任务（排一天 / 写章节 / 按评审改）进度：这一轮发起的做完了就自动告诉助理，让它接着办；翻历史只显示结果 */
function JobCard({ ui, live, onDone }: { ui: { space_id: string; job_id: string; job: string }; live: boolean; onDone: (msg: string) => void }) {
  const [j, setJ] = useState<any>(null); const told = useRef(false); const cb = useRef(onDone); cb.current = onDone;
  useEffect(() => {
    let on = true;
    const tick = async () => {
      const r = await fetch(`/api/lab/studio/${ui.space_id}/jobs`).then(x => x.json()).catch(() => null);
      const job = r?.jobs?.find((x: any) => x.id === ui.job_id); if (!on || !job) return;
      setJ(job);
      if (job.status !== 'running') { clearInterval(t); if (live && !told.current) { told.current = true; cb.current(job.status === 'done' ? `「${ui.job}」做完了：${job.detail || '完成'}。` : `「${ui.job}」没成：${job.error || '失败'}。`); } }
    };
    const t = setInterval(tick, 4000); tick();
    return () => { on = false; clearInterval(t); };
  }, [ui.space_id, ui.job_id, ui.job, live]);
  if (!j) return null;
  return <div className="lc-card" style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center', columnGap: 10 }}>
    <span className={`wc-dot${j.status === 'running' ? ' run' : j.status === 'failed' ? ' err' : ''}`} />
    <span>{ui.job} · {j.status === 'running' ? <span className="lab-scan" style={{ color: 'var(--v)' }}>{j.phase}{j.detail ? ` · ${j.detail}` : ''}</span>
      : j.status === 'done' ? <span style={{ color: '#0d7a52' }}>做完了{j.detail ? ` · ${j.detail}` : ''}</span> : <span style={{ color: '#c4323a' }}>没成：{j.error}</span>}</span>
  </div>;
}

/** 局部改提案：改前 / 改后，采纳才写进章节 */
function RevisionCard({ ui, onApplied, onDecided }: { ui: any; onApplied: () => void; onDecided?: (status: 'adopted' | 'discarded') => void }) {
  const [state, setState] = useState<'' | 'busy' | 'adopted' | 'discarded'>(''); const [err, setErr] = useState('');
  const decide = async (status: 'adopted' | 'discarded') => {
    setState('busy'); setErr('');
    const j = await fetch(`/api/lab/studio/${ui.space_id}/revise`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ui.revision_id, status, ...(status === 'adopted' ? { apply: ui.apply } : {}) }) }).then(r => r.json()).catch(() => ({ ok: false, error: '网络错误' }));
    if (!j.ok) { setState(''); setErr(j.error); return; }
    setState(status); if (status === 'adopted') onApplied(); onDecided?.(status);
  };
  const view = (v: any) => ui.target === 'opening'
    ? <><b>{v?.title}</b><div className="lc-mute">{v?.intro}</div></>
    : <>{v?.step?.scene?.text && <div className="lc-mute">{v.step.scene.who}：{v.step.scene.text}</div>}<b>{v?.step?.prompt}</b>{v?.step?.options?.length ? <ul>{v.step.options.map((o: any) => { const ex = v.expert === o.id || (Array.isArray(v.expert) && v.expert.includes(o.id)); return <li key={o.id} style={ex ? { color: '#0d7a52' } : undefined}>{o.label}{o.detail ? <span className="lc-mute">（{o.detail}）</span> : null}{ex ? ' ← 示范' : ''}</li>; })}</ul> : null}</>;
  return <div className="lc-card">
    <div><b>修改提案</b>{ui.note ? <span className="lc-mute"> · {ui.note}</span> : null}</div>
    <div className="lc-diff"><div><div className="lab-mono lab-cap">改前</div>{view(ui.before)}</div><div><div className="lab-mono lab-cap" style={{ color: '#0d7a52' }}>改后</div>{view(ui.after)}</div></div>
    {state === 'adopted' ? <span style={{ color: '#0d7a52' }}>已采纳，写进这一章了</span> : state === 'discarded' ? <span className="lc-mute">没采纳</span>
      : <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><button className="lab-btn sm" disabled={state === 'busy'} onClick={() => decide('adopted')}>采纳</button><button className="lab-btn ghost sm" disabled={state === 'busy'} onClick={() => decide('discarded')}>不要</button>{err && <span style={{ color: '#c4323a', fontSize: 13 }}>{err}</span>}</div>}
  </div>;
}

function InviteCard({ ui }: { ui: { space_id: string; title: string } }) {
  const [r, setR] = useState<any>(null); const [copied, setCopied] = useState(false);
  useEffect(() => { fetch(`/api/lab/spaces/${ui.space_id}/invite`, { method: 'POST' }).then(x => x.json()).then(setR).catch(() => setR({ ok: false, error: '网络错误' })); }, [ui.space_id]);
  return <div className="lc-card"><b>请老师傅来示范「{ui.title}」</b>
    {!r ? <span className="lc-mute">生成链接…</span> : !r.ok ? <span style={{ color: '#c4323a' }}>{r.error}</span>
      : <><div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}><code style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, padding: '6px 10px', borderRadius: 8, background: 'rgba(23,26,46,.04)' }} title={r.url}>{r.url}</code><button className="lab-btn ghost sm" style={{ flexShrink: 0, whiteSpace: 'nowrap' }} onClick={() => { navigator.clipboard.writeText(r.url); setCopied(true); }}>{copied ? '已复制' : '复制链接'}</button></div><span className="lc-mute">{r.days} 天内有效，老师傅点开就能示范、纠正做法，不用登录</span></>}
  </div>;
}

const CSS = `
.lc { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0; height: calc(100dvh - 120px); min-height: 520px; }
.lc.in-ws { height: calc(100dvh - 48px); }
.lc.with-p { grid-template-columns: minmax(0, 1fr) minmax(460px, 52%); gap: 16px; }
.lc-chat { display: flex; flex-direction: column; min-height: 0; }
.lc-top { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; min-height: 34px; }
.lc-tools { margin-left: auto; display: flex; align-items: center; gap: 2px; min-width: 0; }
.lc-tools button, .lc-tools a { width: 32px; height: 32px; border: 0; background: transparent; border-radius: 8px; display: grid; place-items: center; color: var(--ink2); cursor: pointer; flex-shrink: 0; }
.lc-tools button:hover, .lc-tools a:hover { background: rgba(23,26,46,.06); color: var(--ink); }
.lc-tools button.on { background: rgba(91,79,224,.12); color: var(--v); }
.lc-p-act { margin-left: auto; display: flex; gap: 2px; align-self: center; }
.lc-p-act a, .lc-p-act button { width: 28px; height: 28px; border: 0; background: transparent; border-radius: 7px; display: grid; place-items: center; color: var(--ink2); cursor: pointer; }
.lc-p-act a:hover, .lc-p-act button:hover { background: rgba(23,26,46,.06); color: var(--ink); }
.lc.with-p:has(.lc-p.full) { grid-template-columns: minmax(0, 1fr); } .lc:has(.lc-p.full) .lc-chat { display: none; }
.lc-sel { width: auto !important; max-width: 320px; padding: 6px 10px !important; font-size: 13px !important; border-radius: 10px !important; }
.lc-hero { margin: auto; width: min(780px, 100%); padding-bottom: 6vh; }
.lc-hero h1 { font-size: 30px; font-weight: 800; margin: 8px 0 6px; } .lc-hero p { color: var(--ink2); margin: 0 0 16px; line-height: 1.8; }
.lc .wc-thread { flex: 1; min-height: 0; overflow-y: auto; }
.lc-p { display: flex; flex-direction: column; min-height: 0; border-radius: 14px; overflow: hidden; border: 1px solid var(--line); background: #fff; }
.lc-p-h { display: flex; align-items: baseline; gap: 10px; padding: 6px 8px 6px 14px; border-bottom: 1px solid var(--line); } .lc-p-h b { font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lc-p iframe { flex: 1; width: 100%; border: 0; background: transparent; }
.lc-card { display: grid; gap: 8px; margin: 4px auto 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; background: rgba(255,255,255,.85); font-size: 13.5px; line-height: 1.7; }
.lc-mute { color: var(--ink3); font-size: 13px; }
.lc-diff { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .lc-diff > div { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; background: #fff; }
.lc-diff ul { margin: 4px 0 0; padding-left: 18px; }
@media (max-width: 1000px) { .lc, .lc.with-p { grid-template-columns: minmax(0, 1fr); height: auto; } .lc-p { height: 70vh; } .lc-diff { grid-template-columns: 1fr; } }
`;
