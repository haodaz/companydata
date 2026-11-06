'use client';

/**
 * 百业工厂 · 聊着出空间（D，2026-11-06，照真活「聊着出任务」）：AI 全包，中间边聊边改，还能替人上下架、评审、邀请老师傅。
 * 左边对话，右边是正在做的空间（工作室嵌进来，iframe 里 LabShell 不画顶栏）。
 * 对话里的卡片：lab_build 生成进度（只在这一轮新出现时发起构建，翻历史不重发；做完自动接一句 space_id 给助理）、
 * lab_revision 局部改提案（改前 / 改后，采纳才写进章节）、lab_invite 邀请老师傅的链接。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Md } from '@/components/ws/Md';
import { CHAT_CSS, Composer, fromHistory, RUNNING, type Item } from '@/components/work/ChatKit';
import { useModel } from '@/lib/model-context';

type Panel = { space_id: string; title: string; url: string; _n?: number };
const QUICK = [
  { t: '给高中生做一个职业体验', p: '给高中生做一个【职业】的生涯体验空间。' },
  { t: '照一份 JD 做空间', p: '照这份岗位 JD 做一个空间，给【谁】用：\n' },
  { t: '改我的一个空间', p: '我那个【空间名】的空间，【哪里】不满意：' },
  { t: '看看哪些空间要改', p: '帮我看看我的空间里哪些该改、哪些可以上架了。' },
];
Object.assign(RUNNING, { locate: '定位', create_space: '准备生成', my_spaces: '找空间', space_detail: '看空间', build_day: '排一天骨架', write_chapters: '安排写章节', revise: '出修改提案', review: 'AI 评审', fix_by_review: '安排按评审改', set_spec: '改生成要求', publish_chapters: '发布章节', set_listing: '改上架状态', invite_master: '生成邀请', jobs: '看进度', open_panel: '打开' });

export default function Page() {
  const router = useRouter(); const { currentModel } = useModel();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<{ id: string; title: string }[]>([]);
  const [items, setItems] = useState<(Item & { live?: boolean })[]>([]);
  const [busy, setBusy] = useState(false); const [text, setText] = useState(''); const [model, setModel] = useState(currentModel);
  const [panel, setPanel] = useState<Panel | null>(null);
  const abortRef = useRef<AbortController | null>(null); const endRef = useRef<HTMLDivElement>(null);
  const tidRef = useRef<string | null>(null); tidRef.current = threadId;
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [items]);
  const loadThreads = useCallback(() => fetch('/api/lab/chat').then(r => r.json()).then(j => j.ok && setThreads(j.data || [])).catch(() => {}), []);
  useEffect(() => { loadThreads(); }, [loadThreads]);

  const openThread = async (id: string) => {
    abortRef.current?.abort(); setBusy(false); setThreadId(id); setItems([]); setPanel(null);
    const j = await (await fetch(`/api/lab/chat?id=${id}`)).json(); if (!j.ok) return;
    setItems(fromHistory(j.thread.messages || []));
    const last = [...(j.thread.messages || [])].reverse().flatMap((m: any) => (m.role === 'tool' ? [...m.results].reverse() : [])).find((r: any) => r.ui?.url);
    if (last) setPanel(last.ui);
  };
  const newChat = () => { abortRef.current?.abort(); setBusy(false); setThreadId(null); setItems([]); setPanel(null); };

  const onEvent = (e: any) => {
    if (e.t === 'thread') { setThreadId(e.id); return; }
    if (e.t === 'text') setItems(it => { const last = it[it.length - 1]; return last?.k === 'text' ? [...it.slice(0, -1), { k: 'text', text: last.text + e.delta }] : [...it, { k: 'text', text: e.delta }]; });
    else if (e.t === 'tool_start') setItems(it => [...it, { k: 'tool', id: e.id, name: e.name, input: e.input, running: true }]);
    else if (e.t === 'tool_end') { setItems(it => it.map(x => (x.k === 'tool' && x.id === e.id ? { ...x, running: false, label: e.label, ui: e.ui, error: e.error, live: true } : x))); if (e.ui?.url) setPanel({ ...e.ui, _n: Date.now() }); }
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
    finally { setBusy(false); setItems(it => it.map(x => (x.k === 'tool' && x.running ? { ...x, running: false, label: x.label || '中断了' } : x))); loadThreads(); }
  };
  const sendRef = useRef(send); sendRef.current = send;

  const pendingAsk = [...items].reverse().find(x => x.k === 'ask' && !x.answered) as Extract<Item, { k: 'ask' }> | undefined;
  const composer = (hero: boolean) => <Composer text={text} setText={setText} busy={busy} send={send} stop={() => abortRef.current?.abort()} model={model} setModel={setModel} autoFocus={hero}
    placeholder={pendingAsk ? '选一个，或者直接打字回答…' : hero ? '说你要做什么：给谁做一个什么职业的体验、改哪个空间…' : '接着说…'} />;

  return (
    <div className={`lc${panel ? ' with-p' : ''}`}>
      <style>{CHAT_CSS + CSS}</style>
      <section className="lc-chat">
        <div className="lc-top">
          <button className="lab-btn ghost sm" onClick={() => router.push('/lab/spaces')}>← 百业工厂</button>
          <select className="lab-input lc-sel" value={threadId || ''} onChange={e => (e.target.value ? openThread(e.target.value) : newChat())}>
            <option value="">新对话</option>{threads.map(t => <option key={t.id} value={t.id}>{t.title || '对话'}</option>)}
          </select>
          {threadId && <button className="lab-btn ghost sm" onClick={newChat}>＋ 新对话</button>}
        </div>
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
                <div className="wc-tool"><span className={`wc-dot${x.running ? ' run' : x.error ? ' err' : ''}`} /><span className="wc-tool-t">{x.running ? `${RUNNING[x.name] || '处理中'}…` : x.error ? `${x.label || x.name}：${x.error}` : x.label || x.name}</span>{(x.ui as any)?.url && !x.running && <button className="wc-link" onClick={() => setPanel({ ...(x.ui as any), _n: Date.now() })}>打开 →</button>}</div>
                {(x.ui as any)?.kind === 'lab_build' && <BuildCard ui={x.ui as any} live={!!(x as any).live} onDone={(id, title) => { setPanel({ space_id: id, title, url: `/lab/studio/${id}`, _n: Date.now() }); if ((x as any).live) setTimeout(() => sendRef.current(`空间生成好了：space_id=${id}。`), 300); }} />}
                {(x.ui as any)?.kind === 'lab_revision' && <RevisionCard ui={x.ui as any} onApplied={() => setPanel(p => p && { ...p, _n: Date.now() })} />}
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
      {panel && <aside className="lc-p" key={panel.url + (panel._n || '')}>
        <div className="lc-p-h"><div style={{ minWidth: 0 }}><div className="lab-mono lab-cap">SPACE</div><b>{panel.title}</b></div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            <a className="wc-link" href={`/lab/${panel.space_id}?m=test`} target="_blank" rel="noreferrer">预览 ↗</a>
            <a className="wc-link" href={panel.url} target="_blank" rel="noreferrer">新窗口 ↗</a>
            <button className="wc-link" onClick={() => setPanel(null)}>关闭</button>
          </div></div>
        <iframe src={panel.url} title={panel.title} />
      </aside>}
    </div>
  );
}

/** 生成进度：只在这一轮新出现时发起构建（localStorage 记着发过的，刷新 / 翻历史都不重发），做完回调 */
function BuildCard({ ui, live, onDone }: { ui: { buildId: string; title: string; payload: any }; live: boolean; onDone: (id: string, title: string) => void }) {
  const [st, setSt] = useState<{ phase?: string; detail?: string; done?: boolean; id?: string; error?: string } | null>(null);
  const doneRef = useRef(false);
  useEffect(() => {
    let on = true; const key = 'lab-chat-builds';
    let started: string[] = []; try { started = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    if (live && !started.includes(ui.buildId)) {
      try { localStorage.setItem(key, JSON.stringify([...started, ui.buildId].slice(-50))); } catch {}
      fetch('/api/lab/spaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ui.payload) }).then(r => r.json())
        .then(j => { if (!on) return; if (j.ok) setSt({ done: true, id: j.id }); else setSt({ done: true, error: j.error }); }).catch(() => {});
    }
    const t = setInterval(async () => {
      const j = await fetch(`/api/lab/spaces?build=${ui.buildId}`).then(r => r.json()).catch(() => null);
      if (on && j?.build) setSt(s => (s?.done ? s : j.build));
    }, 2500);
    return () => { on = false; clearInterval(t); };
  }, [ui.buildId, ui.payload, live]);
  useEffect(() => { if (st?.done && st.id && !doneRef.current) { doneRef.current = true; onDone(st.id, ui.title); } }, [st, ui.title, onDone]);
  return <div className="lc-card">
    <b>生成「{ui.title}」</b>
    {!st ? <span className="lc-mute">{live ? '开始…' : '这是之前发起的生成；结果去百业工厂里看'}</span>
      : st.error ? <span style={{ color: '#c4323a' }}>没成：{st.error}</span>
      : st.done ? <span style={{ color: '#0d7a52' }}>生成好了{st.id ? <> · <a className="wc-link" href={`/lab/studio/${st.id}`} target="_blank" rel="noreferrer">打开 ↗</a></> : null}</span>
      : <span className="lab-scan" style={{ color: 'var(--v)' }}>{st.phase}{st.detail ? ` · ${st.detail}` : ''}（约 2–4 分钟）</span>}
  </div>;
}

/** 局部改提案：改前 / 改后，采纳才写进章节 */
function RevisionCard({ ui, onApplied }: { ui: any; onApplied: () => void }) {
  const [state, setState] = useState<'' | 'busy' | 'adopted' | 'discarded'>(''); const [err, setErr] = useState('');
  const decide = async (status: 'adopted' | 'discarded') => {
    setState('busy'); setErr('');
    const j = await fetch(`/api/lab/studio/${ui.space_id}/revise`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ui.revision_id, status, ...(status === 'adopted' ? { apply: ui.apply } : {}) }) }).then(r => r.json()).catch(() => ({ ok: false, error: '网络错误' }));
    if (!j.ok) { setState(''); setErr(j.error); return; }
    setState(status); if (status === 'adopted') onApplied();
  };
  const view = (v: any) => ui.target === 'opening'
    ? <><b>{v?.title}</b><div className="lc-mute">{v?.intro}</div></>
    : <>{v?.step?.scene?.text && <div className="lc-mute">{v.step.scene.who}：{v.step.scene.text}</div>}<b>{v?.step?.prompt}</b>{v?.step?.options?.length ? <ul>{v.step.options.map((o: any) => <li key={o.id}>{o.label}</li>)}</ul> : null}</>;
  return <div className="lc-card">
    <div><b>修改提案</b>{ui.note ? <span className="lc-mute"> · {ui.note}</span> : null}</div>
    <div className="lc-diff"><div><div className="lab-mono lab-cap">改前</div>{view(ui.before)}</div><div><div className="lab-mono lab-cap" style={{ color: '#0d7a52' }}>改后</div>{view(ui.after)}</div></div>
    {state === 'adopted' ? <span style={{ color: '#0d7a52' }}>已采纳，写进这一章了</span> : state === 'discarded' ? <span className="lc-mute">没采纳</span>
      : <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><button className="lab-btn sm" disabled={state === 'busy'} onClick={() => decide('adopted')}>采纳</button><button className="lab-btn ghost sm" disabled={state === 'busy'} onClick={() => decide('discarded')}>不要</button>{err && <span style={{ color: '#c4323a', fontSize: 13 }}>{err}</span>}</div>}
  </div>;
}

function InviteCard({ ui }: { ui: { space_id: string; title: string } }) {
  const [r, setR] = useState<any>(null);
  useEffect(() => { fetch(`/api/lab/spaces/${ui.space_id}/invite`, { method: 'POST' }).then(x => x.json()).then(setR).catch(() => setR({ ok: false, error: '网络错误' })); }, [ui.space_id]);
  return <div className="lc-card"><b>请老师傅来示范「{ui.title}」</b>
    {!r ? <span className="lc-mute">生成链接…</span> : !r.ok ? <span style={{ color: '#c4323a' }}>{r.error}</span>
      : <><code style={{ wordBreak: 'break-all', fontSize: 12.5 }}>{r.url}</code><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><button className="lab-btn ghost sm" onClick={() => navigator.clipboard.writeText(r.url)}>复制</button><span className="lc-mute">{r.days} 天内有效，老师傅点开就能示范、纠正做法，不用登录</span></div></>}
  </div>;
}

const CSS = `
.lc { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0; height: calc(100dvh - 120px); min-height: 520px; }
.lc.with-p { grid-template-columns: minmax(0, 1fr) minmax(460px, 52%); gap: 16px; }
.lc-chat { display: flex; flex-direction: column; min-height: 0; }
.lc-top { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.lc-sel { width: auto !important; max-width: 320px; padding: 6px 10px !important; font-size: 13px !important; border-radius: 10px !important; }
.lc-hero { margin: auto; width: min(780px, 100%); padding-bottom: 6vh; }
.lc-hero h1 { font-size: 30px; font-weight: 800; margin: 8px 0 6px; } .lc-hero p { color: var(--ink2); margin: 0 0 16px; line-height: 1.8; }
.lc .wc-thread { flex: 1; min-height: 0; overflow-y: auto; }
.lc-p { display: flex; flex-direction: column; min-height: 0; border-radius: 18px; overflow: hidden; border: 1px solid var(--line); background: rgba(255,255,255,.7); }
.lc-p-h { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
.lc-p iframe { flex: 1; width: 100%; border: 0; background: transparent; }
.lc-card { display: grid; gap: 8px; margin: 4px 0 10px 40px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; background: rgba(255,255,255,.85); font-size: 13.5px; line-height: 1.7; }
.lc-mute { color: var(--ink3); font-size: 13px; }
.lc-diff { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .lc-diff > div { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; background: #fff; }
.lc-diff ul { margin: 4px 0 0; padding-left: 18px; }
@media (max-width: 1000px) { .lc, .lc.with-p { grid-template-columns: minmax(0, 1fr); height: auto; } .lc-p { height: 70vh; } .lc-diff { grid-template-columns: 1fr; } .lc-card { margin-left: 0; } }
`;
