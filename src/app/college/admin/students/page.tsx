'use client';

/** 学员管理：学员 = 模型。平台自己的大模型自动在册；客户送来的模型从入学申请录取或手工登记。点一位看学籍，给 TA 录一门课。 */
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Modal, Select, Input } from 'antd';
import { api, Btn, Card, Empty, Face, PageHead, Pill, Rule, score, STATUS_TONE, useToast } from '../ui';

export default function Page() { return <Suspense><Students /></Suspense>; }

function Students() {
  const t = useToast(); const router = useRouter(); const sp = useSearchParams();
  const [rows, setRows] = useState<any[]>([]); const [models, setModels] = useState<any[]>([]); const [err, setErr] = useState('');
  const [focus, setFocus] = useState<string | null>(sp.get('focus'));
  const [ens, setEns] = useState<any[] | null>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [enroll, setEnroll] = useState<{ student: any; space_id: string } | null>(null);
  const [add, setAdd] = useState<any | null>(null);
  const [busy, setBusy] = useState('');
  // 平台 / 客户两类学员分标签（2026-10-26）：默认看平台；有客户学员时先看客户
  const [tab, setTab] = useState<'platform' | 'customer' | null>(null);
  const load = useCallback(() => api('/students').then(j => { setRows(j.data); setModels(j.models); setErr(''); }).catch(e => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!focus) { setEns(null); return; } api(`/enrollments?student_id=${focus}`).then(j => setEns(j.data)).catch(e => t.err(e)); }, [focus]);  // eslint-disable-line react-hooks/exhaustive-deps
  const openEnroll = async (s: any) => { try { if (!courses.length) setCourses((await api('/courses')).data); setEnroll({ student: s, space_id: '' }); } catch (e) { t.err(e); } };
  const doEnroll = async () => { if (!enroll?.space_id) return t.err('先挑一门课'); setBusy('enroll'); try { const j = await api('/enrollments', { method: 'POST', json: { student_id: enroll.student.id, space_id: enroll.space_id } }); t.ok('已录入这门课'); setEnroll(null); router.push(`/college/admin/training/${j.enrollment.id}`); } catch (e) { t.err(e); } finally { setBusy(''); } };
  const doAdd = async () => { setBusy('add'); try { const j = await api('/students', { method: 'POST', json: { ...add, kind: 'customer' } }); t.ok('已登记'); setAdd(null); load(); setFocus(j.student.id); } catch (e) { t.err(e); } finally { setBusy(''); } };
  const setModel = async (s: any, model_id: string | null) => { try { await api('/students', { method: 'PATCH', json: { id: s.id, model_id } }); t.ok('已更新接口'); load(); } catch (e) { t.err(e); } };
  const cur = rows.find(r => r.id === focus);
  const platform = rows.filter(r => r.kind === 'platform'), customer = rows.filter(r => r.kind === 'customer');
  const view = tab || (customer.length ? 'customer' : 'platform');
  const list = view === 'platform' ? platform : customer;

  const Row = ({ s }: { s: any }) => (
    <tr className="click" onClick={() => setFocus(focus === s.id ? null : s.id)} style={focus === s.id ? { background: 'rgba(176,141,87,.06)' } : undefined}>
      <td><span className="serif">{s.name}</span>{s.kind === 'customer' && <div className="ca-mute" style={{ fontSize: 12.5 }}>{[s.org, s.contact].filter(Boolean).join(' · ')}</div>}</td>
      <td>{s.model_id ? <span className="ca-mute" style={{ fontSize: 12.5 }}>{s.model_label}</span> : <Pill tone="warn">未接接口</Pill>}</td>
      <td className="num">{s.enrollments}</td><td className="num">{s.active}</td><td className="num">{s.graduated}</td>
      <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}><Btn kind="navy" sm onClick={() => openEnroll(s)}>录一门课</Btn></td>
    </tr>
  );
  return (
    <div>
      <PageHead art="students" eyebrow="Students" zh="学员管理" en="The Student Body — every student is a model"
        lead="一个模型是一位学员；上不同的课，就成为不同的毕业生。平台自己的大模型自动在册；客户送来的模型从入学申请录取，或在这里登记。"
        extra={<Btn kind="gold" onClick={() => setAdd({ name: '', org: '', contact: '', api_style: '', endpoint: '', model_id: undefined })}>登记客户模型</Btn>} />
      {err && <div className="ca-note" style={{ color: '#b42318', marginBottom: 14 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: focus ? 'minmax(0, 1.1fr) minmax(360px, .9fr)' : '1fr', gap: 16 }}>
        <div>
          <div className="ca-tabs" role="tablist">
            <button role="tab" aria-selected={view === 'platform'} className={view === 'platform' ? 'on' : ''} onClick={() => setTab('platform')}>平台学员<i>{platform.length}</i></button>
            <button role="tab" aria-selected={view === 'customer'} className={view === 'customer' ? 'on' : ''} onClick={() => setTab('customer')}>客户学员<i>{customer.length}</i></button>
            <span className="ca-tabs-note">{view === 'platform' ? '平方自己的大模型，按模型选单自动在册' : '入学申请「录取为学员」或右上角登记'}</span>
          </div>
          <Card>
            {!list.length ? <Empty>{view === 'customer' ? '还没有客户送来的模型。入学申请「录取为学员」后会出现在这里。' : '还没有平台学员。'}</Empty>
              : <table className="ca-table"><thead><tr><th>学员</th><th>接口</th><th className="num">学籍</th><th className="num">在读</th><th className="num">毕业</th><th></th></tr></thead><tbody>{list.map(s => <Row key={s.id} s={s} />)}</tbody></table>}
          </Card>
        </div>
        {focus && cur && (
          <div>
            <Card eyebrow="Student Record" title={cur.name} extra={<Btn kind="ghost" sm onClick={() => setFocus(null)}>收起</Btn>}>
              <div className="ca-kv" style={{ display: 'grid', gap: 4 }}>
                <div><b>类型</b>{cur.kind === 'platform' ? '平台模型' : '客户模型'}{cur.org ? ` · ${cur.org}` : ''}</div>
                {cur.kind === 'customer' && <>
                  <div><b>接口形式</b>{cur.api_style || '—'}{cur.endpoint ? ` · ${cur.endpoint}` : ''}</div>
                  <div className="ca-row"><b>考试用的模型</b><Select size="small" allowClear placeholder="客户模型接上接口前，先选一个平台模型代跑" style={{ minWidth: 260 }} value={cur.model_id || undefined} onChange={v => setModel(cur, v || null)} options={models.map((m: any) => ({ value: m.id, label: m.label }))} /></div>
                </>}
                {cur.note && <div style={{ whiteSpace: 'pre-wrap' }}><b>备注</b>{cur.note}</div>}
              </div>
              <Rule label="ENROLLMENTS" />
              {!ens ? <div className="ca-mute">读取中…</div> : !ens.length ? <Empty>还没有学籍。<br />点「录一门课」给 TA 挑一个百业空间。</Empty> : (
                <table className="ca-table"><thead><tr><th>课程</th><th>Status</th><th className="num">入学</th><th className="num">毕业考</th><th></th></tr></thead>
                  <tbody>{ens.map(e => <tr key={e.id} className="click" onClick={() => router.push(`/college/admin/training/${e.id}`)}>
                    <td className="who"><div className="ca-row" style={{ gap: 10 }}><Face src={e.course?.avatar} size={30} /><div><span className="serif">{e.course?.role}</span><div className="ca-mute" style={{ fontSize: 12 }}>{e.nova_name}{e.course?.company ? ` · ${e.course.company}` : ''}</div></div></div></td>
                    <td><Pill tone={STATUS_TONE[e.status]}>{e.status_label}</Pill></td><td className="num">{score(e.entrance_score)}</td><td className="num">{score(e.final_score)}</td><td onClick={ev => ev.stopPropagation()} style={{ whiteSpace: 'nowrap' }}><a href={`/college/s/${e.id}`} target="_blank" rel="noreferrer" className="ca-mute" style={{ fontSize: 12.5 }}>回放 ↗</a></td></tr>)}</tbody></table>)}
              <div style={{ marginTop: 12 }}><Btn kind="navy" onClick={() => openEnroll(cur)}>录一门课</Btn></div>
            </Card>
          </div>
        )}
      </div>
      <Modal open={!!enroll} onCancel={() => setEnroll(null)} onOk={doEnroll} okText="录入" confirmLoading={busy === 'enroll'} title={`给 ${enroll?.student?.name || ''} 录一门课`} width={620}>
        {enroll && <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          <Select showSearch style={{ width: '100%' }} value={enroll.space_id || undefined} placeholder="搜岗位 / 职业 / 企业" optionFilterProp="label" onChange={v => setEnroll({ ...enroll, space_id: v })}
            options={courses.map((c: any) => ({ value: c.id, label: `${c.role}${c.company ? ` · ${c.company}` : ''} · ${c.chapters} 章${c.teacher?.expert ? ` · 师承 ${c.teacher.name}` : ' · AI 草案'}${c.graduates ? ` · 已出 ${c.graduates} 位毕业生` : ''}` }))} />
          <div className="ca-mute" style={{ fontSize: 12.5 }}>课程就是百业工厂里的空间；一门课有老师傅教过（有技能卡）才能考毕业考。</div>
        </div>}
      </Modal>
      <Modal open={!!add} onCancel={() => setAdd(null)} onOk={doAdd} okText="登记" confirmLoading={busy === 'add'} title="登记客户模型" width={560}>
        {add && <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          <Input placeholder="模型 / 智能体名称 *" value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} />
          <div className="ca-row"><Input placeholder="送学机构" value={add.org} onChange={e => setAdd({ ...add, org: e.target.value })} /><Input placeholder="联系人" value={add.contact} onChange={e => setAdd({ ...add, contact: e.target.value })} /></div>
          <div className="ca-row"><Select placeholder="接口形式" style={{ minWidth: 180 }} value={add.api_style || undefined} onChange={v => setAdd({ ...add, api_style: v })} options={['OpenAI 兼容', 'Anthropic Messages', '自定义 HTTP', '暂时没有接口'].map(x => ({ value: x, label: x }))} /><Input placeholder="接口地址（不填密钥）" value={add.endpoint} onChange={e => setAdd({ ...add, endpoint: e.target.value })} /></div>
          <Select allowClear placeholder="接上接口前，先用哪个平台模型代跑（可不选）" value={add.model_id} onChange={v => setAdd({ ...add, model_id: v })} options={models.map((m: any) => ({ value: m.id, label: m.label }))} />
        </div>}
      </Modal>
    </div>
  );
}
