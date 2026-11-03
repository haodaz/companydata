'use client';

/**
 * 私域课（迁移 061）：一家实验室交来的材料——研究方向 / 组内规格 / 实验要求 / 内部文献 / 组内设备 / 私域知识，只归这一家。
 * 用途：内部文献出私域测评题（只给这家）；学员考这家的题时，其余材料装成「私域知识包」。AI 代实验室起草的演示材料标「AI 起草」，实验室改过变「实验室」。
 */
import React, { useEffect, useState } from 'react';
import { Input, Modal, Select } from 'antd';
import { api, Btn, Card, Empty, PageHead, Pill, useToast } from '../ui';

const KINDS: [string, string, string][] = [
  ['direction', '研究方向', '在做什么、为什么、今年的目标和卡点'], ['spec', '组内规格', '材料、样品、测试的组内标准（带数字和允许范围）'],
  ['requirement', '实验要求', '安全红线、数据记录与作废规则'], ['literature', '内部文献', '未发表的组内报告与数据——最新一份拿来出私域测评题'],
  ['equipment', '组内设备', '型号、参数设置、预约规则、已知毛病'], ['knowhow', '私域知识', '老师傅经验、组里踩过的坑'],
];

export default function Private() {
  const t = useToast();
  const [orgs, setOrgs] = useState<any[]>([]); const [org, setOrg] = useState('');
  const [mats, setMats] = useState<any[] | null>(null); const [exams, setExams] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null); const [busy, setBusy] = useState(false);
  const load = async (o = org) => { try { const j = await api(`/private?org=${o}`); setOrgs(j.orgs); setMats(o ? j.materials : null); setExams(j.exams); if (!o && j.orgs[0]) { setOrg(j.orgs[0].id); } } catch (e) { t.err(e); } };
  useEffect(() => { load(''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { if (org) load(org); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [org]);
  const save = async () => {
    if (!edit?.title?.trim() || !edit?.body?.trim()) return t.err('标题和正文都要有');
    setBusy(true);
    try { if (edit.id) await api('/private', { method: 'PATCH', json: { id: edit.id, title: edit.title, body: edit.body, kind: edit.kind } }); else await api('/private', { method: 'POST', json: { org_id: org, kind: edit.kind, title: edit.title, body: edit.body } }); t.ok('已保存'); setEdit(null); load(); }
    catch (e) { t.err(e); } finally { setBusy(false); }
  };
  const labLink = async () => { try { const j = await api('/private', { method: 'POST', json: { action: 'lab_link', org_id: org } }); await navigator.clipboard.writeText(`${location.origin}/college/lab/${j.token}`).catch(() => {}); t.ok('实验室链接已复制：发给这家实验室，他们自己看、确认、改材料'); } catch (e) { t.err(e); } };
  const link = async (id: string) => { try { const j = await api('/exams', { method: 'POST', json: { id } }); await navigator.clipboard.writeText(`${location.origin}/college/review/${j.token}`).catch(() => {}); t.ok('校正链接已复制，发给这家的导师'); load(); } catch (e) { t.err(e); } };
  return (
    <div>
      <PageHead art="courses" eyebrow="Private Courses" zh="私域课" en="Joint training with a lab's own materials"
        lead="实验室拿自己的规格、实验要求、内部文献、设备和经验来联合培养科研 AI，材料只归这一家。最新一份内部文献出私域测评题；学员考这家的题时，其余材料装成私域知识包。演示材料由 AI 按机构档案起草，实验室只需要改。"
        extra={<><Select value={org || undefined} onChange={setOrg} style={{ width: 280 }} placeholder="选一家科研机构" options={orgs.map(o => ({ value: o.id, label: o.name }))} />{org && <Btn kind="gold" onClick={labLink}>复制实验室链接</Btn>}</>} />
      {exams.length > 0 && <Card><div className="ca-row" style={{ gap: 10, flexWrap: 'wrap' }}><b>这家的私域测评题：</b>{exams.map(e => <span key={e.id} className="ca-row" style={{ gap: 6 }}>{e.title}{e.status === 'mentor_reviewed' ? <Pill tone="ok">导师已校正</Pill> : <Pill tone="mute">AI 初稿</Pill>}<Btn kind="ghost" sm onClick={() => link(e.id)}>复制校正链接</Btn></span>)}</div></Card>}
      {!mats ? <div className="ca-mute">读取中…</div> : KINDS.map(([k, name, d]) => {
        const xs = mats.filter(m => m.kind === k);
        return <Card key={k}>
          <div className="ca-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><div><b className="serif" style={{ fontSize: 18 }}>{name}</b><span className="ca-mute" style={{ marginLeft: 10, fontSize: 13 }}>{d}</span></div><Btn kind="ghost" sm onClick={() => setEdit({ kind: k, title: '', body: '' })}>＋ 加一份</Btn></div>
          {!xs.length ? <Empty>还没有。</Empty> : xs.map(m => <div key={m.id} style={{ borderTop: '1px solid var(--line, #e6e1d2)', padding: '10px 0' }}>
            <div className="ca-row" style={{ gap: 8, justifyContent: 'space-between' }}><b>{m.title}</b><span className="ca-row" style={{ gap: 6 }}>{m.is_demo && <Pill tone="warn">演示虚构</Pill>}<Pill tone={m.source === 'lab' ? 'ok' : 'mute'}>{m.source === 'lab' ? `实验室已确认${m.confirmed_by ? ` · ${m.confirmed_by}` : ''}` : 'AI 起草'}</Pill><Btn kind="ghost" sm onClick={() => setEdit({ ...m })}>看 / 改</Btn></span></div>
            <div className="ca-mute" style={{ fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap', maxHeight: 66, overflow: 'hidden' }}>{m.body.slice(0, 220)}</div>
          </div>)}
        </Card>;
      })}
      <Modal open={!!edit} onCancel={() => setEdit(null)} onOk={save} okText="保存" confirmLoading={busy} width={860} title={edit?.id ? '看 / 改材料' : '加一份材料'}>
        {edit && <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          <Select value={edit.kind} onChange={v => setEdit({ ...edit, kind: v })} options={KINDS.map(([k, n]) => ({ value: k, label: n }))} />
          <Input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} placeholder="标题" />
          <Input.TextArea value={edit.body} onChange={e => setEdit({ ...edit, body: e.target.value })} rows={18} placeholder="正文（文件先抽出文字贴进来）" />
        </div>}
      </Modal>
    </div>
  );
}
