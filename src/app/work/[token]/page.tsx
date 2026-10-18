'use client';

/**
 * 真活台 · 参与者页（公开，留名字就能做）：/work/<token>
 * 左边材料包、中间按环境换操作台（文档 / 代码 / 表格 / 设计）、右边 AI 随便问。所有动作记成事件流，交卷后出报告。
 * ?s=<session id> 回到已有的一次作答（看报告）。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { WorkReport } from '@/components/work/WorkReport';

type Material = { id: string; title: string; kind: string; content: string; source: string };
type Env = { type: 'doc' | 'code' | 'sheet' | 'design'; language?: string; starter?: string; tests?: { name: string; code: string }[]; csv?: string; params?: { name: string; unit?: string; hint?: string }[]; sketch_hint?: string };
type Task = { id: string; company_name: string; role: string; statement: string; task: { title: string; brief: string; deliverables: { id: string; title: string; format: string }[]; time_minutes: number; rules: string[]; env?: Env }; materials: Material[] };
type Ev = { t: number; type: string; [k: string]: any };

const ENV_NAME: Record<string, string> = { doc: '文档 / 对账台', code: '代码台', sheet: '表格 / 数据台', design: '设计台' };
const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export default function WorkPage() {
  const { token } = useParams<{ token: string }>();
  const sp = useSearchParams();
  const [task, setTask] = useState<Task | null>(null);
  const [err, setErr] = useState('');
  const [phase, setPhase] = useState<'loading' | 'intro' | 'work' | 'grading' | 'report'>('loading');
  const [sid, setSid] = useState<string>('');
  const [name, setName] = useState(''); const [contact, setContact] = useState('');
  const [report, setReport] = useState<any>(null);
  const [participant, setParticipant] = useState<any>(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => { const f = () => setNarrow(window.innerWidth < 980); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  useEffect(() => {
    (async () => {
      const j = await (await fetch(`/api/work/${token}`)).json();
      if (!j.ok) { setErr(j.error || '链接不可用'); setPhase('intro'); return; }
      setTask(j.task);
      const s = sp.get('s') || (typeof localStorage !== 'undefined' ? localStorage.getItem(`work:${token}`) : '') || '';
      if (s) {
        const r = await (await fetch(`/api/work/${token}/sessions/${s}`)).json();
        if (r.ok) { setSid(s); setParticipant(r.session.participant); if (r.session.report) { setReport(r.session.report); setPhase('report'); return; } if (!r.session.submitted_at) { setPhase('work'); return; } }
      }
      setPhase('intro');
    })();
  }, [token, sp]);

  const start = async () => {
    if (!name.trim()) return;
    const j = await (await fetch(`/api/work/${token}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, contact }) })).json();
    if (!j.ok) { setErr(j.error); return; }
    setSid(j.session_id); setParticipant({ name, contact }); try { localStorage.setItem(`work:${token}`, j.session_id); } catch {}
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
        <Box title="规则"><ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>{task.task.rules.map((r, i) => <li key={i}>{r}</li>)}</ul><div style={{ color: '#888', fontSize: 13, marginTop: 6 }}>操作台：{ENV_NAME[env.type]} · 建议用时 {task.task.time_minutes} 分钟（不强制停表，但用时会记）· 材料 {task.materials.length} 份 · 交卷后立刻出报告</div></Box>
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

  return <Workspace token={token} sid={sid} task={task} env={env} narrow={narrow} grading={phase === 'grading'} error={err} onSubmit={async (deliverable, events) => {
    setPhase('grading');
    const j = await (await fetch(`/api/work/${token}/sessions/${sid}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deliverable, events }) })).json();
    if (!j.ok) { setErr(j.error || '交卷失败，再试一次'); setPhase('work'); return; }
    setReport(j.report); setPhase('report');
  }} />;
}

/* ── 工作台 ── */
function Workspace({ token, sid, task, env, narrow, grading, error, onSubmit }: { token: string; sid: string; task: Task; env: Env; narrow: boolean; grading: boolean; error?: string; onSubmit: (deliverable: string, events: Ev[]) => Promise<void> }) {
  const t0 = useRef(Date.now());
  const [now, setNow] = useState(0);
  const buf = useRef<Ev[]>([]);
  const lastAct = useRef(Date.now());
  const idleMarked = useRef(false);
  const now_s = () => Math.round((Date.now() - t0.current) / 1000);
  const ev = useCallback((type: string, extra: Record<string, any> = {}) => { buf.current.push({ t: now_s(), type, ...extra }); lastAct.current = Date.now(); idleMarked.current = false; }, []);

  // 各环境的工作内容
  const [doc, setDoc] = useState('');
  const [code, setCode] = useState(env.starter || '');
  const [csv, setCsv] = useState(env.csv || '');
  const [params, setParams] = useState<Record<string, string>>({});
  const [sketch, setSketch] = useState<{ pts: [number, number][]; label: string }[]>([]);
  const [notes, setNotes] = useState('');
  const [testOut, setTestOut] = useState<string>('');
  const lastLen = useRef(0);

  const deliverable = useMemo(() => {
    if (env.type === 'code') return `\`\`\`${env.language || 'js'}\n${code}\n\`\`\`\n\n## 说明\n${notes}`;
    if (env.type === 'sheet') return `## 表\n\`\`\`csv\n${csv}\n\`\`\`\n\n## 口径说明\n${notes}`;
    if (env.type === 'design') return `## 参数表\n| 参数 | 值 | 单位 |\n|---|---|---|\n${(env.params || []).map(p => `| ${p.name} | ${params[p.name] || ''} | ${p.unit || ''} |`).join('\n')}\n\n## 草图（${sketch.length} 条线）\n${sketch.map((l, i) => `- 线 ${i + 1}「${l.label || '未标注'}」：${l.pts.map(p => `(${p[0]},${p[1]})`).join(' → ')}`).join('\n')}\n\n## 设计说明\n${notes}`;
    return doc;
  }, [env, doc, code, csv, params, sketch, notes]);

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
  useEffect(() => {
    const iv = setInterval(async () => {
      const events = buf.current.splice(0);
      try { await fetch(`/api/work/${token}/sessions/${sid}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events, deliverable }) }); } catch { buf.current.unshift(...events); }
    }, 30_000);
    return () => clearInterval(iv);
  }, [token, sid, deliverable]);

  // 材料
  const [mat, setMat] = useState<Material | null>(null);
  const openMat = (m: Material) => { setMat(m); ev('open_material', { id: m.id }); };

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
  const adopt = (a: string) => { ev('adopt', { chars: a.length }); if (env.type === 'code') setNotes(n => n + '\n' + a); else if (env.type === 'doc') setDoc(d => d + (d ? '\n\n' : '') + a); else setNotes(n => n + (n ? '\n\n' : '') + a); };
  const onPaste = (e: React.ClipboardEvent) => { const n = e.clipboardData.getData('text').length; if (n > 20) ev('paste', { chars: n }); };

  // 代码自测（只跑 js，在 Worker 里，3 秒超时）
  const runTests = () => {
    if (!env.tests?.length) return;
    const src = code.replace(/export\s+(default\s+)?/g, '');
    const worker = new Worker(URL.createObjectURL(new Blob([`
      self.onmessage = (e) => { const { src, tests } = e.data; let solution; const out = [];
        try { const mod = new Function(src + '\\n;return typeof solution!=="undefined"?solution:undefined;'); solution = mod(); } catch (err) { self.postMessage({ error: String(err) }); return; }
        for (const t of tests) { try { out.push({ name: t.name, ok: !!(new Function('solution', t.code))(solution) }); } catch (err) { out.push({ name: t.name, ok: false, err: String(err) }); } }
        self.postMessage({ out }); };`], { type: 'text/javascript' })));
    const timer = setTimeout(() => { worker.terminate(); setTestOut('超时（3 秒）：可能死循环'); ev('run_tests', { note: 'timeout' }); }, 3000);
    worker.onmessage = (e) => { clearTimeout(timer); worker.terminate(); if (e.data.error) { setTestOut(`代码报错：${e.data.error}`); ev('run_tests', { note: 'error' }); return; } const out = e.data.out as { name: string; ok: boolean; err?: string }[]; const pass = out.filter(x => x.ok).length; setTestOut(out.map(x => `${x.ok ? '✓' : '✗'} ${x.name}${x.err ? '  ' + x.err : ''}`).join('\n') + `\n通过 ${pass}/${out.length}`); ev('run_tests', { note: `${pass}/${out.length}` }); };
    worker.postMessage({ src, tests: env.tests });
  };

  // 设计台草图：点一下加点，双击结束一条线
  const [cur, setCur] = useState<[number, number][]>([]);
  const svgClick = (e: React.MouseEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); const p: [number, number] = [Math.round(e.clientX - r.left), Math.round(e.clientY - r.top)]; setCur(c => [...c, p]); };
  const [lineLabel, setLineLabel] = useState('');
  const svgDbl = () => { if (cur.length >= 2) { const label = lineLabel.trim(); setSketch(s => [...s, { pts: cur, label }]); ev('sketch', { note: label }); setLineLabel(''); } setCur([]); };

  const [arm, setArm] = useState(false);
  const submit = () => { if (!arm) { setArm(true); setTimeout(() => setArm(false), 5000); return; } setArm(false); const events = buf.current.splice(0); onSubmit(deliverable, events); };
  const over = now > task.task.time_minutes * 60;

  return (
    <Shell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', borderBottom: '1px solid #e8e9f0', background: '#fff', position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: '#6055f5', fontWeight: 700 }}>真活台</div>
        <div style={{ fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.task.title} <span style={{ color: '#888', fontWeight: 400, fontSize: 13 }}>{task.company_name} · {task.role} · {ENV_NAME[env.type]}</span></div>
        <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 700, color: over ? '#c0392b' : '#1a1a2e' }}>{fmt(now)}<span style={{ color: '#aaa', fontWeight: 400 }}> / {task.task.time_minutes}:00</span></div>
        <button onClick={submit} disabled={grading} style={{ ...btnPrimary, ...(arm ? { background: '#c0392b' } : {}) }}>{grading ? '评卷中…' : arm ? '再点一次确认交卷（交后不能改）' : '交卷 →'}</button>
      </div>
      {grading && <div style={{ padding: '14px 18px', background: '#f3f2ff', color: '#4c43c9', fontSize: 14 }}>交卷了。正在逐条核对交付物、回看过程、和 AI 基线比——大约 1–2 分钟，别关页面。</div>}
      {error && !grading && <div style={{ padding: '10px 18px', background: '#fff1f0', color: '#c0392b', fontSize: 14 }}>{error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '300px 1fr 360px', gap: 0, minHeight: 'calc(100vh - 56px)' }}>
        {/* 材料 */}
        <aside style={{ borderRight: narrow ? undefined : '1px solid #e8e9f0', background: '#fafbff', padding: 14, overflow: 'auto', maxHeight: narrow ? 320 : 'calc(100vh - 56px)' }}>
          <div style={capStyle}>材料包 · {task.materials.length} 份</div>
          {task.materials.map(m => <div key={m.id} onClick={() => openMat(m)} style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 6, cursor: 'pointer', background: mat?.id === m.id ? '#fff' : 'transparent', border: `1px solid ${mat?.id === m.id ? '#6055f5' : '#e8e9f0'}` }}><div style={{ fontWeight: 600, fontSize: 13 }}>{m.title}</div><div style={{ fontSize: 11, color: '#999' }}>{m.id} · {m.kind}</div></div>)}
          <div style={{ ...capStyle, marginTop: 16 }}>要交什么</div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>{task.task.deliverables.map(d => <li key={d.id}>{d.title} <span style={{ color: '#999' }}>{d.format}</span></li>)}</ol>
          <details style={{ marginTop: 12, fontSize: 13 }}><summary style={{ cursor: 'pointer', color: '#6055f5' }}>任务书</summary><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#444', marginTop: 6 }}>{task.task.brief}</div></details>
        </aside>
        {/* 操作台 */}
        <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {mat && <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 12, padding: 14, maxHeight: 300, overflow: 'auto' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{mat.title}</b><button onClick={() => setMat(null)} style={btnGhost}>收起</button></div><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.7, margin: '8px 0 0', color: '#333' }}>{mat.content}</pre></div>}
          {env.type === 'doc' && <>
            <div style={capStyle}>交付物（Markdown，按「要交什么」逐个写）</div>
            <textarea value={doc} onChange={e => setDoc(e.target.value)} onPaste={onPaste} placeholder={task.task.deliverables.map(d => `## ${d.title}\n`).join('\n')} style={{ ...ta, flex: 1, minHeight: 420 }} />
          </>}
          {env.type === 'code' && <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={capStyle}>代码（{env.language || 'js'}，导出 solution）</div>{!!env.tests?.length && <button onClick={runTests} style={btnGhost}>▶ 跑自测（{env.tests.length} 个用例）</button>}</div>
            <textarea value={code} onChange={e => setCode(e.target.value)} onPaste={onPaste} spellCheck={false} style={{ ...ta, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, minHeight: 320, background: '#0f1224', color: '#e6e8f0' }} />
            {testOut && <pre style={{ margin: 0, padding: 10, background: '#fafbff', border: '1px solid #e8e9f0', borderRadius: 10, fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{testOut}</pre>}
            <div style={capStyle}>说明（思路、假设、没做完的）</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} onPaste={onPaste} style={{ ...ta, minHeight: 120 }} />
          </>}
          {env.type === 'sheet' && <>
            <div style={capStyle}>表（CSV，直接改；下面实时预览）</div>
            <textarea value={csv} onChange={e => setCsv(e.target.value)} onPaste={onPaste} spellCheck={false} style={{ ...ta, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, minHeight: 180 }} />
            <CsvPreview csv={csv} />
            <div style={capStyle}>口径说明（怎么对的账、哪些是假设）</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} onPaste={onPaste} style={{ ...ta, minHeight: 140 }} />
          </>}
          {env.type === 'design' && <>
            <div style={capStyle}>参数表</div>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}><tbody>{(env.params || []).map(p => <tr key={p.name} style={{ borderTop: '1px solid #eee' }}><td style={{ padding: 6, width: 180, fontWeight: 600 }}>{p.name}</td><td style={{ padding: 6 }}><input value={params[p.name] || ''} onChange={e => setParams(x => ({ ...x, [p.name]: e.target.value }))} onBlur={() => ev('set_param', { id: p.name })} style={{ ...inp, width: 140 }} /> <span style={{ color: '#888' }}>{p.unit}</span></td><td style={{ padding: 6, color: '#888', fontSize: 12 }}>{p.hint}</td></tr>)}</tbody></table>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><div style={capStyle}>草图（点一下加点、双击结束一条线）{env.sketch_hint ? ` · ${env.sketch_hint}` : ''}</div><input value={lineLabel} onChange={e => setLineLabel(e.target.value)} placeholder="这条线标什么：外轮廓 / 孔位 / 尺寸 120mm" style={{ ...inp, width: 280, padding: '5px 10px', fontSize: 13 }} /></div>
            <svg onClick={svgClick} onDoubleClick={svgDbl} width="100%" height={320} style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 12, cursor: 'crosshair', backgroundImage: 'linear-gradient(#f0f0f5 1px, transparent 1px), linear-gradient(90deg, #f0f0f5 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
              {sketch.map((l, i) => <g key={i}><polyline points={l.pts.map(p => p.join(',')).join(' ')} fill="none" stroke="#6055f5" strokeWidth={2} /><text x={l.pts[0][0] + 4} y={l.pts[0][1] - 4} fontSize={11} fill="#6055f5">{l.label}</text></g>)}
              {cur.length > 0 && <polyline points={cur.map(p => p.join(',')).join(' ')} fill="none" stroke="#fa8c16" strokeWidth={2} strokeDasharray="4 3" />}
            </svg>
            {!!sketch.length && <button onClick={() => setSketch(s => s.slice(0, -1))} style={btnGhost}>撤销上一条线</button>}
            <div style={capStyle}>设计说明（取值依据、校核、风险）</div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} onPaste={onPaste} style={{ ...ta, minHeight: 140 }} />
          </>}
        </main>
        {/* AI */}
        <aside style={{ borderLeft: narrow ? undefined : '1px solid #e8e9f0', display: 'flex', flexDirection: 'column', maxHeight: narrow ? 480 : 'calc(100vh - 56px)' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #e8e9f0' }}><div style={capStyle}>AI 助手</div><div style={{ fontSize: 12, color: '#888' }}>随便问，不算作弊；评的是你怎么用、什么是你自己定的。它看得到你当前打开的材料。</div></div>
          <div style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {chat.map((c, i) => <div key={i}><div style={{ background: '#6055f5', color: '#fff', padding: '8px 12px', borderRadius: '12px 12px 2px 12px', fontSize: 13.5, marginLeft: 30, whiteSpace: 'pre-wrap' }}>{c.q}</div><div style={{ background: '#fafbff', border: '1px solid #e8e9f0', padding: '8px 12px', borderRadius: '12px 12px 12px 2px', fontSize: 13.5, marginTop: 6, marginRight: 30, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{c.a}<div style={{ marginTop: 6 }}><button onClick={() => adopt(c.a)} style={{ ...btnGhost, fontSize: 12 }}>放进交付物</button></div></div></div>)}
            {asking && <div style={{ color: '#888', fontSize: 13 }}>AI 在想…</div>}
          </div>
          <div style={{ padding: 12, borderTop: '1px solid #e8e9f0', display: 'flex', gap: 8 }}>
            <textarea value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} placeholder="问 AI（Enter 发送，Shift+Enter 换行）" style={{ ...ta, minHeight: 44, flex: 1 }} />
            <button onClick={ask} disabled={asking || !q.trim()} style={btnPrimary}>问</button>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function CsvPreview({ csv }: { csv: string }) {
  const rows = useMemo(() => csv.split(/\r?\n/).filter(l => l.trim()).slice(0, 60).map(l => l.split(',')), [csv]);
  if (!rows.length) return null;
  return <div style={{ overflow: 'auto', border: '1px solid #e8e9f0', borderRadius: 10, maxHeight: 260 }}><table style={{ borderCollapse: 'collapse', fontSize: 12.5, minWidth: '100%' }}><tbody>{rows.map((r, i) => <tr key={i} style={{ background: i === 0 ? '#fafbff' : undefined }}>{r.map((c, j) => <td key={j} style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f5f5f5', fontWeight: i === 0 ? 700 : 400, whiteSpace: 'nowrap' }}>{c}</td>)}</tr>)}</tbody></table></div>;
}

function Shell({ children }: { children: React.ReactNode }) { return <div style={{ minHeight: '100vh', background: '#f6f7fb', color: '#1a1a2e', fontFamily: 'var(--font-geist-sans), -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif' }}>{children}</div>; }
function Box({ title, children }: { title: string; children: React.ReactNode }) { return <div style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 14, padding: '14px 18px', marginBottom: 14 }}><div style={capStyle}>{title}</div>{children}</div>; }
const capStyle: React.CSSProperties = { fontSize: 11, letterSpacing: 1.5, color: '#8c8c8c', marginBottom: 6, fontWeight: 600 };
const inp: React.CSSProperties = { padding: '9px 12px', border: '1px solid #d9dbe6', borderRadius: 10, fontSize: 14, outline: 'none' };
const ta: React.CSSProperties = { ...inp, width: '100%', resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' };
const btnPrimary: React.CSSProperties = { padding: '9px 18px', borderRadius: 999, border: 0, background: 'linear-gradient(135deg,#6055f5,#12b5cb)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 };
const btnGhost: React.CSSProperties = { padding: '5px 12px', borderRadius: 999, border: '1px solid #d9dbe6', background: '#fff', color: '#444', cursor: 'pointer', fontSize: 13 };
