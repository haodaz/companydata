'use client';
/**
 * 产业投资地图 · 对话。对话区最大，应用区是它里面展开的卡片框，可开多个标签；回答里的企业、机构点开进应用区。
 * 显隐开关在对话区右上角，放大和收起在应用区自己的栏上。应用区打开且屏幕不宽时侧栏自动收起；手机上不自动弹出。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Maximize2, Minimize2, PanelRight, Square, X } from 'lucide-react';
import { Md } from '@/components/ws/Md';
import { fromHistory, type Item } from '@/components/work/ChatKit';
import { ActCtx, ChainBoard, CompanyDetail, CompanyTable, InvestorDetail, Overview, PathCards, TipBox, useAct, useOverview, useTip, type Act } from '../ui';

type Tab = { key: string; title: string; panel: 'company' | 'investor' | 'chain' | 'overview' | 'projects' | 'path'; id?: number; name?: string; chain?: string; params?: any; paths?: any[] };
const keyOf = (u: any) => [u.panel, u.id, u.name, u.chain, u.params && JSON.stringify(u.params)].filter(Boolean).join(':');
const STARTS = [
  { t: '看一个产业', d: '半导体哪些环节近三年融资最热？', p: '半导体哪些环节近三年融资最热？还有哪些环节企业不少但很少融资？' },
  { t: '看一家机构', d: '红杉中国最近投了什么，常和谁一起投', p: '红杉中国最近投了什么？常和哪些机构一起投？' },
  { t: '找项目', d: '上海在大量招人、还没见融资的 AI 公司', p: '上海有哪些在大量招人、还没见融资的人工智能公司？' },
  { t: '查一个人或一家公司', d: '谁是 CTO、团队和融资历程', p: '帮我看一下深圳优艾智合机器人的融资历程和管理团队' },
];
const RUNNING: Record<string, string> = { industry_overview: '看产业全景', chain_map: '看产业链', search_companies: '筛企业', company_profile: '看企业资料', search_investors: '找机构', investor_profile: '看机构画像', search_financings: '查融资', search_people: '查人', search_jobs: '查岗位', search_news: '查动态', search_products: '查产品', search_knowledge: '查职业和标准', search_person: '查人', find_path: '找路径', open_panel: '打开应用区' };

function Panel({ t, on }: { t: Tab; on: any }) {
  if (t.panel === 'path') return <PathCards paths={t.paths || []} />;
  if (t.panel === 'company') return <CompanyDetail id={t.id!} />;
  if (t.panel === 'investor') return <InvestorDetail name={t.name!} on={on} />;
  if (t.panel === 'projects') return <CompanyTable params={t.params || { chain: 'all' }} />;
  return <ChainOrOverview t={t} on={on} />;
}
function ChainOrOverview({ t, on }: { t: Tab; on: any }) {
  const chain = t.chain || 'all', { d, err } = useOverview(chain);
  if (err) return <div className="iv-empty">{err}</div>;
  if (!d) return <div className="iv-empty">读取中…</div>;
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{t.panel === 'chain' ? <ChainBoard d={{ ...d, chain }} on={on} /> : <Overview d={d} on={on} />}</div>;
}

export default function InvestChat() {
  const outer = useAct();
  const [items, setItems] = useState<Item[]>([]), [busy, setBusy] = useState(false), [text, setText] = useState(''), [threadId, setThreadId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]), [active, setActive] = useState(''), [show, setShow] = useState(false), [full, setFull] = useState(false);
  const abort = useRef<AbortController | null>(null), end = useRef<HTMLDivElement>(null), tid = useRef<string | null>(null); tid.current = threadId;
  const { tip, on } = useTip();
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [items]);
  useEffect(() => { window.dispatchEvent(new CustomEvent('iv-thread', { detail: threadId })); }, [threadId]);

  /** auto：AI 打开的，手机上不自动弹；人点的直接弹 */
  const openTab = useCallback((u: any, auto = false) => {
    const key = keyOf(u);
    setTabs(ts => ts.some(t => t.key === key) ? ts : [...ts, { ...u, key }]);
    setActive(key);
    if (!auto || window.innerWidth > 760) { setShow(true); if (window.innerWidth < 1440) window.dispatchEvent(new Event('iv-side')); }
  }, []);
  const act = useMemo<Act>(() => ({ company: (id, name) => openTab({ panel: 'company', id, title: name || '企业' }), investor: n => openTab({ panel: 'investor', name: n, title: n }), place: p => openTab({ panel: 'projects', params: { chain: 'all', place: p }, title: `${p}企业` }), canAdmin: outer.canAdmin }), [openTab, outer.canAdmin]);
  const closeTab = (key: string) => setTabs(ts => { const left = ts.filter(t => t.key !== key); if (!left.length) { setShow(false); setFull(false); } else if (active === key) setActive(left[left.length - 1].key); return left; });

  const reset = useCallback(() => { abort.current?.abort(); setBusy(false); setItems([]); setTabs([]); setActive(''); setShow(false); setFull(false); }, []);
  const openThread = useCallback(async (id: string) => {
    reset(); setThreadId(id);
    const j = await (await fetch(`/api/invest/chat?id=${id}`)).json(); if (!j.ok) return;
    const hist = fromHistory(j.thread.messages || []);
    setItems(hist);
    // 这段对话里 AI 打开过的东西恢复成标签，停在最后一个
    const seen = new Map<string, Tab>();
    for (const x of hist) if (x.k === 'tool' && x.ui?.kind === 'invest') seen.set(keyOf(x.ui), { ...x.ui, key: keyOf(x.ui) });
    if (seen.size) { const list = [...seen.values()]; setTabs(list); setActive(list[list.length - 1].key); if (window.innerWidth > 760) setShow(true); }
  }, [reset]);
  useEffect(() => { const h = (e: Event) => { const id = (e as CustomEvent).detail; if (id) openThread(id); else { reset(); setThreadId(null); } }; window.addEventListener('iv-open', h); return () => window.removeEventListener('iv-open', h); }, [openThread, reset]);

  const onEvent = (e: any) => {
    if (e.t === 'thread') { setThreadId(e.id); window.dispatchEvent(new Event('iv-threads')); }
    else if (e.t === 'text') setItems(it => { const l = it[it.length - 1]; return l?.k === 'text' ? [...it.slice(0, -1), { k: 'text', text: l.text + e.delta }] : [...it, { k: 'text', text: e.delta }]; });
    else if (e.t === 'tool_start') setItems(it => [...it, { k: 'tool', id: e.id, name: e.name, input: e.input, running: true }]);
    else if (e.t === 'tool_end') { setItems(it => it.map(x => (x.k === 'tool' && x.id === e.id ? { ...x, running: false, label: e.label, ui: e.ui, error: e.error } : x))); if (e.ui?.kind === 'invest') openTab(e.ui, true); }
    else if (e.t === 'ask') setItems(it => [...it, { k: 'ask', id: e.id, question: e.question, options: e.options }]);
    else if (e.t === 'error') setItems(it => [...it, { k: 'error', text: e.message }]);
  };
  const send = async (raw: string) => {
    const t = raw.trim(); if (!t || busy) return;
    setText(''); setBusy(true);
    setItems(it => [...it.map(x => (x.k === 'ask' && !x.answered ? { ...x, answered: t } : x)), { k: 'user', text: t }]);
    const ac = new AbortController(); abort.current = ac;
    try {
      const res = await fetch('/api/invest/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: tid.current, text: t }), signal: ac.signal });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); setItems(it => [...it, { k: 'error', text: j.error || `出错了（${res.status}）` }]); return; }
      const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let nl; while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (line.trim()) onEvent(JSON.parse(line)); } }
    } catch (e: any) { if (e?.name !== 'AbortError') setItems(it => [...it, { k: 'error', text: e.message }]); }
    finally { setBusy(false); setItems(it => it.map(x => (x.k === 'tool' && x.running ? { ...x, running: false, label: x.label || '中断了' } : x))); window.dispatchEvent(new Event('iv-threads')); }
  };
  const sendRef = useRef(send); sendRef.current = send;
  useEffect(() => {
    const q = new URLSearchParams(location.search), th = q.get('thread');
    if (th) { openThread(th); return; }
    let p = ''; try { p = sessionStorage.getItem('iv-pending') || ''; sessionStorage.removeItem('iv-pending'); } catch {}
    if (p) setTimeout(() => sendRef.current(p), 0);
  }, [openThread]);

  /** 回答里的企业 / 机构链接：进应用区，不跳页 */
  const onLink = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest?.('a'); const h = a?.getAttribute('href') || '';
    const c = h.match(/^\/invest\/c\/(\d+)/), i = h.match(/^\/invest\/i\/(.+)/);
    if (c) { e.preventDefault(); act.company(Number(c[1]), a!.textContent || undefined); }
    else if (i) { e.preventDefault(); act.investor(decodeURIComponent(i[1])); }
  };
  const pending = [...items].reverse().find(x => x.k === 'ask' && !x.answered) as Extract<Item, { k: 'ask' }> | undefined;
  const composer = (auto: boolean) => <div className="iv-ask"><textarea rows={2} autoFocus={auto} value={text} placeholder={pending ? '选一个，或者直接打字回答…' : '企业、融资、投资机构、产业链、人、岗位，都可以问'} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} /><div className="iv-ask-bar">{busy ? <button className="iv-send" aria-label="停止" onClick={() => abort.current?.abort()}><Square size={13} fill="currentColor" /></button> : <button className="iv-send" aria-label="发送" disabled={!text.trim()} onClick={() => send(text)}><ArrowUp size={17} /></button>}</div></div>;
  const last = items[items.length - 1];
  const cur = tabs.find(t => t.key === active);
  return <ActCtx.Provider value={act}><div className="iv-chat">
    <section className="iv-talk" onClickCapture={onLink}>
      {tabs.length > 0 && <div className="iv-talk-top"><button className={`iv-tog${show ? ' on' : ''}`} aria-pressed={show} onClick={() => { setShow(v => !v); setFull(false); }}><PanelRight size={14} />应用区 {tabs.length}</button></div>}
      {!items.length && <div className="iv-scene" aria-hidden />}
      {!items.length ? <div className="iv-hero"><div className="iv-eb">产业投资地图</div><h1>想查什么，直接说</h1>{composer(true)}<div className="iv-starts">{STARTS.map(s => <button key={s.t} onClick={() => send(s.p)}><b>{s.t}</b><span>{s.d}</span></button>)}</div></div> : <>
        <div className="iv-stream">
          {items.map((x, i) => {
            if (x.k === 'user') return <div key={i} className="iv-user"><div>{x.text}</div></div>;
            if (x.k === 'text') return <div key={i} className="iv-ai"><Md text={x.text} /></div>;
            if (x.k === 'tool') return <div key={x.id} className="iv-step"><i className={x.running ? 'run' : x.error ? 'err' : ''} />{x.running ? `${RUNNING[x.name] || '处理中'}…` : x.ui?.kind === 'invest' ? <a className="iv-link" onClick={() => openTab(x.ui)}>{x.label}</a> : x.label || '完成'}</div>;
            if (x.k === 'ask') return <div key={x.id} className="iv-ai"><div>{x.question}</div><div className="iv-opts">{x.options.map(o => <button key={o} disabled={!!x.answered || busy} onClick={() => send(o)}>{o}</button>)}</div></div>;
            return <div key={i} className="iv-err">{x.text}</div>;
          })}
          {busy && last?.k !== 'text' && !(last?.k === 'tool' && last.running) && <div className="iv-step"><i className="run" />在想…</div>}
          <div ref={end} style={{ height: 6 }} />
        </div>
        <div className="iv-dock">{composer(false)}</div>
      </>}
    </section>
    {show && cur && <aside className={`iv-app${full ? ' full' : ''}`}>
      <div className="iv-app-h"><div className="iv-tabs">{tabs.map(t => <button key={t.key} className={`iv-tab${t.key === active ? ' on' : ''}`} onClick={() => setActive(t.key)} title={t.title}><span>{t.title}</span><u role="button" aria-label={`关闭${t.title}`} onClick={e => { e.stopPropagation(); closeTab(t.key); }}>×</u></button>)}</div><button className="iv-ic" aria-label={full ? '退出放大' : '放大'} onClick={() => setFull(f => !f)}>{full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button><button className="iv-ic" aria-label="收起应用区" onClick={() => { setShow(false); setFull(false); }}><X size={16} /></button></div>
      <div className="iv-app-b" key={cur.key}><Panel t={cur} on={on} /></div>
    </aside>}
    <TipBox tip={tip} />
  </div></ActCtx.Provider>;
}
