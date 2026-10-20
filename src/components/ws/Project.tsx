'use client';

/**
 * 招聘项目页 + 候选人详情（工作台）：一次招人 = 一个项目。
 * 项目页：环节进度、下一步建议、在项目里问 AI、候选人 / JD / 真活与空间 / 对话；候选人详情：适配、真活、人才检测（智查查 2.0）、阶段、备注。
 */
import React, { useEffect, useRef, useState } from 'react';

export const STAGE_LABEL: Record<string, string> = { new: '新进', screening: '已筛', work: '做真活', verify: '人才检测', interview: '面试', offer: 'offer', hired: '已入职', rejected: '不合适' };
const FLOW = ['new', 'screening', 'work', 'verify', 'interview', 'offer', 'hired'];

export function useProject(id: string, nonce = 0) {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  const load = () => fetch(`/api/ws/projects/${id}`).then(r => r.json()).then(j => (j.ok ? setD(j) : setErr(j.error))).catch(e => setErr(e.message));
  useEffect(() => { setD(null); load(); }, [id, nonce]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { d, err, reload: load };
}

export function ProjectPage({ id, openArt, ask, openThread }: { id: string; openArt: (a: any) => void; ask: (text: string) => void; openThread: (id: string) => void }) {
  const { d, err, reload } = useProject(id);
  const [tab, setTab] = useState<'cands' | 'jd' | 'work' | 'threads'>('cands');
  const [q, setQ] = useState('');
  if (err) return <div className="ws-page"><div className="ws-err">{err}</div></div>;
  if (!d) return <div className="ws-page ws-muted">加载中…</div>;
  const p = d.project, cs: any[] = d.candidates, jd = p.brief?.jd;
  const count = (k: string) => cs.filter(c => c.stage === k).length;
  const next: [string, string][] = [];
  if (!jd) next.push(['写 JD', '帮我写这个岗位的 JD']);
  if (!d.work.length) next.push(['出一道真活', `给「${p.role_title}」出一道真活`]);
  if (!cs.length) next.push(['怎么收候选人', '候选人从哪来？我手上有一些简历']);
  if (cs.some(c => !c.fit && c.resume_text)) next.push(['适配分析', '把还没分析的候选人都分析一下']);
  if (cs.some(c => c.fit?.score >= 70 && !c.audit_report_id)) next.push(['人才检测', '适配分高的候选人做一下人才检测']);
  if (cs.length >= 2) next.push(['对比推荐', '对比一下现在的候选人，推荐谁进面试']);
  next.push(['进展怎么样', '这个项目进展怎么样，下一步做什么']);
  return (
    <div className="ws-page">
      <div className="ws-cap">招聘项目</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <h1 className="ws-title" style={{ margin: 0 }}>{p.title}</h1>
        <span className="ws-chip-s">{p.role_title}</span><span className="ws-chip-s">招 {p.headcount} 人</span><span className="ws-chip-s">{p.status === 'open' ? '进行中' : p.status === 'paused' ? '暂停' : '已结束'}</span>
      </div>
      <div className="ws-flow">{FLOW.map(k => <div key={k} className={`ws-flow-i${count(k) ? ' has' : ''}`}><b>{count(k)}</b><span>{STAGE_LABEL[k]}</span></div>)}{count('rejected') ? <div className="ws-flow-i rej"><b>{count('rejected')}</b><span>不合适</span></div> : null}</div>
      <div className="ws-pask"><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && q.trim() && !(e.nativeEvent as any).isComposing) { ask(q); setQ(''); } }} placeholder="在这个项目里问 AI：写 JD、筛简历、出真活、对比候选人、进展怎么样…" /><button className="ws-send" disabled={!q.trim()} onClick={() => { ask(q); setQ(''); }}>↑</button></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 18px' }}><span className="ws-muted" style={{ fontSize: 12.5, alignSelf: 'center' }}>下一步：</span>{next.slice(0, 5).map(([t, pr]) => <button key={t} className="ws-ghost sm" onClick={() => ask(pr)}>{t}</button>)}</div>
      <div className="ws-tabs2">{([['cands', `候选人 ${cs.length}`], ['jd', jd ? 'JD' : 'JD（未写）'], ['work', `真活与空间 ${d.work.length + d.spaces.length}`], ['threads', `对话 ${d.threads.length}`]] as const).map(([k, t]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>)}</div>
      {tab === 'cands' && <Candidates pid={p.id} cs={cs} reload={reload} openArt={openArt} />}
      {tab === 'jd' && (jd ? <Jd jd={jd} /> : <div className="ws-emptybox">还没有 JD。<button className="ws-ghost sm" onClick={() => ask('帮我写这个岗位的 JD')}>让 AI 写</button></div>)}
      {tab === 'work' && <div style={{ display: 'grid', gap: 8 }}>
        {d.work.map((w: any) => <button key={w.id} className="ws-artchip" onClick={() => openArt({ kind: 'work', id: w.id, token: w.token, owner_key: w.owner_key, title: w.title })}><span className="ws-artchip-ico">▤</span><span><b>{w.title}</b><span className="ws-muted" style={{ display: 'block', fontSize: 12 }}>真活{w.baseline != null ? ` · AI 基线 ${w.baseline}` : ''}</span></span><span className="ws-muted" style={{ marginLeft: 'auto', fontSize: 12 }}>打开 →</span></button>)}
        {d.spaces.map((x: any) => <button key={x.id} className="ws-artchip" onClick={() => openArt({ kind: 'space', id: x.id, title: x.title })}><span className="ws-artchip-ico">◇</span><span><b>{x.title}</b><span className="ws-muted" style={{ display: 'block', fontSize: 12 }}>职业空间 · 入职带教</span></span><span className="ws-muted" style={{ marginLeft: 'auto', fontSize: 12 }}>打开 →</span></button>)}
        {!d.work.length && !d.spaces.length && <div className="ws-emptybox">还没有。<button className="ws-ghost sm" onClick={() => ask(`给「${p.role_title}」出一道真活`)}>出真活</button> <button className="ws-ghost sm" onClick={() => ask(`给「${p.role_title}」建一个职业空间，入职带教用`)}>建空间</button></div>}
      </div>}
      {tab === 'threads' && (d.threads.length ? <div className="ws-table"><table><tbody>{d.threads.map((t: any) => <tr key={t.id}><td><a className="ws-rowlink" onClick={() => openThread(t.id)}>{t.title}</a></td><td className="ws-muted" style={{ width: 120 }}>{new Date(t.updated_at).toLocaleDateString('zh-CN')}</td></tr>)}</tbody></table></div> : <div className="ws-emptybox">项目里还没有对话。上面输入框问一句就开始。</div>)}
    </div>
  );
}

function Candidates({ pid, cs, reload, openArt }: { pid: string; cs: any[]; reload: () => void; openArt: (a: any) => void }) {
  const [busy, setBusy] = useState(''); const [paste, setPaste] = useState(''); const [show, setShow] = useState(false); const fileRef = useRef<HTMLInputElement>(null);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const [i, f] of Array.from(files).entries()) {
      setBusy(`读简历 ${i + 1}/${files.length}：${f.name}`);
      const fd = new FormData(); fd.append('file', f);
      const j = await (await fetch(`/api/ws/projects/${pid}/candidates`, { method: 'POST', body: fd })).json().catch(() => ({ ok: false, error: '网络错误' }));
      if (!j.ok) { setBusy(`${f.name}：${j.error}`); await new Promise(r => setTimeout(r, 2500)); }
    }
    setBusy(''); reload();
  };
  const addText = async () => { setBusy('读简历中…'); const j = await (await fetch(`/api/ws/projects/${pid}/candidates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: paste }) })).json().catch(() => ({ ok: false, error: '网络错误' })); setBusy(j.ok ? '' : j.error); if (j.ok) { setPaste(''); setShow(false); reload(); } };
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="ws-primary" style={{ padding: '7px 14px', fontSize: 13.5 }} onClick={() => fileRef.current?.click()}>上传简历（PDF，可多选）</button>
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md" multiple style={{ display: 'none' }} onChange={e => { upload(e.target.files); e.target.value = ''; }} />
        <button className="ws-ghost sm" onClick={() => setShow(s => !s)}>粘贴简历文字</button>
        <span className="ws-muted" style={{ fontSize: 12.5 }}>做了这个项目真活的人会自动进来</span>
        {busy && <span className="ws-note-b" style={{ margin: 0 }}>{busy}</span>}
      </div>
      {show && <div style={{ marginBottom: 12 }}><textarea className="ws-input" style={{ height: 140, padding: 10, resize: 'vertical' }} value={paste} onChange={e => setPaste(e.target.value)} placeholder="把一份简历的文字粘进来" /><button className="ws-primary" style={{ marginTop: 6, padding: '6px 14px', fontSize: 13 }} disabled={paste.trim().length < 20 || !!busy} onClick={addText}>加入</button></div>}
      {cs.length ? <div className="ws-table"><table><thead><tr><th>候选人</th><th>来源</th><th>阶段</th><th>适配</th><th>真活</th><th>人才检测</th></tr></thead><tbody>{cs.map(c => (
        <tr key={c.id} onClick={() => openArt({ kind: 'candidate', id: c.id, project_id: pid, title: c.name })} style={{ cursor: 'pointer' }}>
          <td><b>{c.name}</b><div className="ws-muted" style={{ fontSize: 12 }}>{c.resume?.headline || c.contact || ''}</div></td>
          <td className="ws-muted">{c.source === 'work' ? '做真活' : c.source === 'upload' ? '上传' : c.source}</td>
          <td><span className={`ws-stage s-${c.stage}`}>{STAGE_LABEL[c.stage] || c.stage}</span></td>
          <td>{c.fit ? <><b>{c.fit.score}</b> <span className="ws-muted" style={{ fontSize: 12 }}>{c.fit.verdict}</span></> : <span className="ws-muted">—</span>}</td>
          <td>{c.resume?.work ? (c.resume.work.submitted ? (c.resume.work.score ?? 'AI 审计中') : '做题中') : <span className="ws-muted">—</span>}</td>
          <td>{c.audit ? (c.audit.status === 'running' ? '验真中…' : c.audit.status === 'failed' ? '没跑完' : c.audit.scan?.score != null ? `能力 ${c.audit.scan.score}` : '已出') : <span className="ws-muted">—</span>}</td>
        </tr>))}</tbody></table></div> : <div className="ws-emptybox">还没有候选人。上传简历，或者把这个项目的真活链接发出去。</div>}
    </>
  );
}

function Jd({ jd }: { jd: any }) {
  const L = ({ t, xs }: { t: string; xs?: string[] }) => xs?.length ? <><div className="ws-sub">{t}</div><ul className="ws-list">{xs.map((x, i) => <li key={i}>{x}</li>)}</ul></> : null;
  return <div className="ws-box"><div style={{ fontFamily: 'var(--font-serif-sc),Songti SC,serif', fontSize: 20, fontWeight: 700 }}>{jd.title}</div><p style={{ color: 'var(--ink2)', lineHeight: 1.8 }}>{jd.summary}</p><L t="职责" xs={jd.responsibilities} /><L t="要求" xs={jd.requirements} /><L t="硬性要求（筛人用）" xs={jd.must_haves} /><L t="加分项" xs={jd.nice_to_haves} />{jd.first90 && <><div className="ws-sub">入职 90 天要做成什么</div><p style={{ color: 'var(--ink2)', lineHeight: 1.8, margin: 0 }}>{jd.first90}</p></>}</div>;
}

/** 右侧面板：项目概览（对话里 AI 推进项目时打开） */
export function ProjectArt({ id, tab, openArt }: { id: string; tab?: string; openArt: (a: any) => void }) {
  const { d, err } = useProject(id);
  if (err) return <div className="ws-muted">{err}</div>;
  if (!d) return <div className="ws-muted">加载中…</div>;
  const cs: any[] = d.candidates;
  return (
    <div>
      <div className="ws-flow" style={{ marginBottom: 12 }}>{FLOW.map(k => <div key={k} className={`ws-flow-i${cs.some(c => c.stage === k) ? ' has' : ''}`}><b>{cs.filter(c => c.stage === k).length}</b><span>{STAGE_LABEL[k]}</span></div>)}</div>
      {tab === 'jd' && d.project.brief?.jd ? <Jd jd={d.project.brief.jd} /> : <>
        {cs.length ? cs.map(c => <button key={c.id} className="ws-cand" onClick={() => openArt({ kind: 'candidate', id: c.id, project_id: id, title: c.name })}><b>{c.name}</b><span className={`ws-stage s-${c.stage}`}>{STAGE_LABEL[c.stage]}</span><span className="ws-muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>{c.fit ? `适配 ${c.fit.score}` : ''}{c.resume?.work?.score != null ? ` · 真活 ${c.resume.work.score}` : ''}{c.audit?.scan?.score != null ? ` · 能力 ${c.audit.scan.score}` : ''}</span></button>) : <div className="ws-emptybox">还没有候选人</div>}
        {d.project.brief?.jd && <div style={{ marginTop: 14 }}><Jd jd={d.project.brief.jd} /></div>}
      </>}
    </div>
  );
}

/** 右侧面板：候选人详情 */
export function CandidateArt({ id, openArt }: { id: string; openArt: (a: any) => void }) {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState('');
  const load = () => fetch(`/api/ws/candidates/${id}`).then(r => r.json()).then(j => (j.ok ? setD(j) : setErr(j.error))).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (d?.candidate?.audit?.status !== 'running') return; const iv = setInterval(load, 15000); return () => clearInterval(iv); }, [d?.candidate?.audit?.status]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="ws-muted">{err}</div>;
  if (!d) return <div className="ws-muted">加载中…</div>;
  const c = d.candidate, a = c.audit, f = c.fit;
  const act = async (action: string) => { setBusy(action === 'fit' ? '适配分析中…' : '交给智查查…'); const j = await (await fetch(`/api/ws/candidates/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })).json().catch(() => ({ ok: false, error: '网络错误' })); setBusy(j.ok ? '' : j.error); load(); };
  const stage = async (s: string) => { await fetch(`/api/ws/candidates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: s }) }); load(); };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="ws-box"><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ minWidth: 0 }}><div style={{ fontSize: 18, fontWeight: 700 }}>{c.name}</div><div className="ws-muted" style={{ fontSize: 13 }}>{c.resume?.headline || c.contact || ''}</div></div>
        <select className="ws-stage-sel" value={c.stage} onChange={e => stage(e.target.value)}>{Object.entries(STAGE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        {busy && <div className="ws-note-b">{busy}</div>}</div>
      <div className="ws-box"><div className="ws-box-h">适配分析 {f && <span className="ws-chip-s">{f.score} · {f.verdict}</span>}{!f && c.resume_text && <button className="ws-ghost sm" style={{ marginLeft: 'auto' }} onClick={() => act('fit')}>分析</button>}</div>
        {f ? <><ul className="ws-list">{f.reasons.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>{!!f.risks?.length && <><div className="ws-sub">风险</div><ul className="ws-list">{f.risks.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}{!!f.ask_in_interview?.length && <><div className="ws-sub">面试时追问</div><ul className="ws-list">{f.ask_in_interview.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}</> : <div className="ws-muted" style={{ fontSize: 13 }}>{c.resume_text ? '还没分析' : '没有简历文字，做真活的人可以看真活报告'}</div>}</div>
      <div className="ws-box"><div className="ws-box-h">真活 {d.work && <span className="ws-chip-s">{d.work.submitted ? (d.work.score ?? 'AI 审计中') : '做题中'}</span>}</div>
        {d.work ? <><div style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.7 }}>{d.work.report?.result?.summary || d.work.title}</div>{d.work.token && <button className="ws-ghost sm" style={{ marginTop: 8 }} onClick={() => openArt({ kind: 'results', task_id: '', token: d.work.token, owner_key: d.work.owner_key, title: d.work.title })}>看报告 →</button>}</> : <div className="ws-muted" style={{ fontSize: 13 }}>还没做真活。把项目的真活链接发给 TA。</div>}</div>
      <div className="ws-box"><div className="ws-box-h">人才检测 <span className="ws-chip-s">智查查 2.0 · 验真 + 能力扫描</span>{!a && <button className="ws-ghost sm" style={{ marginLeft: 'auto' }} disabled={!d.zhichacha || !c.resume_text} onClick={() => act('verify')}>开始检测</button>}</div>
        {!a && <div className="ws-muted" style={{ fontSize: 13 }}>{!d.zhichacha ? '智查查还没接上（需要配置 datasquare 的地址和密钥）' : !c.resume_text ? '需要简历文字' : '学历、经历、论文专利逐条核对，再做能力扫描，要几分钟'}</div>}
        {a?.status === 'running' && <div className="ws-note-b">验真中…每 15 秒看一次进度</div>}
        {a?.status === 'failed' && <div className="ws-err">没跑完：{a.text || a.verdict}</div>}
        {a?.status === 'done' && <><div style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--ink2)' }}>{a.verdict}</div>{a.stats && <div className="ws-muted" style={{ fontSize: 12.5, marginTop: 6 }}>核对一致 {a.stats.match ?? 0} · 不一致 {a.stats.mismatch ?? 0} · 需人工 {a.stats.manual_review ?? 0}</div>}
          {a.scan && <><div className="ws-sub">能力扫描 {a.scan.score} {a.scan.grade}</div><div style={{ fontSize: 13.5 }}>{a.scan.headline}</div>{!!a.scan.risks?.length && <ul className="ws-list">{a.scan.risks.map((x: any, i: number) => <li key={i}>{typeof x === 'string' ? x : x.title || JSON.stringify(x)}</li>)}</ul>}</>}
          {a.url && <a className="ws-ghost sm" style={{ display: 'inline-block', marginTop: 8 }} href={a.url} target="_blank" rel="noreferrer">完整验真报告 ↗</a>}</>}</div>
      {c.resume_text && <details className="ws-box"><summary style={{ cursor: 'pointer', fontWeight: 650 }}>简历原文</summary><pre className="ws-pre">{c.resume_text}</pre></details>}
    </div>
  );
}
