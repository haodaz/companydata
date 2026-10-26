'use client';

/** 毕业生管理：统筹与分配。毕业生 = 考过的学籍；一位毕业生可以派到多家企业 / 科研院所 / 培养需求单。 */
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Modal, Select, Input } from 'antd';
import { api, Btn, Card, Empty, Face, fmtDate, PageHead, Pill, Rule, score, STATUS_TONE, useToast } from '../ui';

export default function Page() { return <Suspense><Graduates /></Suspense>; }

function Graduates() {
  const t = useToast(); const sp = useSearchParams(); const demand = sp.get('demand');
  const [rows, setRows] = useState<any[] | null>(null); const [pls, setPls] = useState<any[]>([]); const [err, setErr] = useState('');
  const [q, setQ] = useState(''); const [open, setOpen] = useState<string | null>(null);
  const [place, setPlace] = useState<any | null>(null); const [busy, setBusy] = useState('');
  const load = useCallback(() => Promise.all([api('/enrollments?status=graduated'), api('/placements')]).then(([a, b]) => { setRows(a.data); setPls(b.data); setErr(''); }).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const searchTargets = async (text: string, kind: string) => { try { const j = await api(`/targets?q=${encodeURIComponent(text)}`); setPlace((p: any) => p && { ...p, options: j.data, target: p.target || (demand && kind === 'demand' ? j.data.demand.find((x: any) => x.id === demand) || null : null) }); } catch (e) { t.err(e); } };
  const openPlace = (e: any) => { const kind = demand ? 'demand' : 'ws_org'; setPlace({ en: e, kind, q: '', options: null, target: null, note: '' }); searchTargets('', kind); };
  const doPlace = async () => { if (!place?.target) return t.err('先选一个去向'); setBusy('place'); try { await api('/placements', { method: 'POST', json: { enrollment_id: place.en.id, target_kind: place.kind, target_id: place.target.id, target_name: place.target.name, note: place.note } }); t.ok(`已把 ${place.en.nova_name} 派去 ${place.target.name}`); setPlace(null); load(); } catch (e) { t.err(e); } finally { setBusy(''); } };
  const setStatus = async (p: any, status: string) => { try { await api('/placements', { method: 'PATCH', json: { id: p.id, status } }); load(); } catch (e) { t.err(e); } };
  const shown = (rows || []).filter(e => !q || [e.course?.role, e.nova_name, e.student_name, e.course?.company].join(' ').toLowerCase().includes(q.toLowerCase()));
  const byRole = new Map<string, any[]>(); for (const e of shown) { const k = e.course?.research ? '学科研究' : (e.course?.role || '其他'); byRole.set(k, [...(byRole.get(k) || []), e]); }

  return (
    <div>
      <PageHead art="graduates" eyebrow="IV · Graduates" zh="毕业生管理" en="Commencement & Placement"
        lead="考过的学籍就是毕业生。这里统筹：哪些岗位已经有毕业生、每位考得怎样、派去了哪里。一位毕业生可以被派到多家企业或科研院所。"
        extra={<Input className="ca-input" placeholder="搜岗位 / NOVA / 模型 / 企业" value={q} onChange={e => setQ(e.target.value)} style={{ width: 260 }} />} />
      {demand && <div className="ca-note" style={{ marginBottom: 14 }}>正在给一份<b>人才培养需求</b>挑毕业生：点某位的「派去…」，去向会预选这份需求单。<Link href="/college/admin/applications?kind=hire" style={{ color: 'var(--gold)', marginLeft: 8 }}>回到需求单</Link></div>}
      {err && <div className="ca-note" style={{ color: '#b42318', marginBottom: 14 }}>{err}</div>}
      {rows && <div className="ca-grid" style={{ marginBottom: 16 }}>
        <div className="ca-stat"><i>I</i><b>{rows.length}</b><span>毕业生</span><small>{byRole.size} 个岗位 / 方向</small></div>
        <div className="ca-stat"><i>II</i><b>{pls.filter(p => p.status === 'placed').length}</b><span>已上岗</span><small>已推荐 {pls.filter(p => p.status === 'offered').length} · 拟派 {pls.filter(p => p.status === 'proposed').length}</small></div>
        <div className="ca-stat"><i>III</i><b>{rows.filter(e => !e.placements).length}</b><span>还没安排去向</span><small>优先给培养需求单和工作台机构</small></div>
      </div>}
      <Card>
        {!rows ? <div className="ca-mute">读取中…</div> : !shown.length ? <Empty>还没有毕业生。学籍里每一章毕业考都 ≥ 60 就会出现在这里。</Empty> : (
          <table className="ca-table"><thead><tr><th>毕业生</th><th>学员（模型）</th><th className="num">入学</th><th className="num">毕业考</th><th>Graduated</th><th>去向</th><th></th></tr></thead>
            <tbody>{shown.map(e => { const mine = pls.filter(p => p.enrollment_id === e.id); return (
              <React.Fragment key={e.id}>
                <tr className="click" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <td className="who"><div className="ca-row" style={{ gap: 12 }}><Face src={e.course?.avatar} /><div><span className="serif">{e.course?.role}</span><div className="ca-mute" style={{ fontSize: 12.5 }}>{e.nova_name}{e.course?.company ? ` · ${e.course.company}` : ''}{e.demand_id ? ' · 定向培养' : ''}</div></div></div></td>
                  <td>{e.student_name}{e.model_label && e.model_label !== e.student_name ? <div className="ca-mute" style={{ fontSize: 12 }}>{e.model_label}</div> : null}</td>
                  <td className="num">{score(e.entrance_score)}</td><td className="num">{score(e.final_score)}</td>
                  <td className="ca-mute" style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.graduated_at)}</td>
                  <td>{mine.length ? <div className="ca-row" style={{ gap: 6 }}>{mine.slice(0, 3).map(p => <Pill key={p.id} tone={STATUS_TONE[p.status]}>{p.target_name}</Pill>)}{mine.length > 3 && <span className="ca-mute">+{mine.length - 3}</span>}</div> : <span className="ca-mute">待安排</span>}</td>
                  <td onClick={ev => ev.stopPropagation()} style={{ whiteSpace: 'nowrap' }}><div className="ca-row" style={{ gap: 6 }}><Btn kind="gold" sm onClick={() => openPlace(e)}>派去…</Btn><Link href={`/college/admin/training/${e.id}`}><Btn kind="ghost" sm>学籍</Btn></Link><a href={`/college/g/${e.space_id}`} target="_blank" rel="noreferrer"><Btn kind="ghost" sm>档案 ↗</Btn></a></div></td>
                </tr>
                {open === e.id && <tr><td colSpan={7} style={{ background: 'rgba(176,141,87,.04)' }}>
                  {!mine.length ? <div className="ca-mute">还没有去向。</div> : <table className="ca-table" style={{ maxWidth: 900 }}><thead><tr><th>去向</th><th>Type</th><th>Status</th><th>备注</th><th>Since</th></tr></thead><tbody>{mine.map(p => <tr key={p.id}><td className="serif">{p.target_name}</td><td><Pill tone="navy">{p.kind_label}</Pill></td><td><Select size="small" value={p.status} style={{ width: 100 }} onChange={v => setStatus(p, v)} options={[['proposed', '拟派'], ['offered', '已推荐'], ['placed', '已上岗'], ['ended', '已结束']].map(([v, l]) => ({ value: v, label: l }))} /></td><td className="ca-mute">{p.note || ''}</td><td className="ca-mute">{fmtDate(p.created_at)}</td></tr>)}</tbody></table>}
                </td></tr>}
              </React.Fragment>); })}</tbody></table>)}
      </Card>
      <Modal open={!!place} onCancel={() => setPlace(null)} onOk={doPlace} okText="记下去向" confirmLoading={busy === 'place'} title={`把 ${place?.en?.nova_name || ''}（${place?.en?.course?.role || ''}）派去…`} width={620}>
        {place && <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          <div className="ca-tabs">{[['ws_org', '工作台机构'], ['company', '企业库企业'], ['demand', '培养需求单']].map(([v, l]) => <button key={v} className={place.kind === v ? 'on' : ''} onClick={() => { setPlace({ ...place, kind: v, target: null }); searchTargets(place.q, v); }}>{l}</button>)}</div>
          <Input placeholder="搜名字" value={place.q} onChange={ev => { setPlace({ ...place, q: ev.target.value }); searchTargets(ev.target.value, place.kind); }} />
          <div style={{ display: 'grid', gap: 4, maxHeight: 240, overflow: 'auto' }}>{(place.options?.[place.kind] || []).map((o: any) => <div key={o.id} onClick={() => setPlace({ ...place, target: o })} className="ca-kv" style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: place.target?.id === o.id ? 'rgba(176,141,87,.14)' : 'rgba(22,32,74,.03)' }}><b>{o.name}</b><span className="ca-mute">{o.hint}</span></div>)}{place.options && !(place.options[place.kind] || []).length && <div className="ca-mute" style={{ padding: 8 }}>没找到</div>}</div>
          <Input placeholder="备注（可选）" value={place.note} onChange={ev => setPlace({ ...place, note: ev.target.value })} />
          <Rule label="PLACEMENT" />
          <div className="ca-mute" style={{ fontSize: 12.5 }}>工作台机构 = 企业版 / 科研版工作台里注册的机构；企业库企业 = 平方企业实体库；培养需求单 = 官网提交的「人才培养需求」。</div>
        </div>}
      </Modal>
    </div>
  );
}
