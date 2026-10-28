'use client';

/**
 * 百业 ToB 工作台 /workspace（2026-10-20）：照 Claude 的骨架——左侧栏（新对话 + 功能入口 + 最近对话）、中间 AI 总控对话、右侧产物面板。
 * 企业用户绑定一家企业，AI 只围绕自己企业干活（工具层把关，见 src/lib/ws/tools.ts）。底色是淡淡的纸张色。
 */
import { Skel } from '@/components/ws/Skel';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { App, ConfigProvider } from 'antd';
import { Md } from '@/components/ws/Md';
import { ArtifactPanel, artKey, type Art } from '@/components/ws/Artifact';
import { MODEL_OPTIONS } from '@/lib/model-options';
import { Setup } from '@/components/ws/Setup';
import { ProjectPage, STAGE_LABEL } from '@/components/ws/Project';

type Org = { id: string; name: string; company_id: number | null; company_name: string | null; role: string; setup_step?: string; kind?: 'company' | 'research' };
type Item =
  | { k: 'user'; text: string }
  | { k: 'text'; text: string }
  | { k: 'tool'; id: string; name: string; input: any; label?: string; ui?: any; error?: string; running: boolean; t0: number }
  | { k: 'ask'; id: string; question: string; options: string[]; answered?: string }
  | { k: 'error'; text: string };
type View = 'chat' | 'roles' | 'work' | 'spaces' | 'people' | 'setup' | 'project';

const TOOL_RUNNING: Record<string, string> = { add_candidate: '读简历、加进候选人', org_profile: '读企业画像', list_roles: '查本企业岗位', propose_problems: '从企业动态和岗位职责里找业务问题', create_work_task: '出真活：任务书、材料包、评分标准（1–2 分钟）', run_baseline: 'AI 先做一遍当基线（约 1 分钟）', list_work_tasks: '列本企业的真活', work_results: '看作答和报告', create_space: '准备建职业空间', list_spaces: '列本企业的职业空间' };
const CHAT_MODELS = MODEL_OPTIONS.filter(m => /^(claude-|gpt-|gemini-|qwen)/.test(m.id));
const DEFAULT_MODEL = 'claude-opus-5-5';
const SUGGEST_R = [
  { t: '开一个人才引进项目', d: '招博士后、研究员或教授：写招聘启事、收简历、评审、验真', p: '我要引进一位研究人员，帮我开一个项目' },
  { t: '出一道研究真活', d: '实验设计、数据分析、审稿、写本子：看候选人真实的研究功夫', p: '帮我给一个研究岗出一道研究真活' },
  { t: '学术验真', d: '学历、论文、专利、项目逐条核对，再做能力扫描', p: '我想核实一位候选人的学术履历' },
  { t: '了解我们机构', d: '看平方数据里本机构的研究方向、平台和成果', p: '平方数据里我们机构现在是什么样？' },
];
const SUGGEST = [
  { t: '出一道真活', d: '给一个在招岗位出一道此刻真实的业务题，看候选人怎么干', p: '帮我给一个岗位出一道真活' },
  { t: '建一个职业空间', d: '给岗位建数字职人和一天的练习，新人带教用', p: '帮我给一个岗位建职业空间，给新人练手' },
  { t: '看谁做得好', d: '汇总真活的作答，对比候选人，给录用建议', p: '最近的真活谁做得最好？帮我对比一下' },
  { t: '了解我们企业', d: '看平方数据里本企业的画像、动态和在招岗位', p: '平方数据里我们企业现在是什么样？' },
];

/** 两个版本共用一套工作台：company = 企业版（ToB，/workspace），research = 科研版（ToS，/research） */
export type Edition = 'company' | 'research';
export const EDITION_PATH: Record<Edition, string> = { company: '/workspace', research: '/research' };
export const EDITION_NAME: Record<Edition, string> = { company: '企业版', research: '科研版' };

/** 这个页面发给 /api/ws/* 的请求都带上版本头，后端据此取本版本的机构 */
let fetchPatched = false;
function patchFetch(edition: Edition) {
  if (typeof window === 'undefined' || fetchPatched) return; fetchPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (/^\/api\/ws\/|\/api\/ws\//.test(url)) { const h = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined)); h.set('x-ws-edition', edition); return orig(input, { ...init, headers: h }); }
    return orig(input, init);
  };
}

export function WorkspaceApp({ edition = 'company' }: { edition?: Edition }) {
  patchFetch(edition);
  return <ConfigProvider theme={{ token: { colorPrimary: '#4f46c8', borderRadius: 10, fontFamily: "'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" } }}><App><Inner edition={edition} /></App></ConfigProvider>;
}

function Inner({ edition }: { edition: Edition }) {
  const [org, setOrg] = useState<Org | null | undefined>(undefined);
  const [user, setUser] = useState<{ email: string; role: string } | null>(null);
  const [bootErr, setBootErr] = useState('');
  const [view, setView] = useState<View>('chat');
  const [threads, setThreads] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);   // 正在看的项目页
  const [chatProject, setChatProject] = useState<string | null>(null);   // 当前对话挂在哪个项目
  const [threadId, setThreadId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [art, setArt] = useState<Art | null>(null);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [side, setSide] = useState(true);
  const [palette, setPalette] = useState(false);
  const [drawer, setDrawer] = useState(false);   // 手机上的侧栏抽屉
  const [artW, setArtW] = useState<number | null>(null);   // 右侧面板宽度（拖边调，记在本机）
  useEffect(() => { try { const w = Number(localStorage.getItem('ws:artw')); if (w > 300) setArtW(w); } catch {} }, []);
  const resizeArt = (w: number) => { setArtW(w); try { localStorage.setItem('ws:artw', String(Math.round(w))); } catch {} };
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { try { const m = localStorage.getItem('ws:model'); if (m && CHAT_MODELS.some(x => x.id === m)) setModel(m); } catch {} }, []);
  const loadOrg = useCallback(async () => {
    document.cookie = `ws_edition=${edition}; path=/; max-age=31536000; samesite=lax`;   // 后端按这个取本版本的机构
    const r = await fetch('/api/ws/org'); if (r.status === 401) { location.href = `/lab/login?next=${EDITION_PATH[edition]}`; return; }
    const j = await r.json(); if (!j.ok) { setBootErr(j.error); setOrg(null); return; }
    setUser(j.user); setOrg(j.org);
  }, []);
  const loadThreads = useCallback(async () => { const j = await (await fetch('/api/ws/threads')).json(); if (j.ok) setThreads(j.threads); const k = await (await fetch('/api/ws/projects')).json().catch(() => ({})); if (k.ok) setProjects(k.projects); }, []);
  useEffect(() => { loadOrg(); }, [loadOrg]);
  useEffect(() => { if (org) loadThreads(); }, [org, loadThreads]);
  // 新企业（设置还没走完）：一进来 AI 就开口，边聊边配，右边企业档案跟着长
  const kicked = useRef(false);
  useEffect(() => { if (org && (org.setup_step === 'context' || org.setup_step === 'roles') && !kicked.current) { kicked.current = true; setArt({ kind: 'company', title: `${org.name} · ${org.kind === 'research' ? '机构档案' : '企业档案'}` }); setTimeout(() => send(org.kind === 'research' ? '帮我把机构设置好' : '帮我把企业设置好'), 300); } }, [org]);   // eslint-disable-line react-hooks/exhaustive-deps

  const openThread = async (id: string) => {
    abortRef.current?.abort(); setBusy(false); setView('chat'); setThreadId(id); setItems([]); setArt(null);
    const j = await (await fetch(`/api/ws/threads/${id}`)).json(); if (!j.ok) return;
    setChatProject(j.thread.project_id || null);
    setItems(fromHistory(j.thread.messages || []));
    const lastArt = [...(j.thread.messages || [])].reverse().flatMap((m: any) => (m.role === 'tool' ? [...m.results].reverse() : [])).find((r: any) => r.ui && r.ui.kind !== 'problems');
    if (lastArt) setArt(lastArt.ui);
  };
  const newChat = (inProject: string | null = null) => { abortRef.current?.abort(); setBusy(false); setView('chat'); setThreadId(null); setItems([]); setArt(null); setChatProject(inProject); };
  // 在项目里问一句：开一个挂在这个项目下的新对话
  const askInProject = (pid: string, text: string) => { newChat(pid); setTimeout(() => sendRef.current?.(text, pid), 0); };
  const sendRef = useRef<((t: string, pid?: string | null) => void) | null>(null);

  const send = async (text: string, pid: string | null = chatProject) => {
    const t = text.trim(); if (!t || busy) return;
    setView('chat'); setBusy(true);
    setItems(it => [...it.map(x => (x.k === 'ask' && !x.answered ? { ...x, answered: t } : x)), { k: 'user', text: t }]);
    const ac = new AbortController(); abortRef.current = ac;
    try {
      const res = await fetch('/api/ws/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread_id: threadId, text: t, model, project_id: pid }), signal: ac.signal });
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
    if (e.t === 'thread') { setThreadId(e.id); loadThreads(); return; }
    if (e.t === 'text') setItems(it => { const last = it[it.length - 1]; return last?.k === 'text' ? [...it.slice(0, -1), { k: 'text', text: last.text + e.delta }] : [...it, { k: 'text', text: e.delta }]; });
    else if (e.t === 'tool_start') setItems(it => [...it, { k: 'tool', id: e.id, name: e.name, input: e.input, running: true, t0: Date.now() }]);
    else if (e.t === 'tool_end') { setItems(it => it.map(x => (x.k === 'tool' && x.id === e.id ? { ...x, running: false, label: e.label, ui: e.ui, error: e.error } : x))); if (e.ui && e.ui.kind !== 'problems') setArt({ ...e.ui, _n: Date.now() }); }
    else if (e.t === 'ask') setItems(it => [...it, { k: 'ask', id: e.id, question: e.question, options: e.options }]);
    else if (e.t === 'error') setItems(it => [...it, { k: 'error', text: e.message }]);
  };
  const stop = () => { abortRef.current?.abort(); };
  sendRef.current = send;
  // 项目对话里传简历：先进项目候选人，再让 AI 接着分析
  const uploadResumes = async (pid: string, fs: File[]) => {
    const names: string[] = [];
    for (const f of fs) {
      setItems(it => [...it, { k: 'tool', id: `up-${f.name}-${Date.now()}`, name: 'add_candidate', input: { file: f.name }, running: true, t0: Date.now() }]);
      const fd = new FormData(); fd.append('file', f);
      const j = await (await fetch(`/api/ws/projects/${pid}/candidates`, { method: 'POST', body: fd })).json().catch(() => ({ ok: false, error: '网络错误' }));
      setItems(it => it.map(x => (x.k === 'tool' && x.name === 'add_candidate' && x.running ? { ...x, running: false, label: j.ok ? `读了「${f.name}」，加进候选人：${j.candidate.name}` : `「${f.name}」没读成`, error: j.ok ? undefined : j.error } : x)));
      if (j.ok) names.push(j.candidate.name);
    }
    loadThreads();
    if (names.length) setTimeout(() => sendRef.current?.(`我上传了 ${names.join('、')} 的简历，帮我做一下适配分析`, pid), 200);
  };
  // 快捷键：⌘K / Ctrl+K 搜索，Esc 关面板（输入框里按 Esc 不关）
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p); }
      else if (e.key === 'Escape') { if (palette) setPalette(false); else if (drawer) setDrawer(false); else if (art && !(e.target as HTMLElement)?.closest?.('textarea, input')) setArt(null); }
    };
    window.addEventListener('keydown', on); return () => window.removeEventListener('keydown', on);
  }, [palette, drawer, art]);

  if (org === undefined) return <Shell><div className="ws-boot"><span className="ws-brand-mark">百</span><div className="ws-boot-bar"><i /></div></div></Shell>;
  if (!org) return <Shell><Onboard edition={edition} err={bootErr} onDone={o => setOrg(o)} /></Shell>;

  return (
    <Shell>
      <div className={`ws-root${art ? ' with-art' : ''}${side ? '' : ' no-side'}`} style={artW ? ({ ['--art-w' as string]: `${artW}px` } as React.CSSProperties) : undefined}>
        {drawer && <div className="ws-scrim" onClick={() => setDrawer(false)} />}
        <div className={`ws-side-wrap${drawer ? ' open' : ''}`} onClick={e => { if ((e.target as HTMLElement).closest('button')) setDrawer(false); }}>
        <Sidebar reload={loadThreads} openPalette={() => setPalette(true)} org={org} user={user} view={view} setView={v => { setView(v); if (v !== 'chat') setArt(null); }} threads={threads} threadId={threadId} openThread={openThread} newChat={() => newChat(null)} onHide={() => setSide(false)} projects={projects} projectId={view === 'project' ? projectId : chatProject} openProject={id => { setProjectId(id); setView('project'); setArt(null); }} newProject={() => { newChat(null); setTimeout(() => sendRef.current?.(org.kind === 'research' ? '我要引进一位研究人员，帮我开一个项目' : '我要招人，帮我开一个招聘项目', null), 0); }} />
        </div>
        <main className="ws-main">
          {!side && <button className="ws-ghost ws-showside" onClick={() => setSide(true)} aria-label="展开侧栏">☰</button>}
          <button className="ws-ghost ws-burger" onClick={() => setDrawer(true)} aria-label="打开菜单">☰</button>
          {view === 'chat'
            ? <Chat onFiles={chatProject ? fs => uploadResumes(chatProject, fs) : undefined} project={projects.find(x => x.id === chatProject)} openProject={() => { if (chatProject) { setProjectId(chatProject); setView('project'); } }} org={org} items={items} busy={busy} send={send} stop={stop} model={model} setModel={m => { setModel(m); try { localStorage.setItem('ws:model', m); } catch {} }} openArt={setArt} activeArt={art ? artKey(art) : ''} />
            : view === 'setup' ? <SetupPage />
            : view === 'project' && projectId ? <ProjectPage id={projectId} openArt={setArt} ask={t => askInProject(projectId, t)} openThread={openThread} />
            : <Lists view={view} org={org} openArt={setArt} ask={p => { newChat(); setTimeout(() => send(p), 0); }} />}
        </main>
        {art && <ArtifactPanel key={artKey(art) + ((art as any)._n || '')} art={art} onClose={() => setArt(null)} openArt={setArt} onResize={resizeArt} />}
      </div>
      {palette && <Palette org={org} threads={threads} projects={projects} close={() => setPalette(false)} run={a => { setPalette(false); a(); }}
        actions={{ newChat: () => newChat(null), newProject: () => { newChat(null); setTimeout(() => sendRef.current?.(org.kind === 'research' ? '我要引进一位研究人员，帮我开一个项目' : '我要招人，帮我开一个招聘项目', null), 0); }, view: (v: View) => { setView(v); setArt(null); }, thread: openThread, project: (id: string) => { setProjectId(id); setView('project'); setArt(null); }, ask: (p: string) => { newChat(null); setTimeout(() => sendRef.current?.(p, null), 0); } }} />}
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

/** 「最近」按今天 / 昨天 / 7 天内 / 更早分组 */
function groupByDay(ts: any[]): [string, any[]][] {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = day(new Date()); const g: Record<string, any[]> = {}; const order = ['今天', '昨天', '7 天内', '更早'];
  for (const t of ts) { const diff = (today - day(new Date(t.updated_at))) / 86400000; const k = diff < 1 ? '今天' : diff < 2 ? '昨天' : diff < 7 ? '7 天内' : '更早'; (g[k] ||= []).push(t); }
  return order.filter(k => g[k]).map(k => [k, g[k]]);
}
/** 一条最近对话：悬停出「…」，可改名、删除（删除要点两下） */
function Recent({ t, on, open, changed }: { t: any; on: boolean; open: () => void; changed: () => void }) {
  const [menu, setMenu] = useState(false); const [edit, setEdit] = useState(false); const [name, setName] = useState(t.title || ''); const [arm, setArm] = useState(false);
  const save = async () => { setEdit(false); if (name.trim() && name !== t.title) { await fetch(`/api/ws/threads/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: name }) }); changed(); } };
  const del = async () => { if (!arm) { setArm(true); setTimeout(() => setArm(false), 3000); return; } await fetch(`/api/ws/threads/${t.id}`, { method: 'DELETE' }); setMenu(false); changed(); };
  if (edit) return <input className="ws-recent-edit" autoFocus value={name} onChange={e => setName(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEdit(false); setName(t.title); } }} />;
  return (
    <div className={`ws-recent-row${on ? ' on' : ''}${menu ? ' menu' : ''}`} onMouseLeave={() => { setMenu(false); setArm(false); }}>
      <button className="ws-recent" onClick={open} title={t.title}>{t.project_id && <span className="ws-dot-p" />}{t.title || '未命名对话'}</button>
      <button className="ws-recent-more" onClick={() => setMenu(m => !m)} aria-label="更多">⋯</button>
      {menu && <div className="ws-menu"><button onClick={() => { setMenu(false); setEdit(true); }}>改名</button><button className="danger" onClick={del}>{arm ? '再点一下确认删除' : '删除'}</button></div>}
    </div>
  );
}

function Sidebar({ org, user, view, setView, threads, threadId, openThread, newChat, onHide, projects, projectId, openProject, newProject, reload, openPalette }: { org: Org; user: any; view: View; setView: (v: View) => void; threads: any[]; threadId: string | null; openThread: (id: string) => void; newChat: () => void; onHide: () => void; projects: any[]; projectId: string | null; openProject: (id: string) => void; newProject: () => void; reload: () => void; openPalette: () => void }) {
  const NAV: [View, string, string][] = [['chat', '对话', 'M4 5h16v11H8l-4 4z'], ['roles', '岗位', 'M4 7h16v12H4zM9 7V5h6v2'], ['work', '真活', 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5'], ['spaces', '职业空间', 'M12 3l8 4.5v9L12 21l-8-4.5v-9z'], ['people', '候选人', 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M17 11a2.5 2.5 0 1 0 0-5M21 19c0-2-1.5-3.5-4-4'], ['setup', '企业设置', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z']];
  return (
    <nav className="ws-side">
      <div className="ws-side-top">
        <div className="ws-brand"><span className="ws-brand-mark">百</span><span>百业 AI <span className="ws-muted" style={{ fontWeight: 400 }}>{org.kind === 'research' ? '科研版' : '企业版'}</span></span></div>
        <button className="ws-ghost" onClick={onHide} aria-label="收起侧栏" title="收起侧栏">⟨</button>
      </div>
      <div className="ws-org"><div className="ws-org-avatar">{org.name.slice(0, 1)}</div><div style={{ minWidth: 0 }}><div className="ws-org-name">{org.name}</div><div className="ws-cap">{org.role === 'owner' ? '管理员' : org.role === 'admin' ? '平台管理员' : '成员'}</div></div></div>
      <button className="ws-new" onClick={newChat}><span style={{ fontSize: 17, lineHeight: 1 }}>＋</span> 新对话</button>
      <button className="ws-search" onClick={openPalette}><Ico d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" size={14} />搜索<kbd>⌘K</kbd></button>
      <div className="ws-sec">功能</div>
      {NAV.map(([v, t, d]) => <button key={v} className={`ws-nav${view === v ? ' on' : ''}`} onClick={() => (v === 'chat' ? newChat() : setView(v))}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>{org.kind === 'research' && v === 'setup' ? '机构设置' : t}</button>)}
      <div className="ws-sec" style={{ display: 'flex', alignItems: 'center' }}>{org.kind === 'research' ? '引进项目' : '招聘项目'}<button className="ws-ghost" style={{ marginLeft: 'auto', padding: '0 6px', fontSize: 15 }} title="开一个招聘项目" onClick={newProject}>＋</button></div>
      {projects.length ? projects.slice(0, 8).map(p => <button key={p.id} className={`ws-proj${p.id === projectId ? ' on' : ''}`} onClick={() => openProject(p.id)} title={p.title}><span className="ws-proj-ico">{(p.role_title || p.title).slice(0, 1)}</span><span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>{p.candidates ? <span className="ws-muted" style={{ fontSize: 11.5 }}>{p.candidates}</span> : null}</button>) : <div className="ws-muted" style={{ padding: '2px 10px 4px', fontSize: 12.5 }}>{org.kind === 'research' ? '一次引进就是一个项目' : '一次招人就是一个项目'}</div>}
      <div className="ws-recents">
        {threads.length ? groupByDay(threads).map(([g, ts]) => <div key={g}><div className="ws-sec">{g}</div>{ts.map(t => <Recent key={t.id} t={t} on={t.id === threadId && view === 'chat'} open={() => openThread(t.id)} changed={reload} />)}</div>) : <><div className="ws-sec">最近</div><div className="ws-muted" style={{ padding: '4px 10px', fontSize: 12.5 }}>还没有对话</div></>}
      </div>
      <div className="ws-side-foot">
        <div className="ws-me"><span className="ws-me-av">{(user?.name || user?.email || '我').slice(0, 1).toUpperCase()}</span><div style={{ minWidth: 0 }}><div className="ws-me-name">{user?.name || String(user?.email || '').split('@')[0]}</div><div className="ws-cap" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div></div></div>
        <div style={{ display: 'flex', gap: 10, fontSize: 12, alignItems: 'center' }}><Link href="/lab" className="ws-link">百业</Link><Link href="/work" className="ws-link">真活</Link><ThemeSwitch /></div>
      </div>
    </nav>
  );
}

function Chat({ project, openProject, org, items, busy, send, stop, model, setModel, openArt, activeArt, onFiles }: { onFiles?: (fs: File[]) => void; project?: any; openProject: () => void; org: Org; items: Item[]; busy: boolean; send: (t: string) => void; stop: () => void; model: string; setModel: (m: string) => void; openArt: (a: Art) => void; activeArt: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [items]);
  const empty = !items.length;
  const hour = new Date().getHours(); const hello = hour < 11 ? '上午好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  const pendingAsk = [...items].reverse().find(x => x.k === 'ask' && !x.answered) as Extract<Item, { k: 'ask' }> | undefined;
  return (
    <div className={`ws-chat${empty ? ' empty' : ''}`}>
      {empty && <div className="ws-scene" aria-hidden />}
      {empty ? (
        <div className="ws-hero">
          <h1 className="ws-hello">{hello}，{org.name}</h1>
          <div className="ws-muted" style={{ marginBottom: 22, fontSize: 15 }}>{org.kind === 'research' ? '招博士后、研究员、教授：说一句，AI 帮你干。' : '招人、带人、看团队：说一句，AI 帮你干。'}</div>
          <Composer research={org.kind === 'research'} busy={busy} send={send} stop={stop} model={model} setModel={setModel} autoFocus />
          <div className="ws-sec" style={{ margin: '26px 2px 10px' }}>可以从这里开始</div>
          <div className="ws-suggest">{(org.kind === 'research' ? SUGGEST_R : SUGGEST).map(s => <button key={s.t} className="ws-card" onClick={() => send(s.p)}><div style={{ fontWeight: 650, marginBottom: 4 }}>{s.t}</div><div className="ws-muted" style={{ fontSize: 13, lineHeight: 1.55 }}>{s.d}</div></button>)}</div>
        </div>
      ) : (
        <>
          {project && <div className="ws-inproj"><button className="ws-ghost sm" onClick={openProject}>招聘项目 · {project.title} →</button></div>}
          <div className="ws-thread">
            {(() => {
              // 连续的工具调用合成一组（像「做了 4 件事」），产物卡、候选问题卡放在组下面；同一个产物只出一张卡
              const seen = new Set<string>(); const out: React.ReactNode[] = [];
              const lastText = items.map((x, i) => (x.k === 'text' ? i : -1)).filter(i => i >= 0).pop();
              const lastUser = [...items].reverse().find(x => x.k === 'user') as Extract<Item, { k: 'user' }> | undefined;
              for (let i = 0; i < items.length; i++) {
                const x = items[i];
                if (x.k === 'tool') {
                  const group: Extract<Item, { k: 'tool' }>[] = [];
                  while (i < items.length && items[i].k === 'tool') { group.push(items[i] as any); i++; }
                  i--;
                  const chips: any[] = [];
                  for (const g of group) { if (!g.ui || g.ui.kind === 'problems') continue; const k = artKey(g.ui); if (seen.has(k)) continue; seen.add(k); chips.push(g.ui); }
                  out.push(<ToolGroup key={`g${i}`} tools={group} />);
                  for (const g of group) if (g.ui?.kind === 'problems') out.push(<Problems key={`p${g.id}`} ui={g.ui} send={send} busy={busy} />);
                  for (const ui of chips) out.push(<ArtChip key={`c${artKey(ui)}`} ui={ui} openArt={openArt} active={activeArt === artKey(ui)} />);
                  continue;
                }
                out.push(<Row key={i} x={x} send={send} busy={busy} streaming={busy && i === items.length - 1 && x.k === 'text'} last={i === lastText && !busy} regen={lastUser ? () => send(lastUser.text) : undefined} />);
              }
              return out;
            })()}
            {busy && items[items.length - 1]?.k !== 'text' && !(items[items.length - 1]?.k === 'tool' && (items[items.length - 1] as any).running) && <div className="ws-typing"><span className="ws-avatar">百</span><i /><i /><i /></div>}
            <div ref={endRef} style={{ height: 8 }} />
          </div>
          <div className="ws-dock"><Composer onFiles={onFiles} research={org.kind === 'research'} busy={busy} send={send} stop={stop} model={model} setModel={setModel} placeholder={pendingAsk ? '选上面一个，或者直接说你的想法…' : '接着说…'} /></div>
        </>
      )}
    </div>
  );
}

/** 工具图标：读 / 查 / 写 / 跑 / 核 / 人 */
const TOOL_ICON: Record<string, string> = {
  add_candidate: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h4',
  org_profile: 'M4 20V6l8-3 8 3v14M9 20v-5h6v5', setup_checklist: 'M9 11l2 2 4-4M5 4h14v16H5z', enrich_company: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  list_roles: 'M4 7h16v12H4zM9 7V5h6v2', list_work_tasks: 'M5 4h14v16H5zM8 9h8M8 13h8', list_spaces: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z', list_projects: 'M3 7h7l2 2h9v10H3z',
  propose_problems: 'M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2', create_work_task: 'M4 20h4L18 10l-4-4L4 16zM13 7l4 4', write_jd: 'M4 20h4L18 10l-4-4L4 16zM13 7l4 4',
  run_baseline: 'M7 5l12 7-12 7z', screen_candidates: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 11l2 2 4-4', verify_candidate: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z', check_verification: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9 12l2 2 4-4',
  set_candidate_stage: 'M5 12h14M13 6l6 6-6 6', create_space: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z', create_project: 'M3 7h7l2 2h9v10H3zM12 12v5M9.5 14.5h5', project_board: 'M4 5h16v14H4zM9 5v14M15 5v14',
  save_company_info: 'M5 4h11l3 3v13H5zM8 4v5h8V4', add_role: 'M4 7h16v12H4zM12 10v6M9 13h6', finish_setup: 'M5 12l5 5L20 7', work_results: 'M5 19V9M12 19V5M19 19v-7',
};
function Ico({ d, size = 14 }: { d?: string; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d || 'M12 5v14M5 12h14'} /></svg>; }

/** 一组工具调用：收着时一行「做了 N 件事」（进行中显示当前这步），展开看每一步 */
function ToolGroup({ tools }: { tools: Extract<Item, { k: 'tool' }>[] }) {
  const running = tools.find(t => t.running); const failed = tools.filter(t => t.error).length;
  const [open, setOpen] = useState(false); const [, tick] = useState(0);
  useEffect(() => { if (running) { const iv = setInterval(() => tick(n => n + 1), 1000); return () => clearInterval(iv); } }, [running]);
  const head = running ? `${TOOL_RUNNING[running.name] || running.name}` : tools.length === 1 ? (tools[0].error ? `${TOOL_RUNNING[tools[0].name] || tools[0].name}：${tools[0].error}` : tools[0].label) : `做了 ${tools.length} 件事${failed ? `，${failed} 件出错` : ''}`;
  return (
    <div className={`ws-tg${open ? ' open' : ''}`}>
      <button className="ws-tg-head" onClick={() => setOpen(o => !o)}>
        <span className={`ws-tool-dot${running ? ' run' : failed ? ' err' : ''}`} />
        <span className="ws-tg-title">{head}</span>
        {running && <span className="ws-muted" style={{ fontSize: 12 }}>{Math.round((Date.now() - running.t0) / 1000)}s</span>}
        {!running && tools.length > 1 && <span className="ws-tg-icons">{tools.slice(0, 5).map(t => <span key={t.id}><Ico d={TOOL_ICON[t.name]} size={12} /></span>)}</span>}
        <span className="ws-tg-caret"><Ico d="M9 6l6 6-6 6" size={12} /></span>
      </button>
      {open && <div className="ws-tg-body">{tools.map(t => <ToolLine key={t.id} t={t} />)}</div>}
    </div>
  );
}
function ToolLine({ t }: { t: Extract<Item, { k: 'tool' }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ws-tl">
      <button className="ws-tl-head" onClick={() => setOpen(o => !o)}>
        <span className={`ws-tl-ico${t.error ? ' err' : t.running ? ' run' : ''}`}><Ico d={TOOL_ICON[t.name]} size={13} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>{t.running ? TOOL_RUNNING[t.name] || t.name : t.error ? `${TOOL_RUNNING[t.name] || t.name}：${t.error}` : t.label}</span>
        <span className="ws-muted" style={{ fontSize: 11 }}>{open ? '收起' : '参数'}</span>
      </button>
      {open && <pre className="ws-tool-detail">{JSON.stringify(t.input || {}, null, 2)}</pre>}
    </div>
  );
}
function Problems({ ui, send, busy }: { ui: any; send: (t: string) => void; busy: boolean }) {
  return <div className="ws-problems">{ui.items.map((p: any, i: number) => (
    <button key={i} className="ws-card ws-problem" disabled={busy} onClick={() => send(`就第 ${i + 1} 个：${p.title}——${p.statement}`)}>
      <div className="ws-cap">候选 {i + 1}</div><div style={{ fontWeight: 650, margin: '3px 0 6px' }}>{p.title}</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{p.statement}</div>
      {p.why_now && <div className="ws-muted" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.55 }}>为什么是现在：{p.why_now}</div>}
      {!!p.evidence?.length && <div className="ws-muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>依据：{p.evidence.join('；')}</div>}
    </button>))}</div>;
}
function ArtChip({ ui, openArt, active }: { ui: any; openArt: (a: Art) => void; active: boolean }) {
  const kind = ui.kind === 'work' ? '真活 · 任务书、材料包、评分标准、AI 基线' : ui.kind === 'results' ? '作答与报告' : ui.kind === 'company' ? '档案' : ui.kind === 'project' ? '招聘项目' : ui.kind === 'candidate' ? '候选人' : '职业空间';
  const d = ui.kind === 'space_build' || ui.kind === 'space' ? TOOL_ICON.create_space : ui.kind === 'candidate' ? TOOL_ICON.screen_candidates : ui.kind === 'project' ? TOOL_ICON.list_projects : ui.kind === 'company' ? TOOL_ICON.org_profile : TOOL_ICON.list_work_tasks;
  return (
    <button className={`ws-artchip${active ? ' on' : ''}`} onClick={() => openArt(ui)}>
      <span className="ws-artchip-ico"><Ico d={d} size={16} /></span>
      <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ui.title}</span><span className="ws-muted" style={{ fontSize: 12 }}>{kind}</span></span>
      <span className="ws-muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{active ? '已打开' : '打开 →'}</span>
    </button>
  );
}

function Row({ x, send, busy, streaming, last, regen }: { x: Item; send: (t: string) => void; busy: boolean; streaming?: boolean; last?: boolean; regen?: () => void }) {
  const [copied, setCopied] = useState(false);
  if (x.k === 'user') return <div className="ws-user"><div className="ws-bubble">{x.text}</div></div>;
  if (x.k === 'text') return (
    <div className={`ws-ai${streaming ? ' streaming' : ''}`}>
      <span className="ws-avatar">百</span>
      <div className="ws-ai-body">
        <Md text={x.text} />
        {!streaming && <div className={`ws-ai-act${last ? ' show' : ''}`}>
          <button onClick={() => { navigator.clipboard?.writeText(x.text); setCopied(true); setTimeout(() => setCopied(false), 1400); }} title="复制"><Ico d={copied ? 'M5 12l5 5L20 7' : 'M8 8h11v11H8zM5 16V5h11'} size={13} />{copied ? '已复制' : '复制'}</button>
          {last && regen && <button onClick={regen} disabled={busy} title="把上一句再问一次"><Ico d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" size={13} />再说一次</button>}
        </div>}
      </div>
    </div>
  );
  if (x.k === 'error') return <div className="ws-err">{x.text}</div>;
  if (x.k === 'ask') return (
    <div className="ws-ask">
      <div style={{ fontWeight: 600, marginBottom: 10 }}>{x.question}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {x.options.map((o, i) => <button key={i} className={`ws-opt${x.answered === o ? ' on' : ''}`} disabled={!!x.answered || busy} onClick={() => send(o)}><span className="ws-opt-n">{i + 1}</span>{o.replace(/^\s*\d+\s*[.、)）:：]?\s*/, '')}</button>)}
      </div>
      {x.answered && !x.options.includes(x.answered) && <div className="ws-muted" style={{ marginTop: 8, fontSize: 13 }}>你回答了：{x.answered}</div>}
    </div>
  );
  return null;
}

function Composer({ busy, send, stop, model, setModel, placeholder, autoFocus, research, onFiles }: { busy: boolean; send: (t: string) => void; stop: () => void; model: string; setModel: (m: string) => void; placeholder?: string; autoFocus?: boolean; research?: boolean; onFiles?: (files: File[]) => void }) {
  const [v, setV] = useState(''); const ta = useRef<HTMLTextAreaElement>(null); const fileRef = useRef<HTMLInputElement>(null); const [drag, setDrag] = useState(false);
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(220, el.scrollHeight) + 'px'; }, [v]);
  const go = () => { if (!v.trim() || busy) return; send(v); setV(''); };
  const take = (fl: FileList | null) => { const fs = Array.from(fl || []).filter(f => /\.(pdf|txt|md)$/i.test(f.name)); if (fs.length && onFiles) onFiles(fs); };
  return (
    <div className={`ws-composer${drag ? ' drag' : ''}`} onDragOver={e => { if (onFiles) { e.preventDefault(); setDrag(true); } }} onDragLeave={() => setDrag(false)} onDrop={e => { if (!onFiles) return; e.preventDefault(); setDrag(false); take(e.dataTransfer.files); }}>
      {drag && <div className="ws-drop">松手，简历会加进这个项目的候选人</div>}
      <textarea ref={ta} value={v} autoFocus={autoFocus} rows={1} placeholder={placeholder || (research ? '比如：给界面表征方向的博士后出一道研究真活' : '比如：给供应链计划岗出一道真活')} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); go(); } }} />
      <div className="ws-composer-bar">
        {onFiles && <><button className="ws-clip" title="上传简历（PDF，可多选；也可以直接拖进来）" onClick={() => fileRef.current?.click()} disabled={busy}><Ico d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7" size={16} /></button><input ref={fileRef} type="file" accept=".pdf,.txt,.md" multiple hidden onChange={e => { take(e.target.files); e.target.value = ''; }} /></>}
        <select className="ws-model" value={model} onChange={e => setModel(e.target.value)} title="总控用哪个模型">{CHAT_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        <span className="ws-muted ws-scope" style={{ fontSize: 12, marginLeft: 8 }}>{research ? '只围绕本机构' : '只围绕本企业'}</span>
        {busy ? <button className="ws-send stop" onClick={stop} aria-label="停止">■</button> : <button className="ws-send" onClick={go} disabled={!v.trim()} aria-label="发送">↑</button>}
      </div>
    </div>
  );
}

/** ⌘K：搜对话、项目，也能直接执行常用动作 */
function Palette({ org, threads, projects, close, run, actions }: { org: Org; threads: any[]; projects: any[]; close: () => void; run: (a: () => void) => void; actions: { newChat: () => void; newProject: () => void; view: (v: View) => void; thread: (id: string) => void; project: (id: string) => void; ask: (p: string) => void } }) {
  const [q, setQ] = useState(''); const [i, setI] = useState(0);
  const r = org.kind === 'research';
  const all: { g: string; t: string; d?: string; ico: string; go: () => void }[] = [
    { g: '动作', t: '新对话', ico: 'M12 5v14M5 12h14', go: actions.newChat },
    { g: '动作', t: r ? '开一个人才引进项目' : '开一个招聘项目', ico: TOOL_ICON.create_project, go: actions.newProject },
    { g: '动作', t: r ? '出一道研究真活' : '出一道真活', ico: TOOL_ICON.create_work_task, go: () => actions.ask(r ? '帮我给一个研究岗出一道研究真活' : '帮我给一个岗位出一道真活') },
    { g: '动作', t: '建一个职业空间', ico: TOOL_ICON.create_space, go: () => actions.ask('帮我给一个岗位建职业空间') },
    { g: '动作', t: r ? '机构设置' : '企业设置', ico: TOOL_ICON.save_company_info, go: () => actions.view('setup') },
    { g: '页面', t: '岗位', ico: TOOL_ICON.list_roles, go: () => actions.view('roles') },
    { g: '页面', t: '真活', ico: TOOL_ICON.list_work_tasks, go: () => actions.view('work') },
    { g: '页面', t: '职业空间', ico: TOOL_ICON.list_spaces, go: () => actions.view('spaces') },
    { g: '页面', t: '候选人', ico: TOOL_ICON.screen_candidates, go: () => actions.view('people') },
    ...projects.map(p => ({ g: r ? '引进项目' : '招聘项目', t: p.title, d: `${p.candidates || 0} 位候选人`, ico: TOOL_ICON.list_projects, go: () => actions.project(p.id) })),
    ...threads.map(t => ({ g: '对话', t: t.title || '未命名对话', d: new Date(t.updated_at).toLocaleDateString('zh-CN'), ico: 'M4 5h16v11H8l-4 4z', go: () => actions.thread(t.id) })),
  ];
  const qq = q.trim().toLowerCase();
  const list = (qq ? all.filter(x => x.t.toLowerCase().includes(qq) || x.g.includes(qq)) : all.filter(x => x.g !== '对话').concat(all.filter(x => x.g === '对话').slice(0, 5))).slice(0, 40);
  useEffect(() => { setI(0); }, [q]);
  const key = (e: React.KeyboardEvent) => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(n => Math.min(list.length - 1, n + 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setI(n => Math.max(0, n - 1)); } else if (e.key === 'Enter' && list[i]) { e.preventDefault(); run(list[i].go); } else if (e.key === 'Escape') close(); };
  let lastG = '';
  return (
    <div className="ws-pal-scrim" onClick={close}>
      <div className="ws-pal" onClick={e => e.stopPropagation()}>
        <div className="ws-pal-in"><Ico d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" size={16} /><input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={key} placeholder="搜对话、项目，或者直接做点什么…" /><kbd>Esc</kbd></div>
        <div className="ws-pal-list">
          {list.length ? list.map((x, k) => { const head = x.g !== lastG ? (lastG = x.g, <div key={`h${k}`} className="ws-pal-g">{x.g}</div>) : null; return <React.Fragment key={k}>{head}<button className={`ws-pal-i${k === i ? ' on' : ''}`} onMouseEnter={() => setI(k)} onClick={() => run(x.go)}><span className="ws-pal-ico"><Ico d={x.ico} size={14} /></span><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.t}</span>{x.d && <span className="ws-muted" style={{ fontSize: 12 }}>{x.d}</span>}</button></React.Fragment>; }) : <div className="ws-muted" style={{ padding: 18, textAlign: 'center' }}>没找到「{q}」</div>}
        </div>
        <div className="ws-pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>↵</kbd> 打开</span><span><kbd>⌘K</kbd> 开关</span></div>
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
      <div className="ws-ph">
        <img className="ws-ph-art" src={`/workspace/head-${view}.jpg`} alt="" aria-hidden />
        <div><h1 className="ws-title">{title}</h1><div className="ws-muted">{sub}</div></div>
        <button className="ws-primary" style={{ marginLeft: 'auto' }} onClick={() => ask(view === 'spaces' ? '帮我给一个岗位建职业空间' : view === 'people' ? '最近的真活谁做得最好？帮我对比一下' : '帮我给一个岗位出一道真活')}>{view === 'spaces' ? '建一个职业空间' : view === 'people' ? '让 AI 对比' : '出一道真活'}</button>
      </div>
      {err && <div className="ws-err">{err}</div>}
      {!d && !err && <Skel lines={6} card />}
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

function Onboard({ edition, err, onDone }: { edition: Edition; err: string; onDone: (o: Org) => void }) {
  const kind = edition;
  const [q, setQ] = useState(''); const [site, setSite] = useState(''); const [list, setList] = useState<any[]>([]); const [pick, setPick] = useState<any>(null); const [busy, setBusy] = useState(false); const [e2, setE2] = useState('');
  useEffect(() => { if (!q.trim() || pick?.name === q) { setList([]); return; } const t = setTimeout(async () => { const j = await (await fetch(`/api/work/companies?q=${encodeURIComponent(q)}`)).json(); setList(j.companies || []); const exact = (j.companies || []).find((c: any) => c.name === q.trim() || c.brief_name === q.trim()); if (exact) setPick(exact); }, 250); return () => clearTimeout(t); }, [q]);   // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => {
    setBusy(true); setE2('');
    const j = await (await fetch('/api/ws/org', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pick ? { name: pick.brief_name || pick.name, company_id: pick.id, company_name: pick.name, kind } : { name: q.trim(), company_name: q.trim(), website: site.trim() || null, kind }) })).json();
    setBusy(false); if (!j.ok) { setE2(j.error); return; } onDone(j.org);
  };
  return (
    <div className="ws-center">
      <div style={{ width: 'min(520px, 92vw)' }}>
        <div className="ws-brand" style={{ marginBottom: 26 }}><span className="ws-brand-mark">百</span><span>百业 AI <span className="ws-muted" style={{ fontWeight: 400 }}>{EDITION_NAME[edition]}</span></span></div>
        <h1 className="ws-hello" style={{ fontSize: 30 }}>{kind === 'research' ? '你在哪个机构？' : '你在哪家企业？'}</h1>
        <div className="ws-muted" style={{ margin: '6px 0 20px', lineHeight: 1.7 }}>{kind === 'research' ? '工作台围绕你自己的机构干活：用平方数据里的研究方向、平台和成果来出研究真活、写招聘启事、做学术验真。库里搜得到就选上；搜不到也可以，按新机构建。' : '工作台围绕你自己的企业干活：用平方数据里本企业的画像、动态和岗位来出真活、建职业空间。库里搜得到就选上；搜不到也可以，按新企业建。'}</div>
        {err && <div className="ws-err" style={{ marginBottom: 12 }}>{err}</div>}
        <input className="ws-input" value={q} onChange={e => { setQ(e.target.value); setPick(null); }} placeholder={kind === 'research' ? '输入机构名，比如 某某大学材料学院 / 某某研究院' : '输入企业名，比如 宁德时代'} autoFocus />
        {!!list.length && !pick && <div className="ws-pick">{list.slice(0, 6).map(c => <button key={c.id} onClick={() => { setPick(c); setQ(c.name); setList([]); }}><b>{c.name}</b><span className="ws-muted"> {[c.industry, c.city].filter(Boolean).join(' · ')}{c.jobs ? ` · 在招 ${c.jobs}` : ''}</span></button>)}</div>}
        <div className="ws-muted" style={{ fontSize: 12.5, margin: '8px 2px 12px' }}>{pick ? `已匹配平方企业库：${pick.name}${pick.has_profile ? ' · 有企业画像' : ''}${pick.jobs ? ` · 在招 ${pick.jobs} 个岗位` : ''}` : q.trim() ? '平方企业库里没有这家：会在库里新建，下一步 AI 联网补全你们的画像，你核对' : ''}</div>
        {!pick && q.trim() && <input className="ws-input" style={{ marginBottom: 16 }} value={site} onChange={e => setSite(e.target.value)} placeholder="官网（选填，比如 https://www.example.com）——用来给企业编号、找公开资料" />}
        <button className="ws-primary" disabled={!q.trim() || busy} onClick={go} style={{ width: '100%', height: 44 }}>{busy ? '正在建…' : '进入工作台'}</button>
        {e2 && <div className="ws-err" style={{ marginTop: 10 }}>{e2}</div>}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState('light');
  useEffect(() => { const read = () => { try { setTheme(localStorage.getItem('ws:theme2') || 'light'); } catch {} }; read(); window.addEventListener('ws-theme', read); return () => window.removeEventListener('ws-theme', read); }, []);
  return <div className="ws" data-theme={theme}>{children}<style>{CSS}</style></div>;
}

/** 配色：浅色（默认，2026-10-28 起照一答 /v2 工作区：极光白 + 中性灰 + 主色实色按钮）/ 纸张（暖色旧版）。换了存储键，大家默认都回到浅色 */
function ThemeSwitch() {
  const [t, setT] = useState('light');
  useEffect(() => { try { setT(localStorage.getItem('ws:theme2') || 'light'); } catch {} }, []);
  const set = (v: string) => { setT(v); try { localStorage.setItem('ws:theme2', v); } catch {} window.dispatchEvent(new Event('ws-theme')); };
  return <span className="ws-theme" title="配色">{[['light', '浅色'], ['paper', '纸张']].map(([k, l]) => <button key={k} className={t === k ? 'on' : ''} onClick={() => set(k)}>{l}</button>)}</span>;
}

function SetupPage() { return <div style={{ flex: 1, overflowY: 'auto' }}><Setup step="context" embedded onDone={() => {}} /></div>; }

const CSS = `
.ws { --paper:#faf9f5; --side:#f2f0e9; --card:#fffefb; --line:#e6e2d6; --line2:#efece3; --ink:#26241f; --ink2:#5d5950; --ink3:#918c80; --accent:#4f46c8; --accent-soft:#ecebfa; --hover:#e9e6dc;
  min-height:100dvh; background:var(--paper); color:var(--ink); font-family:'PingFang SC',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; font-size:14.5px; }
.ws * { box-sizing:border-box; }
.ws-muted { color:var(--ink3); }
.ws-cap { font-size:11.5px; color:var(--ink3); letter-spacing:.02em; }
.ws-center { min-height:100dvh; display:grid; place-items:center; padding:24px; }
.ws-root { display:grid; grid-template-columns:260px minmax(0,1fr); height:100dvh; transition:grid-template-columns .25s; }
.ws-root.with-art { grid-template-columns:260px minmax(0,1fr) var(--art-w, minmax(420px,46%)); }
.ws-root.no-side { grid-template-columns:0 minmax(0,1fr); }
.ws-root.no-side.with-art { grid-template-columns:0 minmax(0,1fr) var(--art-w, minmax(420px,46%)); }
.ws-side-wrap { display:contents; } .ws-burger, .ws-scrim { display:none; }
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
.ws-recent-row { position:relative; display:flex; align-items:center; border-radius:8px; }
.ws-recent-row:hover, .ws-recent-row.on, .ws-recent-row.menu { background:var(--hover); }
.ws-recent-row .ws-recent { background:transparent !important; flex:1; min-width:0; }
.ws-recent-row.on .ws-recent { color:var(--ink); }
.ws-recent-more { opacity:0; border:0; background:transparent; color:var(--ink3); cursor:pointer; padding:2px 8px; font-size:15px; border-radius:6px; }
.ws-recent-row:hover .ws-recent-more, .ws-recent-row.menu .ws-recent-more { opacity:1; } .ws-recent-more:hover { color:var(--ink); }
.ws-menu { position:absolute; right:4px; top:30px; z-index:5; background:var(--card); border:1px solid var(--line); border-radius:10px; box-shadow:0 10px 30px rgba(40,30,10,.12); padding:4px; min-width:140px; }
.ws-menu button { display:block; width:100%; text-align:left; border:0; background:transparent; padding:7px 10px; font-size:13px; border-radius:7px; cursor:pointer; color:var(--ink); }
.ws-menu button:hover { background:var(--hover); } .ws-menu button.danger { color:#a33a2b; }
.ws-recent-edit { width:100%; border:1px solid var(--accent); border-radius:8px; padding:5px 9px; font:inherit; font-size:13.5px; outline:0; background:var(--card); color:var(--ink); }
.ws-search { display:flex; align-items:center; gap:8px; width:100%; padding:7px 10px; border-radius:9px; border:0; background:transparent; color:var(--ink2); font-size:14px; cursor:pointer; text-align:left; }
.ws-search:hover { background:var(--hover); }
.ws kbd { margin-left:auto; font-family:ui-monospace,Menlo,monospace; font-size:11px; color:var(--ink3); border:1px solid var(--line); border-bottom-width:2px; border-radius:5px; padding:0 5px; background:var(--card); }
.ws-pal-scrim { position:fixed; inset:0; z-index:50; background:rgba(30,26,18,.18); backdrop-filter:blur(2px); display:flex; justify-content:center; align-items:flex-start; padding-top:12vh; animation:wsfade .12s ease-out; }
.ws-pal { width:min(620px, 92vw); background:var(--card); border:1px solid var(--line); border-radius:16px; box-shadow:0 30px 80px rgba(30,26,18,.22); overflow:hidden; animation:wspop .14s ease-out; }
.ws-pal-in { display:flex; align-items:center; gap:10px; padding:14px 16px; border-bottom:1px solid var(--line2); color:var(--ink3); }
.ws-pal-in input { flex:1; border:0; outline:0; font:inherit; font-size:16px; background:transparent; color:var(--ink); }
.ws-pal-list { max-height:min(420px, 56vh); overflow-y:auto; padding:6px; }
.ws-pal-g { font-size:11.5px; color:var(--ink3); padding:8px 10px 4px; letter-spacing:.04em; }
.ws-pal-i { display:flex; align-items:center; gap:10px; width:100%; border:0; background:transparent; padding:8px 10px; border-radius:9px; font-size:14px; color:var(--ink); cursor:pointer; text-align:left; }
.ws-pal-i.on { background:var(--hover); }
.ws-pal-ico { width:24px; height:24px; border-radius:7px; background:var(--accent-soft); color:var(--accent); display:grid; place-items:center; flex-shrink:0; }
.ws-pal-foot { display:flex; gap:16px; padding:8px 14px; border-top:1px solid var(--line2); font-size:12px; color:var(--ink3); } .ws-pal-foot kbd { margin:0 3px 0 0; }
@keyframes wsfade { from { opacity:0 } } @keyframes wspop { from { opacity:0; transform:translateY(-6px) scale(.99); } }
.ws-side-foot { border-top:1px solid var(--line); padding:10px 8px 2px; display:flex; flex-direction:column; gap:8px; }
.ws-me { display:flex; align-items:center; gap:9px; min-width:0; }
.ws-me-av { width:28px; height:28px; flex:none; border-radius:50%; display:grid; place-items:center; background:var(--ink); color:var(--paper); font-size:12.5px; font-weight:650; }
.ws-me-name { font-size:13px; font-weight:600; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
/* 版画（2026-10-28）：首页底部一张淡淡的海港园区，上半更透明、下半清楚；各功能页右上角一张和本页有关的小插图，四边渐隐、正片叠底融进纸色 */
.ws-chat.empty { position:relative; }
.ws-scene { position:absolute; left:50%; transform:translateX(-50%); bottom:-4%; width:min(1180px, 100%); height:min(38%, 340px); background:url(/workspace/h-port.jpg) center 40% / 100% auto no-repeat; mix-blend-mode:multiply; opacity:.5; filter:saturate(.5) contrast(1.05); pointer-events:none;
  -webkit-mask-image:linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.55) 28%, #000 68%), linear-gradient(to right, transparent 0%, #000 22%, #000 78%, transparent 100%); -webkit-mask-composite:source-in;
  mask-image:linear-gradient(to bottom, transparent 0%, rgba(0,0,0,.55) 28%, #000 68%), linear-gradient(to right, transparent 0%, #000 22%, #000 78%, transparent 100%); mask-composite:intersect; }
.ws-chat.empty .ws-hero { position:relative; z-index:1; }
.ws-ph { position:relative; display:flex; align-items:flex-end; gap:16px; margin-bottom:18px; min-height:132px; }
.ws-ph > div, .ws-ph > button { position:relative; z-index:1; }
.ws-ph-art { position:absolute; right:150px; top:-30px; height:176px; width:auto; max-width:48%; object-fit:contain; mix-blend-mode:multiply; opacity:.62; filter:saturate(.4); pointer-events:none; user-select:none;
  -webkit-mask-image:linear-gradient(to right, transparent 0%, #000 38%, #000 78%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 22%, #000 70%, transparent 100%); -webkit-mask-composite:source-in;
  mask-image:linear-gradient(to right, transparent 0%, #000 38%, #000 78%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 22%, #000 70%, transparent 100%); mask-composite:intersect; }
@media (max-width: 900px) { .ws-ph-art { display:none; } .ws-ph { min-height:0; } .ws-scene { height:34%; opacity:.35; } }
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
.ws-ai { margin:12px auto 6px; line-height:1.8; font-size:15px; display:flex; gap:12px; align-items:flex-start; }
.ws-ai-body { flex:1; min-width:0; }
.ws-avatar { width:24px; height:24px; border-radius:7px; background:var(--ink); color:var(--paper); display:grid; place-items:center; font-size:12px; font-family:var(--font-serif-sc),'Songti SC',serif; flex-shrink:0; margin-top:3px; }
.ws[data-theme="cool"] .ws-avatar { background:#4b57d6; color:#fff; }
.ws-ai.streaming .ws-md > :last-child::after { content:''; display:inline-block; width:7px; height:15px; margin-left:3px; vertical-align:-2px; background:var(--ink2); border-radius:1px; animation:wscaret 1s steps(2) infinite; }
@keyframes wscaret { 50% { opacity:0; } }
.ws-ai-act { display:flex; gap:4px; margin-top:2px; opacity:0; transition:opacity .15s; }
.ws-ai:hover .ws-ai-act, .ws-ai-act.show { opacity:1; }
.ws-ai-act button { display:inline-flex; align-items:center; gap:4px; border:0; background:transparent; color:var(--ink3); font-size:12px; padding:3px 7px; border-radius:6px; cursor:pointer; }
.ws-ai-act button:hover:not(:disabled) { background:var(--hover); color:var(--ink); }
.ws-tg { margin:8px auto; border:1px solid var(--line2); border-radius:12px; background:transparent; transition:background .15s; }
.ws-tg.open { background:var(--card); border-color:var(--line); }
.ws-tg-head { display:flex; align-items:center; gap:9px; width:100%; border:0; background:transparent; padding:8px 12px; color:var(--ink2); font-size:13.5px; cursor:pointer; text-align:left; border-radius:12px; }
.ws-tg-head:hover { background:var(--hover); }
.ws-tg-title { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ws-tg-icons { display:inline-flex; gap:3px; color:var(--ink3); margin-left:4px; } .ws-tg-icons span { width:20px; height:20px; border-radius:6px; background:var(--hover); display:grid; place-items:center; }
.ws-tg-caret { margin-left:auto; color:var(--ink3); transition:transform .15s; display:inline-flex; } .ws-tg.open .ws-tg-caret { transform:rotate(90deg); }
.ws-tg-body { border-top:1px solid var(--line2); padding:4px 6px 6px; }
.ws-tl-head { display:flex; align-items:center; gap:9px; width:100%; border:0; background:transparent; padding:6px 6px; color:var(--ink2); font-size:13px; cursor:pointer; text-align:left; border-radius:8px; }
.ws-tl-head:hover { background:var(--hover); }
.ws-tl-ico { width:22px; height:22px; border-radius:6px; background:var(--accent-soft); color:var(--accent); display:grid; place-items:center; flex-shrink:0; }
.ws-tl-ico.err { background:#f6e9e6; color:#a33a2b; } .ws-tl-ico.run { animation:wspulse 1.2s ease-in-out infinite; }
.ws-typing { align-items:center; } .ws-typing .ws-avatar { margin:0 6px 0 0; }
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
.ws-artchip { display:flex; align-items:center; gap:12px; margin:8px auto 0; border:1px solid var(--line); background:var(--card); border-radius:12px; padding:10px 14px; cursor:pointer; text-align:left; color:var(--ink); font-size:14px; }
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
.ws-composer:focus-within { border-color:#c9c2ae; box-shadow:0 2px 10px rgba(60,50,20,.05), 0 0 0 3px rgba(79,70,200,.06); }
.ws-composer { position:relative; transition:border-color .15s, box-shadow .15s; }
.ws-composer.drag { border-color:var(--accent); border-style:dashed; }
.ws-drop { position:absolute; inset:0; border-radius:18px; background:rgba(236,235,250,.92); display:grid; place-items:center; color:var(--accent); font-weight:600; z-index:2; pointer-events:none; }
.ws-clip { border:0; background:transparent; color:var(--ink3); cursor:pointer; padding:4px; border-radius:8px; display:inline-flex; margin-right:4px; }
.ws-clip:hover:not(:disabled) { background:var(--hover); color:var(--ink); }
.ws-composer textarea { width:100%; border:0; outline:0; resize:none; background:transparent; font:inherit; font-size:15px; line-height:1.6; color:var(--ink); min-height:26px; }
.ws-composer-bar { display:flex; align-items:center; margin-top:4px; }
.ws-model { border:0; background:transparent; color:var(--ink2); font:inherit; font-size:12.5px; cursor:pointer; padding:4px 2px; outline:0; }
.ws-send { margin-left:auto; width:32px; height:32px; border-radius:10px; border:0; background:var(--ink); color:#fff; font-size:16px; cursor:pointer; }
.ws-send:disabled { opacity:.25; cursor:default; } .ws-send.stop { background:#7a756a; font-size:11px; }
.ws-art .ant-descriptions-item-label { white-space:nowrap; width:1%; }
@media (max-width: 560px) { .ws-art .ant-descriptions-item-label { padding:8px 10px !important; font-size:12.5px; } .ws-art .ant-descriptions-item-content { padding:8px 10px !important; } }
.ws-art { position:relative; border-left:1px solid var(--line); background:#fffefb; display:flex; flex-direction:column; min-width:0; min-height:0; animation:wsslide .22s cubic-bezier(.2,.8,.2,1); }
@keyframes wsslide { from { opacity:0; transform:translateX(18px); } }
.ws-art-grip { position:absolute; left:-4px; top:0; bottom:0; width:8px; cursor:col-resize; z-index:3; }
.ws-art-grip:hover, .ws-art-grip:active { background:linear-gradient(90deg, transparent 3px, var(--accent) 3px, var(--accent) 5px, transparent 5px); opacity:.5; }
.ws-skel { display:flex; flex-direction:column; gap:12px; padding:4px 0; } .ws-skel.card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px; }
.ws-skel i { display:block; border-radius:6px; background:linear-gradient(90deg, var(--hover) 25%, var(--line2) 50%, var(--hover) 75%); background-size:200% 100%; animation:wsshimmer 1.3s linear infinite; }
@keyframes wsshimmer { to { background-position:-200% 0; } }
.ws-boot { min-height:100dvh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; }
.ws-boot-bar { width:120px; height:3px; border-radius:2px; background:var(--hover); overflow:hidden; } .ws-boot-bar i { display:block; width:40%; height:100%; background:var(--accent); border-radius:2px; animation:wsboot 1s ease-in-out infinite; }
@keyframes wsboot { from { transform:translateX(-100%); } to { transform:translateX(260%); } }
.ws button:focus-visible, .ws a:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
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
.ws-table th, .ws-table td:not(:first-child):not(:last-child) { white-space:nowrap; }
.ws-table { overflow-x:auto; }
.ws-table tr:last-child td { border-bottom:0; } .ws-table tr:hover td { background:#fbfaf6; }
.ws-rowlink { color:var(--ink); cursor:pointer; font-weight:600; text-decoration:none; } .ws-rowlink:hover { color:var(--accent); text-decoration:underline; }
.ws-emptybox { border:1px dashed #d8d2c2; border-radius:14px; padding:36px; text-align:center; color:var(--ink3); }
.ws-input { width:100%; height:46px; border:1px solid var(--line); border-radius:12px; padding:0 14px; font:inherit; font-size:15px; background:#fff; outline:0; color:var(--ink); }
.ws-input:focus { border-color:#c9c2ae; }
.ws-pick { margin-top:6px; border:1px solid var(--line); border-radius:12px; background:#fff; overflow:hidden; }
.ws-pick button { display:block; width:100%; text-align:left; border:0; background:transparent; padding:9px 14px; cursor:pointer; font-size:14px; color:var(--ink); }
.ws-pick button:hover { background:#f6f4ee; }
/* 冷灰（照一答企业版 /ws）：中性灰底 + 极淡的蓝 / 浅紫极光，实色蓝紫 */
.ws[data-theme="light"] { --paper:#f8f9fd; --side:rgba(255,255,255,.55); --card:#ffffff; --line:#e6e7ec; --line2:#eff0f3; --ink:#1d2030; --ink2:#4a4f63; --ink3:#7c8193; --accent:#6055f5; --accent-soft:#efedfe; --hover:#f0f0f8;
  background:radial-gradient(1100px 680px at 88% -12%, rgba(150,180,255,.20), transparent 62%), radial-gradient(900px 620px at 8% 112%, rgba(186,168,255,.16), transparent 60%), linear-gradient(180deg, #f9fbff 0%, #f7f7fd 100%); background-attachment:fixed; }
.ws[data-theme="light"] .ws-side { backdrop-filter:blur(12px); border-right-color:rgba(220,222,238,.8); }
.ws[data-theme="light"] .ws-primary, .ws[data-theme="light"] .ws-send { background:#6055f5; color:#fff; }
.ws[data-theme="light"] .ws-primary:hover, .ws[data-theme="light"] .ws-send:hover { background:#4f46e5; }
.ws[data-theme="light"] .ws-brand-mark, .ws[data-theme="light"] .ws-avatar { background:#6055f5; color:#fff; font-family:inherit; }
.ws[data-theme="light"] .ws-me-av { background:#efedfe; color:#4f46e5; }
.ws[data-theme="light"] .ws-hello, .ws[data-theme="light"] .ws-title { font-family:inherit; font-weight:700; letter-spacing:0; }
.ws[data-theme="light"] .ws-nav.on, .ws[data-theme="light"] .ws-recent.on { background:#efedfe; color:#4f46e5; }
.ws[data-theme="light"] .ws-bubble { background:#efedfe; }
.ws[data-theme="light"] .ws-table th { background:#f7f8fc; }
.ws[data-theme="light"] .ws-art { background:rgba(255,255,255,.92); }
.ws[data-theme="light"] .ws-scene { opacity:.38; filter:saturate(.3) hue-rotate(10deg); }
.ws[data-theme="light"] .ws-ph-art { opacity:.5; }
.ws[data-theme="cool"] { --paper:#f8f9fb; --side:rgba(252,252,254,.85); --card:#ffffff; --line:#e4e6ec; --line2:#edf0f8; --ink:#1d1f24; --ink2:#3c4048; --ink3:#6b6f78; --accent:#4b57d6; --accent-soft:#eef1fb; --hover:#eef1fb;
  background: radial-gradient(ellipse 55% 40% at 0% 0%, rgba(120,145,245,.10), transparent 70%), radial-gradient(ellipse 45% 35% at 100% 0%, rgba(165,145,240,.09), transparent 70%), #f8f9fb; }
.ws[data-theme="cool"] .ws-side { backdrop-filter:blur(14px); }
.ws[data-theme="cool"] .ws-bubble { background:#eceff8; }
.ws[data-theme="cool"] .ws-nav.on, .ws[data-theme="cool"] .ws-recent.on { background:#e4e9fb; }
.ws[data-theme="cool"] .ws-primary, .ws[data-theme="cool"] .ws-send { background:#4b57d6; }
.ws[data-theme="cool"] .ws-brand-mark { background:#4b57d6; }
.ws[data-theme="cool"] .ws-art { background:rgba(252,252,254,.92); }
.ws[data-theme="cool"] .ws-tool-line:hover, .ws[data-theme="cool"] .ws-tool-detail { background:#f3f5fe; }
.ws[data-theme="cool"] .ws-table th { background:#f6f8fe; }
.ws-theme { margin-left:auto; display:inline-flex; gap:2px; padding:2px; border-radius:8px; background:var(--hover); }
.ws-theme button { border:0; background:transparent; color:var(--ink3); font-size:11.5px; padding:2px 7px; border-radius:6px; cursor:pointer; }
.ws-theme button.on { background:var(--card); color:var(--ink); box-shadow:0 1px 2px rgba(0,0,0,.06); }
/* 企业落地向导 */
.ws-wizard { min-height:100dvh; overflow-y:auto; }
.ws-steps { display:flex; align-items:center; gap:6px; margin-bottom:22px; }
.ws-stepb { display:flex; align-items:center; gap:8px; border:1px solid var(--line); background:var(--card); border-radius:999px; padding:5px 14px 5px 6px; cursor:pointer; color:var(--ink2); font-size:13.5px; }
.ws-stepb.on { border-color:var(--accent); color:var(--ink); font-weight:600; }
.ws-stepn { width:22px; height:22px; border-radius:50%; background:var(--accent-soft); color:var(--accent); display:grid; place-items:center; font-size:12px; font-weight:700; }
.ws-box { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px 16px; }
.ws-box-h { display:flex; align-items:center; gap:8px; font-weight:650; margin-bottom:12px; }
.ws-chip-s { font-size:11.5px; font-weight:500; color:var(--ink3); background:var(--hover); border-radius:999px; padding:2px 9px; }
.ws-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 14px; }
.ws-form label { display:flex; flex-direction:column; gap:4px; font-size:12.5px; color:var(--ink3); }
.ws-form label.wide { grid-column:1 / -1; }
.ws-form input, .ws-form textarea { border:1px solid var(--line); border-radius:9px; padding:8px 10px; font:inherit; font-size:14px; color:var(--ink); background:var(--paper); outline:0; resize:vertical; }
.ws-form input:focus, .ws-form textarea:focus { border-color:var(--accent); background:#fff; }
.ws-input.sm { height:38px; font-size:14px; }
.ws-note-b { margin-top:12px; color:var(--accent); font-size:13.5px; }
.ws-note-ok { margin-top:12px; color:#3d6b32; background:#eef6ea; border:1px solid #d5e8cf; border-radius:10px; padding:8px 12px; font-size:13.5px; }
.ws-role { border-top:1px solid var(--line2); padding:10px 2px; } .ws-role:first-of-type { border-top:0; }
.ws-score { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px 14px; }
.ws-bar { height:6px; border-radius:3px; background:var(--hover); margin-top:8px; overflow:hidden; } .ws-bar i { display:block; height:100%; background:var(--accent); border-radius:3px; transition:width .5s; }
.ws[data-theme="cool"] .ws-bar i { background:linear-gradient(90deg,#6d83f2,#9a8cf0); }
.ws-ki { border:1px solid var(--line2); border-radius:10px; padding:9px 12px; margin-bottom:6px; background:var(--paper); }
.ws-ki.has { background:var(--card); border-color:var(--line); }
.ws-ki-dot { width:7px; height:7px; border-radius:50%; background:#d6d1c2; flex-shrink:0; } .ws-ki.has .ws-ki-dot { background:#5aa476; }
.ws-ki-v { font-size:13px; color:var(--ink2); margin-top:4px; line-height:1.6; }
.ws-ki-why { font-size:12.5px; color:var(--ink3); margin-top:3px; line-height:1.55; }
.ws-proj { display:flex; align-items:center; gap:8px; width:100%; padding:6px 10px; border-radius:8px; border:0; background:transparent; color:var(--ink2); font-size:13.5px; cursor:pointer; text-align:left; }
.ws-proj:hover { background:var(--hover); } .ws-proj.on { background:var(--hover); color:var(--ink); font-weight:600; }
.ws-proj-ico { width:20px; height:20px; border-radius:6px; background:var(--accent-soft); color:var(--accent); display:grid; place-items:center; font-size:11px; font-weight:700; flex-shrink:0; }
.ws-dot-p { display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--accent); margin-right:6px; vertical-align:middle; }
.ws-inproj { width:min(760px,92%); margin:10px auto 0; }
.ws-flow { display:flex; gap:4px; flex-wrap:wrap; }
.ws-flow-i { flex:1; min-width:64px; background:var(--card); border:1px solid var(--line2); border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; gap:2px; }
.ws-flow-i b { font-size:18px; color:var(--ink3); } .ws-flow-i span { font-size:12px; color:var(--ink3); }
.ws-flow-i.has { border-color:var(--line); } .ws-flow-i.has b { color:var(--ink); } .ws-flow-i.rej b { color:#a33a2b; }
.ws-pask { display:flex; align-items:center; gap:8px; margin-top:14px; background:#fff; border:1px solid var(--line); border-radius:14px; padding:6px 6px 6px 14px; }
.ws-pask input { flex:1; border:0; outline:0; font:inherit; font-size:14.5px; background:transparent; color:var(--ink); }
.ws-tabs2 { display:inline-flex; gap:2px; padding:3px; border-radius:10px; background:var(--hover); margin-bottom:12px; }
.ws-tabs2 button { border:0; background:transparent; padding:5px 12px; border-radius:8px; font-size:13px; color:var(--ink3); cursor:pointer; }
.ws-tabs2 button.on { background:var(--card); color:var(--ink); font-weight:600; box-shadow:0 1px 2px rgba(0,0,0,.06); }
.ws-stage { font-size:12px; padding:2px 8px; border-radius:999px; background:var(--hover); color:var(--ink2); white-space:nowrap; }
.ws-stage.s-screening, .ws-stage.s-work, .ws-stage.s-verify { background:var(--accent-soft); color:var(--accent); }
.ws-stage.s-interview, .ws-stage.s-offer { background:#fbf1e3; color:#8a5a1f; } .ws-stage.s-hired { background:#e9f3e6; color:#3d6b32; } .ws-stage.s-rejected { background:#f6e9e6; color:#a33a2b; }
.ws-stage-sel { margin-left:auto; border:1px solid var(--line); border-radius:8px; padding:4px 8px; font:inherit; font-size:13px; background:var(--paper); color:var(--ink); }
.ws-cand { display:flex; align-items:center; gap:10px; width:100%; border:1px solid var(--line); background:var(--card); border-radius:10px; padding:9px 12px; margin-bottom:6px; cursor:pointer; text-align:left; font-size:14px; color:var(--ink); }
.ws-cand:hover { border-color:#bdb6a2; }
.ws-sub { font-size:12px; font-weight:700; color:var(--ink3); margin:12px 0 4px; }
.ws-list { margin:0; padding-left:18px; font-size:13.5px; line-height:1.8; color:var(--ink2); }
.ws-pre { white-space:pre-wrap; font-family:inherit; font-size:12.5px; line-height:1.7; color:var(--ink2); margin:8px 0 2px; max-height:320px; overflow:auto; }
.ws-kind { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:22px; }
.ws-kind button { text-align:left; border:1px solid var(--line); background:var(--card); border-radius:12px; padding:10px 12px; cursor:pointer; display:flex; flex-direction:column; gap:3px; color:var(--ink); font-size:14px; }
.ws-kind button span { font-size:12px; color:var(--ink3); line-height:1.5; }
.ws-kind button.on { border-color:var(--accent); background:var(--accent-soft); }
.ws-libjob { display:flex; align-items:center; gap:10px; padding:7px 2px; border-top:1px solid var(--line2); }
@media (max-width: 900px) {
  .ws-root, .ws-root.with-art, .ws-root.no-side.with-art { grid-template-columns:0 minmax(0,1fr); } .ws-side { visibility:hidden; }
  .ws-side-wrap { display:block; position:fixed; left:0; top:0; bottom:0; width:280px; z-index:40; transform:translateX(-100%); transition:transform .22s cubic-bezier(.2,.8,.2,1); }
  .ws-side-wrap.open { transform:none; } .ws-side-wrap .ws-side { visibility:visible; height:100%; box-shadow:12px 0 40px rgba(30,26,18,.18); }
  .ws-scrim { display:block; position:fixed; inset:0; z-index:39; background:rgba(30,26,18,.25); }
  .ws-burger { display:inline-flex; position:absolute; left:10px; top:10px; z-index:5; } .ws-showside { display:none; }
  .ws-hero { padding-top:56px; } .ws-scope { display:none; } .ws-art-grip { display:none; }
  .ws-art { position:fixed; inset:0; z-index:20; } .ws-suggest, .ws-form, .ws-two { grid-template-columns:1fr !important; } .ws-hello { font-size:28px; }
}
`;
