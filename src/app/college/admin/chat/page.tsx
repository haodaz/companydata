'use client';

/**
 * 学院秘书 · 教务 AI（2026-10-23）：照 /workspace 的骨架——左最近对话、中对话、右产物。产物就是教务处的真页面（iframe），建课在面板里跑。
 * 校长一句话：「给这家基金培养一个能看懂具身智能的分析师」→ 找课 / 录学员 / 开学籍 / 按路径培养 / 派去向，关键处停下来问。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Md } from '@/components/ws/Md';
import { MODEL_OPTIONS } from '@/lib/model-options';
import { useUser } from '@/lib/user-context';

type Item =
  | { k: 'user'; text: string }
  | { k: 'text'; text: string }
  | { k: 'tool'; id: string; name: string; input: any; label?: string; ui?: any; error?: string; running: boolean }
  | { k: 'ask'; id: string; question: string; options: string[]; answered?: string }
  | { k: 'error'; text: string };
type Art = { kind: 'college_page'; path: string; title: string } | { kind: 'space_build'; buildId: string; payload: Record<string, any>; title: string };

const MODELS = MODEL_OPTIONS.filter(m => /^(claude-|gpt-|gemini-|qwen)/.test(m.id));
const RUNNING: Record<string, string> = { overview: '看教务总览', list_leads: '看线索', admit_lead: '录取为学员', list_students: '查学员名册', register_student: '登记学员', list_courses: '翻课程目录', build_course: '让百业工厂造课', enroll: '开学籍', list_enrollments: '查学籍', record: '调学籍档案', advance: '按学习路径推进（每步 30–90 秒）', entrance_exam: '监考入学考', attend_class: '上课、记要点', final_exam: '监考毕业考', reflect: '带学员反思', list_work_tasks: '找真活', work_exam: '监考真活', regrade: '按学院口径重评', list_graduates: '翻毕业生名册', search_targets: '找去向', place: '派去向' };
const SUGGEST = [
  { t: '学校现在什么情况？', d: '待办、在读、补训、毕业生、去向', p: '学校现在什么情况？今天有什么要处理的？' },
  { t: '定向培养一位分析师', d: '从线索到毕业派遣，一句话交给学院秘书', p: '给武岳峰资本培养一个能看懂具身智能的投资分析师：找对口的课，用通义千问做学员，按路径培养到毕业，然后派过去。' },
  { t: '补训中的学籍卡在哪？', d: '看错题本和老师傅的关键动作', p: '补训中的学籍都卡在哪一章？老师傅的关键动作差在哪？' },
  { t: '毕业生谁还没安排去向？', d: '统筹与分配', p: '毕业生里谁还没安排去向？给我建议。' },
];

export default function CollegeChatPage() {
  const { user } = useUser();
  const [threads, setThreads] = useState<any[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState('claude-opus-5-5');
  const [art, setArt] = useState<Art | null>(null);
  const [text, setText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const loadThreads = useCallback(() => fetch('/api/college/admin/threads', { cache: 'no-store' }).then(r => r.json()).then(j => j.ok && setThreads(j.data)).catch(() => {}), []);
  useEffect(() => { loadThreads(); }, [loadThreads]);
  // ?thread=<id> 直接打开某段对话（录片 / 分享用）
  useEffect(() => { const t = new URLSearchParams(window.location.search).get('thread'); if (t) openThread(t); }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [items]);

  const openThread = async (id: string) => {
    abortRef.current?.abort(); setBusy(false); setThreadId(id); setItems([]); setArt(null);
    const j = await (await fetch(`/api/college/admin/threads/${id}`)).json(); if (!j.ok) return;
    setItems(fromHistory(j.thread.messages || []));
    const last = [...(j.thread.messages || [])].reverse().flatMap((m: any) => (m.role === 'tool' ? [...m.results].reverse() : [])).find((r: any) => r.ui);
    if (last) setArt(last.ui);
  };
  const newChat = () => { abortRef.current?.abort(); setBusy(false); setThreadId(null); setItems([]); setArt(null); };
  const onEvent = (e: any) => {
    if (e.t === 'thread') { setThreadId(e.id); loadThreads(); return; }
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
    try {
      const res = await fetch('/api/college/admin/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: threadId, text: t, model }), signal: ac.signal });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); setItems(it => [...it, { k: 'error', text: j.error || `出错了（${res.status}）` }]); return; }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let nl; while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (line.trim()) onEvent(JSON.parse(line)); } }
    } catch (e: any) { if (e?.name !== 'AbortError') setItems(it => [...it, { k: 'error', text: e.message }]); }
    finally { setBusy(false); setItems(it => it.map(x => (x.k === 'tool' && x.running ? { ...x, running: false, label: x.label || '中断了' } : x))); loadThreads(); }
  };
  const pendingAsk = [...items].reverse().find(x => x.k === 'ask' && !x.answered) as Extract<Item, { k: 'ask' }> | undefined;
  const hour = new Date().getHours(); const hello = hour < 11 ? '早安' : hour < 13 ? '午安' : hour < 18 ? '午后好' : '晚安';

  return (
    <div className={`cc${art ? ' with-art' : ''}`}>
      <style>{CSS}</style>
      <aside className="cc-recent">
        <button className="cc-new" onClick={newChat}>＋ 新对话</button>
        <div className="cc-sec">最近</div>
        {threads.map(t => <button key={t.id} className={`cc-th${threadId === t.id ? ' on' : ''}`} onClick={() => openThread(t.id)}>{t.title || '对话'}</button>)}
        {!threads.length && <div className="cc-mute" style={{ padding: '6px 10px' }}>还没有对话</div>}
      </aside>
      <section className="cc-chat">
        {!items.length ? (
          <div className="cc-hero">
            <div className="ca-eyebrow">College Secretary · Registrar AI</div>
            <h1>{hello}，好大壮院长</h1>
            <p>我是学院秘书。线索、学员、课程、学籍、考试、去向——说一句，我去办；该您拍板的地方我会停下来问。</p>
            <Composer text={text} setText={setText} busy={busy} send={send} stop={() => abortRef.current?.abort()} model={model} setModel={setModel} autoFocus />
            <div className="cc-sec" style={{ margin: '24px 2px 10px' }}>可以从这里开始</div>
            <div className="cc-suggest">{SUGGEST.map(x => <button key={x.t} className="cc-card" onClick={() => send(x.p)}><b>{x.t}</b><span>{x.d}</span></button>)}</div>
          </div>
        ) : (
          <>
            <div className="cc-thread">
              {items.map((x, i) => {
                if (x.k === 'user') return <div key={i} className="cc-user"><div className="cc-bubble">{x.text}</div></div>;
                if (x.k === 'text') return <div key={i} className={`cc-ai${busy && i === items.length - 1 ? ' streaming' : ''}`}><span className="cc-ava">秘</span><div className="cc-ai-body"><Md text={x.text} /></div></div>;
                if (x.k === 'tool') return <div key={x.id} className="cc-tool"><span className={`cc-dot${x.running ? ' run' : x.error ? ' err' : ''}`} /><span className="cc-tool-t">{x.running ? `${RUNNING[x.name] || x.name}…` : x.label || x.name}</span>{x.ui && !x.running && <button className="cc-link" onClick={() => setArt({ ...x.ui, _n: Date.now() })}>看 →</button>}{x.error && <span className="cc-err-t">{x.error}</span>}</div>;
                if (x.k === 'ask') return <div key={x.id} className="cc-ask"><div className="cc-ask-q">{x.question}</div><div className="cc-opts">{x.options.map((o, j) => <button key={o} className={`cc-opt${x.answered === o ? ' on' : ''}`} disabled={!!x.answered || busy} onClick={() => send(o)}><i>{j + 1}</i>{o}</button>)}</div>{x.answered && !x.options.includes(x.answered) && <div className="cc-mute" style={{ marginTop: 6 }}>你回答：{x.answered}</div>}</div>;
                return <div key={i} className="cc-error">{x.text}</div>;
              })}
              {busy && items[items.length - 1]?.k !== 'text' && !(items[items.length - 1]?.k === 'tool' && (items[items.length - 1] as any).running) && <div className="cc-typing"><i /><i /><i /></div>}
              <div ref={endRef} style={{ height: 8 }} />
            </div>
            <div className="cc-dock"><Composer text={text} setText={setText} busy={busy} send={send} stop={() => abortRef.current?.abort()} model={model} setModel={setModel} placeholder={pendingAsk ? '选一个，或者直接打字回答…' : '对学院秘书说…'} /></div>
          </>
        )}
      </section>
      {art && <ArtPanel key={(art.kind === 'college_page' ? art.path : art.buildId) + ((art as any)._n || '')} art={art} onClose={() => setArt(null)} />}
    </div>
  );
}

function Composer({ text, setText, busy, send, stop, model, setModel, placeholder, autoFocus }: { text: string; setText: (t: string) => void; busy: boolean; send: (t: string) => void; stop: () => void; model: string; setModel: (m: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <div className="cc-composer">
      <textarea value={text} autoFocus={autoFocus} rows={2} placeholder={placeholder || '对学院秘书说：给谁培养什么人、谁学得怎么样、谁该派去哪…'} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} />
      <div className="cc-bar">
        <select className="cc-model" value={model} onChange={e => setModel(e.target.value)}>{MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        {busy ? <button className="cc-send stop" onClick={stop}>停</button> : <button className="cc-send" disabled={!text.trim()} onClick={() => send(text)}>↑</button>}
      </div>
    </div>
  );
}

/** 右侧产物：教务处的真页面；建课在这里跑（和企业工作台一样：前端 POST /api/lab/spaces，轮询进度） */
const started = new Set<string>();
function ArtPanel({ art, onClose }: { art: Art; onClose: () => void }) {
  const [build, setBuild] = useState<{ phase?: string; detail?: string; done?: boolean; id?: string; error?: string } | null>(null);
  useEffect(() => {
    if (art.kind !== 'space_build') return;
    let on = true;
    if (!started.has(art.buildId)) { started.add(art.buildId); fetch('/api/lab/spaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(art.payload) }).then(r => r.json()).then(j => { if (on && !j.ok) setBuild({ error: j.error }); if (on && j.ok && j.id) setBuild(b => ({ ...(b || {}), done: true, id: j.id })); }).catch(e => on && setBuild({ error: e.message })); }
    const t = setInterval(async () => { try { const j = await (await fetch(`/api/lab/spaces?build=${art.buildId}`)).json(); if (on && j.build) setBuild(b => ({ ...(b || {}), ...j.build })); if (j.build?.done) clearInterval(t); } catch {} }, 2500);
    return () => { on = false; clearInterval(t); };
  }, [art]);
  const open = art.kind === 'college_page' ? art.path : build?.id ? `/lab/${build.id}` : null;
  return (
    <aside className="cc-art">
      <div className="cc-art-h"><div style={{ minWidth: 0 }}><div className="ca-eyebrow sm">{art.kind === 'space_build' ? 'Building a course' : 'Registrar page'}</div><div className="cc-art-t">{art.title}</div></div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>{open && <a className="cc-link" href={open} target="_blank" rel="noreferrer">新窗口 ↗</a>}<button className="cc-link" onClick={onClose}>关闭</button></div></div>
      <div className="cc-art-b">
        {art.kind === 'college_page' && <iframe src={art.path} title={art.title} />}
        {art.kind === 'space_build' && (build?.id ? <iframe src={`/lab/${build.id}`} title={art.title} /> : <div className="cc-build">{build?.error ? <div className="cc-error">{build.error}</div> : <><span className="cc-dot run" /><div><b>{build?.phase || '排队中…'}</b><div className="cc-mute">{build?.detail || '百业工厂在拆解职责、设计工位、画场景，3–5 分钟'}</div></div></>}</div>)}
      </div>
    </aside>
  );
}

function fromHistory(ms: any[]): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    if (m.role === 'user') out.push({ k: 'user', text: m.text });
    else if (m.role === 'assistant') {
      if (m.text) out.push({ k: 'text', text: m.text });
      const res = ms[i + 1]?.role === 'tool' ? ms[i + 1].results : [];
      for (const c of m.calls || []) {
        const r = res.find((x: any) => x.id === c.id);
        if (c.name === 'ask_user') { let a: string | undefined; try { a = r ? JSON.parse(r.content).answer : undefined; } catch { a = r ? '已回答' : undefined; } out.push({ k: 'ask', id: c.id, question: c.input?.question || '', options: c.input?.options || [], answered: a }); }
        else out.push({ k: 'tool', id: c.id, name: c.name, input: c.input, label: r?.label, ui: r?.ui, error: r?.is_error ? '出错了' : undefined, running: false });
      }
    }
  }
  return out;
}

const CSS = `
.cc { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 0; margin: -30px clamp(-44px, -3vw, -18px) -70px; min-height: 100vh; height: 100vh; }
.cc.with-art { grid-template-columns: 200px minmax(0, 1fr) minmax(420px, 44%); }
.cc-recent { border-right: 1px solid var(--line); padding: 14px 10px; overflow-y: auto; background: rgba(255,255,255,.5); }
.cc-new { width: 100%; border: 1px solid var(--line); background: #fff; border-radius: 10px; padding: 9px 12px; font: inherit; font-size: 14px; font-weight: 700; color: var(--navy); cursor: pointer; text-align: left; }
.cc-new:hover { border-color: var(--gold); }
.cc-sec { font: 700 10.5px var(--en); letter-spacing: .24em; color: var(--ink3); padding: 14px 10px 6px; }
.cc-th { display: block; width: 100%; text-align: left; border: 0; background: transparent; padding: 7px 10px; border-radius: 8px; font: inherit; font-size: 13.5px; color: var(--navy2); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-th:hover { background: rgba(22,32,74,.05); } .cc-th.on { background: rgba(176,141,87,.14); color: var(--navy); font-weight: 700; }
.cc-chat { display: flex; flex-direction: column; min-height: 0; }
.cc-hero { width: min(760px, 92%); margin: auto; padding: 40px 0 60px; }
.cc-hero h1 { font-family: var(--serif); font-size: 36px; font-weight: 900; margin: 8px 0 8px; letter-spacing: .02em; }
.cc-hero p { color: var(--ink2); font-size: 15px; line-height: 1.8; margin: 0 0 22px; }
.cc-suggest { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cc-card { text-align: left; background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; cursor: pointer; color: var(--navy); font: inherit; }
.cc-card b { display: block; font-size: 14.5px; margin-bottom: 4px; } .cc-card span { display: block; font-size: 12.5px; color: var(--ink2); }
.cc-card:hover { border-color: var(--gold); }
.cc-thread { flex: 1; overflow-y: auto; padding: 28px 0 12px; } .cc-thread > * { width: min(780px, 92%); margin-left: auto; margin-right: auto; }
.cc-dock { padding: 8px 0 18px; } .cc-dock > * { width: min(780px, 92%); margin: 0 auto; }
.cc-user { display: flex; justify-content: flex-end; margin: 14px auto; }
.cc-bubble { background: rgba(22,32,74,.07); border-radius: 16px; padding: 10px 14px; max-width: 80%; white-space: pre-wrap; line-height: 1.65; font-size: 14.5px; }
.cc-ai { margin: 12px auto 6px; line-height: 1.8; font-size: 15px; display: flex; gap: 12px; align-items: flex-start; }
.cc-ai-body { flex: 1; min-width: 0; } .cc-ai-body .ws-md p { margin: 0 0 10px; } .cc-ai-body .ws-md ul, .cc-ai-body .ws-md ol { margin: 0 0 10px; padding-left: 22px; }
.cc-ava { width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(135deg, #d9b878, #b08d57); color: #1c1606; display: grid; place-items: center; font: 700 12px var(--en); flex-shrink: 0; margin-top: 4px; }
.cc-tool { display: flex; align-items: center; gap: 9px; margin: 6px auto; border: 1px solid var(--line); background: #fff; border-radius: 10px; padding: 7px 11px; color: var(--navy2); font-size: 13.5px; }
.cc-tool-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-dot { width: 8px; height: 8px; border-radius: 50%; background: #0d7a52; flex-shrink: 0; }
.cc-dot.run { background: var(--gold); animation: ccpulse 1.2s ease-in-out infinite; } .cc-dot.err { background: #b42318; }
@keyframes ccpulse { 0%,100% { box-shadow: 0 0 0 0 rgba(176,141,87,.4) } 50% { box-shadow: 0 0 0 5px rgba(176,141,87,0) } }
.cc-link { border: 0; background: transparent; color: var(--gold); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; }
.cc-err-t { color: #b42318; font-size: 12.5px; }
.cc-ask { border: 1px solid var(--line); background: var(--paper); border-radius: 14px; padding: 14px 16px; margin: 10px auto; }
.cc-ask-q { font-weight: 700; margin-bottom: 10px; } .cc-opts { display: grid; gap: 6px; }
.cc-opt { display: flex; align-items: center; gap: 10px; border: 1px solid var(--line); background: #fff; border-radius: 10px; padding: 9px 12px; text-align: left; cursor: pointer; color: var(--navy); font: inherit; font-size: 14px; }
.cc-opt i { width: 22px; height: 22px; border-radius: 6px; background: rgba(22,32,74,.07); display: grid; place-items: center; font: 600 12px var(--en); color: var(--ink2); }
.cc-opt:hover:not(:disabled) { border-color: var(--gold); } .cc-opt:disabled { opacity: .55; cursor: default; } .cc-opt.on { opacity: 1; border-color: var(--gold); background: rgba(176,141,87,.12); }
.cc-error { color: #b42318; background: #fbeeea; border: 1px solid #f1d6cf; border-radius: 10px; padding: 9px 12px; margin: 10px auto; font-size: 13.5px; }
.cc-typing { display: flex; gap: 5px; padding: 10px 2px; } .cc-typing i { width: 6px; height: 6px; border-radius: 50%; background: var(--ink3); animation: ccdot 1.2s infinite; }
.cc-typing i:nth-child(2) { animation-delay: .15s } .cc-typing i:nth-child(3) { animation-delay: .3s } @keyframes ccdot { 0%,80%,100% { opacity: .25 } 40% { opacity: 1 } }
.cc-composer { background: #fff; border: 1px solid var(--line); border-radius: 18px; padding: 12px 12px 8px 16px; box-shadow: 0 2px 10px rgba(22,32,74,.05); }
.cc-composer:focus-within { border-color: var(--gold); }
.cc-composer textarea { width: 100%; border: 0; outline: 0; resize: none; background: transparent; font: inherit; font-size: 15px; line-height: 1.6; color: var(--navy); }
.cc-bar { display: flex; align-items: center; margin-top: 4px; }
.cc-model { border: 0; background: transparent; color: var(--ink2); font: inherit; font-size: 12.5px; cursor: pointer; padding: 4px 2px; outline: 0; }
.cc-send { margin-left: auto; width: 32px; height: 32px; border-radius: 10px; border: 0; background: var(--navy); color: #fff; font-size: 16px; cursor: pointer; }
.cc-send:disabled { opacity: .25; cursor: default; } .cc-send.stop { background: #7a756a; font-size: 12px; }
.cc-art { border-left: 1px solid var(--line); background: #fffefb; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.cc-art-h { display: flex; align-items: center; gap: 10px; padding: 12px 14px 12px 18px; border-bottom: 1px solid var(--line); }
.cc-art-t { font-weight: 800; font-size: 15px; font-family: var(--serif); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-art-b { flex: 1; min-height: 0; } .cc-art-b iframe { width: 100%; height: 100%; border: 0; }
.cc-build { display: flex; gap: 12px; align-items: flex-start; padding: 22px; font-size: 14px; }
.cc-mute { color: var(--ink2); font-size: 13px; }
@media (max-width: 1100px) { .cc, .cc.with-art { grid-template-columns: minmax(0, 1fr); } .cc-recent { display: none; } .cc-art { position: fixed; inset: 0; z-index: 30; } }
`;
