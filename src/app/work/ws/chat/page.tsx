'use client';

/**
 * 真活工作台 · 对话 /work/ws/chat。多行输入框发起一切：出任务（原来的「聊着出任务」）、看谁做了、分析报告、并排比、整道题怎么样、改题、上下架。
 * 右边是应用框架：AI 做出来的东西（一道题的空间、一个人的报告）自动打开；也能自己点「应用」打开管理真活 / 任务报告 / 任务库。
 * 右边开着题或报告时，「这道题」「他」就指它（focus 跟着消息发给助理）；开着的应用页里点「问助理」，就在这段对话里接着问（postMessage wws-ask）。
 * 别的页面「问助理」跳过来带 ?ask=（直接发出）&task= / &sid=&token=（先把面板打开）；首页输入框写的话放在 sessionStorage wws-pending 带过来。
 */
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Md } from '@/components/ws/Md';
import { ReportView } from '@/components/work/ReportView';
import { CHAT_CSS, Composer, fromHistory, RUNNING, type Item } from '@/components/work/ChatKit';

type Art =
  | { kind: 'work_task'; token: string; owner_key: string; title: string; task_id: string; _n?: number }
  | { kind: 'work_report'; token: string; sid: string; title: string; name: string; task_id: string; _n?: number }
  | { kind: 'app'; url: string; title: string; _n?: number };
const APPS = [{ url: '/work/ws/tasks', title: '管理真活' }, { url: '/work/ws/reports', title: '任务报告' }, { url: '/work/library', title: '任务库' }];
const artKey = (a: Art) => (a.kind === 'work_report' ? a.sid : a.kind === 'app' ? a.url : a.task_id) + (a._n || '');

const SUGGEST = [
  { t: '最近怎么样', p: '我出的题最近有人做吗？哪道题值得我去看一下？' },
  { t: '分析一道题的作答', p: '帮我看看我最近那道题大家做得怎么样，卡在哪，题是不是出得太难了。' },
  { t: '比一比候选人', p: '把我最近那道题交卷的人并排比一下，推荐谁进面试，各自要追问什么。' },
  { t: '出一道新任务', p: '我们要招一个能把销售数据理清楚、说出问题在哪的人，帮我出一道真活。' },
];

export default function Page() { return <Suspense><WorkHome /></Suspense>; }

function WorkHome() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState('claude-opus-5-5');
  const [art, setArt] = useState<Art | null>(null);
  const [text, setText] = useState('');
  const [apps, setApps] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Art | null>(null); artRef.current = art;
  const tidRef = useRef<string | null>(null); tidRef.current = threadId;
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [items]);
  useEffect(() => { window.dispatchEvent(new CustomEvent('wws-thread', { detail: threadId })); }, [threadId]);

  const openThread = useCallback(async (id: string) => {
    abortRef.current?.abort(); setBusy(false); setThreadId(id); setItems([]); setArt(null);
    const j = await (await fetch(`/api/admin/work/chat?id=${id}`)).json(); if (!j.ok) return;
    setItems(fromHistory(j.thread.messages || []));
    const last = [...(j.thread.messages || [])].reverse().flatMap((m: any) => (m.role === 'tool' ? [...m.results].reverse() : [])).find((r: any) => r.ui);
    if (last) setArt(last.ui);
  }, []);
  const newChat = useCallback(() => { abortRef.current?.abort(); setBusy(false); setThreadId(null); setItems([]); setArt(null); }, []);
  useEffect(() => {
    const on = (e: Event) => { const id = (e as CustomEvent).detail; if (id) openThread(id); else newChat(); };
    window.addEventListener('wws-open', on); return () => window.removeEventListener('wws-open', on);
  }, [openThread, newChat]);

  const onEvent = (e: any) => {
    if (e.t === 'thread') { setThreadId(e.id); window.dispatchEvent(new Event('wws-threads')); return; }
    if (e.t === 'text') setItems(it => { const last = it[it.length - 1]; return last?.k === 'text' ? [...it.slice(0, -1), { k: 'text', text: last.text + e.delta }] : [...it, { k: 'text', text: e.delta }]; });
    else if (e.t === 'tool_start') setItems(it => [...it, { k: 'tool', id: e.id, name: e.name, input: e.input, running: true }]);
    else if (e.t === 'tool_end') { setItems(it => it.map(x => (x.k === 'tool' && x.id === e.id ? { ...x, running: false, label: e.label, ui: e.ui, error: e.error } : x))); if (e.ui) setArt({ ...e.ui, _n: Date.now() }); }
    else if (e.t === 'ask') setItems(it => [...it, { k: 'ask', id: e.id, question: e.question, options: e.options }]);
    else if (e.t === 'error') setItems(it => [...it, { k: 'error', text: e.message }]);
  };
  const send = async (raw: string) => {
    const t = raw.trim(); if (!t || busy) return;
    setText(''); setBusy(true);
    setItems(it => [...it.map(x => (x.k === 'ask' && !x.answered ? { ...x, answered: t } : x)), { k: 'user', text: t }]);
    const ac = new AbortController(); abortRef.current = ac;
    const a = artRef.current;
    const focus = !a || a.kind === 'app' ? null : a.kind === 'work_report' ? { task_id: a.task_id, session_id: a.sid, title: a.title, name: a.name } : { task_id: a.task_id, title: a.title };
    try {
      const res = await fetch('/api/admin/work/home', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: tidRef.current, text: t, model, focus }), signal: ac.signal });
      if (res.status === 401) { location.href = `/work/login?next=${encodeURIComponent('/work/ws/chat')}`; return; }
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); setItems(it => [...it, { k: 'error', text: j.error || `出错了（${res.status}）` }]); return; }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let nl; while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (line.trim()) onEvent(JSON.parse(line)); } }
    } catch (e: any) { if (e?.name !== 'AbortError') setItems(it => [...it, { k: 'error', text: e.message }]); }
    finally { setBusy(false); setItems(it => it.map(x => (x.k === 'tool' && x.running ? { ...x, running: false, label: x.label || '中断了' } : x))); window.dispatchEvent(new Event('wws-threads')); }
  };

  // ?task= / ?sid=&token= 先在右边打开，?ask= 直接发（从别的页面或右边嵌着的应用页来）
  const takeAsk = (q: URLSearchParams) => {
    const task = q.get('task'), sid = q.get('sid'), token = q.get('token'), title = q.get('title') || '', name = q.get('name') || '';
    if (sid && token && task) setArt({ kind: 'work_report', token, sid, task_id: task, title, name, _n: Date.now() });
    else if (task && token && q.get('k')) setArt({ kind: 'work_task', token, owner_key: q.get('k')!, task_id: task, title, _n: Date.now() });
    const ask = q.get('ask'); if (ask) setTimeout(() => send(ask), 0);
  };
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('thread')) { openThread(q.get('thread')!); return; }
    let pending: any = null; try { pending = JSON.parse(sessionStorage.getItem('wws-pending') || 'null'); sessionStorage.removeItem('wws-pending'); } catch {}
    if (pending?.model) setModel(pending.model);
    if (q.get('ask') || q.get('task')) { window.history.replaceState(null, '', '/work/ws/chat'); takeAsk(q); }
    else if (pending?.text) setTimeout(() => send(pending.text), 0);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  const takeRef = useRef(takeAsk); takeRef.current = takeAsk;
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.origin !== location.origin || e.data?.type !== 'wws-ask') return; takeRef.current(new URL(String(e.data.href), location.origin).searchParams); };
    window.addEventListener('message', on); return () => window.removeEventListener('message', on);
  }, []);

  const pendingAsk = [...items].reverse().find(x => x.k === 'ask' && !x.answered) as Extract<Item, { k: 'ask' }> | undefined;
  const composer = (hero: boolean) => <Composer text={text} setText={setText} busy={busy} send={send} stop={() => abortRef.current?.abort()} model={model} setModel={setModel} autoFocus={hero}
    placeholder={pendingAsk ? '选一个，或者直接打字回答…' : art && art.kind !== 'app' ? `问这${art.kind === 'work_report' ? `份报告（${art.name}）` : '道题'}，或者说别的事…` : hero ? '说你要做什么：出一道任务、看谁做得好、分析一份报告、改题……' : '接着说…'} />;

  const appMenu = <div className="wws-apps">
    <button className="wc-link" onClick={() => setApps(v => !v)} aria-expanded={apps}>应用 ▾</button>
    {apps && <div className="wws-apps-m" onMouseLeave={() => setApps(false)}>{APPS.map(x => <button key={x.url} onClick={() => { setArt({ kind: 'app', ...x, _n: Date.now() }); setApps(false); }}>{x.title}</button>)}</div>}
  </div>;
  return (
    <div className={`wc${art ? ' with-art' : ''}`}>
      <style>{CHAT_CSS + CSS}</style>
      <section className="wc-chat">
        {!art && <div className="wws-top">{appMenu}</div>}
        {!items.length ? (
          <div className="wc-hero">
            <div className="wc-eyebrow">TRUE WORK, TRUE TALENT · 真活工作台</div>
            <h1>今天要做什么？</h1>
            <p>出任务、看谁做了、读报告、几个人并排比、看一道题大家卡在哪、改题、上下架——直接说。做出来的东西在右边打开；右上「应用」也能自己打开管理真活、任务报告、任务库。</p>
            {composer(true)}
            <div className="wc-sec" style={{ margin: '24px 2px 10px' }}>比如这样说（点一下放进输入框）</div>
            <div className="wc-suggest">{SUGGEST.map(x => <button key={x.t} className="wc-card" onClick={() => { setText(x.p); setTimeout(() => (document.querySelector('.wc-composer textarea') as HTMLTextAreaElement | null)?.focus(), 0); }}><b>{x.t}</b><span>「{x.p}」</span></button>)}</div>
          </div>
        ) : (
          <>
            <div className="wc-thread">
              {items.map((x, i) => {
                if (x.k === 'user') { const lines = String(x.text || '').split('\n'); const isF = (l: string) => l.startsWith('【文件】') || l.startsWith('【素材】'); const atts = lines.filter(isF).map(l => l.slice(4).split('｜')[0]); const plain = lines.filter(l => !isF(l)).join('\n').trim(); return <div key={i} className="wc-user"><div className="wc-bubble">{plain}{atts.length > 0 && <div className="wc-atts">{atts.map((n, j) => <span key={j} className="wc-att">📎 {n}</span>)}</div>}</div></div>; }
                if (x.k === 'text') return <div key={i} className="wc-ai"><span className="wc-ava">真</span><div className="wc-ai-body"><Md text={x.text} /></div></div>;
                if (x.k === 'tool') return <div key={x.id} className="wc-tool"><span className={`wc-dot${x.running ? ' run' : x.error ? ' err' : ''}`} /><span className="wc-tool-t">{x.running ? `${RUNNING[x.name] || '处理中'}…` : x.label || x.name}</span>{x.ui && !x.running && <button className="wc-link" onClick={() => setArt({ ...x.ui, _n: Date.now() })}>看 →</button>}{x.error && <span className="wc-err-t">{x.error}</span>}</div>;
                if (x.k === 'ask') return <div key={x.id} className="wc-ask"><div className="wc-ask-q">{x.question}</div><div className="wc-opts">{x.options.map((o, j) => <button key={o} className={`wc-opt${x.answered === o ? ' on' : ''}`} disabled={!!x.answered || busy} onClick={() => send(o)}><i>{j + 1}</i>{o}</button>)}</div>{x.answered && !x.options.includes(x.answered) && <div className="wc-mute" style={{ marginTop: 8 }}>你答：{x.answered}</div>}</div>;
                return <div key={i} className="wc-error">{x.text}</div>;
              })}
              {busy && items[items.length - 1]?.k !== 'text' && !(items[items.length - 1]?.k === 'tool' && (items[items.length - 1] as any).running) && <div className="wc-typing"><i /><i /><i /></div>}
              <div ref={endRef} style={{ height: 8 }} />
            </div>
            <div className="wc-dock">{composer(false)}</div>
          </>
        )}
      </section>
      {art && <aside className="wc-art" key={artKey(art)}>
        <div className="wc-art-h"><div style={{ minWidth: 0 }}><div className="wc-eyebrow sm">{art.kind === 'work_report' ? `${art.name} 的报告` : art.kind === 'app' ? '应用' : '这道真活的空间'}</div><div className="wc-art-t">{art.title}</div></div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
            {appMenu}
            <a className="wc-link" href={art.kind === 'work_report' ? `/work/${art.token}?s=${art.sid}` : art.kind === 'app' ? art.url : `/work/${art.token}/owner?k=${encodeURIComponent(art.owner_key)}`} target="_blank" rel="noreferrer">新窗口 ↗</a>
            <button className="wc-link" onClick={() => setArt(null)}>关闭</button></div></div>
        <div className="wc-art-b">{art.kind === 'work_report' ? <ReportPanel token={art.token} sid={art.sid} /> : <iframe src={art.kind === 'app' ? art.url : `/work/${art.token}/owner?k=${encodeURIComponent(art.owner_key)}&embed=1`} title={art.title} />}</div>
      </aside>}
    </div>
  );
}

/** 右边的一份报告：和报告链接、任务空间「看报告」同一个 ReportView；出任务的人先看交了什么 */
function ReportPanel({ token, sid }: { token: string; sid: string }) {
  const [s, setS] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { fetch(`/api/work/${token}/sessions/${sid}?full=1`).then(r => r.json()).then(j => (j.ok ? setS(j.session) : setErr(j.error || '读不到'))).catch(e => setErr(e.message)); }, [token, sid]);
  if (err) return <div className="wc-mute" style={{ padding: 20 }}>{err}</div>;
  if (!s) return <div className="wc-mute" style={{ padding: 20 }}>读取报告…</div>;
  if (!s.report) return <div className="wc-mute" style={{ padding: 20 }}>{s.submitted_at ? '报告还在生成，过一两分钟再看。' : '还没交卷。'}</div>;
  return <div style={{ padding: '16px 18px 40px', overflowY: 'auto', height: '100%' }}><ReportView report={s.report} participant={s.participant} deliverable={s.deliverable} events={s.events || []} aiChat={s.ai_chat || []} defaultTab="deliv" /></div>;
}

const CSS = `
.wc { height: 100vh; grid-template-columns: minmax(0, 1fr); }
.wc.with-art { grid-template-columns: minmax(0, 1fr) minmax(460px, 50%); }
.wc-art-b { overflow: hidden; }
.wc-chat { position: relative; }
.wc-art-h { position: relative; z-index: 4; }
.wws-top { position: absolute; top: 14px; right: 20px; z-index: 3; }
.wws-apps { position: relative; }
.wws-apps-m { position: absolute; right: 0; top: calc(100% + 6px); background: #fff; border: 1px solid #e8e9f0; border-radius: 12px; padding: 6px; box-shadow: 0 8px 24px rgba(20,24,60,.12); display: grid; gap: 2px; min-width: 150px; z-index: 5; }
.wws-apps-m button { border: 0; background: transparent; text-align: left; padding: 8px 10px; border-radius: 8px; font: inherit; font-size: 13.5px; color: #1a1a2e; cursor: pointer; } .wws-apps-m button:hover { background: #f0f1f6; }
@media (max-width: 1100px) { .wc, .wc.with-art { grid-template-columns: minmax(0, 1fr); height: auto; min-height: 100vh; } }
`;
