'use client';

/**
 * 聊着出题 /work/new/chat（2026-10-23）：和填表出题并排的第二种模式。出题 AI 追问缺的信息、解释、修订；题出好在右侧打开真活空间。
 * 骨架照学院秘书 / 企业工作台（NDJSON 流 + ask_user 停下来问），配色换成真活的浅色 + #6055f5。
 */
import { NewModeSwitch, WorkTopBar } from '@/components/work/WorkTopBar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Md } from '@/components/ws/Md';
import { MODEL_OPTIONS } from '@/lib/model-options';

type Item =
  | { k: 'user'; text: string }
  | { k: 'text'; text: string }
  | { k: 'tool'; id: string; name: string; input: any; label?: string; ui?: any; error?: string; running: boolean }
  | { k: 'ask'; id: string; question: string; options: string[]; answered?: string }
  | { k: 'error'; text: string };
type Art = { kind: 'work_task'; token: string; owner_key: string; title: string; task_id: string; _n?: number };

const MODELS = MODEL_OPTIONS.filter(m => /^(claude-|gpt-|qwen)/.test(m.id));
const RUNNING: Record<string, string> = { find_company: '在企业库里搜', company_brief: '看这家企业的材料', suggest_roles: '找岗位', my_references: '看参考资料', read_reference: '读参考资料（约 1 分钟）', create_task: '出任务中（约 2 分钟：拼材料、锚定问题、写任务书、做材料包、定标准）', task_summary: '看这道题', run_baseline: 'AI 先做一遍当基线（约 1 分钟）', revise_task: '按意见修订' };
const SUGGEST = [
  { t: '直接说要找什么样的人', d: '不用先想职位名', p: '我要给武岳峰资本找一个能看懂具身智能的人来做投资，出一道题。' },
  { t: '给一个岗位出任务', d: '说企业和岗位就行，其余它来问', p: '给宁德时代的供应链计划岗出一道题。' },
  { t: '照我们以前的题出', d: '把过往用过的题贴给它，它换成这家企业', p: '我有一道以前校招用过的题，想照它的路数给宁德时代的供应链计划岗出一道。' },
  { t: '先聊聊再出', d: '它一件一件问：企业、要找的人、考什么', p: '帮我出一道真活，你问我。' },
];

export default function WorkChatPage() {
  const [threads, setThreads] = useState<any[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState('claude-opus-5-5');
  const [art, setArt] = useState<Art | null>(null);
  const [text, setText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const loadThreads = useCallback(() => fetch('/api/admin/work/chat', { cache: 'no-store' }).then(r => { if (r.status === 401) location.href = `/work/login?next=${encodeURIComponent('/work/new/chat')}`; return r.json(); }).then(j => j.ok && setThreads(j.data)).catch(() => {}), []);
  useEffect(() => { loadThreads(); }, [loadThreads]);
  useEffect(() => { const t = new URLSearchParams(window.location.search).get('thread'); if (t) openThread(t); }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [items]);

  const openThread = async (id: string) => {
    abortRef.current?.abort(); setBusy(false); setThreadId(id); setItems([]); setArt(null);
    const j = await (await fetch(`/api/admin/work/chat?id=${id}`)).json(); if (!j.ok) return;
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
      const res = await fetch('/api/admin/work/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: threadId, text: t, model }), signal: ac.signal });
      if (res.status === 401) { location.href = `/work/login?next=${encodeURIComponent('/work/new/chat')}`; return; }
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); setItems(it => [...it, { k: 'error', text: j.error || `出错了（${res.status}）` }]); return; }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let nl; while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (line.trim()) onEvent(JSON.parse(line)); } }
    } catch (e: any) { if (e?.name !== 'AbortError') setItems(it => [...it, { k: 'error', text: e.message }]); }
    finally { setBusy(false); setItems(it => it.map(x => (x.k === 'tool' && x.running ? { ...x, running: false, label: x.label || '中断了' } : x))); loadThreads(); }
  };
  const pendingAsk = [...items].reverse().find(x => x.k === 'ask' && !x.answered) as Extract<Item, { k: 'ask' }> | undefined;

  return (
    <div style={{ minHeight: '100vh', background: '#f6f7fb', color: '#1a1a2e', display: 'flex', flexDirection: 'column' }}>
      <style>{CSS}</style>
      <WorkTopBar active="new" right={<NewModeSwitch mode="chat" />} />
      <div className={`wc${art ? ' with-art' : ''}`}>
        <aside className="wc-recent">
          <button className="wc-new" onClick={newChat}>＋ 新对话</button>
          <div className="wc-sec">最近</div>
          {threads.map(t => <button key={t.id} className={`wc-th${threadId === t.id ? ' on' : ''}`} onClick={() => openThread(t.id)}>{t.title || '对话'}</button>)}
          {!threads.length && <div className="wc-mute" style={{ padding: '6px 10px' }}>还没有对话</div>}
        </aside>
        <section className="wc-chat">
          {!items.length ? (
            <div className="wc-hero">
              <div className="wc-eyebrow">TRUE WORK, TRUE TALENT · 出任务助理</div>
              <h1>说说你要找什么样的人</h1>
              <p>企业、要找的人、想考什么——缺哪件我问哪件；有过往用过的题可以直接贴给我，我照它的路数出。题出好在右边打开，不对就当场改。</p>
              <Composer text={text} setText={setText} busy={busy} send={send} stop={() => abortRef.current?.abort()} model={model} setModel={setModel} autoFocus />
              <div className="wc-sec" style={{ margin: '24px 2px 10px' }}>可以从这里开始</div>
              <div className="wc-suggest">{SUGGEST.map(x => <button key={x.t} className="wc-card" onClick={() => send(x.p)}><b>{x.t}</b><span>{x.d}</span></button>)}</div>
            </div>
          ) : (
            <>
              <div className="wc-thread">
                {items.map((x, i) => {
                  if (x.k === 'user') { const lines = String(x.text || '').split('\n'); const isF = (l: string) => l.startsWith('【文件】') || l.startsWith('【素材】'); const atts = lines.filter(isF).map(l => l.slice(4).split('｜')[0]); const plain = lines.filter(l => !isF(l)).join('\n').trim(); return <div key={i} className="wc-user"><div className="wc-bubble">{plain}{atts.length > 0 && <div className="wc-atts">{atts.map((n, j) => <span key={j} className="wc-att">📎 {n}</span>)}</div>}</div></div>; }
                  if (x.k === 'text') return <div key={i} className="wc-ai"><span className="wc-ava">题</span><div className="wc-ai-body"><Md text={x.text} /></div></div>;
                  if (x.k === 'tool') return <div key={x.id} className="wc-tool"><span className={`wc-dot${x.running ? ' run' : x.error ? ' err' : ''}`} /><span className="wc-tool-t">{x.running ? `${RUNNING[x.name] || x.name}…` : x.label || x.name}</span>{x.ui && !x.running && <button className="wc-link" onClick={() => setArt({ ...x.ui, _n: Date.now() })}>看 →</button>}{x.error && <span className="wc-err-t">{x.error}</span>}</div>;
                  if (x.k === 'ask') return <div key={x.id} className="wc-ask"><div className="wc-ask-q">{x.question}</div><div className="wc-opts">{x.options.map((o, j) => <button key={o} className={`wc-opt${x.answered === o ? ' on' : ''}`} disabled={!!x.answered || busy} onClick={() => send(o)}><i>{j + 1}</i>{o}</button>)}</div>{x.answered && !x.options.includes(x.answered) && <div className="wc-mute" style={{ marginTop: 8 }}>你答：{x.answered}</div>}</div>;
                  return <div key={i} className="wc-error">{x.text}</div>;
                })}
                {busy && items[items.length - 1]?.k !== 'text' && !(items[items.length - 1]?.k === 'tool' && (items[items.length - 1] as any).running) && <div className="wc-typing"><i /><i /><i /></div>}
                <div ref={endRef} style={{ height: 8 }} />
              </div>
              <div className="wc-dock"><Composer text={text} setText={setText} busy={busy} send={send} stop={() => abortRef.current?.abort()} model={model} setModel={setModel} placeholder={pendingAsk ? '选一个，或者直接打字回答…' : '接着说…（也可以把一道过往的题整段贴进来）'} /></div>
            </>
          )}
        </section>
        {art && <aside className="wc-art" key={art.task_id + (art._n || '')}>
          <div className="wc-art-h"><div style={{ minWidth: 0 }}><div className="wc-eyebrow sm">这道真活的空间</div><div className="wc-art-t">{art.title}</div></div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}><a className="wc-link" href={`/work/${art.token}/owner?k=${encodeURIComponent(art.owner_key)}`} target="_blank" rel="noreferrer">新窗口 ↗</a><button className="wc-link" onClick={() => setArt(null)}>关闭</button></div></div>
          <div className="wc-art-b"><iframe src={`/work/${art.token}/owner?k=${encodeURIComponent(art.owner_key)}&embed=1`} title={art.title} /></div>
        </aside>}
      </div>
    </div>
  );
}

function Composer({ text, setText, busy, send, stop, model, setModel, placeholder, autoFocus }: { text: string; setText: (t: string) => void; busy: boolean; send: (t: string) => void; stop: () => void; model: string; setModel: (m: string) => void; placeholder?: string; autoFocus?: boolean }) {
  // 上传文件：以【文件】行附进消息；是素材还是参考资料由出题助理按语境判断（默认素材）
  const fileRef = useRef<HTMLInputElement>(null);
  const [up, setUp] = useState(false);
  const attach = async (files: FileList | null) => {
    if (!files?.length) return; setUp(true);
    try { const lines: string[] = []; for (const f of Array.from(files).slice(0, 6)) { const fd = new FormData(); fd.append('file', f); const j = await (await fetch('/api/admin/work/attach', { method: 'POST', body: fd })).json(); if (j.ok) lines.push(`【文件】${j.name}｜${j.url}｜${j.mime}${j.text ? `｜文字摘录：${String(j.text).slice(0, 1500).replace(/\s+/g, ' ')}` : j.image ? '｜图片' : ''}`); }
      if (lines.length) setText((text ? text + '\n' : '') + lines.join('\n')); }
    finally { setUp(false); }
  };
  return (
    <div className="wc-composer">
      <textarea value={text} autoFocus={autoFocus} rows={2} placeholder={placeholder || '比如：给宁德时代找一个能做欧洲交付计划的人，出一道题'} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} />
      <div className="wc-bar">
        <select className="wc-model" value={model} onChange={e => setModel(e.target.value)}>{MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        <button className="wc-clip" title="上传文件：给候选人的素材，或让 AI 照着出的参考资料——传完说一句是哪种就行" disabled={busy || up} onClick={() => fileRef.current?.click()}>{up ? '上传中…' : '📎 文件'}</button>
        <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg,.webp,.gif" style={{ display: 'none' }} onChange={e => { attach(e.target.files); e.target.value = ''; }} />
        {busy ? <button className="wc-send stop" onClick={stop}>停</button> : <button className="wc-send" disabled={!text.trim()} onClick={() => send(text)}>↑</button>}
      </div>
    </div>
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
.wc-mode { margin-left: auto; display: flex; border: 1px solid #e0e0ee; border-radius: 999px; overflow: hidden; font-size: 13px; }
.wc-mode a, .wc-mode span { padding: 6px 14px; color: #666; text-decoration: none; } .wc-mode .on { background: #6055f5; color: #fff; font-weight: 700; }
.wc { flex: 1; display: grid; grid-template-columns: 210px minmax(0, 1fr); min-height: 0; height: calc(100vh - 60px); }
.wc.with-art { grid-template-columns: 210px minmax(0, 1fr) minmax(440px, 46%); }
.wc-recent { border-right: 1px solid #e8e9f0; padding: 14px 10px; overflow-y: auto; background: #fff; }
.wc-new { width: 100%; border: 1px solid #e0e0ee; background: #fff; border-radius: 10px; padding: 9px 12px; font: inherit; font-size: 14px; font-weight: 700; color: #1a1a2e; cursor: pointer; text-align: left; }
.wc-new:hover { border-color: #6055f5; }
.wc-sec { font-size: 11px; letter-spacing: .2em; color: #999; padding: 14px 10px 6px; font-weight: 700; }
.wc-eyebrow { font-size: 12px; letter-spacing: 2px; color: #6055f5; font-weight: 700; } .wc-eyebrow.sm { font-size: 11px; }
.wc-th { display: block; width: 100%; text-align: left; border: 0; background: transparent; padding: 7px 10px; border-radius: 8px; font: inherit; font-size: 13.5px; color: #3b405a; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wc-th:hover { background: #f0f1f6; } .wc-th.on { background: #ecebff; color: #2b2670; font-weight: 700; }
.wc-chat { display: flex; flex-direction: column; min-height: 0; }
.wc-hero { width: min(760px, 92%); margin: auto; padding: 40px 0 60px; }
.wc-hero h1 { font-size: 32px; font-weight: 900; margin: 8px 0 8px; }
.wc-hero p { color: #555; font-size: 15px; line-height: 1.8; margin: 0 0 22px; }
.wc-suggest { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.wc-card { text-align: left; background: #fff; border: 1px solid #e8e9f0; border-radius: 14px; padding: 14px 16px; cursor: pointer; color: #1a1a2e; font: inherit; }
.wc-card b { display: block; font-size: 14.5px; margin-bottom: 4px; } .wc-card span { display: block; font-size: 12.5px; color: #777; }
.wc-card:hover { border-color: #6055f5; }
.wc-thread { flex: 1; overflow-y: auto; padding: 28px 0 12px; } .wc-thread > * { width: min(780px, 92%); margin-left: auto; margin-right: auto; }
.wc-dock { padding: 8px 0 18px; } .wc-dock > * { width: min(780px, 92%); margin: 0 auto; }
.wc-user { display: flex; justify-content: flex-end; margin: 14px auto; }
.wc-atts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; } .wc-att { font-size: 12px; background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.35); border-radius: 6px; padding: 2px 8px; }
.wc-bubble { background: #ecebff; border-radius: 16px; padding: 10px 14px; max-width: 80%; white-space: pre-wrap; line-height: 1.65; font-size: 14.5px; }
.wc-ai { margin: 12px auto 6px; line-height: 1.8; font-size: 15px; display: flex; gap: 12px; align-items: flex-start; }
.wc-ai-body { flex: 1; min-width: 0; } .wc-ai-body .ws-md p { margin: 0 0 10px; } .wc-ai-body .ws-md ul, .wc-ai-body .ws-md ol { margin: 0 0 10px; padding-left: 22px; }
.wc-ava { width: 26px; height: 26px; border-radius: 50%; background: #6055f5; color: #fff; display: grid; place-items: center; font-size: 12px; font-weight: 700; flex-shrink: 0; margin-top: 4px; }
.wc-tool { display: flex; align-items: center; gap: 9px; margin: 6px auto; border: 1px solid #e8e9f0; background: #fff; border-radius: 10px; padding: 7px 11px; color: #3b405a; font-size: 13.5px; }
.wc-tool-t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wc-dot { width: 8px; height: 8px; border-radius: 50%; background: #0d7a52; flex-shrink: 0; }
.wc-dot.run { background: #6055f5; animation: wcpulse 1.2s ease-in-out infinite; } .wc-dot.err { background: #b42318; }
@keyframes wcpulse { 0%,100% { box-shadow: 0 0 0 0 rgba(96,85,245,.4) } 50% { box-shadow: 0 0 0 5px rgba(96,85,245,0) } }
.wc-link { border: 0; background: transparent; color: #6055f5; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; }
.wc-err-t { color: #b42318; font-size: 12.5px; }
.wc-ask { border: 1px solid #e8e9f0; background: #fff; border-radius: 14px; padding: 14px 16px; margin: 10px auto; }
.wc-ask-q { font-weight: 700; margin-bottom: 10px; } .wc-opts { display: grid; gap: 6px; }
.wc-opt { display: flex; align-items: center; gap: 10px; border: 1px solid #e8e9f0; background: #fff; border-radius: 10px; padding: 9px 12px; text-align: left; cursor: pointer; color: #1a1a2e; font: inherit; font-size: 14px; }
.wc-opt i { width: 22px; height: 22px; border-radius: 6px; background: #f0f1f6; display: grid; place-items: center; font-size: 12px; font-style: normal; color: #666; }
.wc-opt:hover:not(:disabled) { border-color: #6055f5; } .wc-opt:disabled { opacity: .55; cursor: default; } .wc-opt.on { opacity: 1; border-color: #6055f5; background: #ecebff; }
.wc-error { color: #b42318; background: #fbeeea; border: 1px solid #f1d6cf; border-radius: 10px; padding: 9px 12px; margin: 10px auto; font-size: 13.5px; }
.wc-typing { display: flex; gap: 5px; padding: 10px 2px; } .wc-typing i { width: 6px; height: 6px; border-radius: 50%; background: #999; animation: wcdot 1.2s infinite; }
.wc-typing i:nth-child(2) { animation-delay: .15s } .wc-typing i:nth-child(3) { animation-delay: .3s } @keyframes wcdot { 0%,80%,100% { opacity: .25 } 40% { opacity: 1 } }
.wc-composer { background: #fff; border: 1px solid #e8e9f0; border-radius: 18px; padding: 12px 12px 8px 16px; box-shadow: 0 2px 10px rgba(20,24,60,.05); }
.wc-composer:focus-within { border-color: #6055f5; }
.wc-composer textarea { width: 100%; border: 0; outline: 0; resize: none; background: transparent; font: inherit; font-size: 15px; line-height: 1.6; color: #1a1a2e; }
.wc-bar { display: flex; align-items: center; margin-top: 4px; }
.wc-model { border: 0; background: transparent; color: #666; font: inherit; font-size: 12.5px; cursor: pointer; padding: 4px 2px; outline: 0; }
.wc-clip { border: 1px solid #e0e0ee; background: #fff; color: #555; font: inherit; font-size: 12.5px; border-radius: 8px; padding: 3px 10px; margin-left: 8px; cursor: pointer; } .wc-clip:disabled { opacity: .5; }
.wc-send { margin-left: auto; width: 32px; height: 32px; border-radius: 10px; border: 0; background: #6055f5; color: #fff; font-size: 16px; cursor: pointer; }
.wc-send:disabled { opacity: .25; cursor: default; } .wc-send.stop { background: #7a756a; font-size: 12px; }
.wc-art { border-left: 1px solid #e8e9f0; background: #fff; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.wc-art-h { display: flex; align-items: center; gap: 10px; padding: 12px 14px 12px 18px; border-bottom: 1px solid #e8e9f0; }
.wc-art-t { font-weight: 800; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wc-art-b { flex: 1; min-height: 0; } .wc-art-b iframe { width: 100%; height: 100%; border: 0; }
.wc-mute { color: #777; font-size: 13px; }
@media (max-width: 1100px) { .wc, .wc.with-art { grid-template-columns: minmax(0, 1fr); } .wc-recent { display: none; } .wc-art { position: fixed; inset: 0; z-index: 30; } }
`;
