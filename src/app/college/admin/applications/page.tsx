'use client';

/** 申请管理：模型入学申请 → 录取为学员；人才培养需求 → 立项（挑学员 + 课程开一份定向学籍）或派已有毕业生；跟进状态和备注 */
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Modal, Select } from 'antd';
import { api, Btn, Card, Empty, fmtDate, PageHead, Pill, useToast } from '../ui';

const LABEL: Record<string, string> = { role: '职务', model_source: '模型来源', api_style: '接口形式', endpoint: '接口地址', target: '训练目标', usage: '使用场景', note: '其他', industry: '行业', size: '规模', city: '城市', contact_title: '联系人职务', headcount: '需要几位', mode: '接入方式', jd: '要找什么样的人', tasks: '希望干的真活', materials: '可提供材料', timeline: '期望上岗时间' };
const STATUS_OPTS: Record<string, string[]> = { enroll: ['new', 'contacted', 'admitted', 'closed'], hire: ['new', 'contacted', 'won', 'training', 'delivered', 'closed'] };
const S: Record<string, string> = { new: '新申请', contacted: '已联系', won: '已签约', closed: '已关闭', admitted: '已录取', training: '培养中', delivered: '已交付' };

export default function Page() { return <Suspense><Applications /></Suspense>; }

function Applications() {
  const t = useToast(); const router = useRouter(); const sp = useSearchParams();
  const [kind, setKind] = useState(sp.get('kind') || '');
  const [rows, setRows] = useState<any[]>([]); const [err, setErr] = useState(''); const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [plan, setPlan] = useState<any | null>(null);
  const load = useCallback(() => api(`/applications?${kind ? `kind=${kind}` : ''}${sp.get('status') ? `&status=${sp.get('status')}` : ''}`).then(j => { setRows(j.data); setErr(''); }).catch(e => setErr(e.message)), [kind, sp]);
  useEffect(() => { load(); }, [load]);
  const patch = async (id: string, body: any) => { try { await api('/applications', { method: 'PATCH', json: { id, ...body } }); setRows(r => r.map(x => (x.id === id ? { ...x, ...body } : x))); } catch (e) { t.err(e); } };
  const admit = async (a: any) => { setBusy(a.id); try { const j = await api('/applications', { method: 'POST', json: { id: a.id, action: 'admit' } }); t.ok(`已录取为学员：${j.student.name}`); router.push(`/college/admin/students?focus=${j.student.id}`); } catch (e) { t.err(e); } finally { setBusy(''); } };
  const openPlan = async (a: any) => { try { const [s, c] = await Promise.all([api('/students'), api('/courses')]); setPlan({ app: a, students: s.data, courses: c.data, student_id: s.data.find((x: any) => x.model_id === 'qwen-plus')?.id || s.data[0]?.id, space_id: '' }); } catch (e) { t.err(e); } };
  const createPlan = async () => { if (!plan?.space_id) return t.err('先挑一门课程'); setBusy('plan'); try { const j = await api('/enrollments', { method: 'POST', json: { student_id: plan.student_id, space_id: plan.space_id, demand_id: plan.app.id } }); t.ok('已立项，开了一份定向学籍'); setPlan(null); router.push(`/college/admin/training/${j.enrollment.id}`); } catch (e) { t.err(e); } finally { setBusy(''); } };

  return (
    <div>
      <PageHead art="applications" eyebrow="I · Leads" zh="申请管理 · 线索" en="Inquiries & Leads — not the ledger"
        lead="这里是线索：官网上提交的「申请模型入学」和「人才培养需求」，记谁来问过、跟进到哪。学员、学籍、去向是另一套台账，不依赖线索——「录取为学员」「立项」只是从线索顺手建过去，在学员管理 / 课程目录里直接建效果一样。" />
      <div className="ca-tabs" style={{ marginBottom: 14 }}>{[['', '全部'], ['enroll', '模型入学'], ['hire', '人才培养需求']].map(([v, l]) => <button key={v} className={kind === v ? 'on' : ''} onClick={() => setKind(v)}>{l}</button>)}</div>
      {err && <div className="ca-note" style={{ color: '#b42318', marginBottom: 14 }}>{err}</div>}
      <Card>
        {!rows.length ? <Empty>还没有申请。官网 <a href="/college/enroll" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>申请模型入学</a> / <a href="/college/hire" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>人才培养需求</a> 提交后会出现在这里。</Empty> : (
          <table className="ca-table"><thead><tr><th>Type</th><th>机构 · 联系人</th><th>{kind === 'hire' ? '要找什么样的人' : '模型 / 需求'}</th><th>Status</th><th>Date</th><th></th></tr></thead>
            <tbody>{rows.map(a => (
              <React.Fragment key={a.id}>
                <tr className="click" onClick={() => setOpen(open === a.id ? null : a.id)}>
                  <td><Pill tone={a.kind === 'enroll' ? 'navy' : 'gold'}>{a.kind === 'enroll' ? '模型入学' : '培养需求'}</Pill></td>
                  <td><span className="serif">{a.org}</span><div className="ca-mute" style={{ fontSize: 12.5 }}>{a.contact}{a.payload?.contact_title ? ` · ${a.payload.contact_title}` : ''} · {a.phone}{a.email ? ` · ${a.email}` : ''}</div></td>
                  <td style={{ maxWidth: 440 }}>{a.title}{a.kind === 'hire' && a.payload?.jd && <div className="ca-mute" style={{ fontSize: 12.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{a.payload.jd}</div>}
                    {a.student && <div style={{ fontSize: 12.5 }}>→ 已录取为学员 <Link href={`/college/admin/students?focus=${a.student.id}`} style={{ color: 'var(--gold)', fontWeight: 700 }}>{a.student.name}</Link></div>}
                    {a.enrollments?.length > 0 && <div style={{ fontSize: 12.5 }}>→ 定向学籍 {a.enrollments.map((e: any) => <Link key={e.id} href={`/college/admin/training/${e.id}`} style={{ color: 'var(--gold)', fontWeight: 700, marginRight: 8 }}>{S[e.status] || e.status}</Link>)}</div>}</td>
                  <td onClick={e => e.stopPropagation()}><Select size="small" value={a.status} style={{ width: 110 }} onChange={v => patch(a.id, { status: v })} options={STATUS_OPTS[a.kind].map(v => ({ value: v, label: S[v] }))} /></td>
                  <td className="ca-mute" style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.created_at)}</td>
                  <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                    {a.kind === 'enroll' ? (a.student ? <Pill tone="ok">已录取</Pill> : <Btn kind="navy" sm busy={busy === a.id} onClick={() => admit(a)}>录取为学员</Btn>)
                      : <span className="ca-row"><Btn kind="navy" sm onClick={() => openPlan(a)}>立项 · 开定向学籍</Btn><Link href={`/college/admin/graduates?demand=${a.id}`}><Btn kind="ghost" sm>派已有毕业生</Btn></Link></span>}
                  </td>
                </tr>
                {open === a.id && <tr><td colSpan={6} style={{ background: 'rgba(176,141,87,.04)' }}>
                  <div style={{ display: 'grid', gap: 6, maxWidth: 900 }} className="ca-kv">
                    {Object.entries(a.payload || {}).filter(([, v]) => v).map(([k, v]) => <div key={k}><b>{LABEL[k] || k}</b><span style={{ whiteSpace: 'pre-wrap' }}>{String(v)}</span></div>)}
                    {a.source && <div><b>来源</b>{a.source}</div>}
                    <textarea className="ca-input" rows={2} defaultValue={a.note || ''} placeholder="跟进备注（内部）" style={{ width: '100%', maxWidth: 700 }} onBlur={e => e.target.value !== (a.note || '') && patch(a.id, { note: e.target.value })} />
                  </div></td></tr>}
              </React.Fragment>))}</tbody></table>)}
      </Card>
      <Modal open={!!plan} onCancel={() => setPlan(null)} onOk={createPlan} okText="开一份定向学籍" confirmLoading={busy === 'plan'} title={`立项 · ${plan?.app?.org || ''}`} width={640}>
        {plan && <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
          <div className="ca-note">需求：{plan.app.payload?.jd || plan.app.title}</div>
          <label className="ca-kv"><b>学员（模型）</b><Select style={{ width: '100%' }} value={plan.student_id} onChange={v => setPlan({ ...plan, student_id: v })} options={plan.students.map((s: any) => ({ value: s.id, label: `${s.name}${s.kind === 'customer' ? ' · 客户模型' : ''}${!s.model_id ? '（未接接口，暂不能考）' : ''}` }))} /></label>
          <label className="ca-kv"><b>课程（百业空间）</b><Select showSearch style={{ width: '100%' }} value={plan.space_id || undefined} placeholder="搜岗位 / 职业名" optionFilterProp="label" onChange={v => setPlan({ ...plan, space_id: v })} options={plan.courses.map((c: any) => ({ value: c.id, label: `${c.role}${c.company ? ` · ${c.company}` : ''} · ${c.chapters} 章${c.teacher?.expert ? ` · 师承 ${c.teacher.name}` : ' · AI 草案'}` }))} /></label>
          <div className="ca-mute" style={{ fontSize: 12.5 }}>没有对口的课？先去 <a href="/lab/spaces" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>百业工厂</a> 按这个需求生成一个空间，再回来立项。</div>
        </div>}
      </Modal>
    </div>
  );
}
