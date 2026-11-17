'use client';

/**
 * AI 工作台（2026-11-17 beta）：像 Claude Code 那样带一个 AI 代理做 project。是一种作答形态，和评分方式（全看 / AI 使用 / AI 驾驭量表）是两件事，任何题都能用。
 * 左：工作区文件（题目给的材料都在里面，代理和人都能读写）；中：和代理的对话（最大）；右：对话区里展开的文件卡（任务书 / 文件，能改、能跑）。
 * 代理的工具在本页执行（文件在内存，Python 在 Pyodide Worker），服务端每步记日志；人自己的动作（打开 / 改 / 跑 / 撤销 AI 的改动 / 叫停）记成事件。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MdView, RulesView } from '@/components/work/WorkText';
import { useL } from '@/lib/work/i18n';
import { AGENT_MODELS, DEFAULT_AGENT_MODEL, buildAgentDeliverable, initialFiles, outputsOf, type WsFile } from '@/lib/work/agent-bench';
import { runPython, warmSandbox, type RunResult } from './agent/sandbox';

type Task = { id: string; company_name: string; role: string; statement?: string; task: any; materials: any[] };
type Ev = { t: number; type: string; [k: string]: any };
type Call = { id: string; name: string; input: any };
type Item =
  | { k: 'user'; text: string }
  | { k: 'agent'; text: string }
  | { k: 'tool'; id: string; name: string; input: any; state: 'run' | 'ok' | 'err' | 'skip'; out?: string }
  | { k: 'note'; text: string }
  | { k: 'plan'; id: string; text: string; state: 'open' | 'ok' | 'edit' | 'reject' | 'closed' }
  | { k: 'confirm'; id: string; path: string; act: 'write' | 'edit' | 'delete'; before: string; after: string; state: 'wait' | 'ok' | 'no' };

const C = { bg: '#f6f6f9', card: '#ffffff', line: '#e7e7ee', ink: '#1d1d2b', ink2: '#6b6b80', brand: '#5b50e6', soft: '#f1f0ff', ok: '#16a34a', bad: '#dc2626', mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' };
const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const sizeOf = (f: WsFile) => (f.bin ? Math.round(f.content.length * 0.75) : f.content.length);
const BRIEF = '__brief';

function toolLabel(name: string, input: any, L: (a: string, b: string) => string) {
  const p = input?.path ? ` ${input.path}` : '';
  if (name === 'web_search') return L(`联网检索：${String(input?.query || '').slice(0, 60)}`, `Web search: ${String(input?.query || '').slice(0, 60)}`);
  return ({ list_files: L('看了一眼工作区', 'Listed files'), read_file: L(`读${p}`, `Read${p}`), write_file: L(`写入${p}`, `Wrote${p}`), edit_file: L(`修改${p}`, `Edited${p}`), delete_file: L(`删除${p}`, `Deleted${p}`), run_python: input?.path ? L(`运行${p}`, `Ran${p}`) : L('运行一段 Python', 'Ran Python') } as Record<string, string>)[name] || name;
}

/** 历史里的步骤 → 对话流 */
function itemsOf(turns: any[]): Item[] {
  const out: Item[] = [];
  for (const tn of turns) {
    out.push({ k: 'user', text: tn.q });
    const res = new Map<string, any>();
    for (const m of tn.steps) if (m.role === 'tool') for (const r of m.results) res.set(r.id, r);
    const lastText = [...tn.steps].reverse().find((m: any) => m.role === 'assistant' && m.text);
    for (const m of tn.steps) if (m.role === 'assistant') {
      if (m.text) out.push(tn.plan && m === lastText ? { k: 'plan', id: `p${out.length}`, text: m.text, state: 'closed' } : { k: 'agent', text: m.text });
      for (const c of m.calls) { const r = res.get(c.id); out.push({ k: 'tool', id: c.id, name: c.name, input: c.input, state: !r ? 'skip' : r.is_error ? 'err' : 'ok', out: r ? String(r.content).slice(0, 2000) : undefined }); }
    }
    if (tn.stopped) out.push({ k: 'note', text: '你叫停了这一轮' });
  }
  return out;
}

/** 逐行对比（改动确认卡用）：太大就不细比，整段旧 / 新 */
function lineDiff(a: string, b: string): { t: '+' | '-' | ' '; s: string }[] {
  const x = a ? a.split('\n') : [], y = b ? b.split('\n') : [];
  if (x.length * y.length > 250_000) return [...x.map(s => ({ t: '-' as const, s })), ...y.map(s => ({ t: '+' as const, s }))];
  const n = x.length, m = y.length, dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { t: '+' | '-' | ' '; s: string }[] = []; let i = 0, j = 0;
  while (i < n && j < m) { if (x[i] === y[j]) { out.push({ t: ' ', s: x[i] }); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ t: '-', s: x[i++] }); else out.push({ t: '+', s: y[j++] }); }
  while (i < n) out.push({ t: '-', s: x[i++] }); while (j < m) out.push({ t: '+', s: y[j++] });
  return out;
}

export function AgentWork({ token, sid, task, resume, limit, grading, error, onSubmit }: { token: string; sid: string; task: Task; resume?: any; limit: number | null; grading: boolean; error?: string; onSubmit: (deliverable: string, events: Ev[], auto?: boolean) => Promise<void> }) {
  const L = useL(); const lang = task.task?.lang;
  const original = useMemo(() => initialFiles(task), [task]);
  const outputs = useMemo(() => outputsOf(task), [task]);
  const [files, setFilesState] = useState<WsFile[]>(original); const filesRef = useRef(files);
  const setFiles = (f: WsFile[]) => { filesRef.current = f; setFilesState(f); };
  const undo = useRef(new Map<string, WsFile | null>());   // AI 最近一次改某个文件之前的样子（人可以撤销）
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const stopRef = useRef(false);
  const [live, setLive] = useState<{ text: string; chars: number } | null>(null);   // 正在流式输出的这一步
  const stepT0 = useRef(0);   // 这一步开始的时间：等得久时显示秒数，让人知道它还活着
  const [planMode, setPlanMode] = useState(false); const [confirmMode, setConfirmMode] = useState(false); const confirmRef = useRef(false); confirmRef.current = confirmMode;
  const waits = useRef(new Map<string, (ok: boolean) => void>());   // 等人确认的改动
  const [planDraft, setPlanDraft] = useState<Record<string, string>>({});
  const [model, setModel] = useState(DEFAULT_AGENT_MODEL);
  const [tabs, setTabs] = useState<string[]>([BRIEF]); const [active, setActive] = useState(BRIEF);
  const [appOpen, setAppOpen] = useState(true); const [appMax, setAppMax] = useState(false); const [tree, setTree] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1280);   // 笔电窄屏：文件区开着时工作区默认收起
  const [py, setPy] = useState<'loading' | 'ready' | 'fail'>('loading');
  const [runOut, setRunOut] = useState<Record<string, RunResult>>({});
  const [editMode, setEditMode] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState(''); const [arm, setArm] = useState(false); const [disc, setDisc] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const t0 = useRef(Date.now() - (resume?.elapsed_s || 0) * 1000);
  const [now, setNow] = useState<number>(resume?.elapsed_s || 0);
  const now_s = () => Math.round((Date.now() - t0.current) / 1000);
  const buf = useRef<Ev[]>([]);
  const ev = useCallback((type: string, extra: Record<string, any> = {}) => { buf.current.push({ t: now_s(), type, ...extra }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const chatEnd = useRef<HTMLDivElement>(null);
  const draftKey = `work:agent:${sid}`;

  // 恢复：服务器的对话 + 草稿里的文件（本机 localStorage 更新就用本机的）
  useEffect(() => {
    (async () => {
      try {
        const j = await (await fetch(`/api/work/${token}/sessions/${sid}/agent`)).json();
        if (j.ok) { setItems(itemsOf(j.turns || [])); const local = (() => { try { return JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch { return null; } })(); const d = local?.files ? local : j.draft?.agent; if (d?.files?.length) setFiles(d.files); if (d?.model) setModel(d.model); if (d?.plan) setPlanMode(true); if (d?.confirm) setConfirmMode(true); }
      } catch { /* 新作答 */ }
      setRestored(true);
    })();
    warmSandbox().then(r => setPy(r.ok ? 'ready' : 'fail'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'end' }); }, [items, live?.text.length, live?.chars]);

  const deliverable = useCallback((img: Record<string, string> = {}) => buildAgentDeliverable(filesRef.current, outputs, original, img), [outputs, original]);
  // 时钟 + 每 30 秒同步（事件、交付物、草稿 = 工作区文件）；关页时补发
  useEffect(() => { const iv = setInterval(() => setNow(now_s()), 1000); return () => clearInterval(iv); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!restored) return;
    const draft = () => ({ agent: { files: filesRef.current.filter(f => !f.bin || f.content.length < 300_000), model, plan: planMode, confirm: confirmMode } });
    try { localStorage.setItem(draftKey, JSON.stringify(draft().agent)); } catch { /* 太大 */ }
    const sync = async () => { const events = buf.current.splice(0); try { await fetch(`/api/work/${token}/sessions/${sid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events, deliverable: deliverable(), draft: draft() }) }); } catch { buf.current.unshift(...events); } };
    const iv = setInterval(sync, 30_000);
    const flush = () => { if (document.visibilityState === 'visible') return; const events = buf.current.splice(0); navigator.sendBeacon(`/api/work/${token}/sessions/${sid}`, new Blob([JSON.stringify({ events: [...events, { t: now_s(), type: 'leave' }], deliverable: deliverable() })], { type: 'application/json' })); };
    document.addEventListener('visibilitychange', flush); window.addEventListener('pagehide', flush);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', flush); };
  }, [restored, files, model, planMode, confirmMode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (grading) return; e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [grading]);

  // ── 文件操作 ──
  const put = (f: WsFile, by: 'agent' | 'human') => {
    const cur = filesRef.current, i = cur.findIndex(x => x.path === f.path);
    if (by === 'agent') undo.current.set(f.path, i >= 0 ? cur[i] : null);
    const next = { ...f, by };
    setFiles(i >= 0 ? cur.map((x, k) => (k === i ? next : x)) : [...cur, next].sort((a, b) => a.path.localeCompare(b.path)));
  };
  const drop = (path: string, by: 'agent' | 'human') => { const cur = filesRef.current; const f = cur.find(x => x.path === path); if (by === 'agent' && f) undo.current.set(path, f); setFiles(cur.filter(x => x.path !== path)); };
  const openFile = (path: string, human = true) => { setTabs(t => (t.includes(path) ? t : [...t, path])); setActive(path); setAppOpen(true); if (human) ev('ws_open', { note: path.slice(0, 120) }); };
  const closeTab = (p: string) => { const t = tabs.filter(x => x !== p); setTabs(t); if (active === p) setActive(t[t.length - 1] || ''); if (!t.length) setAppOpen(false); };
  const applyRun = (r: RunResult, by: 'agent' | 'human') => { for (const f of r.changed) put(f, by); for (const p of r.deleted) drop(p, by); };

  // ── 代理的工具：在本页执行 ──
  const exec = async (c: Call): Promise<{ content: string; is_error?: boolean; out?: string }> => {
    const i = c.input || {}, p = String(i.path || '').replace(/^\.?\/+/, '');
    const f = filesRef.current.find(x => x.path === p);
    switch (c.name) {
      case 'list_files': return { content: JSON.stringify(filesRef.current.map(x => ({ path: x.path, size: sizeOf(x), by: x.by }))) };
      case 'read_file': {
        if (!f) return { content: JSON.stringify({ error: `没有这个文件：${p}` }), is_error: true };
        if (f.bin) return { content: JSON.stringify({ path: p, binary: true, bytes: sizeOf(f) }) };
        const lines = f.content.split('\n'); const a = Math.max(1, Number(i.start_line) || 1), b = Math.min(lines.length, Number(i.end_line) || lines.length);
        const body = lines.slice(a - 1, b).join('\n');
        return { content: body.length > 30000 ? `${body.slice(0, 30000)}\n……（文件共 ${lines.length} 行，后面没读，用 start_line / end_line 分段读）` : body };
      }
      case 'web_search': {
        const query = String(i.query || '').trim();
        try { const j = await (await fetch(`/api/work/${token}/sessions/${sid}/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ search: query }) })).json(); return j.ok ? { content: j.text, out: j.text } : { content: JSON.stringify({ error: j.error }), is_error: true }; }
        catch (e: any) { return { content: JSON.stringify({ error: String(e?.message || e) }), is_error: true }; }
      }
      case 'write_file': if (!p) return { content: '{"error":"缺 path"}', is_error: true }; if (typeof i.content !== 'string') return { content: '{"error":"content 不完整（可能输出被截断），文件没写；分段写"}', is_error: true }; if (!(await ask(c.id, p, 'write', f && !f.bin ? f.content : '', String(i.content ?? '')))) return refused(p); put({ path: p, content: String(i.content ?? '') }, 'agent'); return { content: JSON.stringify({ ok: true, path: p, chars: String(i.content ?? '').length, action: f ? (f.by === 'agent' ? '覆盖了你自己之前写的版本' : '覆盖了已有文件') : '新建' }) };
      case 'edit_file': {
        if (!f || f.bin) return { content: JSON.stringify({ error: `没有这个文本文件：${p}` }), is_error: true };
        const o = String(i.old_text ?? ''); const n = f.content.split(o).length - 1;
        if (!o || n !== 1) return { content: JSON.stringify({ error: n ? `old_text 出现了 ${n} 次，要唯一` : 'old_text 在文件里找不到' }), is_error: true };
        const next = f.content.replace(o, String(i.new_text ?? ''));
        if (!(await ask(c.id, p, 'edit', f.content, next))) return refused(p);
        put({ path: p, content: next }, 'agent'); return { content: JSON.stringify({ ok: true, path: p }) };
      }
      case 'delete_file': if (!f) return { content: JSON.stringify({ error: `没有这个文件：${p}` }), is_error: true }; if (!(await ask(c.id, p, 'delete', f.bin ? '（二进制文件）' : f.content, ''))) return refused(p); drop(p, 'agent'); return { content: JSON.stringify({ ok: true }) };
      case 'run_python': {
        if (p && !f) return { content: JSON.stringify({ error: `没有这个文件：${p}` }), is_error: true };
        const r = await runPython(filesRef.current, { path: p || undefined, code: i.code });
        applyRun(r, 'agent');
        const out = `${r.stdout}${r.stderr ? `\n[stderr]\n${r.stderr}` : ''}`.trim();
        return { content: JSON.stringify({ ok: r.ok, seconds: Math.round(r.ms / 100) / 10, stdout: r.stdout.slice(-8000), stderr: r.stderr.slice(-4000), changed: r.changed.map(x => x.path), deleted: r.deleted }), is_error: !r.ok, out: out.slice(-3000) };
      }
    }
    return { content: JSON.stringify({ error: `没有这个工具：${c.name}` }), is_error: true };
  };

  /** 「改动要我确认」开着时：AI 写 / 改 / 删文件先停下，在对话里出一张对比卡，人点接受或拒绝 */
  const ask = (id: string, path: string, act: 'write' | 'edit' | 'delete', before: string, after: string) => {
    if (!confirmRef.current || stopRef.current) return Promise.resolve(!stopRef.current);
    setItems(x => [...x, { k: 'confirm', id: `c${id}`, path, act, before, after, state: 'wait' }]);
    return new Promise<boolean>(res => waits.current.set(`c${id}`, res));
  };
  const answer = (cid: string, ok: boolean, path: string) => {
    const f = waits.current.get(cid); if (!f) return; waits.current.delete(cid);
    setItems(x => x.map(it => (it.k === 'confirm' && it.id === cid ? { ...it, state: ok ? 'ok' : 'no' } : it)));
    ev(ok ? 'change_ok' : 'change_reject', { note: path.slice(0, 120) }); f(ok);
  };
  const refused = (p: string) => ({ content: JSON.stringify({ error: `用户拒绝了这次对 ${p} 的改动，文件没变。先问清楚他要什么再改。` }), is_error: true });
  /** 一步：流式读回（逐字 + 写长文件时的进度），最后一行是结果；服务端直接回 JSON 的（叫停、到步数上限、出错）照常读 */
  const post = async (body: any) => {
    setLive({ text: '', chars: 0 }); stepT0.current = Date.now();   // 头要等第一个字才到，计时从发出去算
    const r = await fetch(`/api/work/${token}/sessions/${sid}/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, stream: true, files: filesRef.current.map(f => ({ path: f.path, size: sizeOf(f), by: f.by })) }) });
    if (!/ndjson/.test(r.headers.get('content-type') || '') || !r.body) { setLive(null); return r.json(); }
    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', fin: any = null;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let k: number;
      while ((k = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, k); buf = buf.slice(k + 1); if (!line.trim()) continue;
        let o: any; try { o = JSON.parse(line); } catch { continue; }
        if (o.t === 'text') setLive(l => ({ text: (l?.text || '') + o.delta, chars: l?.chars || 0 }));
        else if (o.t === 'input') setLive(l => ({ text: l?.text || '', chars: o.chars }));
        else if (o.t === 'done') fin = o;
      }
    }
    setLive(null);
    return fin || { ok: false, error: L('连接断了，再说一次试试', 'Connection lost. Please try again.') };
  };
  const send = async (text: string, opt: { plan?: boolean } = {}) => {
    if (!text.trim() || busy) return;
    const plan = opt.plan ?? planMode;
    setQ(''); setBusy(true); setErr(''); stopRef.current = false;
    ev('ai_ask', { chars: text.length, ...(plan ? { note: 'plan' } : {}) });
    setItems(x => [...x, { k: 'user', text }]);
    try {
      let j = await post({ q: text, model, plan });
      for (let guard = 0; guard < 45; guard++) {
        if (!j.ok) { setErr(j.error || L('AI 出错了', 'The AI hit an error')); break; }
        if (j.text) setItems(x => [...x, j.plan && (j.done || !j.calls?.length) ? { k: 'plan', id: `p${Date.now()}`, text: j.text, state: 'open' } : { k: 'agent', text: j.text }]);
        if (j.done || !j.calls?.length) break;
        const results: any[] = [];
        for (const c of j.calls as Call[]) {
          if (stopRef.current) { setItems(x => [...x, { k: 'tool', id: c.id, name: c.name, input: c.input, state: 'skip' }]); continue; }
          setItems(x => [...x, { k: 'tool', id: c.id, name: c.name, input: c.input, state: 'run' }]);
          const r = await exec(c);
          results.push({ id: c.id, content: r.content, is_error: r.is_error });
          setItems(x => x.map(it => (it.k === 'tool' && it.id === c.id ? { ...it, state: r.is_error ? 'err' : 'ok', out: r.out } : it)));
          if (['write_file', 'edit_file'].includes(c.name) && c.input?.path && outputs.some(o => o.path === c.input.path)) openFile(c.input.path, false);
        }
        if (stopRef.current) { await post({ results, stop: true }); setItems(x => [...x, { k: 'note', text: L('你叫停了这一轮', 'You stopped this turn') }]); break; }
        j = await post({ results });
      }
    } catch (e: any) { setErr(String(e?.message || e)); }
    setBusy(false);
  };
  const stop = () => { stopRef.current = true; ev('agent_stop'); for (const [cid, f] of waits.current) { setItems(x => x.map(it => (it.k === 'confirm' && it.id === cid ? { ...it, state: 'no' } : it))); f(false); } waits.current.clear(); };
  const decidePlan = (it: Extract<Item, { k: 'plan' }>, how: 'ok' | 'edit' | 'reject') => {
    setItems(x => x.map(y => (y.k === 'plan' && y.id === it.id ? { ...y, state: how } : y)));
    if (how === 'ok') { ev('agent_plan', { note: 'ok' }); send(L('批准，按这个计划执行。', 'Approved. Go ahead with this plan.'), { plan: false }); }
    else if (how === 'edit') { const d = planDraft[it.id] ?? it.text; ev('agent_plan', { note: 'edit', delta: d.length - it.text.length }); send(L(`按我改过的计划执行：\n${d}`, `Go ahead with my edited plan:\n${d}`), { plan: false }); }
    else ev('agent_plan', { note: 'reject' });
  };
  const toggleMode = (k: 'plan' | 'confirm') => { if (k === 'plan') { setPlanMode(v => { ev('agent_mode', { note: `plan:${!v ? 'on' : 'off'}` }); return !v; }); } else { setConfirmMode(v => { ev('agent_mode', { note: `confirm:${!v ? 'on' : 'off'}` }); return !v; }); } };

  // 人自己动文件
  const editTimer = useRef<Record<string, { t: any; d: number }>>({});
  const humanEdit = (path: string, content: string) => {
    const f = filesRef.current.find(x => x.path === path); const d = content.length - (f?.content.length || 0);
    put({ path, content }, 'human');
    const k = editTimer.current[path] || { t: null, d: 0 }; k.d += d; clearTimeout(k.t);
    k.t = setTimeout(() => { ev('ws_edit', { note: path.slice(0, 120), delta: k.d }); editTimer.current[path] = { t: null, d: 0 }; }, 3000); editTimer.current[path] = k;
  };
  const humanRun = async (path: string) => {
    setRunOut(r => ({ ...r, [path]: { ok: true, stdout: L('运行中…', 'Running…'), stderr: '', changed: [], deleted: [], ms: 0 } }));
    const r = await runPython(filesRef.current, { path }); applyRun(r, 'human'); setRunOut(x => ({ ...x, [path]: r }));
    ev('ws_run', { note: path.slice(0, 120), id: r.ok ? 'ok' : 'err' });
  };
  const revert = (path: string) => { const prev = undo.current.get(path); if (prev === undefined) return; if (prev) put(prev, 'human'); else drop(path, 'human'); undo.current.delete(path); ev('ws_revert', { note: path.slice(0, 120) }); };
  const newFile = () => { const p = window.prompt(L('新文件的路径（如 notes.md、output/check.py）', 'New file path (e.g. notes.md, output/check.py)')); if (!p?.trim()) return; const path = p.trim().replace(/^\/+/, ''); if (!filesRef.current.some(f => f.path === path)) put({ path, content: '' }, 'human'); ev('ws_new', { note: path.slice(0, 120) }); openFile(path, false); setEditMode(m => ({ ...m, [path]: true })); };
  const download = (f: WsFile) => { const a = document.createElement('a'); a.href = f.bin ? f.content : URL.createObjectURL(new Blob([f.content], { type: 'text/plain' })); a.download = f.path.split('/').pop() || 'file'; a.click(); ev('download', { note: f.path.slice(0, 120) }); };

  // ── 交卷 ──
  const missing = outputs.filter(o => { const f = files.find(x => x.path === o.path); return !f || (!f.bin && !f.content.trim()); });
  const finish = async (auto?: boolean) => {
    if (disc && disc.trim().length >= 10) ev('ai_disclosure', { text: disc.trim().slice(0, 800) });
    const imgs: Record<string, string> = {};
    for (const f of filesRef.current.filter(x => x.bin && /\.(png|jpe?g|gif|webp)$/i.test(x.path) && (outputs.some(o => o.path === x.path) || /^output\//.test(x.path))).slice(0, 8)) {
      try { const blob = await (await fetch(f.content)).blob(); const fd = new FormData(); fd.append('file', new File([blob], f.path.replace(/\//g, '_'), { type: blob.type })); fd.append('kind', 'file'); const j = await (await fetch(`/api/work/${token}/sessions/${sid}/upload`, { method: 'POST', body: fd })).json(); if (j.ok) imgs[f.path] = j.url; } catch { /* 图没传上去就只交文字 */ }
    }
    try { await fetch(`/api/work/${token}/sessions/${sid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: [], draft: { agent: { files: filesRef.current.filter(f => !f.bin || f.content.length < 300_000), model } } }) }); } catch { /* 草稿没存上不影响交卷 */ }
    onSubmit(deliverable(imgs), buf.current.splice(0), auto);
  };
  const submit = () => {
    if (busy) { setErr(L('AI 还在干活，先等它停下或点「停」', 'The AI is still working. Wait or click Stop first.')); return; }
    if (!arm) { setArm(true); if (missing.length) setErr(L(`${missing.map(o => o.path).join('、')} 还是空的。确定要交就再点一次`, `${missing.map(o => o.path).join(', ')} is still empty. Click again if you're sure.`)); setTimeout(() => { setArm(false); setErr(''); }, 6000); return; }
    setArm(false); setErr('');
    if (disc == null) { setDisc(''); return; }
    finish();
  };
  const left = limit == null ? null : Math.max(0, limit - now);
  const autoFired = useRef(false);
  useEffect(() => { if (limit != null && now >= limit && !autoFired.current && !grading) { autoFired.current = true; finish(true); } });

  // ── 渲染 ──
  const folders = useMemo(() => { const g = new Map<string, WsFile[]>(); for (const f of files) { const d = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''; g.set(d, [...(g.get(d) || []), f]); } return [...g.entries()].sort((a, b) => (a[0] === 'output' ? 1 : b[0] === 'output' ? -1 : a[0].localeCompare(b[0]))); }, [files]);
  const isOut = (p: string) => outputs.some(o => o.path === p);
  const dot = (f: WsFile) => (f.by === 'agent' ? C.brand : f.by === 'human' ? '#0ea5e9' : 'transparent');
  const iconBtn: React.CSSProperties = { border: 0, background: 'transparent', color: C.ink2, cursor: 'pointer', padding: '4px 6px', borderRadius: 6, fontSize: 13 };

  const treeEl = tree ? (
    <aside style={{ width: 236, flex: 'none', background: C.card, borderRight: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 12px 8px', gap: 6 }}>
        <b style={{ fontSize: 13, flex: 1 }}>{L('工作区', 'Workspace')}</b>
        <button onClick={newFile} title={L('新建文件', 'New file')} style={iconBtn}>＋</button>
        <button onClick={() => setTree(false)} title={L('收起', 'Collapse')} style={iconBtn}>⟨</button>
      </div>
      <div style={{ fontSize: 11.5, color: C.ink2, padding: '0 12px 8px', lineHeight: 1.6 }}>{L('题目给的材料都在这里，AI 和你都能读写。', 'All task materials are here; you and the AI can both read and write them.')}<br />{py === 'ready' ? L('Python 已就绪', 'Python ready') : py === 'loading' ? L('Python 环境准备中…', 'Preparing Python…') : L('Python 没装上，刷新试试', 'Python failed to load; try refreshing')}</div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 6px 12px' }}>
        <div onClick={() => openFile(BRIEF, false)} style={{ padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13, background: active === BRIEF && appOpen ? C.soft : 'transparent', fontWeight: 600 }}>📋 {L('任务书', 'Task brief')}</div>
        {folders.map(([d, fs]) => <div key={d} style={{ marginTop: 8 }}>
          {d && <div style={{ fontSize: 11.5, color: C.ink2, padding: '2px 8px', fontWeight: 600 }}>{d}/{d === 'output' ? L(' · 要交的', ' · to submit') : ''}</div>}
          {fs.map(f => <div key={f.path} onClick={() => openFile(f.path)} title={f.path} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontFamily: C.mono, background: active === f.path && appOpen ? C.soft : 'transparent' }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path.split('/').pop()}</span>
            {isOut(f.path) && <span style={{ fontSize: 10, color: C.brand, fontFamily: 'inherit' }}>{L('交', 'out')}</span>}
            <span style={{ width: 6, height: 6, borderRadius: 9, background: dot(f) }} />
          </div>)}
        </div>)}
        {outputs.filter(o => !files.some(f => f.path === o.path)).map(o => <div key={o.path} style={{ padding: '5px 8px 5px 14px', fontSize: 12.5, fontFamily: C.mono, color: '#aaa' }} title={L('还没有这个文件：让 AI 写，或者自己新建', "Not created yet: ask the AI or create it yourself")}>{o.path} · {L('待交', 'missing')}</div>)}
      </div>
      <div style={{ fontSize: 11, color: C.ink2, padding: '8px 12px', borderTop: `1px solid ${C.line}`, display: 'flex', gap: 10 }}><span><i style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 9, background: C.brand }} /> {L('AI 改过', 'AI edited')}</span><span><i style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 9, background: '#0ea5e9' }} /> {L('你改过', 'You edited')}</span></div>
    </aside>
  ) : <aside style={{ width: 44, flex: 'none', background: C.card, borderRight: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12, gap: 8 }}><button onClick={() => setTree(true)} title={L('展开工作区', 'Open workspace')} style={{ ...iconBtn, fontSize: 16 }}>🗂</button></aside>;

  const tabEl = (p: string) => {
    if (p === BRIEF) return <div style={{ padding: '18px 22px', overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 12, color: C.brand, fontWeight: 700, letterSpacing: 1 }}>{L('AI 工作台 · beta', 'AI workspace · beta')}</div>
      <h2 style={{ margin: '6px 0 10px', fontSize: 20 }}>{task.task.title}</h2>
      <MdView text={task.task.brief} style={{ lineHeight: 1.8, fontSize: 14 }} />
      <h4 style={{ margin: '16px 0 6px' }}>{L('要交的文件', 'Files to submit')}</h4>
      <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 13.5 }}>{outputs.map(o => <li key={o.path}><code style={{ fontFamily: C.mono }}>{o.path}</code> · {o.title}</li>)}</ul>
      {(task.task.rules || []).length > 0 && <><h4 style={{ margin: '16px 0 6px' }}>{L('规则', 'Rules')}</h4><RulesView rules={task.task.rules} fontSize={13.5} /></>}
    </div>;
    const f = files.find(x => x.path === p);
    if (!f) return <div style={{ padding: 24, color: C.ink2 }}>{L('这个文件已经不在了', 'This file no longer exists')}</div>;
    const canPreview = /\.(md|csv)$/i.test(p); const editing = !canPreview || editMode[p];
    const ro = runOut[p];
    return <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${C.line}`, fontSize: 12.5, color: C.ink2 }}>
        <code style={{ fontFamily: C.mono, color: C.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p}</code>
        {undo.current.has(p) && f.by === 'agent' && <button onClick={() => revert(p)} style={{ ...iconBtn, color: C.bad, border: `1px solid #fecaca` }}>{L('撤销 AI 这次改动', "Undo AI's change")}</button>}
        {canPreview && <button onClick={() => setEditMode(m => ({ ...m, [p]: !m[p] }))} style={{ ...iconBtn, border: `1px solid ${C.line}` }}>{editing ? L('预览', 'Preview') : L('编辑', 'Edit')}</button>}
        {/\.py$/.test(p) && <button disabled={py !== 'ready'} onClick={() => humanRun(p)} style={{ ...iconBtn, background: C.brand, color: '#fff', opacity: py === 'ready' ? 1 : 0.5 }}>▶ {L('运行', 'Run')}</button>}
        <button onClick={() => download(f)} style={iconBtn} title={L('下载', 'Download')}>⤓</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {f.bin ? (/\.(png|jpe?g|gif|webp)$/i.test(p) ? <img src={f.content} alt={p} style={{ maxWidth: '100%', display: 'block', margin: 12 }} /> : <div style={{ padding: 20, color: C.ink2 }}>{L('二进制文件，点 ⤓ 下载看', 'Binary file. Download to view.')}</div>)
          : editing ? <textarea value={f.content} onChange={e => humanEdit(p, e.target.value)} spellCheck={false} style={{ width: '100%', height: '100%', minHeight: 300, boxSizing: 'border-box', border: 0, outline: 'none', resize: 'none', padding: '12px 14px', fontFamily: C.mono, fontSize: 12.5, lineHeight: '19px', color: C.ink, whiteSpace: 'pre', tabSize: 4 }} />
          : /\.csv$/i.test(p) ? <CsvView text={f.content} /> : <div style={{ padding: '14px 20px' }}><MdView text={f.content} style={{ lineHeight: 1.8, fontSize: 14 }} /></div>}
      </div>
      {ro && <pre style={{ margin: 0, maxHeight: 180, overflow: 'auto', borderTop: `1px solid ${C.line}`, background: '#fafafe', padding: '8px 12px', fontFamily: C.mono, fontSize: 12, color: ro.ok ? C.ink : C.bad, whiteSpace: 'pre-wrap' }}>{`$ python ${p}${ro.ms ? `  (${(ro.ms / 1000).toFixed(1)}s)` : ''}\n${ro.stdout}${ro.stderr ? `\n${ro.stderr}` : ''}${ro.changed.length ? `\n→ ${ro.changed.map(c => c.path).join(', ')}` : ''}`}</pre>}
    </div>;
  };

  const tips = [L('先把材料都读一遍，告诉我数据口径上有哪些问题', 'Read all the materials and tell me what data issues you see'), L('写个脚本把 data 里的表清洗干净，跑一下给我看结果', 'Write a script to clean the tables in data/ and show me the output'), L(`把结论写进 ${(outputs.find(o => /\.md$/.test(o.path)) || outputs[0])?.path || 'output/'}`, `Write the conclusions into ${(outputs.find(o => /\.md$/.test(o.path)) || outputs[0])?.path || 'output/'}`)];
  const chatEl = (
    <div style={{ flex: 1, minWidth: 360, display: appMax ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 8px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!items.length && <div style={{ padding: '28px 4px 8px' }}>
            <div style={{ fontSize: 12, color: C.brand, fontWeight: 700, letterSpacing: 1 }}>{L('把要交的文件做出来、做好', 'Produce the files to submit, and make them good')}</div>
            <div style={{ fontSize: 20, fontWeight: 700, margin: '8px 0 6px' }}>{L('你有一个能写代码、跑数据、写文档的 AI 搭档', 'You have an AI partner that can write code, crunch data and draft documents')}</div>
            <div style={{ fontSize: 13.5, color: C.ink2, lineHeight: 1.8 }}>{L('它能读写左边工作区里的所有文件、跑 Python。用不用它、怎么用由你定，交出去的文件你负责。过程会记录。', "It can read and write every file in the workspace and run Python. Whether and how you use it is up to you; you're responsible for what you submit. Your process is recorded.")}</div>
            <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>{tips.map(t => <button key={t} onClick={() => setQ(t)} style={{ textAlign: 'left', border: `1px solid ${C.line}`, background: C.card, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontSize: 13, color: C.ink }}>{t}</button>)}</div>
          </div>}
          {items.map((it, i) => it.k === 'user' ? <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', background: C.soft, borderRadius: 12, padding: '9px 13px', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{it.text}</div>
            : it.k === 'agent' ? <div key={i}><MdView text={it.text} style={{ fontSize: 14, lineHeight: 1.75 }} /></div>
            : it.k === 'note' ? <div key={i} style={{ fontSize: 12, color: C.ink2, textAlign: 'center' }}>— {it.text} —</div>
            : it.k === 'plan' ? <div key={i} style={{ border: `1px solid #d9d5ff`, background: '#fbfaff', borderRadius: 12, padding: '10px 14px' }}>
                <div style={{ fontSize: 12, color: C.brand, fontWeight: 700, marginBottom: 4 }}>{L('AI 的执行计划', "AI's plan")}{it.state === 'ok' ? L(' · 你批准了', ' · approved') : it.state === 'edit' ? L(' · 你改过再执行', ' · edited by you') : it.state === 'reject' ? L(' · 你打回了', ' · rejected') : ''}</div>
                {it.state === 'open' && planDraft[it.id] != null ? <textarea value={planDraft[it.id]} onChange={e => setPlanDraft(d => ({ ...d, [it.id]: e.target.value }))} rows={10} style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, fontSize: 13, fontFamily: 'inherit', lineHeight: 1.6 }} /> : <MdView text={it.text} style={{ fontSize: 14, lineHeight: 1.75 }} />}
                {it.state === 'open' && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {planDraft[it.id] != null ? <button disabled={busy} onClick={() => decidePlan(it, 'edit')} style={btnMain}>{L('按改过的执行', 'Run edited plan')}</button> : <button disabled={busy} onClick={() => decidePlan(it, 'ok')} style={btnMain}>{L('批准执行', 'Approve')}</button>}
                  {planDraft[it.id] == null && <button disabled={busy} onClick={() => setPlanDraft(d => ({ ...d, [it.id]: it.text }))} style={btnGhost}>{L('改一改', 'Edit')}</button>}
                  <button disabled={busy} onClick={() => decidePlan(it, 'reject')} style={btnGhost}>{L('打回', 'Reject')}</button>
                </div>}
              </div>
            : it.k === 'confirm' ? <ConfirmCard key={i} it={it} onAnswer={ok => answer(it.id, ok, it.path)} L={L} />
            : <ToolRow key={i} it={it} label={toolLabel(it.name, it.input, L)} onOpen={it.input?.path && files.some(f => f.path === it.input.path) ? () => openFile(it.input.path) : undefined} />)}
          {busy && live?.text && <div style={{ opacity: 0.85 }}><MdView text={live.text} style={{ fontSize: 14, lineHeight: 1.75 }} /></div>}
          {busy && <div style={{ fontSize: 12.5, color: C.ink2 }}>{live?.chars ? L(`AI 正在写文件… 约 ${live.chars} 字`, `AI is writing a file… ~${live.chars} chars`) : [...items].reverse().find(x => x.k === 'confirm')?.k === 'confirm' && waits.current.size ? L('等你确认上面的改动', 'Waiting for you to review the change above') : L('AI 在干活…', 'AI is working…')}{live && stepT0.current && now >= 0 ? ` ${Math.round((Date.now() - stepT0.current) / 1000)} ${L('秒', 's')}` : ''}</div>}
          <div ref={chatEnd} />
        </div>
      </div>
      <div style={{ padding: '8px 20px 16px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', border: `1px solid ${C.line}`, borderRadius: 14, background: C.card, boxShadow: '0 2px 10px rgba(20,20,60,.05)' }}>
          <textarea value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(q); } }} rows={3} placeholder={L('告诉 AI 要做什么（Enter 发送，Shift+Enter 换行）', 'Tell the AI what to do (Enter to send, Shift+Enter for a new line)')} style={{ width: '100%', boxSizing: 'border-box', border: 0, outline: 'none', resize: 'none', padding: '12px 14px 4px', fontSize: 14, lineHeight: 1.6, borderRadius: 14, fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px 10px', flexWrap: 'wrap' }}>
            <select value={model} onChange={e => { setModel(e.target.value); ev('agent_model', { note: e.target.value }); }} disabled={busy} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: '4px 6px', fontSize: 12.5, background: '#fff', color: C.ink2 }}>
              {AGENT_MODELS.map(m => <option key={m.id} value={m.id} title={m.note}>{lang === 'en' ? m.en : m.label}</option>)}
            </select>
            <button onClick={() => toggleMode('plan')} disabled={busy} title={L('开着时：AI 先只读材料、列出执行计划，你批准或改过之后它才动手', 'When on, the AI first reads and proposes a plan; it acts only after you approve or edit it')} style={{ ...chip, ...(planMode ? chipOn : {}) }}>{planMode ? '☑' : '☐'} {L('先出计划', 'Plan first')}</button>
            <button onClick={() => toggleMode('confirm')} title={L('开着时：AI 每次写 / 改 / 删文件都先给你看改了什么，你接受了才生效', 'When on, every file write / edit / delete is shown to you first and only applies if you accept')} style={{ ...chip, ...(confirmMode ? chipOn : {}) }}>{confirmMode ? '☑' : '☐'} {L('改动要我确认', 'Review changes')}</button>
            <span style={{ flex: 1 }} />
            {busy ? <button onClick={stop} style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 9, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>■ {L('停', 'Stop')}</button>
              : <button onClick={() => send(q)} disabled={!q.trim()} style={{ border: 0, background: q.trim() ? C.brand : '#c9c6f5', color: '#fff', borderRadius: 9, padding: '6px 16px', cursor: q.trim() ? 'pointer' : 'default', fontSize: 13, fontWeight: 600 }}>{L('发送', 'Send')}</button>}
          </div>
        </div>
      </div>
    </div>
  );

  const appEl = appOpen && tabs.length ? (
    <section style={{ width: appMax ? 'auto' : '48%', flex: appMax ? 1 : 'none', minWidth: 380, margin: '0 12px 12px 0', background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 4px 18px rgba(20,20,60,.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${C.line}`, background: '#fbfbfd' }}>
        <div style={{ display: 'flex', flex: 1, overflow: 'auto' }}>{tabs.map(p => <div key={p} onClick={() => setActive(p)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap', borderRight: `1px solid ${C.line}`, background: active === p ? C.card : 'transparent', fontWeight: active === p ? 600 : 400 }}>{p === BRIEF ? L('任务书', 'Brief') : p.split('/').pop()}<span onClick={e => { e.stopPropagation(); closeTab(p); }} style={{ color: '#aaa' }}>×</span></div>)}</div>
        <button onClick={() => setAppMax(m => !m)} title={appMax ? L('还原', 'Restore') : L('放大', 'Expand')} style={iconBtn}>{appMax ? '⇲' : '⤢'}</button>
        <button onClick={() => { setAppOpen(false); setAppMax(false); }} title={L('收起', 'Close')} style={iconBtn}>✕</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{tabEl(active)}</div>
    </section>
  ) : null;

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', background: C.bg, color: C.ink, fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif' }}>
      {treeEl}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 700 }}>{task.task.title} <span style={{ fontWeight: 400, fontSize: 12.5, color: C.ink2 }}>{task.company_name} · {L('AI 工作台 beta', 'AI workspace beta')}</span></div>
          <span style={{ fontFamily: C.mono, fontSize: 13, color: left != null && left <= 300 ? C.bad : C.ink2 }}>{left != null ? `${L('剩', 'left')} ${fmt(left)}` : fmt(now)}</span>
          {!appOpen && <button onClick={() => { setAppOpen(true); if (!tabs.length) { setTabs([BRIEF]); setActive(BRIEF); } }} style={{ ...iconBtn, border: `1px solid ${C.line}` }}>{L('打开文件区', 'Open files')}</button>}
          <button onClick={submit} disabled={grading} style={{ border: 0, background: arm ? C.bad : C.ink, color: '#fff', borderRadius: 9, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{grading ? L('评分中…', 'Grading…') : arm ? L('确定交卷', 'Confirm') : L('交卷', 'Submit')}</button>
        </header>
        {(err || error) && <div style={{ margin: '0 16px 8px', padding: '8px 12px', borderRadius: 10, background: '#fef2f2', color: C.bad, fontSize: 13 }}>{err || error}</div>}
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>{chatEl}{appEl}</div>
      </main>
      {disc != null && <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,40,.35)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
        <div style={{ width: 'min(560px, calc(100vw - 32px))', background: '#fff', borderRadius: 16, padding: 22 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{L('交卷前：说说 AI 在这份成果里做了什么', 'Before you submit: what did the AI do in this work?')}</div>
          <div style={{ fontSize: 13, color: C.ink2, margin: '6px 0 10px', lineHeight: 1.7 }}>{L('哪些是 AI 做的、哪些你核过或自己改的、哪一步你没信它。会写进给企业的报告；不写也能交。', "Which parts the AI did, what you checked or rewrote, where you didn't trust it. This goes into the report for the company; you can skip it.")}</div>
          <textarea value={disc} onChange={e => setDisc(e.target.value)} rows={5} autoFocus style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, fontSize: 14, fontFamily: 'inherit' }} placeholder={L('比如：清洗脚本是 AI 写的，我核了缺失值的处理；第二个结论 AI 算反了，我让它重算并自己抽查了三行', 'e.g. The AI wrote the cleaning script; I checked how it handled missing values. It got the second conclusion backwards, so I had it redo the math and spot-checked three rows myself.')} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}><button onClick={() => setDisc(null)} style={{ border: `1px solid ${C.line}`, background: '#fff', borderRadius: 9, padding: '7px 14px', cursor: 'pointer' }}>{L('回去再看看', 'Go back')}</button><button onClick={() => finish()} style={{ border: 0, background: C.ink, color: '#fff', borderRadius: 9, padding: '7px 16px', cursor: 'pointer', fontWeight: 600 }}>{L('交卷', 'Submit')}</button></div>
        </div>
      </div>}
    </div>
  );
}

const btnMain: React.CSSProperties = { border: 0, background: C.brand, color: '#fff', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 };
const btnGhost: React.CSSProperties = { border: `1px solid ${C.line}`, background: '#fff', color: C.ink, borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 12.5 };
const chip: React.CSSProperties = { border: `1px solid ${C.line}`, background: '#fff', color: C.ink2, borderRadius: 99, padding: '3px 10px', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' };
const chipOn: React.CSSProperties = { borderColor: '#c9c3ff', background: C.soft, color: C.brand };

function ConfirmCard({ it, onAnswer, L }: { it: Extract<Item, { k: 'confirm' }>; onAnswer: (ok: boolean) => void; L: (a: string, b: string) => string }) {
  const d = useMemo(() => lineDiff(it.before, it.after), [it.before, it.after]);
  const add = d.filter(x => x.t === '+').length, del = d.filter(x => x.t === '-').length;
  // 只显示改动附近的行：改动前后各留 2 行
  const keep = new Set<number>(); d.forEach((x, k) => { if (x.t !== ' ') for (let j = k - 2; j <= k + 2; j++) keep.add(j); });
  const shown = d.map((x, k) => ({ ...x, k })).filter(x => keep.has(x.k)).slice(0, 80);
  const act = it.act === 'write' ? (it.before ? L('覆盖', 'Overwrite') : L('新建', 'Create')) : it.act === 'edit' ? L('修改', 'Edit') : L('删除', 'Delete');
  return <div style={{ border: `1px solid ${it.state === 'wait' ? '#fcd34d' : C.line}`, borderRadius: 10, background: C.card, fontSize: 12.5 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: `1px solid ${C.line}` }}>
      <b>{act}</b><code style={{ fontFamily: C.mono, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.path}</code>
      <span style={{ color: C.ok }}>+{add}</span><span style={{ color: C.bad }}>−{del}</span>
      {it.state === 'wait' ? <><button onClick={() => onAnswer(true)} style={btnMain}>{L('接受', 'Accept')}</button><button onClick={() => onAnswer(false)} style={btnGhost}>{L('拒绝', 'Reject')}</button></>
        : <span style={{ color: it.state === 'ok' ? C.ok : C.bad }}>{it.state === 'ok' ? L('已接受', 'Accepted') : L('已拒绝', 'Rejected')}</span>}
    </div>
    <pre style={{ margin: 0, maxHeight: it.state === 'wait' ? 320 : 120, overflow: 'auto', fontFamily: C.mono, fontSize: 11.5, lineHeight: '17px', padding: '6px 0' }}>
      {shown.map((x, n) => <div key={n} style={{ padding: '0 10px', whiteSpace: 'pre-wrap', background: x.t === '+' ? '#ecfdf3' : x.t === '-' ? '#fef2f2' : 'transparent', color: x.t === ' ' ? C.ink2 : C.ink }}>{x.t === ' ' ? '  ' : x.t + ' '}{x.s}</div>)}
      {d.filter(x => x.t !== ' ').length > shown.filter(x => x.t !== ' ').length && <div style={{ padding: '2px 10px', color: C.ink2 }}>{L('……（还有改动没显示，接受后可以在文件里看全文）', '…(more changes not shown; open the file after accepting)')}</div>}
    </pre>
  </div>;
}

function ToolRow({ it, label, onOpen }: { it: Extract<Item, { k: 'tool' }>; label: string; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const color = it.state === 'err' ? C.bad : it.state === 'run' ? C.brand : it.state === 'skip' ? '#aaa' : C.ok;
  const mark = it.state === 'run' ? '◌' : it.state === 'err' ? '✕' : it.state === 'skip' ? '–' : '✓';
  const code = it.name === 'run_python' && it.input?.code ? String(it.input.code) : '';
  return <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, background: C.card, fontSize: 12.5 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px' }}>
      <span style={{ color, fontWeight: 700, width: 12 }}>{mark}</span>
      <span style={{ fontFamily: C.mono, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {onOpen && <button onClick={onOpen} style={{ border: 0, background: 'none', color: C.brand, cursor: 'pointer', fontSize: 12 }}>打开</button>}
      {(it.out || code) && <button onClick={() => setOpen(o => !o)} style={{ border: 0, background: 'none', color: C.ink2, cursor: 'pointer', fontSize: 12 }}>{open ? '收起' : '详情'}</button>}
    </div>
    {open && <pre style={{ margin: 0, borderTop: `1px solid ${C.line}`, padding: '8px 10px', maxHeight: 260, overflow: 'auto', fontFamily: C.mono, fontSize: 11.5, whiteSpace: 'pre-wrap', background: '#fafafe' }}>{code ? `${code}\n\n` : ''}{it.out}</pre>}
  </div>;
}

function CsvView({ text }: { text: string }) {
  const row = (line: string) => { const out: string[] = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const rows = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 300).map(row);
  if (!rows.length) return <div style={{ padding: 20, color: C.ink2 }}>（空）</div>;
  return <table style={{ borderCollapse: 'collapse', fontSize: 12.5, margin: 12 }}><thead><tr>{rows[0].map((c, j) => <th key={j} style={{ border: `1px solid ${C.line}`, padding: '5px 9px', background: '#f6f6fa', textAlign: 'left', whiteSpace: 'nowrap' }}>{c}</th>)}</tr></thead>
    <tbody>{rows.slice(1).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} style={{ border: `1px solid ${C.line}`, padding: '4px 9px', whiteSpace: 'nowrap', textAlign: /^-?[\d.,%]+$/.test(c.trim()) ? 'right' : 'left', fontVariantNumeric: 'tabular-nums' }}>{c}</td>)}</tr>)}</tbody></table>;
}
