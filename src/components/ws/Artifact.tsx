'use client';

/**
 * 工作台右侧的产物面板（像 Claude 的 artifact）：真活详情 / 作答与报告 / 职业空间（建造中显示进度，建好嵌空间页）。
 * 建空间：总控只给出 buildId + 参数，真正的构建由这里发起（POST /api/lab/spaces，3–5 分钟），并轮询进度；同一个 buildId 只发一次。
 */
import { Skel } from '@/components/ws/Skel';
import React, { useEffect, useState } from 'react';
import { WorkTaskDetail } from '@/components/work/WorkTaskDetail';
import { CandidateArt, ProjectArt } from '@/components/ws/Project';

export type Art =
  | { kind: 'work'; id: string; token: string; owner_key: string; title: string; role?: string }
  | { kind: 'results'; task_id: string; token: string; owner_key: string; title: string }
  | { kind: 'space_build'; buildId: string; payload: Record<string, any>; title: string }
  | { kind: 'space'; id: string; title: string }
  | { kind: 'company'; title: string }
  | { kind: 'project'; id: string; title: string; tab?: string }
  | { kind: 'candidate'; id: string; project_id: string; title: string };

export const artKey = (a: Art) => (a.kind === 'space_build' ? a.buildId : a.kind === 'space' ? a.id : a.kind === 'company' ? 'company' : a.kind === 'project' ? `project:${a.id}` : a.kind === 'candidate' ? `cand:${a.id}` : `${a.kind}:${a.token}`);
const started = new Set<string>();

export function ArtifactPanel({ art, onClose, onSpaceDone, openArt, onResize }: { art: Art; onClose: () => void; onSpaceDone?: (buildId: string, id: string) => void; openArt?: (a: Art) => void; onResize?: (w: number) => void }) {
  const open = art.kind === 'work' || art.kind === 'results' ? `/work/${art.token}/owner?k=${encodeURIComponent(art.owner_key)}` : art.kind === 'space' ? `/lab/${art.id}` : null;
  const label = art.kind === 'work' ? '真活' : art.kind === 'results' ? '作答与报告' : art.kind === 'company' ? '档案 · 让 AI 更懂你们' : art.kind === 'project' ? '招聘项目' : art.kind === 'candidate' ? '候选人' : '职业空间';
  return (
    <aside className="ws-art">
      {onResize && <div className="ws-art-grip" title="拖动调宽" onPointerDown={e => { e.preventDefault(); const move = (ev: PointerEvent) => onResize(Math.max(380, Math.min(window.innerWidth - 560, window.innerWidth - ev.clientX))); const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.style.cursor = ''; }; document.body.style.cursor = 'col-resize'; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); }} />}
      <div className="ws-art-head">
        <div style={{ minWidth: 0 }}><div className="ws-cap">{label}</div><div className="ws-art-title">{art.title}</div></div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {open && <a className="ws-ghost" href={open} target="_blank" rel="noreferrer">新窗口打开 ↗</a>}
          <button className="ws-ghost" onClick={onClose} aria-label="关闭">✕</button>
        </div>
      </div>
      <div className="ws-art-body">
        {(art.kind === 'work' || art.kind === 'results') && <WorkArt token={art.token} k={art.owner_key} tab={art.kind === 'results' ? 's' : 'p'} />}
        {art.kind === 'space_build' && <SpaceBuild art={art} onDone={id => onSpaceDone?.(art.buildId, id)} />}
        {art.kind === 'company' && <CompanyArt />}
        {art.kind === 'project' && <ProjectArt id={art.id} tab={art.tab} openArt={a => openArt?.(a)} />}
        {art.kind === 'candidate' && <CandidateArt id={art.id} openArt={a => openArt?.(a)} />}
        {art.kind === 'space' && <iframe src={`/lab/${art.id}`} className="ws-frame" title={art.title} />}
      </div>
    </aside>
  );
}

function WorkArt({ token, k, tab }: { token: string; k: string; tab: string }) {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { setD(null); fetch(`/api/work/${token}/owner?k=${encodeURIComponent(k)}`).then(r => r.json()).then(j => j.ok ? setD(j) : setErr(j.error)).catch(e => setErr(e.message)); }, [token, k]);
  if (err) return <div className="ws-muted">{err}</div>;
  if (!d) return <Skel lines={7} card />;
  const link = typeof location !== 'undefined' ? `${location.origin}/work/${token}` : `/work/${token}`;
  return <WorkTaskDetail key={tab} task={d.task} sessions={d.sessions} shareLink={link} notes={d.task?.notes} defaultTab={tab} />;
}

function SpaceBuild({ art, onDone }: { art: Extract<Art, { kind: 'space_build' }>; onDone: (id: string) => void }) {
  const [info, setInfo] = useState<{ phase?: string; detail?: string; done?: boolean; id?: string; error?: string } | null>(null);
  const [t0] = useState(() => Date.now()); const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const doneId = sessionStorage.getItem(`wsbuild:${art.buildId}:id`);
    if (doneId) { setInfo({ done: true, id: doneId }); return; }
    if (!started.has(art.buildId) && !sessionStorage.getItem(`wsbuild:${art.buildId}`)) {
      started.add(art.buildId); sessionStorage.setItem(`wsbuild:${art.buildId}`, '1');
      fetch('/api/lab/spaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(art.payload) })
        .then(r => r.json()).then(j => { if (j.ok && j.id) { sessionStorage.setItem(`wsbuild:${art.buildId}:id`, j.id); setInfo({ done: true, id: j.id }); onDone(j.id); } else setInfo({ error: j.error || '建空间失败' }); })
        .catch(e => setInfo(i => (i?.done ? i : { error: e.message })));
    }
    const iv = setInterval(async () => {
      setNow(Date.now());
      try { const j = await (await fetch(`/api/lab/spaces?build=${art.buildId}`)).json(); if (j.build) setInfo(i => (i?.done ? i : j.build)); if (j.build?.done && j.build.id) { sessionStorage.setItem(`wsbuild:${art.buildId}:id`, j.build.id); onDone(j.build.id); } } catch { /* 下一拍再试 */ }
    }, 3000);
    return () => clearInterval(iv);
  }, [art.buildId]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (info?.done && info.id) return <iframe src={`/lab/${info.id}`} className="ws-frame" title={art.title} />;
  const sec = Math.round((now - t0) / 1000);
  return (
    <div style={{ padding: '28px 8px' }}>
      <div className="ws-build-dot" />
      <div style={{ fontWeight: 650, fontSize: 16, marginTop: 14 }}>{info?.error ? '没建成' : '正在建职业空间'}</div>
      <div className="ws-muted" style={{ marginTop: 6 }}>{info?.error || info?.phase || '读取岗位 JD'}{info?.detail ? ` · ${info.detail}` : ''}</div>
      {!info?.error && <div className="ws-muted" style={{ marginTop: 14, fontSize: 12.5 }}>已用 {Math.floor(sec / 60)} 分 {sec % 60} 秒 · 一般 3–5 分钟：拆任务、写一天的章节、画人物和场景、搭工位、定评分标准。可以先去做别的。</div>}
    </div>
  );
}

/** 企业档案：按 know-how 清单显示已有 / 缺的，每项带来源和「它让 AI 能做什么」；聊天里每存一条就刷新 */
function CompanyArt() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { fetch('/api/ws/setup?checklist=1').then(r => r.json()).then(j => (j.ok ? setD(j) : setErr(j.error))).catch(e => setErr(e.message)); }, []);
  if (err) return <div className="ws-muted">{err}</div>;
  if (!d) return <Skel lines={7} card />;
  const Item = ({ i }: { i: any }) => (
    <div className={`ws-ki${i.value ? ' has' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="ws-ki-dot" /><b style={{ fontSize: 13.5 }}>{i.label}</b>{i.source && <span className="ws-chip-s">{i.source}</span>}{!i.value && i.weight >= 3 && <span className="ws-chip-s" style={{ color: '#b25e1f' }}>最要紧</span>}</div>
      {i.value ? <div className="ws-ki-v">{String(i.value).slice(0, 240)}</div> : <div className="ws-ki-why">{i.why}</div>}
    </div>
  );
  return (
    <div>
      <div className="ws-score"><div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><b style={{ fontSize: 26 }}>{d.score}%</b><span className="ws-muted">AI 对你们的了解程度</span></div><div className="ws-bar"><i style={{ width: `${d.score}%` }} /></div>
        <div className="ws-muted" style={{ fontSize: 12.5, marginTop: 6 }}>{d.company ? `平方企业库 #${d.company.id} ${d.company.name}` : '未关联平方企业库'} · 平方岗位库里有本企业 {d.library_jobs} 个岗位</div></div>
      <div className="ws-sec" style={{ padding: '14px 0 6px' }}>公开信息 · 确认后回流平方</div>
      {d.items.filter((i: any) => i.layer === 'public').map((i: any) => <Item key={i.key} i={i} />)}
      <div className="ws-sec" style={{ padding: '14px 0 6px' }}>只给你自己的 AI 看</div>
      {d.items.filter((i: any) => i.layer === 'private').map((i: any) => <Item key={i.key} i={i} />)}
      <div className="ws-sec" style={{ padding: '14px 0 6px' }}>岗位</div>
      {d.roles.length ? d.roles.map((r: any) => <div key={r.title} className="ws-ki has"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="ws-ki-dot" /><b style={{ fontSize: 13.5 }}>{r.title}</b>{r.linked && <span className="ws-chip-s">平方岗位库</span>}{r.occupation && <span className="ws-chip-s">已对上职业库</span>}</div>
        <div className="ws-ki-v">{r.notes.map((n: any) => <div key={n.key} style={{ color: n.value ? undefined : 'var(--ink3)' }}>{n.label}：{n.value || '—'}</div>)}</div></div>) : <div className="ws-ki"><div className="ws-ki-why">还没有岗位。每个岗位是一个招聘项目的起点，AI 会问你要管哪些。</div></div>}
    </div>
  );
}
