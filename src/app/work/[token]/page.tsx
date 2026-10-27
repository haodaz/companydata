'use client';

/**
 * 真活台 · 参与者页（公开，留名字就能做）：/work/<token>
 * 左边材料包、中间按环境换操作台（文档 / 代码 / 表格 / 设计）、右边 AI 随便问。所有动作记成事件流，交卷后出报告。
 * ?s=<session id> 回到已有的一次作答（看报告）。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { WorkReport } from '@/components/work/WorkReport';
import { AuditPanel } from '@/components/work/AuditPanel';
import { DocBench } from '@/components/work/benches/DocBench';
import { CodeBench } from '@/components/work/benches/CodeBench';
import { SheetBench } from '@/components/work/benches/SheetBench';
import { DesignBench } from '@/components/work/benches/DesignBench';
import { OpenBench } from '@/components/work/benches/OpenBench';
import { CanvasBench } from '@/components/work/benches/CanvasBench';
import { BoardBench, emptyBoard, type BoardValue } from '@/components/work/benches/BoardBench';
import { Md } from '@/components/ws/Md';
import { Tour, type TourStep } from '@/components/work/Tour';
import { MODULES, boardToText, canvasToText, resolveModule, type CanvasGraph, type Module } from '@/lib/work/modules';
import { PluginWork } from '@/components/work/benches/PluginWork';

type Material = { id: string; title: string; kind: string; content: string; source: string; url?: string; mime?: string; name?: string };

// 附件里的数据表（csv / xlsx 抽出的 CSV 文字）：按表格渲染，多个 sheet 用「## 名」分段
function isSheet(m: Material) { return m.kind === 'file' && (/csv|spreadsheet|ms-excel/.test(m.mime || '') || /\.(csv|xlsx?)$/i.test(m.name || m.title || '')) && !!m.content?.trim(); }
function parseCsvLine(line: string) { const out: string[] = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; }
function SheetView({ text, dark }: { text: string; dark: boolean }) {
  const blocks = text.split(/\n(?=## )/).map(b => { const m = b.match(/^## (.*)\n?/); return { name: m ? m[1] : '', rows: b.replace(/^## .*\n?/, '').split(/\r?\n/).filter(l => l.trim()).slice(0, 200).map(parseCsvLine) }; }).filter(b => b.rows.length);
  const bd = dark ? '#2b2d3e' : '#e8e9f0';
  return <div style={{ margin: '8px 0 0' }}>{blocks.map((b, i) => <div key={i} style={{ marginBottom: 12 }}>{b.name && <div style={{ fontSize: 12, color: '#888', margin: '6px 0' }}>工作表 · {b.name}</div>}
    <div style={{ overflow: 'auto' }}><table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: '100%' }}><thead><tr>{b.rows[0].map((c, j) => <th key={j} style={{ border: `1px solid ${bd}`, padding: '6px 10px', background: dark ? '#262838' : '#f6f7fb', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600 }}>{c}</th>)}</tr></thead>
    <tbody>{b.rows.slice(1).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} style={{ border: `1px solid ${bd}`, padding: '5px 10px', whiteSpace: 'nowrap', textAlign: /^-?[\d.,%]+$/.test(c.trim()) ? 'right' : 'left', fontVariantNumeric: 'tabular-nums' }}>{c}</td>)}</tr>)}</tbody></table></div>
    {b.rows.length >= 200 && <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>只显示前 200 行，完整文件点上面的链接下载</div>}</div>)}</div>;
}
type Env = { type: 'doc' | 'code' | 'sheet' | 'design' | 'open' | 'plugin'; language?: string; starter?: string; tests?: { name: string; code: string }[]; csv?: string; params?: { name: string; unit?: string; hint?: string }[]; sketch_hint?: string };
type Stage = { id: string; type: string; question: string; reveal: string };
type Task = { id: string; company_name: string; role: string; statement: string; task: { title: string; brief: string; deliverables: { id: string; title: string; format: string; module?: string }[]; time_minutes: number; rules: string[]; env?: Env; stages?: Stage[] }; materials: Material[] };
type Ev = { t: number; type: string; [k: string]: any };

// 操作台模组按交付物挂（2026-10-25，王刚：交付物不止一个 Word，表 / 脚本 / 流程图可以混用；考试台不是在线 Word）
type Part = { id: string; title: string; format: string; module: Module };
function partsOf(task: Task, env: Env): Part[] {
  const fb = (['doc', 'sheet', 'code', 'design'].includes(env.type) ? env.type : 'doc') as Module;
  const ds = task.task.deliverables.length ? task.task.deliverables : [{ id: 'd1', title: '按题目要求作答', format: '' }];
  return ds.map(d => ({ id: d.id, title: d.title, format: d.format, module: resolveModule(d.format, d.module, fb) }));
}
// 线性小图标（16px，currentColor）：左栏 / AI / 最大化 / 分屏 / 最小化 / 关闭
function Ico({ k }: { k: 'left' | 'ai' | 'max' | 'split' | 'min' | 'close' }) {
  const P: Record<string, React.ReactNode> = {
    left: <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5H12.5A1.5 1.5 0 0 1 14 6v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12z" />,   // 文件夹：材料包
    ai: <><path d="M8 2.5c.5 2.7 2.3 4.5 5 5-2.7.5-4.5 2.3-5 5-.5-2.7-2.3-4.5-5-5 2.7-.5 4.5-2.3 5-5z" fill="currentColor" stroke="none" /><path d="M12.5 1.5c.2 1 .8 1.6 1.8 1.8-1 .2-1.6.8-1.8 1.8-.2-1-.8-1.6-1.8-1.8 1-.2 1.6-.8 1.8-1.8z" fill="currentColor" stroke="none" /></>,   // 星芒：AI 助手
    max: <><path d="M9 3h4v4" /><path d="M7 13H3V9" /><path d="M13 3L9 7" /><path d="M3 13l4-4" /></>,
    split: <><rect x="2" y="2" width="12" height="12" rx="2" /><path d="M2 8h12" /></>,
    min: <path d="M3 8h10" />,
    close: <path d="M4 4l8 8M12 4l-8 8" />,
  };
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{P[k]}</svg>;
}
const modulesLabel = (task: Task, env: Env) => [...new Set(partsOf(task, env).map(p => MODULES[p.module].label))].join(' + ');
const ENV_NAME: Record<string, string> = { doc: '文档 / 对账台', code: '代码台', sheet: '表格 / 数据台', design: '设计台', open: '用自己的软件做（录屏）', plugin: '用自己的网页工具做（真活插件）' };
const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export default function WorkPage() {
  const { token } = useParams<{ token: string }>();
  const sp = useSearchParams();
  const [task, setTask] = useState<Task | null>(null);
  const [preview, setPreview] = useState(false);   // 出任务的人预览（待发布的题，带管理密钥进来）
  const [err, setErr] = useState('');
  const [phase, setPhase] = useState<'loading' | 'intro' | 'work' | 'grading' | 'report'>('loading');
  const [sid, setSid] = useState<string>('');
  const [name, setName] = useState(''); const [contact, setContact] = useState('');
  const [mode, setMode] = useState<'bench' | 'open' | 'plugin'>('bench');
  const [report, setReport] = useState<any>(null);
  const [participant, setParticipant] = useState<any>(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => { const f = () => setNarrow(window.innerWidth < 980); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  useEffect(() => {
    (async () => {
      const j = await (await fetch(`/api/work/${token}${sp.get('k') ? `?k=${encodeURIComponent(sp.get('k')!)}` : ''}`)).json();
      if (j.ok) setPreview(!!j.preview);
      if (!j.ok) { setErr(j.error || '链接不可用'); setPhase('intro'); return; }
      setTask(j.task); if (j.task?.task?.env?.type === 'open') setMode('open'); if (j.task?.task?.env?.type === 'plugin') setMode('plugin');   // 出任务的人指定了「自己录制电脑操作」：只有开放模式
      const s = sp.get('s') || (typeof localStorage !== 'undefined' ? localStorage.getItem(`work:${token}`) : '') || '';
      if (s) {
        const r = await (await fetch(`/api/work/${token}/sessions/${s}`)).json();
        if (r.ok) { setSid(s); setParticipant(r.session.participant); if (r.session.participant?.mode === 'open' || j.task?.task?.env?.type === 'open') setMode('open'); if (r.session.participant?.mode === 'plugin') setMode('plugin'); if (r.session.report?.auditing) { setPhase('grading'); return; } if (r.session.report) { setReport(r.session.report); setPhase('report'); return; } if (!r.session.submitted_at) { setPhase('work'); return; } }
      }
      setPhase('intro');
    })();
  }, [token, sp]);

  const start = async () => {
    if (!name.trim()) return;
    const j = await (await fetch(`/api/work/${token}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, contact, mode, k: sp.get('k') || undefined }) })).json();
    if (!j.ok) { setErr(j.error); return; }
    setSid(j.session_id); setParticipant({ name, contact, mode, ...(j.code ? { code: j.code } : {}) }); try { localStorage.setItem(`work:${token}`, j.session_id); } catch {}
    setPhase('work');
  };

  if (phase === 'loading') return <Shell><div style={{ padding: 40, color: '#888' }}>加载中…</div></Shell>;
  if (!task) return <Shell><div style={{ padding: 40, color: '#c0392b' }}>{err || '链接不可用'}</div></Shell>;
  const env: Env = task.task.env || { type: 'doc' };

  if (phase === 'intro') return (
    <Shell>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700 }}>真活台 · {task.company_name} · {task.role}</div>
        <h1 style={{ fontSize: 28, margin: '8px 0 4px', lineHeight: 1.3 }}>{task.task.title}</h1>
        <div style={{ color: '#666', marginBottom: 20 }}>{task.statement}</div>
        <Box title="任务书"><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{task.task.brief}</div></Box>
        <Box title="要交什么"><ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>{task.task.deliverables.map(d => <li key={d.id}><b>{d.title}</b> <span style={{ color: '#888' }}>{d.format}</span></li>)}</ol></Box>
        <Box title="规则"><ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>{task.task.rules.map((r, i) => <li key={i}>{r}</li>)}</ul><div style={{ color: '#888', fontSize: 13, marginTop: 6 }}>操作台：{modulesLabel(task, env)}（按交付物切换） · 建议用时 {task.task.time_minutes} 分钟（不强制停表，但用时会记）· 材料 {task.materials.length} 份 · 交卷后立刻出报告</div></Box>
        {env.type === 'plugin'
          ? <Box title="怎么做"><div style={{ lineHeight: 1.8 }}><b>用你自己的工具做。</b>在线文档、表格、设计工具、各家 AI 都可以。点「开始做」后会给你一个真活码，装好「真活插件」（一次就好，<a href="/work/plugin" target="_blank" rel="noreferrer">看说明</a>）、关联这次作答，插件只在答题期间记录你打开的网页、页面上的文字和打字粘贴的量。交付说明在插件侧边栏或本页写，做完点「结束作答」；到时间会自动交卷。</div></Box>
          : env.type === 'open'
          ? <Box title="怎么做"><div style={{ lineHeight: 1.8 }}><b>用自己的软件做。</b>下载材料，用你顺手的 Excel / CAD / IDE / AI 做；浏览器录屏（不用装东西），做完上传交付文件 + 写交付说明。出任务的人指定了这种做法，过程由录屏还原。</div></Box>
          : <Box title="怎么做">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {([['bench', '在本页的操作台做', `${modulesLabel(task, env)}：每个交付物一个标签页，材料、编辑区、AI 都在页面里，每一步自动记录。省事，推荐。`], ['plugin', '用自己的网页工具做', '在线文档 / 表格 / 设计工具 / 各家 AI 都行。装一次「真活插件」，它只在答题期间记录你打开的网页和页面文字；交付说明在侧边栏写。'], ['open', '用自己的桌面软件做', '装在电脑上的 Excel / CAD / IDE：下载材料，浏览器录屏（不用装东西），做完上传交付文件 + 写交付说明。']] as const).map(([k, t, d]) => (
              <div key={k} onClick={() => setMode(k)} style={{ cursor: 'pointer', padding: '12px 14px', borderRadius: 12, border: `2px solid ${mode === k ? '#6055f5' : '#e8e9f0'}`, background: mode === k ? '#f3f2ff' : '#fff' }}><div style={{ fontWeight: 700 }}>{mode === k ? '● ' : '○ '}{t}</div><div style={{ fontSize: 13, color: '#666', lineHeight: 1.6, marginTop: 4 }}>{d}</div></div>
            ))}
          </div>
        </Box>}
        <Box title="留个名字就开始">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="姓名 / 昵称" style={inp} />
            <input value={contact} onChange={e => setContact(e.target.value)} placeholder="联系方式（选填，报告发你）" style={{ ...inp, flex: 1, minWidth: 220 }} />
            <button onClick={start} disabled={!name.trim()} style={btnPrimary}>开始做 →</button>
          </div>
          {err && <div style={{ color: '#c0392b', marginTop: 8 }}>{err}</div>}
        </Box>
      </div>
    </Shell>
  );

  if (phase === 'report') return (
    <Shell>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '28px 20px' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700 }}>真活台 · 报告</div>
        <h1 style={{ fontSize: 24, margin: '6px 0 16px' }}>{task.task.title} <span style={{ fontSize: 14, color: '#888', fontWeight: 400 }}>{task.company_name} · {task.role}</span></h1>
        <WorkReport report={report} participant={participant} />
        <div style={{ marginTop: 16, fontSize: 13, color: '#888' }}>这页的链接：<code>{typeof location !== 'undefined' ? `${location.origin}/work/${token}?s=${sid}` : ''}</code></div>
      </div>
    </Shell>
  );

  // 交卷后：「AI 审计中」一段一段推进（笔记追加着出现），done 了换成正式报告
  if (phase === 'grading' && sid) return (
    <Shell>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '28px 20px' }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700 }}>真活台 · 交卷了</div>
        <h1 style={{ fontSize: 24, margin: '6px 0 4px' }}>{task.task.title}</h1>
        <div style={{ color: '#666', marginBottom: 18, fontSize: 13.5 }}>AI 正在回看你的操作过程，一段一段记；看完再逐条核对交付物、和 AI 基线比。别关页面（关了也没事，回来接着看）。</div>
        <AuditPanel token={token} sid={sid} onDone={rep => { setReport(rep); setPhase('report'); }} />
      </div>
    </Shell>
  );

  if (mode === 'plugin' && participant?.code) return <Shell><PluginWork code={participant.code} task={task as any} onSubmitted={() => setPhase('grading')} /></Shell>;

  return <Workspace token={token} sid={sid} task={task} env={env} mode={mode as 'bench' | 'open'} narrow={narrow} grading={phase === 'grading'} error={err} onSubmit={async (deliverable, events) => {
    setPhase('grading');
    const j = await (await fetch(`/api/work/${token}/sessions/${sid}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliverable, events }) })).json();
    if (!j.ok) { setErr(j.error || '交卷失败，再试一次'); setPhase('work'); return; }
    if (j.staged) return;   // 进「AI 审计中」，由 AuditPanel 推进
    setReport(j.report); setPhase('report');
  }} />;
}

function Workspace({ token, sid, task, env, mode, narrow, grading, error, onSubmit }: { token: string; sid: string; task: Task; env: Env; mode: 'bench' | 'open'; narrow: boolean; grading: boolean; error?: string; onSubmit: (deliverable: string, events: Ev[]) => Promise<void> }) {
  const t0 = useRef(Date.now());
  const [now, setNow] = useState(0);
  const buf = useRef<Ev[]>([]);
  const lastAct = useRef(Date.now());
  const idleMarked = useRef(false);
  const now_s = () => Math.round((Date.now() - t0.current) / 1000);
  const ev = useCallback((type: string, extra: Record<string, any> = {}) => { buf.current.push({ t: now_s(), type, ...extra }); lastAct.current = Date.now(); idleMarked.current = false; }, []);

  // 每个交付物一个模组、一份工作内容（文档 / 表格 / 代码 / 参数草图 / 画布），标签页切换
  const parts = useMemo(() => partsOf(task, env), [task, env]);
  type PartState = { doc: string; code: string; csv: string; notes: string; params: Record<string, string>; sketch: { pts: [number, number][]; label: string }[]; graph: CanvasGraph; board: BoardValue };
  const blank = (): PartState => ({ doc: '', code: '', csv: '', notes: '', params: {}, sketch: [], graph: { nodes: [], edges: [], lanes: [] }, board: emptyBoard() });
  // 要求印在试卷里（文档开头印标题 + 形态，代码开头一行注释），不堆在顶栏；seed 用来判断有没有真动笔
  const seedOf = (p: Part) => p.module === 'doc' ? `# ${p.title}\n${p.format ? `（${p.format}）\n` : ''}\n` : p.module === 'code' ? `// ${p.title}${p.format ? `（${p.format}）` : ''}\n` : '';
  const [ps, setPs] = useState<Record<string, PartState>>(() => { const o: Record<string, PartState> = {}; let seededCode = false, seededCsv = false; for (const p of parts) { const st = blank(); const seed = seedOf(p); if (p.module === 'doc') st.doc = seed; if (p.module === 'code' && !seededCode) { st.code = seed + (env.starter || ''); seededCode = true; } else if (p.module === 'code') st.code = seed; if (p.module === 'sheet' && !seededCsv) { st.csv = env.csv || ''; seededCsv = true; } o[p.id] = st; } return o; });
  const [opened, setOpened] = useState<Set<string>>(() => new Set(parts[0] ? [parts[0].id] : []));
  const [nudge, setNudge] = useState<string | null>(null); const nudged = useRef(false);
  const [cur, setCur] = useState(parts[0]?.id || 'd1');
  const curPart = parts.find(p => p.id === cur) || parts[0];
  const st = ps[cur] || blank();
  const setPart = (patch: Partial<PartState> | ((x: PartState) => Partial<PartState>)) => setPs(all => { const x = all[cur] || blank(); return { ...all, [cur]: { ...x, ...(typeof patch === 'function' ? patch(x) : patch) } }; });
  const setDoc = (v: string) => setPart({ doc: v }); const setCode = (v: string) => setPart({ code: v }); const setCsv = (v: string) => setPart({ csv: v }); const setNotes = (v: string | ((n: string) => string)) => setPart(x => ({ notes: typeof v === 'function' ? v(x.notes) : v }));
  const [testOut, setTestOut] = useState<string>('');
  const [summary, setSummary] = useState(''); const [uploads, setUploads] = useState<{ name: string; size: number; url: string }[]>([]); const [recording, setRecording] = useState<{ url: string; duration: number } | null>(null);
  const lastLen = useRef(0);

  // 交付内容（文本，评卷读）。白板交卷时另存一张 PNG，shots[id] = 图的地址
  const build = useCallback((shots: Record<string, string>) => {
    if (mode === 'open') return summary;
    const body = (p: Part, x: PartState) => {
      if (p.module === 'board') return `${shots[p.id] ? `![${p.title}](${shots[p.id]})\n\n` : ''}${boardToText(x.board.elements)}\n\n### 设计说明\n${x.notes}`;
      if (p.module === 'code') return `\`\`\`${env.language || 'js'}\n${x.code}\n\`\`\`\n\n### 说明\n${x.notes}`;
      if (p.module === 'sheet') return `\`\`\`csv\n${x.csv}\n\`\`\`\n\n### 口径说明\n${x.notes}`;
      if (p.module === 'design') return `### 参数表\n| 参数 | 值 | 单位 |\n|---|---|---|\n${(env.params || []).map(q => `| ${q.name} | ${x.params[q.name] || ''} | ${q.unit || ''} |`).join('\n')}\n\n### 草图（${x.sketch.length} 条线）\n${x.sketch.map((l, i) => `- 线 ${i + 1}「${l.label || '未标注'}」：${l.pts.map(q => `(${Math.round(q[0])},${Math.round(q[1])})`).join(' ')}`).join('\n')}\n\n### 说明\n${x.notes}`;
      if (p.module === 'canvas') return `${canvasToText(x.graph)}\n\n### 图的说明\n${x.notes}`;
      return x.doc;
    };
    if (parts.length === 1) return body(parts[0], ps[parts[0].id] || blank());
    return parts.map(p => `## ${p.id} ${p.title}（${p.format}）\n\n${body(p, ps[p.id] || blank())}`).join('\n\n');
  }, [env, mode, summary, parts, ps]);
  const deliverable = useMemo(() => build({}), [build]);

  // 时钟 + 改稿事件（每 20 秒把字数变化记一次）+ 空闲 + 同步
  useEffect(() => {
    const iv = setInterval(() => {
      setNow(now_s());
      const d = deliverable.length - lastLen.current;
      if (d !== 0 && now_s() % 20 === 0) { buf.current.push({ t: now_s(), type: 'edit', delta: d }); lastLen.current = deliverable.length; }
      if (Date.now() - lastAct.current > 120_000 && !idleMarked.current) { buf.current.push({ t: now_s(), type: 'idle' }); idleMarked.current = true; }
    }, 1000);
    return () => clearInterval(iv);
  }, [deliverable]);
  const delivRef = useRef(deliverable); delivRef.current = deliverable;
  useEffect(() => {
    const sync = async () => {
      const events = buf.current.splice(0);
      try { await fetch(`/api/work/${token}/sessions/${sid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events, deliverable: delivRef.current }) }); } catch { buf.current.unshift(...events); }
    };
    const iv = setInterval(sync, 30_000);
    // 关页 / 切到别的标签：把剩下的事件用 sendBeacon 补发（fetch 在卸载时会被掐）
    const flush = () => { if (document.visibilityState === 'visible') return; const events = buf.current.splice(0); if (!events.length && !delivRef.current) return; navigator.sendBeacon(`/api/work/${token}/sessions/${sid}`, new Blob([JSON.stringify({ events: [...events, { t: Math.round((Date.now() - t0.current) / 1000), type: 'leave' }], deliverable: delivRef.current })], { type: 'application/json' })); };
    document.addEventListener('visibilitychange', flush); window.addEventListener('pagehide', flush);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', flush); };
  }, [token, sid]);

  // 材料
  const [mat, setMat] = useState<Material | null>(() => task.materials?.[0] || null);   // 默认打开第一份材料：进来就是材料 + 作答分屏
  const openMat = (m: Material) => { setMat(m); ev('open_material', { id: m.id }); };
  // 案例推进式（深度样本出的题）：一步一步给信息，看完当步再答、答完再开下一步；每一步的揭示都记进过程
  const stages = task?.task?.stages || [];
  const [unlocked, setUnlocked] = useState(1);
  const STAGE_CN: Record<string, string> = { structuring: '搭框架', judgement: '判断与洞察', numeracy: '测算', creativity: '出主意', synthesis: '综合建议', other: '' };
  const openStage = (st: Stage, i: number) => { if (i >= unlocked) { setUnlocked(i + 1); ev('stage_unlock', { id: st.id }); } setMat({ id: st.id, title: `${st.id} · ${st.question}`, kind: 'stage', content: st.reveal || '（这一步没有新信息，直接作答）', source: 'stage' }); ev('open_stage', { id: st.id }); };

  // AI
  const [chat, setChat] = useState<{ q: string; a: string }[]>([]);
  const [q, setQ] = useState(''); const [asking, setAsking] = useState(false);
  const ask = async () => {
    const text = q.trim(); if (!text || asking) return;
    setAsking(true); setQ(''); ev('ai_ask', { chars: text.length });
    try {
      const j = await (await fetch(`/api/work/${token}/sessions/${sid}/ai`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text, material: mat ? `${mat.title}\n${mat.content}` : '' }) })).json();
      setChat(c => [...c, { q: text, a: j.ok ? j.a : `（出错：${j.error}）` }]);
    } finally { setAsking(false); }
  };
  const adopt = (a: string) => { ev('adopt', { chars: a.length }); if (curPart.module === 'doc') setPart(x => ({ doc: x.doc + (x.doc ? '\n\n' : '') + a })); else setNotes(n => n + (n ? '\n\n' : '') + a); };
  const onPaste = (e: React.ClipboardEvent) => { const n = e.clipboardData.getData('text').length; if (n > 20) ev('paste', { chars: n }); };

  // 代码自测（只跑 js，在 Worker 里，3 秒超时）
  const runTests = () => {
    if (!env.tests?.length) return;
    const src = st.code.replace(/export\s+(default\s+)?/g, '');
    const worker = new Worker(URL.createObjectURL(new Blob([`
      self.onmessage = (e) => { const { src, tests } = e.data; let solution; const out = [];
        try {
          const names = [...new Set(['solution', ...[...src.matchAll(/function\\s+([A-Za-z_$][\\w$]*)/g)].map(m => m[1]), ...[...src.matchAll(/(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:async\\s*)?(?:\\(|[A-Za-z_$][\\w$]*\\s*=>)/g)].map(m => m[1])])];
          const mod = new Function('module', 'exports', src + '\\n;return [' + names.map(n => 'typeof ' + n + '!=="undefined"?' + n + ':undefined').join(',') + '];');
          const module = { exports: {} }; const found = mod(module, module.exports);
          solution = found.find(f => typeof f === 'function') || (typeof module.exports === 'function' ? module.exports : Object.values(module.exports).find(f => typeof f === 'function'));
          if (typeof solution !== 'function') { self.postMessage({ error: '没找到可调用的函数：请定义 function solution(...) 或在代码里定义一个函数' }); return; }
        } catch (err) { self.postMessage({ error: String(err) }); return; }
        for (const t of tests) { try { out.push({ name: t.name, ok: !!(new Function('solution', t.code))(solution) }); } catch (err) { out.push({ name: t.name, ok: false, err: String(err) }); } }
        self.postMessage({ out }); };`], { type: 'text/javascript' })));
    const timer = setTimeout(() => { worker.terminate(); setTestOut('超时（3 秒）：可能死循环'); ev('run_tests', { note: 'timeout' }); }, 3000);
    worker.onmessage = (e) => { clearTimeout(timer); worker.terminate(); if (e.data.error) { setTestOut(`代码报错：${e.data.error}`); ev('run_tests', { note: 'error' }); return; } const out = e.data.out as { name: string; ok: boolean; err?: string }[]; const pass = out.filter(x => x.ok).length; setTestOut(out.map(x => `${x.ok ? '✓' : '✗'} ${x.name}${x.err ? '  ' + x.err : ''}`).join('\n') + `\n通过 ${pass}/${out.length}`); ev('run_tests', { note: `${pass}/${out.length}` }); };
    worker.postMessage({ src, tests: env.tests });
  };


  const [arm, setArm] = useState(false);
  const dark = false;   // 代码台也用浅色（2026-10-25）：整页一个色调，别忽然深一块
  const [localErr, setLocalErr] = useState('');
  // 布局（2026-10-25，王刚：作答区别太固定，要像 AI workspace）：材料栏可收、材料面板高度可拖 / 占满 / 收成一条 / 关闭、AI 助手是可收的卡片
  const [leftOpen, setLeftOpen] = useState(!narrow);
  // 第一次进来的引导（看过一次就不弹；顶栏「?」可重看）
  const [tour, setTour] = useState<number | null>(null);
  useEffect(() => { let seen = false; try { seen = localStorage.getItem('work-tour-done') === '1'; } catch {} if (!seen && !narrow) { const t = setTimeout(() => setTour(0), 600); return () => clearTimeout(t); } }, [narrow]);
  const [aiOpen, setAiOpen] = useState(!narrow);
  const [matMode, setMatMode] = useState<'split' | 'full' | 'bar'>('split');
  // 白板要地方画：第一次切到白板交付物时，材料面板收成一条（点一下还能展开）
  const boardSeen = useRef<Set<string>>(new Set());
  useEffect(() => { if (curPart?.module === 'board' && !boardSeen.current.has(cur)) { boardSeen.current.add(cur); setMatMode(m => (m === 'split' ? 'bar' : m)); } }, [cur, curPart?.module]);
  const [matH, setMatH] = useState(300);
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  useEffect(() => {
    const mv = (e: MouseEvent) => { if (!dragRef.current) return; setMatH(Math.max(120, Math.min(window.innerHeight - 260, dragRef.current.h + (e.clientY - dragRef.current.y)))); };
    const up = () => { if (dragRef.current) { dragRef.current = null; document.body.style.cursor = ''; document.body.style.userSelect = ''; } };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, []);
  const showMat = (m: Material) => { openMat(m); if (matMode === 'bar') setMatMode('split'); };
  const filledOf = (id: string) => { const x = ps[id]; const p = parts.find(q => q.id === id); if (!x || !p) return false; const seed = seedOf(p).trim(); const docReal = x.doc.trim() && x.doc.trim() !== seed; const codeReal = x.code.trim() && x.code.trim() !== seed && x.code.trim() !== (seed + (env.starter || '')).trim(); return !!(docReal || x.csv.trim() || codeReal || x.notes.trim() || x.graph.nodes.length || Object.keys(x.params).length || x.board.elements.some((e: any) => !e.isDeleted)); };
  // 20 分钟还没打开的交付物：弹一次气泡（别等到交卷才说）
  useEffect(() => { if (nudged.current || mode === 'open') return; if (now >= 1200) { const miss = parts.filter(p => !opened.has(p.id)); if (miss.length) { nudged.current = true; setNudge(`${miss.map(p => `${p.id} ${MODULES[p.module].label}`).join('、')} 还没打开过，别漏了`); ev('nudge', { parts: miss.map(p => p.id) }); } } }, [now, parts, opened, mode, ev]);
  const switchPart = (id: string) => { setCur(id); setOpened(o => new Set(o).add(id)); ev('switch_part', { id }); };
  const tabsEl = mode === 'open' ? null : <div data-tour="tabs" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{parts.map(p => { const on = p.id === cur; const filled = filledOf(p.id); return <button key={p.id} onClick={() => switchPart(p.id)} title={`${p.title}${p.format ? `（${p.format}）` : ''}`} style={{ border: 0, background: on ? '#6055f5' : 'transparent', color: on ? '#fff' : dark ? '#b8bdd6' : '#555', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', font: 'inherit', fontSize: 12.5, fontWeight: on ? 700 : 500, display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>{p.id} {MODULES[p.module].label}<span style={{ width: 6, height: 6, borderRadius: 99, background: filled ? '#22c55e' : on ? 'rgba(255,255,255,.45)' : '#d9dbe6' }} /></button>; })}</div>;
  const emptyParts = mode === 'open' ? [] : parts.filter(p => !filledOf(p.id));
  const line = dark ? '#2b2d3e' : '#e8e9f0', panel = dark ? '#1e1f2b' : '#fff', ink2 = dark ? '#aab' : '#777';
  const viewBtn = (on: boolean): React.CSSProperties => ({ width: 30, height: 26, border: 0, background: on ? (dark ? '#2b2a4a' : '#e9e7ff') : 'transparent', color: on ? '#4c43c9' : ink2, borderRadius: 6, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 });
  const iconBtn = (on: boolean): React.CSSProperties => ({ width: 26, height: 24, border: 0, background: on ? (dark ? '#2b2a4a' : '#e9e7ff') : 'transparent', color: on ? '#4c43c9' : ink2, borderRadius: 6, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 });
  const miniBtn: React.CSSProperties = { border: `1px solid ${line}`, background: 'transparent', color: ink2, borderRadius: 6, padding: '2px 8px', cursor: 'pointer', font: 'inherit', fontSize: 12 };
  const submit = () => {
    if (mode === 'open' && !recording) { setLocalErr('先录一段屏再交卷：点「开始录屏」，做完点停止'); setTimeout(() => setLocalErr(''), 5000); return; }
    if (!arm) { setArm(true); if (emptyParts.length) { setLocalErr(`${emptyParts.map(p => `${p.id} ${p.title}`).join('、')} 还没动笔。确定要交就再点一次交卷`); setTimeout(() => setLocalErr(''), 6000); } setTimeout(() => setArm(false), 6000); return; }
    setArm(false); const events = buf.current.splice(0);
    // 白板：交卷前把每张画板导出 PNG 存起来（给出任务的人看），文字版照样进交付内容
    const boards = parts.filter(p => p.module === 'board' && (ps[p.id]?.board.elements || []).some((e: any) => !e.isDeleted));
    if (!boards.length) { onSubmit(deliverable, events); return; }
    (async () => {
      const shots: Record<string, string> = {};
      try {
        const { exportToBlob } = await import('@excalidraw/excalidraw');
        for (const p of boards) {
          const b = ps[p.id].board;
          const blob = await exportToBlob({ elements: b.elements.filter((e: any) => !e.isDeleted), files: b.files, mimeType: 'image/png', appState: { exportBackground: true, viewBackgroundColor: '#ffffff' }, exportPadding: 24 } as any);
          const fd = new FormData(); fd.append('file', new File([blob], `${p.id}-board.png`, { type: 'image/png' })); fd.append('kind', 'file');
          const j = await (await fetch(`/api/work/${token}/sessions/${sid}/upload`, { method: 'POST', body: fd })).json();
          if (j.ok) shots[p.id] = j.url;
        }
      } catch (e) { console.warn('[work] 白板截图失败，只交文字版', e); }
      onSubmit(build(shots), events);
    })();
  };
  const over = now > task.task.time_minutes * 60;

  const matBody = mat && <>
    {mat.kind === 'file' && mat.url && (/^image\//.test(mat.mime || '') ? <a href={mat.url} target="_blank" rel="noreferrer"><img src={mat.url} alt={mat.name || mat.title} style={{ maxWidth: '100%', display: 'block', margin: '8px 0', borderRadius: 8, border: `1px solid ${line}` }} /></a> : <a href={mat.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', margin: '8px 0 0', color: '#6055f5', fontWeight: 600 }}>打开 / 下载附件：{mat.name || mat.title} ↗</a>)}
    {isSheet(mat) ? <SheetView text={mat.content} dark={dark} /> : mat.kind === 'stage' || /^(data)$/.test(mat.kind) && !/\|/.test(mat.content) ? <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.75, margin: '8px 0 0', color: dark ? '#cfd3e6' : '#333' }}>{mat.content}</pre> : <div className="wk-md wk-mat" style={{ fontSize: 13.5, lineHeight: 1.75, color: dark ? '#cfd3e6' : '#333', marginTop: 6 }}><Md text={mat.content} /></div>}
  </>;

  return (
    <Shell dark={dark}>
      <style>{`.wk-md p{margin:0 0 8px}.wk-md ul,.wk-md ol{margin:0 0 8px;padding-left:20px}.wk-md li{margin:2px 0}.wk-md .ws-h{font-weight:700;margin:10px 0 4px}.wk-md a{color:#6055f5}.wk-md .ws-code{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;background:rgba(96,85,245,.08);padding:1px 5px;border-radius:4px}.wk-md>:last-child{margin-bottom:0}.wk-md .ws-tw{overflow:auto;margin:6px 0 10px}.wk-md .ws-table{border-collapse:collapse;font-size:12.5px;min-width:60%}.wk-md .ws-table th,.wk-md .ws-table td{border:1px solid rgba(120,120,160,.25);padding:5px 9px;text-align:left;vertical-align:top}.wk-md .ws-table th{background:rgba(96,85,245,.06);font-weight:600;white-space:nowrap}.wk-md .ws-quote{margin:6px 0 10px;padding:6px 12px;border-left:3px solid #c9c9dc;color:#666;background:rgba(120,120,160,.05);border-radius:0 8px 8px 0}.wk-md .ws-pre{white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;background:rgba(120,120,160,.08);padding:10px 12px;border-radius:8px;margin:6px 0 10px}.wk-mat .ws-h{font-size:14px;margin:12px 0 4px}.wk-ta:focus{outline:none;border-color:#6055f5!important;box-shadow:0 0 0 3px rgba(96,85,245,.12)}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', borderBottom: `1px solid ${line}`, background: dark ? '#16171f' : '#fff', color: dark ? '#e6e8f0' : undefined, position: 'sticky', top: 0, zIndex: 5, height: 52, boxSizing: 'border-box' }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: '#6055f5', fontWeight: 700 }}>真活台</div>
        <div style={{ fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>{task.task.title} <span style={{ color: '#888', fontWeight: 400, fontSize: 12.5 }}>{task.company_name} · {task.role} · {mode === 'open' ? '用自己的软件做' : modulesLabel(task, env)}</span></div>
        {!narrow && <div data-tour="views" style={{ display: 'flex', gap: 2, padding: 2, border: `1px solid ${line}`, borderRadius: 8 }}>
          <button onClick={() => setLeftOpen(v => !v)} style={viewBtn(leftOpen)} title={leftOpen ? '收起材料栏' : '展开材料栏'}><Ico k="left" /></button>
          <button onClick={() => setAiOpen(v => !v)} style={viewBtn(aiOpen)} title={aiOpen ? '收起 AI 助手' : '展开 AI 助手'}><Ico k="ai" /></button>
        </div>}
        <button onClick={() => setTour(0)} title="界面说明" style={{ ...viewBtn(false), border: `1px solid ${line}`, fontWeight: 700, fontSize: 13 }}>?</button>
        <div data-tour="clock" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 700, fontSize: 13.5, color: over ? '#ff8a80' : dark ? '#e6e8f0' : '#1a1a2e' }}>{fmt(now)}<span style={{ color: '#aaa', fontWeight: 400 }}> / {task.task.time_minutes}:00</span></div>
        <button onClick={submit} disabled={grading} style={{ ...btnPrimary, padding: '7px 16px', fontSize: 13.5, ...(arm ? { background: '#c0392b' } : {}) }}>{grading ? '评卷中…' : arm ? '再点一次确认交卷' : '交卷 →'}</button>
        </div>
      </div>
      {tour != null && <Tour step={tour} steps={TOUR_STEPS.filter(t => mode !== 'open' || t.key !== 'tabs')} onStep={setTour} onDone={() => { setTour(null); try { localStorage.setItem('work-tour-done', '1'); } catch {} }} />}
      {grading && <div style={{ padding: '12px 18px', background: '#f3f2ff', color: '#4c43c9', fontSize: 13.5 }}>交卷了。正在逐条核对交付物、回看过程、和 AI 基线比——大约 1–2 分钟，别关页面。</div>}
      {(error || localErr) && !grading && <div style={{ padding: '10px 18px', background: '#fff1f0', color: '#c0392b', fontSize: 13.5 }}>{error || localErr}</div>}
      <div style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', height: narrow ? undefined : 'calc(100vh - 52px)', minHeight: narrow ? 'calc(100vh - 52px)' : undefined }}>
        {/* 材料包 · 要交什么（可收） */}
        {(narrow || leftOpen) && <aside data-tour="materials" style={{ width: narrow ? undefined : 272, flex: 'none', borderRight: narrow ? undefined : `1px solid ${line}`, background: dark ? '#16171f' : '#fafbff', color: dark ? '#d6d8e6' : undefined, padding: 14, overflow: 'auto', maxHeight: narrow ? 300 : undefined }}>
          {stages.length > 0 && <div style={{ marginBottom: 14 }}>
            <div style={{ ...capStyle, color: dark ? '#8b8fa8' : capStyle.color }}>推进 · {stages.length} 步</div>
            {stages.map((st2, i) => { const locked = i >= unlocked; const on = mat?.id === st2.id; return (
              <div key={st2.id} onClick={() => { if (!locked || i === unlocked) { openStage(st2, i); if (matMode === 'bar') setMatMode('split'); } }} style={{ padding: '9px 12px', borderRadius: 10, marginBottom: 6, cursor: locked && i !== unlocked ? 'not-allowed' : 'pointer', opacity: locked && i !== unlocked ? .45 : 1, background: on ? panel : 'transparent', border: `1px solid ${on ? '#6055f5' : line}` }}>
                <div style={{ fontSize: 11, color: '#999', letterSpacing: 1 }}>{st2.id.toUpperCase()}{STAGE_CN[st2.type] ? ` · ${STAGE_CN[st2.type]}` : ''}{locked ? (i === unlocked ? ' · 点开下一步' : ' · 先答上一步') : ''}</div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.5, marginTop: 2 }}>{locked && i !== unlocked ? '…' : st2.question}</div>
              </div>); })}
          </div>}
          <div style={{ ...capStyle, color: dark ? '#8b8fa8' : capStyle.color }}>材料包 · {task.materials.length} 份</div>
          {task.materials.map(m => <div key={m.id} onClick={() => showMat(m)} style={{ padding: '9px 12px', borderRadius: 10, marginBottom: 6, cursor: 'pointer', background: mat?.id === m.id ? panel : 'transparent', border: `1px solid ${mat?.id === m.id ? '#6055f5' : line}` }}><div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.4 }}>{m.title}</div><div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{m.id} · {m.kind === 'file' ? (/^image\//.test(m.mime || '') ? '附图' : '附件') : m.kind}</div></div>)}
          <div style={{ ...capStyle, marginTop: 16, color: dark ? '#8b8fa8' : capStyle.color }}>要交什么</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>{task.task.deliverables.map(d => <li key={d.id}>{d.title} <span style={{ color: '#999' }}>{d.format}</span></li>)}</ol>
          <details style={{ marginTop: 12, fontSize: 13 }}><summary style={{ cursor: 'pointer', color: dark ? '#8f87ff' : '#6055f5' }}>任务书</summary><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: dark ? '#b8bdd6' : '#444', marginTop: 6 }}>{task.task.brief}</div></details>
        </aside>}
        {/* 作答区：交付物标签常驻 → 材料面板（可拖高 / 占满 / 一条 / 关）→ 操作台 */}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', background: dark ? '#14151e' : undefined, minHeight: 0 }}>
          {nudge && <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: '#fff7e6', border: '1px solid #ffd591', color: '#8a5a00', fontSize: 13 }}><span>⏱ 20 分钟了：{nudge}</span><button onClick={() => setNudge(null)} style={{ marginLeft: 'auto', ...miniBtn, color: '#8a5a00', borderColor: '#ffd591' }}>知道了</button></div>}
          {mat && <div style={{ background: panel, color: dark ? '#d6d8e6' : undefined, border: `1px solid ${line}`, borderRadius: 12, display: 'flex', flexDirection: 'column', flex: matMode === 'full' ? 1 : 'none', height: matMode === 'split' ? matH : undefined, minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: matMode === 'bar' ? 0 : `1px solid ${line}` }}>
              <b style={{ fontSize: 13.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mat.title}</b>
              <button onClick={() => setMatMode('full')} style={iconBtn(matMode === 'full')} title="最大化：材料占满，作答区收成一条"><Ico k="max" /></button>
              <button onClick={() => setMatMode('split')} style={iconBtn(matMode === 'split')} title="分屏：上下分，中间可拖"><Ico k="split" /></button>
              <button onClick={() => setMatMode('bar')} style={iconBtn(matMode === 'bar')} title="最小化：只留标题一条"><Ico k="min" /></button>
              <button onClick={() => setMat(null)} style={iconBtn(false)} title="关闭"><Ico k="close" /></button>
            </div>
            {matMode !== 'bar' && <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 14px 14px' }}>{matBody}</div>}
          </div>}
          {mat && matMode === 'split' && <div onMouseDown={e => { dragRef.current = { y: e.clientY, h: matH }; document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none'; }} style={{ height: 10, margin: '-6px 0', cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="拖动调整材料 / 作答高度"><div style={{ width: 48, height: 4, borderRadius: 4, background: dark ? '#3a3d52' : '#d9dbe6' }} /></div>}
          {mat && matMode === 'full'
            ? <div onClick={() => setMatMode('split')} style={{ flex: 'none', border: `1px solid ${line}`, background: panel, borderRadius: 12, padding: '9px 14px', fontSize: 13, color: ink2, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}><span>作答区 · {mode === 'open' ? '用自己的软件做' : `${curPart.id} ${MODULES[curPart.module].label}`}</span><span style={{ color: '#6055f5' }}>展开 ▴</span></div>
            : <div style={{ flex: 1, minHeight: mode === 'open' ? 420 : 320, display: 'flex', flexDirection: 'column' }}>
            {mode === 'open' && <OpenBench token={token} sid={sid} materials={task.materials} deliverables={task.task.deliverables} summary={summary} onSummary={setSummary} onEvent={(type, extra) => ev(type, extra)} uploads={uploads} onUploads={setUploads} recording={recording} onRecording={setRecording} t0={t0.current} />}
            {mode !== 'open' && curPart.module === 'doc' && <DocBench key={cur} leading={tabsEl} value={st.doc} onChange={setDoc} onPaste={onPaste} deliverables={stages.length && parts.findIndex(p => p.module === 'doc') === parts.findIndex(p => p.id === cur) ? stages.map(s2 => ({ id: s2.id, title: `${s2.id} ${s2.question}`, format: '' })) : []} title={task.task.title} />}
            {mode !== 'open' && curPart.module === 'code' && <CodeBench key={cur} leading={tabsEl} code={st.code} onCode={setCode} notes={st.notes} onNotes={setNotes} tests={env.tests || []} language={env.language || 'js'} onRun={runTests} testOut={testOut} onPaste={onPaste} />}
            {mode !== 'open' && curPart.module === 'sheet' && <SheetBench key={cur} leading={tabsEl} caption={`${curPart.title}${curPart.format ? `（${curPart.format}）` : ''}`} csv={st.csv} onCsv={setCsv} notes={st.notes} onNotes={setNotes} onPaste={onPaste} />}
            {mode !== 'open' && curPart.module === 'canvas' && <CanvasBench key={cur} leading={tabsEl} graph={st.graph} onChange={f => setPart(x => ({ graph: f(x.graph) }))} notes={st.notes} onNotes={setNotes} onPaste={onPaste} onEvent={(t2, extra) => ev(t2, extra)} hint={`${curPart.title}${curPart.format ? `（${curPart.format}）` : ''}`} />}
            {mode !== 'open' && curPart.module === 'board' && <BoardBench key={cur} leading={tabsEl} caption={`${curPart.title}${curPart.format ? `（${curPart.format}）` : ''}`} value={st.board} onChange={v => setPart({ board: v })} notes={st.notes} onNotes={setNotes} onEvent={(t, d) => ev(t, d || {})} />}
            {mode !== 'open' && curPart.module === 'design' && <DesignBench key={cur} leading={tabsEl} params={env.params || []} values={st.params} onParam={(k, v) => setPart(x => ({ params: { ...x.params, [k]: v } }))} onParamDone={k => ev('set_param', { id: k })} sketch={st.sketch} setSketch={f => setPart(x => ({ sketch: f(x.sketch) }))} hint={env.sketch_hint} notes={st.notes} onNotes={setNotes} onPaste={onPaste} onSketch={label => ev('sketch', { label })} />}
          </div>}
        </main>
        {/* AI 助手：卡片（可收） */}
        {(narrow || aiOpen) && <aside data-tour="ai" style={{ width: narrow ? undefined : 352, flex: 'none', padding: narrow ? '0 12px 12px' : '10px 12px 10px 0', display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: narrow ? 520 : undefined }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: panel, color: dark ? '#d6d8e6' : undefined, border: `1px solid ${line}`, borderRadius: 16, boxShadow: dark ? 'none' : '0 6px 24px rgba(30,30,60,.06)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${line}` }}>
              <span style={{ width: 22, height: 22, borderRadius: 7, background: 'linear-gradient(135deg,#6055f5,#12b5cb)', color: '#fff', fontSize: 12, display: 'grid', placeItems: 'center' }}>✦</span>
              <b style={{ fontSize: 13.5, flex: 1 }}>AI 助手</b>
              <span style={{ fontSize: 11.5, color: ink2 }}>看得到你打开的材料</span>
              {!narrow && <button onClick={() => setAiOpen(false)} style={miniBtn} title="收起">✕</button>}
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!chat.length && <div style={{ fontSize: 12.5, color: ink2, lineHeight: 1.7, padding: '4px 2px' }}>随便问，不算作弊。评的是你怎么用、哪些判断是你自己定的。可以让它核算、起草、挑毛病，但结论要你自己写。</div>}
              {chat.map((c, i) => <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ alignSelf: 'flex-end', maxWidth: '88%', background: '#6055f5', color: '#fff', padding: '8px 12px', borderRadius: '14px 14px 4px 14px', fontSize: 13.5, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{c.q}</div>
                <div style={{ alignSelf: 'flex-start', maxWidth: '94%', background: dark ? '#262838' : '#f7f7fb', padding: '10px 12px', borderRadius: '4px 14px 14px 14px', fontSize: 13.5, lineHeight: 1.65 }} className="wk-md"><Md text={c.a} /><div style={{ marginTop: 8 }}><button onClick={() => adopt(c.a)} style={{ ...miniBtn, color: '#6055f5', borderColor: 'rgba(96,85,245,.4)' }}>放进当前交付物</button></div></div>
              </div>)}
              {asking && <div style={{ color: ink2, fontSize: 13 }}>AI 在想…</div>}
            </div>
            <div style={{ padding: 10, borderTop: `1px solid ${line}` }}>
              <div style={{ border: `1px solid ${line}`, borderRadius: 14, background: dark ? '#1a1b26' : '#fff', padding: '8px 8px 8px 12px', display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <textarea className="wk-ta" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} placeholder="问 AI… Enter 发送，Shift+Enter 换行" rows={2} style={{ flex: 1, border: 0, outline: 'none', resize: 'none', font: 'inherit', fontSize: 13.5, lineHeight: 1.5, background: 'transparent', color: 'inherit', minHeight: 40, maxHeight: 140 }} />
                <button onClick={ask} disabled={asking || !q.trim()} style={{ width: 32, height: 32, borderRadius: 10, border: 0, background: q.trim() && !asking ? 'linear-gradient(135deg,#6055f5,#12b5cb)' : (dark ? '#2b2d3e' : '#e8e9f0'), color: '#fff', cursor: q.trim() ? 'pointer' : 'default', fontSize: 15, flex: 'none' }} title="发送">↑</button>
              </div>
            </div>
          </div>
        </aside>}
      </div>
    </Shell>
  );
}

function CsvPreview({ csv }: { csv: string }) {
  const rows = useMemo(() => csv.split(/\r?\n/).filter(l => l.trim()).slice(0, 60).map(l => l.split(',')), [csv]);
  if (!rows.length) return null;
  return <div style={{ overflow: 'auto', border: '1px solid #e8e9f0', borderRadius: 10, maxHeight: 260 }}><table style={{ borderCollapse: 'collapse', fontSize: 12.5, minWidth: '100%' }}><tbody>{rows.map((r, i) => <tr key={i} style={{ background: i === 0 ? '#fafbff' : undefined }}>{r.map((c, j) => <td key={j} style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f5f5f5', fontWeight: i === 0 ? 700 : 400, whiteSpace: 'nowrap' }}>{c}</td>)}</tr>)}</tbody></table></div>;
}

const TOUR_STEPS: TourStep[] = [
  { key: 'materials', title: '材料包', text: '题目给你的材料都在这里，点一份在中间看。材料面板可以拖高、占满、收成一条或关掉。「要交什么」和「任务书」也在这一栏。' },
  { key: 'tabs', title: '作答区有几个标签，都要做', text: '每个交付物一个标签（文档 / 表格 / 代码 / 画布），切着做。小圆点变绿表示动过笔；20 分钟还没打开的会提醒你。' },
  { key: 'ai', title: 'AI 助手', text: '随便问，不算作弊。评的是你怎么用、哪些判断是你自己定的。它看得到你当前打开的材料；回答可以一键放进当前交付物。' },
  { key: 'clock', title: '时间和交卷', text: '右上角看用时；到时不强制停表，但会记录。做完点「交卷」，再点一次确认——交了就不能改。' },
  { key: 'views', title: '两侧可以收起', text: '文件夹 = 材料栏，星芒 = AI 助手，点一下收起或展开，给作答区腾地方。随时点「?」再看这份说明。' },
];

/** 出题人带管理密钥来预览做题台（?k=）：每个阶段顶上一条提示 + 回到真活空间（候选人的链接没有 k，看不到） */
function OwnerPreviewBar() {
  const { token } = useParams<{ token: string }>(); const k = useSearchParams().get('k');
  if (!k) return null;
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap', background: '#fff7e6', borderBottom: '1px solid #ffd591', color: '#8a5a00', fontSize: 13, padding: '8px 18px' }}>
    <span>出任务的人预览 · 在这里看到的就是候选人会看到的</span>
    <a href={`/work/${token}/owner?k=${encodeURIComponent(k)}`} style={{ color: '#6055f5', fontWeight: 700, textDecoration: 'none' }}>← 回到真活空间</a>
  </div>;
}
function Shell({ children, dark }: { children: React.ReactNode; dark?: boolean }) { return <div style={{ minHeight: '100vh', background: dark ? '#14151e' : '#f6f7fb', color: dark ? '#e6e8f0' : '#1a1a2e', fontFamily: 'var(--font-geist-sans), -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif' }}><OwnerPreviewBar />{children}</div>; }
function Box({ title, children }: { title: string; children: React.ReactNode }) { return <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 18px', marginBottom: 14 }}><div style={capStyle}>{title}</div>{children}</div>; }
const capStyle: React.CSSProperties = { fontSize: 11, letterSpacing: 1.5, color: '#8c8c8c', marginBottom: 6, fontWeight: 600 };
const inp: React.CSSProperties = { padding: '9px 12px', border: '1px solid #d9dbe6', borderRadius: 10, fontSize: 14, outline: 'none' };
const ta: React.CSSProperties = { ...inp, width: '100%', resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' };
const btnPrimary: React.CSSProperties = { padding: '9px 18px', borderRadius: 999, border: 0, background: 'linear-gradient(135deg,#6055f5,#12b5cb)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 };
const btnGhost: React.CSSProperties = { padding: '5px 12px', borderRadius: 999, border: '1px solid #d9dbe6', background: '#fff', color: '#444', cursor: 'pointer', fontSize: 13 };
