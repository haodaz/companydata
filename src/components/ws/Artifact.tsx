'use client';

/**
 * 工作台右侧的产物面板（像 Claude 的 artifact）：真活详情 / 作答与报告 / 职业空间（建造中显示进度，建好嵌空间页）。
 * 建空间：总控只给出 buildId + 参数，真正的构建由这里发起（POST /api/lab/spaces，3–5 分钟），并轮询进度；同一个 buildId 只发一次。
 */
import React, { useEffect, useState } from 'react';
import { WorkTaskDetail } from '@/components/work/WorkTaskDetail';

export type Art =
  | { kind: 'work'; id: string; token: string; owner_key: string; title: string; role?: string }
  | { kind: 'results'; task_id: string; token: string; owner_key: string; title: string }
  | { kind: 'space_build'; buildId: string; payload: Record<string, any>; title: string }
  | { kind: 'space'; id: string; title: string };

export const artKey = (a: Art) => (a.kind === 'space_build' ? a.buildId : a.kind === 'space' ? a.id : `${a.kind}:${a.token}`);
const started = new Set<string>();

export function ArtifactPanel({ art, onClose, onSpaceDone }: { art: Art; onClose: () => void; onSpaceDone?: (buildId: string, id: string) => void }) {
  const open = art.kind === 'work' || art.kind === 'results' ? `/work/${art.token}/owner?k=${encodeURIComponent(art.owner_key)}` : art.kind === 'space' ? `/lab/${art.id}` : null;
  const label = art.kind === 'work' ? '真活' : art.kind === 'results' ? '作答与报告' : '职业空间';
  return (
    <aside className="ws-art">
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
        {art.kind === 'space' && <iframe src={`/lab/${art.id}`} className="ws-frame" title={art.title} />}
      </div>
    </aside>
  );
}

function WorkArt({ token, k, tab }: { token: string; k: string; tab: string }) {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { setD(null); fetch(`/api/work/${token}/owner?k=${encodeURIComponent(k)}`).then(r => r.json()).then(j => j.ok ? setD(j) : setErr(j.error)).catch(e => setErr(e.message)); }, [token, k]);
  if (err) return <div className="ws-muted">{err}</div>;
  if (!d) return <div className="ws-muted">加载中…</div>;
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
