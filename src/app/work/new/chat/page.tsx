'use client';

/**
 * 聊着出题 /work/new/chat（2026-10-23）：和填表出题并排的第二种模式。出题 AI 追问缺的信息、解释、修订；题出好在右侧打开真活空间。
 * 骨架照学院秘书 / 企业工作台（NDJSON 流 + ask_user 停下来问），配色换成真活的浅色 + #6055f5。
 */
import { NewModeSwitch, WorkTopBar } from '@/components/work/WorkTopBar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Md } from '@/components/ws/Md';
import { CHAT_CSS as CSS, Composer, fromHistory, RUNNING, type Item, CompanyHits, inlineUi } from '@/components/work/ChatKit';
type Art = { kind: 'work_task'; token: string; owner_key: string; title: string; task_id: string; _n?: number };

// 2026-11-03：引导用户先用大白话说一句最实际的要求（不用一次说全，缺的助理会问）；点卡片把例句放进输入框改，不直接发
const SUGGEST = [
  { t: '说你缺什么样的人', p: '我们要招一个能把 IP 形象延展成表情包、海报、短视频封面的设计师，想看看他真实干活的样子。' },
  { t: '说你最近卡在哪', p: '我们新用户注册转化一直往下掉，想找个能把数据理清楚、说出问题到底在哪的人。' },
  { t: '照以前用过的题出', p: '我们去年校招用过一道题，想照这个思路换成今年的业务再出一道，题我等下贴给你。' },
  { t: '还没想好', p: '想给宁德时代出一道真活，但还没想好考什么，你先问我。' },
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
  // 从任务库来（?lib=&use=）：把挑好的任务和用法写进输入框，用户补一句企业就能发；助理只问还不知道的
  useEffect(() => {
    const q = new URLSearchParams(window.location.search); const id = q.get('lib'); if (!id) return;
    const ref = q.get('use') === 'ref';
    fetch('/api/work/library').then(r => r.json()).then(j => { const it = j.ok && j.items.find((x: any) => x.id === id); if (it) setText(`我想用任务库里的「${it.title}」（编号 ${it.id}），${ref ? '只做参考，照它的思路出一道' : '原题直出，换成我们公司'}。我们公司是：`); }).catch(() => {});
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [items]);

  const openThread = async (id: string) => {
    abortRef.current?.abort(); setBusy(false); setThreadId(id); setItems([]); setArt(null);
    const j = await (await fetch(`/api/admin/work/chat?id=${id}`)).json(); if (!j.ok) return;
    setItems(fromHistory(j.thread.messages || []));
    const last = [...(j.thread.messages || [])].reverse().flatMap((m: any) => (m.role === 'tool' ? [...m.results].reverse() : [])).find((r: any) => r.ui && !inlineUi(r.ui));
    if (last) setArt(last.ui);
  };
  const newChat = () => { abortRef.current?.abort(); setBusy(false); setThreadId(null); setItems([]); setArt(null); };
  const onEvent = (e: any) => {
    if (e.t === 'thread') { setThreadId(e.id); loadThreads(); return; }
    if (e.t === 'text') setItems(it => { const last = it[it.length - 1]; return last?.k === 'text' ? [...it.slice(0, -1), { k: 'text', text: last.text + e.delta }] : [...it, { k: 'text', text: e.delta }]; });
    else if (e.t === 'tool_start') setItems(it => [...it, { k: 'tool', id: e.id, name: e.name, input: e.input, running: true }]);
    else if (e.t === 'tool_end') { setItems(it => it.map(x => (x.k === 'tool' && x.id === e.id ? { ...x, running: false, label: e.label, ui: e.ui, error: e.error } : x))); if (e.ui && !inlineUi(e.ui)) setArt({ ...e.ui, _n: Date.now() }); }
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
              <h1>像跟同事交代一样，说一句最实际的要求</h1>
              <p>不用一次说全。哪家企业、找什么样的人、考什么、做多久——缺的我一件件问，没说的先按常理定好给你确认。素材和以前用过的题，随时传给我。题出好在右边打开，不对就当场改。</p>
              <Composer text={text} setText={setText} busy={busy} send={send} stop={() => abortRef.current?.abort()} model={model} setModel={setModel} autoFocus />
              <div className="wc-sec" style={{ margin: '24px 2px 10px' }}>比如这样说（点一下放进输入框，改成你的话再发）</div>
              <div className="wc-suggest">{SUGGEST.map(x => <button key={x.t} className="wc-card" onClick={() => { setText(x.p); setTimeout(() => (document.querySelector('.wc-composer textarea') as HTMLTextAreaElement | null)?.focus(), 0); }}><b>{x.t}</b><span>「{x.p}」</span></button>)}</div>
            </div>
          ) : (
            <>
              <div className="wc-thread">
                {items.map((x, i) => {
                  if (x.k === 'user') { const lines = String(x.text || '').split('\n'); const isF = (l: string) => l.startsWith('【文件】') || l.startsWith('【素材】'); const atts = lines.filter(isF).map(l => l.slice(4).split('｜')[0]); const plain = lines.filter(l => !isF(l)).join('\n').trim(); return <div key={i} className="wc-user"><div className="wc-bubble">{plain}{atts.length > 0 && <div className="wc-atts">{atts.map((n, j) => <span key={j} className="wc-att">📎 {n}</span>)}</div>}</div></div>; }
                  if (x.k === 'text') return <div key={i} className="wc-ai"><span className="wc-ava">题</span><div className="wc-ai-body"><Md text={x.text} /></div></div>;
                  if (x.k === 'tool') return <React.Fragment key={x.id}><div className="wc-tool"><span className={`wc-dot${x.running ? ' run' : x.error ? ' err' : ''}`} /><span className="wc-tool-t">{x.running ? `${RUNNING[x.name] || x.name}…` : x.label || x.name}</span>{x.ui && !x.running && !inlineUi(x.ui) && <button className="wc-link" onClick={() => setArt({ ...x.ui, _n: Date.now() })}>看 →</button>}{x.error && <span className="wc-err-t">{x.error}</span>}</div>{x.ui?.kind === 'companies' && !x.running && <CompanyHits list={x.ui.list} />}</React.Fragment>;
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
