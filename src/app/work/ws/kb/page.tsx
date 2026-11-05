'use client';

/**
 * 真活工作台 · 知识库（2026-11-05）：出任务背后的知识，平台给的（PGC：企业库画像、任务库）+ 自己攒的（UGC：补的企业介绍、岗位、过往的题、素材）。
 * 一个功能分 tab：企业 / 岗位 / 任务样本 / 素材。平台的资产（题目资产库、外部参照、训练样本、任务库上架）在「全站管理」，只给 admin。
 * 每样都能人工改，也能「问助理」——助理出任务前会先查这里（kb_lookup），对话里讲清的企业 / 岗位会整理存进来（kb_save，人只校正）。
 */
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { askHref, STATUS, when } from '../ask';
import { Empty, Head } from '../ui';

type Tab = 'company' | 'role' | 'sample' | 'asset';
const TABS: [Tab, string, string, string][] = [
  ['company', '企业', 'Companies', '出过题的企业和你补的介绍；企业库里的画像只读。'],
  ['role', '岗位', 'Roles', '要找什么样的人、看重什么；出任务时助理照这里来。'],
  ['sample', '任务样本', 'Samples', '你交过的过往题 / 内部考题，和平台任务库。'],
  ['asset', '素材', 'Materials', '出过的题里传过的文件，能拿去出新题。'],
];

export default function Page() { return <Suspense><Kb /></Suspense>; }

function Kb() {
  const sp = useSearchParams(); const router = useRouter();
  const tab = (sp.get('tab') as Tab) || 'company';
  const tabs = TABS;
  return (
    <div className="wws-page">
      <Head eyebrow="KNOWLEDGE" zh="知识库" en="What your tasks are made of"
        lead="出任务用到的东西都攒在这里：存一次，以后跟助理说一句就能用上。AI 整理的标「AI 整理」，你改一下就算校正过。" />
      <div className="wws-tabs" role="tablist">
        {tabs.map(([k, t, en]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => router.replace(`/work/ws/kb?tab=${k}`)}>{t}<small>{en}</small></button>)}
      </div>
      <p className="wws-muted" style={{ margin: '-4px 0 16px' }}>{tabs.find(x => x[0] === tab)?.[3]}</p>
      {tab === 'company' && <Entities kind="company" />}
      {tab === 'role' && <Entities kind="role" />}
      {tab === 'sample' && <Samples />}
      {tab === 'asset' && <Assets />}
    </div>
  );
}

/** 企业 / 岗位：出过题的自动归进来 + 自己存的；正文可直接改 */
function Entities({ kind }: { kind: 'company' | 'role' }) {
  const [items, setItems] = useState<any[] | null>(null); const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => fetch(`/api/admin/work/kb?tab=${kind}`, { cache: 'no-store' }).then(r => r.json()).then(j => setItems(j.ok ? j.items : [])).catch(() => setItems([])), [kind]);
  useEffect(() => { setItems(null); load(); }, [load]);
  const save = async (x: any) => { setErr(''); const j = await (await fetch('/api/admin/work/kb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, ...x }) })).json(); if (!j.ok) { setErr(j.error); return false; } load(); return true; };
  const del = async (id: string) => { await fetch(`/api/admin/work/kb?id=${id}`, { method: 'DELETE' }); load(); };
  const C = kind === 'company';
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setAdding(a => !a)} className="wws-btn p">＋ {C ? '加一家企业' : '新建岗位'}</button>
        <Link href={askHref(C ? '帮我把一家企业的资料整理进知识库，我先说说这家企业：' : '帮我在知识库里建一个岗位，我说说要找什么样的人：', { fill: true })}><button className="wws-btn">跟助理说着建</button></Link>
        {err && <span style={{ color: '#b42318', fontSize: 13 }}>{err}</span>}
      </div>
      {adding && <Editor kind={kind} onCancel={() => setAdding(false)} onSave={async x => { if (await save(x)) setAdding(false); }} />}
      {items == null && <div className="wws-muted">读取中…</div>}
      {items && !items.length && !adding && <div className="wws-card"><Empty>{C ? '还没有。出过题的企业会自动出现在这里，也可以先加一家。' : '还没有。出过题的岗位会自动出现在这里，也可以先建一个。'}</Empty></div>}
      {(items || []).map((x, i) => <Card key={(x.kb?.id || '') + i} x={x} kind={kind} onSave={save} onDel={del} />)}
    </div>
  );
}

function Card({ x, kind, onSave, onDel }: { x: any; kind: 'company' | 'role'; onSave: (x: any) => Promise<boolean>; onDel: (id: string) => void }) {
  const [edit, setEdit] = useState(false);
  const C = kind === 'company';
  const name = C ? x.name : x.title;
  const body = x.kb?.body || '';
  return (
    <div className="wws-card lined pad">
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <b style={{ font: '800 17px var(--serif)', letterSpacing: '.03em' }}>{name}</b>
        <span className="wws-muted">{C ? [x.industry, x.city, x.scale].filter(Boolean).join(' · ') : x.company}</span>
        {x.kb?.source === 'ai' && <span className="wws-tag ok">AI 整理</span>}
        {C && !x.in_library && <span className="wws-tag warn">企业库里没有</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          {!edit && <button className="wws-back" style={lnkBtn} onClick={() => setEdit(true)}>{body ? '改' : C ? '补介绍' : '写要找什么样的人'}</button>}
          {x.kb && !edit && <button style={{ ...lnkBtn, color: 'var(--ink3)' }} onClick={() => { if (confirm('删掉你存的这条？出过的题不受影响')) onDel(x.kb.id); }}>删</button>}
          <Link href={askHref(C ? `用知识库里「${name}」的资料出一道真活` : `用知识库里「${x.company ? x.company + ' · ' : ''}${name}」这个岗位出一道真活`)}><button className="wws-ask">用它出一道</button></Link>
        </span>
      </div>
      {C && x.one_sentence && <div style={{ fontSize: 13.5, color: 'var(--ink2)', marginTop: 8, lineHeight: 1.75 }}><span className="wws-tag mute" style={{ marginRight: 8 }}>企业库</span>{x.one_sentence}{x.completeness != null && <span className="wws-muted"> · 画像完整度 {x.completeness}</span>}</div>}
      {edit ? <Editor kind={kind} init={{ id: x.kb?.id, title: name, body, company: x.company, company_id: x.company_id, data: x.kb?.data }} onCancel={() => setEdit(false)} onSave={async v => { if (await onSave(v)) setEdit(false); }} />
        : body ? <div style={{ fontSize: 14, lineHeight: 1.85, marginTop: 8, whiteSpace: 'pre-wrap' }}><span className="wws-tag acc" style={{ marginRight: 8 }}>{C ? '你补的' : '要找的人'}</span>{body}{!C && x.kb?.data && (x.kb.data.years || x.kb.data.minutes) ? <span className="wws-muted">（{[x.kb.data.years, x.kb.data.minutes && `常用 ${x.kb.data.minutes} 分钟`].filter(Boolean).join(' · ')}）</span> : null}</div>
        : <div className="wws-muted" style={{ marginTop: 8 }}>{C ? '还没补介绍：出任务时助理只能用企业库里的画像。' : '还没写要找什么样的人。'}</div>}
      {x.tasks?.length > 0 && <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5 }}><span className="wws-muted">出过 {x.tasks.length} 道</span>{x.tasks.slice(0, 6).map((t: any) => <a key={t.task_id} href={`/work/${t.token}/owner?k=${encodeURIComponent(t.k || '')}`} target="_blank" rel="noreferrer" className="wws-chip" style={{ fontSize: 12, padding: '2px 10px' }}>{t.title}{t.status && t.status !== 'published' ? ` · ${STATUS[t.status]?.[0] || ''}` : ''}</a>)}</div>}
    </div>
  );
}

function Editor({ kind, init, onSave, onCancel }: { kind: 'company' | 'role'; init?: any; onSave: (x: any) => void; onCancel: () => void }) {
  const C = kind === 'company';
  const [v, setV] = useState({ id: init?.id, title: init?.title || '', company: init?.company || '', company_id: init?.company_id || null, body: init?.body || '', years: init?.data?.years || '', minutes: init?.data?.minutes || '' });
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 12, padding: 14, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="wws-in" value={v.title} onChange={e => setV({ ...v, title: e.target.value })} placeholder={C ? '企业名' : '岗位名，或「要找一个能……的人」'} style={{ flex: 2, minWidth: 200 }} />
        {!C && <input className="wws-in" value={v.company} onChange={e => setV({ ...v, company: e.target.value })} placeholder="所属企业（选填）" style={{ flex: 1, minWidth: 160 }} />}
      </div>
      <textarea className="wws-in" value={v.body} onChange={e => setV({ ...v, body: e.target.value })} rows={4} placeholder={C ? '做什么、多大、最近在推进什么、为什么招人。出任务时助理照这个写背景。' : '要找什么样的人、看重什么、哪些是硬门槛。比如：能把销售数据理清楚、说出问题在哪；会用 AI 但结论自己核。'} style={{ resize: 'vertical', lineHeight: 1.75 }} />
      {!C && <div style={{ display: 'flex', gap: 8 }}><input className="wws-in" value={v.years} onChange={e => setV({ ...v, years: e.target.value })} placeholder="经验段，如 应届 / 3–5 年" style={{ flex: 1 }} /><input className="wws-in" value={v.minutes} onChange={e => setV({ ...v, minutes: e.target.value.replace(/\D/g, '') })} placeholder="常用时长（分钟）" style={{ flex: 1 }} /></div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={busy || !v.title.trim()} className="wws-btn p" onClick={async () => { setBusy(true); await onSave({ id: v.id, title: v.title, body: v.body, company: v.company, company_id: v.company_id, data: C ? {} : { years: v.years || undefined, minutes: v.minutes ? Number(v.minutes) : undefined } }); setBusy(false); }}>{busy ? '存…' : '存'}</button>
        <button className="wws-btn" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

/** 任务样本：自己交的（UGC，可加可删）+ 平台任务库（PGC，照着出） */
function Samples() {
  const [mine, setMine] = useState<any[] | null>(null); const [lib, setLib] = useState<any[] | null>(null);
  const [text, setText] = useState(''); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const load = useCallback(() => fetch('/api/admin/work/samples?mine=1', { cache: 'no-store' }).then(r => r.json()).then(j => setMine(j.ok ? j.samples : [])).catch(() => setMine([])), []);
  useEffect(() => { load(); fetch('/api/work/library').then(r => r.json()).then(j => setLib(j.ok ? j.items : [])).catch(() => setLib([])); }, [load]);
  const add = async (body: any) => { setBusy('读题中（约 1 分钟）…'); setErr(''); const j = await (await fetch('/api/admin/work/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json().catch(() => ({ ok: false, error: '没传上' })); setBusy(''); if (!j.ok) { setErr(j.error); return; } setText(''); load(); };
  const file = async (f: File) => { const b64 = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.readAsDataURL(f); }); add({ filename: f.name, file: b64 }); };
  return (
    <div style={{ display: 'grid', gap: 26 }}>
      <section>
        <div className="wws-card-h"><h2 className="wws-h2">我交的过往题 / 内部考题<small>Your own</small></h2></div>
        <p className="wws-muted" style={{ margin: '0 0 10px' }}>只给你自己出任务时参照：题型、推进、算法照着来，故事和数字换成新企业。</p>
        <div className="wws-card pad" style={{ marginBottom: 12 }}>
          <textarea className="wws-in" value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="把一道过往的题整段贴进来（200 字以上），或者传文件（PDF / Word / TXT）" style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.75 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <button className="wws-btn p" disabled={!!busy || text.trim().length < 200} onClick={() => add({ text })}>存成样本</button>
            <label className="wws-btn">传文件<input type="file" accept=".pdf,.docx,.txt,.md" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) file(f); e.target.value = ''; }} /></label>
            {busy && <span className="wws-muted">{busy}</span>}{err && <span style={{ color: '#b42318', fontSize: 13 }}>{err}</span>}
          </div>
        </div>
        {mine == null ? <div className="wws-muted">读取中…</div> : !mine.length ? <div className="wws-muted">还没有。</div> :
          <div style={{ display: 'grid', gap: 8 }}>{mine.map(x => <div key={x.id} className="wws-card pad" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}><b style={{ font: '800 15.5px var(--serif)' }}>{x.title}</b> <span className="wws-muted">{[x.industry, x.problem_type, `${x.stages} 步`].filter(Boolean).join(' · ')}</span><div style={{ fontSize: 13.5, color: 'var(--ink2)', marginTop: 4, lineHeight: 1.75 }}>{x.summary}</div></div>
            <Link href={askHref(`照我知识库里的样本「${x.title}」的路数出一道新任务`)}><button className="wws-ask">照它出</button></Link>
            <button style={{ ...lnkBtn, color: 'var(--ink3)' }} onClick={async () => { if (!confirm('删掉这份样本？')) return; await fetch(`/api/admin/work/samples?id=${x.id}`, { method: 'DELETE' }); load(); }}>删</button>
          </div>)}</div>}
      </section>
      <section>
        <div className="wws-card-h"><h2 className="wws-h2">平台任务库<small>From the library · {lib?.length ?? '…'}</small></h2><Link href="/work/ws/library" className="wws-back" style={{ marginLeft: 'auto' }}>完整任务库 →</Link></div>
        <p className="wws-muted" style={{ margin: '0 0 10px' }}>挑一道原题直出换成你们公司，或者只做参考。</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 10 }}>
          {(lib || []).slice(0, 24).map(x => <div key={x.id} className="wws-card pad">
            <div style={{ font: '800 15px/1.5 var(--serif)' }}>{x.title}</div><div className="wws-muted" style={{ margin: '4px 0 10px' }}>{[x.industry, x.role].filter(Boolean).join(' · ')}{x.time_minutes ? ` · ${x.time_minutes} 分钟` : ''}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Link href={askHref(`我想用任务库里的「${x.title}」（编号 ${x.id}），原题直出，换成我们公司。`)}><button className="wws-ask">原题直出</button></Link>
              <Link href={askHref(`我想用任务库里的「${x.title}」（编号 ${x.id}），只做参考，照它的思路出一道。`)}><button className="wws-ask">参考它出</button></Link>
            </div>
          </div>)}
        </div>
      </section>
    </div>
  );
}

function Assets() {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { fetch('/api/admin/work/kb?tab=asset', { cache: 'no-store' }).then(r => r.json()).then(j => setItems(j.ok ? j.items : [])).catch(() => setItems([])); }, []);
  return (
    <div className="wws-card" style={{ overflowX: 'auto' }}>
      <table className="wws-table t-assets">
        <thead><tr>{[['FILE', '文件'], ['USED IN', '用在'], ['COMPANY', '企业'], ['DATE', '时间'], ['', '']].map(([e, z], i) => <th key={i}>{e}<small>{z}</small></th>)}</tr></thead>
        <tbody>
          {items == null && <tr><td colSpan={5} className="wws-muted">读取中…</td></tr>}
          {items && !items.length && <tr><td colSpan={5}><Empty>还没有。出任务时传给候选人的数据表、图纸、截图会攒在这里。</Empty></td></tr>}
          {(items || []).map(x => <tr key={x.url}>
            <td><a className="t" href={x.url} target="_blank" rel="noreferrer">📎 {x.name}</a></td>
            <td><a href={`/work/${x.token}/owner?k=${encodeURIComponent(x.k || '')}`} target="_blank" rel="noreferrer" style={{ color: 'var(--ink2)', textDecoration: 'none' }}>{x.task_title}</a></td>
            <td className="wws-muted">{x.company}</td>
            <td className="wws-muted" style={{ whiteSpace: 'nowrap' }}>{when(x.at)}</td>
            <td style={{ textAlign: 'right' }}><Link href={askHref(`用这份素材出一道新任务\n【文件】${x.name}｜${x.url}｜${x.mime || ''}`, { fill: true })}><button className="wws-ask">拿去出新题</button></Link></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  );
}

const lnkBtn: React.CSSProperties = { border: 0, background: 'transparent', font: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, color: 'var(--acc)' };
