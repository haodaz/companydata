'use client';

/**
 * 企业落地向导（工作台里的「企业设置」也用它）：企业情况 → 岗位。
 * 公开信息回流平方（空的直接填，改动进待审核）；内部信息只留在工作台，给 AI 出题、建空间当上下文。
 */
import React, { useEffect, useState } from 'react';

type F = { key: string; label: string; hint: string; long?: boolean };
export function Setup({ step: step0, onDone, embedded }: { step: 'context' | 'roles'; onDone: () => void; embedded?: boolean }) {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  const [step, setStep] = useState(step0);
  const load = () => fetch('/api/ws/setup').then(r => r.json()).then(j => (j.ok ? setD(j) : setErr(j.error))).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const go = async (s: 'context' | 'roles' | 'done') => { await fetch('/api/ws/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'step', step: s }) }).catch(() => {}); if (s === 'done') onDone(); else setStep(s); };
  if (err) return <div className="ws-page"><div className="ws-err">{err}</div></div>;
  if (!d) return <div className="ws-page ws-muted">加载中…</div>;
  return (
    <div className="ws-page">
      <div className="ws-steps">
        {[['context', '企业情况'], ['roles', '岗位']].map(([k, t], i) => <button key={k} className={`ws-stepb${step === k ? ' on' : ''}`} onClick={() => setStep(k as any)}><span className="ws-stepn">{i + 2}</span>{t}</button>)}
        {!embedded && <span className="ws-muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>第 1 步「你在哪家企业」已完成</span>}
      </div>
      {step === 'context' ? <Context d={d} reload={load} next={() => go('roles')} embedded={embedded} /> : <Roles d={d} reload={load} done={() => go('done')} embedded={embedded} />}
    </div>
  );
}

function Context({ d, reload, next, embedded }: { d: any; reload: () => void; next: () => void; embedded?: boolean }) {
  const pubF: F[] = d.fields.public, privF: F[] = d.fields.private;
  const [pub, setPub] = useState<Record<string, string>>(() => Object.fromEntries(pubF.map(f => [f.key, d.company?.[f.key] ?? ''])));
  const [priv, setPriv] = useState<Record<string, string>>(() => Object.fromEntries(privF.map(f => [f.key, d.context?.[f.key] ?? ''])));
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState('');
  const thin = d.company && pubF.filter(f => !d.company[f.key]).length >= 3;
  const enrich = async () => {
    setBusy('AI 正在联网查你们的公开资料，补全企业画像（约 30–60 秒）…'); setMsg('');
    const j = await (await fetch('/api/ws/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'enrich' }) })).json().catch(() => ({ ok: false, error: '网络错误' }));
    setBusy(''); if (!j.ok) { setMsg(j.error); return; }
    setMsg(j.filled?.length ? `补上了 ${j.filled.length} 项，下面已经更新，请核对` : '没有查到更多公开信息，可以自己填');
    const s = await (await fetch('/api/ws/setup')).json(); if (s.ok) setPub(Object.fromEntries(pubF.map(f => [f.key, s.company?.[f.key] ?? '']))); reload();
  };
  const save = async (then?: () => void) => {
    setBusy('保存中…'); setMsg('');
    const j = await (await fetch('/api/ws/setup', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ public: pub, private: priv }) })).json().catch(() => ({ ok: false, error: '网络错误' }));
    setBusy(''); if (!j.ok) { setMsg(j.error); return; }
    const parts = [j.applied?.length ? `${j.applied.length} 项写进了平方企业库` : '', j.pending?.length ? `${j.pending.length} 项和平方现有记录不同，已提交审核` : ''].filter(Boolean);
    setMsg(parts.length ? `已保存：${parts.join('，')}。内部信息只留在你的工作台。` : '已保存。'); reload(); then?.();
  };
  return (
    <>
      <h1 className="ws-title">把企业的情况告诉 AI</h1>
      <div className="ws-muted" style={{ marginBottom: 18, lineHeight: 1.7 }}>上面一块是平方数据库里你们的公开画像，核对、修改、补充都行，<b>改动会回流平方</b>（空的直接写入，和现有记录不同的进审核）。下面一块<b>只留在你的工作台</b>，AI 出题、建空间时会用到。</div>
      <div className="ws-box">
        <div className="ws-box-h">平方数据里的你们 <span className="ws-chip-s">{d.company ? `平方企业库 #${d.company.id}${d.company.completeness_score != null ? ` · 完整度 ${d.company.completeness_score}` : ''}` : '未关联'}</span>
          {d.company && <button className="ws-ghost sm" style={{ marginLeft: 'auto' }} disabled={!!busy} onClick={enrich}>{thin ? 'AI 联网补全画像' : 'AI 再查一遍公开资料'}</button>}
        </div>
        <div className="ws-form">{pubF.map(f => <label key={f.key} className={f.long ? 'wide' : ''}><span>{f.label}</span>{f.long ? <textarea value={pub[f.key]} placeholder={f.hint} onChange={e => setPub(p => ({ ...p, [f.key]: e.target.value }))} rows={3} /> : <input value={pub[f.key]} placeholder={f.hint} onChange={e => setPub(p => ({ ...p, [f.key]: e.target.value }))} />}</label>)}</div>
      </div>
      <div className="ws-box" style={{ marginTop: 14 }}>
        <div className="ws-box-h">只给你自己的 AI 看 <span className="ws-chip-s">不回流、不公开</span></div>
        <div className="ws-form">{privF.map(f => <label key={f.key} className="wide"><span>{f.label}</span><textarea value={priv[f.key]} placeholder={f.hint} onChange={e => setPriv(p => ({ ...p, [f.key]: e.target.value }))} rows={2} /></label>)}</div>
      </div>
      {(busy || msg) && <div className={busy ? 'ws-note-b' : 'ws-note-ok'}>{busy || msg}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button className="ws-primary" disabled={!!busy} onClick={() => save(embedded ? undefined : next)}>{embedded ? '保存' : '保存，下一步：岗位'}</button>
        {!embedded && <button className="ws-ghost" disabled={!!busy} onClick={next}>先跳过</button>}
      </div>
    </>
  );
}

function Roles({ d, reload, done, embedded }: { d: any; reload: () => void; done: () => void; embedded?: boolean }) {
  const noteF: F[] = d.fields.role;
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(''); const [msg, setMsg] = useState('');
  const [nw, setNw] = useState({ title: '', jd: '' }); const [open, setOpen] = useState<string | null>(null);
  const managed = new Set((d.roles || []).map((r: any) => r.job_id).filter(Boolean));
  const lib = (d.jobs || []).filter((j: any) => !managed.has(j.id) && (!q || j.title.toLowerCase().includes(q.toLowerCase()))).slice(0, 12);
  const add = async (body: any) => {
    setBusy('加岗位中…'); setMsg('');
    const j = await (await fetch('/api/ws/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json().catch(() => ({ ok: false, error: '网络错误' }));
    setBusy(''); if (!j.ok) { setMsg(j.error); return false; }
    setMsg(`已加入「${j.role.title}」${j.created_job ? '，JD 已写回平方岗位库（待审核）' : ''}${j.occupation ? `，对上职业库「${j.occupation.name}」` : '，职业库里暂时没有对应职业'}`); reload(); return true;
  };
  const saveNotes = async (id: string, notes: Record<string, string>) => { await fetch('/api/ws/roles', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, notes }) }); setMsg('备注已保存'); reload(); };
  const del = async (id: string) => { await fetch(`/api/ws/roles?id=${id}`, { method: 'DELETE' }); reload(); };
  return (
    <>
      <h1 className="ws-title">你要管哪些岗位</h1>
      <div className="ws-muted" style={{ marginBottom: 18, lineHeight: 1.7 }}>每个岗位就是一个招聘项目的起点。从平方岗位库里选本企业的岗位，或者贴一份新 JD 建岗位（<b>会写回平方岗位库</b>，待审核）。每个岗位可以写几句内部备注，AI 出题时会用到。</div>
      <div className="ws-box">
        <div className="ws-box-h">已加入 <span className="ws-chip-s">{d.roles.length} 个</span></div>
        {!d.roles.length && <div className="ws-muted" style={{ padding: '6px 2px 10px', fontSize: 13.5 }}>还没有，从下面选或新建。</div>}
        {d.roles.map((r: any) => <RoleRow key={r.id} r={r} noteF={noteF} open={open === r.id} toggle={() => setOpen(o => (o === r.id ? null : r.id))} save={n => saveNotes(r.id, n)} del={() => del(r.id)} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14, marginTop: 14 }} className="ws-two">
        <div className="ws-box">
          <div className="ws-box-h">平方岗位库里的本企业岗位 <span className="ws-chip-s">{(d.jobs || []).length} 个</span></div>
          <input className="ws-input sm" value={q} onChange={e => setQ(e.target.value)} placeholder="搜岗位名" />
          <div style={{ marginTop: 8 }}>{lib.length ? lib.map((j: any) => <div key={j.id} className="ws-libjob"><div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.title}</div><div className="ws-muted" style={{ fontSize: 12 }}>{[j.function, j.has_jd ? '有 JD' : '无 JD'].filter(Boolean).join(' · ')}</div></div><button className="ws-ghost sm" disabled={!!busy} onClick={() => add({ title: j.title, job_id: j.id })}>加入</button></div>) : <div className="ws-muted" style={{ fontSize: 13 }}>{(d.jobs || []).length ? '没有匹配的' : '平方岗位库里还没有本企业的岗位，用右边新建'}</div>}</div>
        </div>
        <div className="ws-box">
          <div className="ws-box-h">新建岗位 <span className="ws-chip-s">写回平方岗位库</span></div>
          <input className="ws-input sm" value={nw.title} onChange={e => setNw(n => ({ ...n, title: e.target.value }))} placeholder="岗位名，比如 供应链计划工程师" />
          <textarea className="ws-input sm" style={{ height: 150, padding: 10, marginTop: 8, resize: 'vertical' }} value={nw.jd} onChange={e => setNw(n => ({ ...n, jd: e.target.value }))} placeholder="贴 JD：职责、要求。只写岗位名也可以加入，但没有 JD 就不会写回岗位库" />
          <button className="ws-primary" style={{ marginTop: 8 }} disabled={!nw.title.trim() || !!busy} onClick={async () => { if (await add({ title: nw.title, jd_text: nw.jd })) setNw({ title: '', jd: '' }); }}>加入这个岗位</button>
        </div>
      </div>
      {(busy || msg) && <div className={busy ? 'ws-note-b' : 'ws-note-ok'}>{busy || msg}</div>}
      {!embedded && <div style={{ display: 'flex', gap: 10, marginTop: 16 }}><button className="ws-primary" onClick={done}>完成，进入工作台</button></div>}
    </>
  );
}

function RoleRow({ r, noteF, open, toggle, save, del }: { r: any; noteF: F[]; open: boolean; toggle: () => void; save: (n: Record<string, string>) => void; del: () => void }) {
  const [n, setN] = useState<Record<string, string>>(() => Object.fromEntries(noteF.map(f => [f.key, r.notes?.[f.key] || ''])));
  const filled = noteF.filter(f => r.notes?.[f.key]).length;
  return (
    <div className="ws-role">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}><b>{r.title}</b> <span className="ws-muted" style={{ fontSize: 12 }}>{[r.job_id ? '平方岗位库' : '仅工作台', r.occupation_id ? '已对上职业库' : null, filled ? `备注 ${filled}/${noteF.length}` : '还没写备注'].filter(Boolean).join(' · ')}</span></div>
        <button className="ws-ghost sm" onClick={toggle}>{open ? '收起' : '内部备注'}</button>
        <button className="ws-ghost sm" onClick={del} title="从工作台移除（不影响平方岗位库）">移除</button>
      </div>
      {open && <div className="ws-form" style={{ marginTop: 10 }}>{noteF.map(f => <label key={f.key} className="wide"><span>{f.label}</span><input value={n[f.key]} placeholder={f.hint} onChange={e => setN(x => ({ ...x, [f.key]: e.target.value }))} /></label>)}<div><button className="ws-primary" style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => save(n)}>保存备注</button></div></div>}
    </div>
  );
}
