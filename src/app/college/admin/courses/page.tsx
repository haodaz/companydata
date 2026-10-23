'use client';

/** 课程目录：课程 = 百业工厂里有已发布章节的空间。看每门课的章节 / 教案 / 老师傅 / 学籍数，给某门课招学员。 */
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, Select, Input } from 'antd';
import { api, Btn, Card, Empty, Face, PageHead, Pill, useToast } from '../ui';

export default function Courses() {
  const t = useToast(); const router = useRouter();
  const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState(''); const [q, setQ] = useState('');
  const [students, setStudents] = useState<any[]>([]); const [pick, setPick] = useState<any | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { api('/courses').then(j => setRows(j.data)).catch(e => setErr(e.message)); }, []);
  const openPick = async (c: any) => { try { if (!students.length) setStudents((await api('/students')).data); setPick({ course: c, student_id: students.find(s => s.model_id === 'qwen-plus')?.id }); } catch (e) { t.err(e); } };
  const doPick = async () => { if (!pick?.student_id) return t.err('先选学员'); setBusy(true); try { const j = await api('/enrollments', { method: 'POST', json: { student_id: pick.student_id, space_id: pick.course.id } }); t.ok('已录入'); setPick(null); router.push(`/college/admin/training/${j.enrollment.id}`); } catch (e) { t.err(e); } finally { setBusy(false); } };
  const shown = (rows || []).filter(c => !q || [c.role, c.title, c.company, c.teacher?.name].join(' ').toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHead eyebrow="V · Curriculum" zh="课程目录" en="Course Catalog — every course is a Baiye workplace"
        lead="一门课就是百业工厂里的一个职业空间：一个岗位一天的章节、工位、老师傅的技能卡、每章的教案。要新课，去百业工厂生成；这里给某门课招学员。"
        extra={<><Input className="ca-input" placeholder="搜岗位 / 企业 / 老师傅" value={q} onChange={e => setQ(e.target.value)} style={{ width: 240 }} /><a href="/lab/spaces" target="_blank" rel="noreferrer"><Btn kind="gold">去百业工厂造新课 ↗</Btn></a></>} />
      {err && <div className="ca-note" style={{ color: '#b42318', marginBottom: 14 }}>{err}</div>}
      <Card>
        {!rows ? <div className="ca-mute">读取中…</div> : !shown.length ? <Empty>没有课程。</Empty> : (
          <table className="ca-table"><thead><tr><th>课程</th><th>Faculty</th><th className="num">章节</th><th className="num">考核章</th><th className="num">教案</th><th className="num">学籍 / 毕业</th><th></th></tr></thead>
            <tbody>{shown.map(c => (
              <tr key={c.id}>
                <td><div className="ca-row" style={{ gap: 10 }}><Face src={c.avatar} /><div><span className="serif">{c.role}</span><div className="ca-mute" style={{ fontSize: 12.5 }}>{c.nova}{c.company ? ` · ${c.company}` : ''}{c.research ? ' · 学科研究' : ''}</div></div></div></td>
                <td>{c.teacher ? (c.teacher.expert ? <>师承 <b>{c.teacher.name}</b><div className="ca-mute" style={{ fontSize: 12 }}>{c.teacher.place}</div></> : <Pill tone="mute">AI 草案 · 等老师傅</Pill>) : <Pill tone="warn">无技能卡</Pill>}</td>
                <td className="num">{c.chapters}</td><td className="num">{c.assessments || <span className="ca-mute">—</span>}</td><td className="num">{c.lessons}/{c.chapters}</td><td className="num">{c.enrollments} / {c.graduates}</td>
                <td style={{ whiteSpace: 'nowrap' }}><div className="ca-row" style={{ gap: 6 }}><Btn kind="navy" sm onClick={() => openPick(c)}>招学员</Btn><a href={`/lab/${c.id}`} target="_blank" rel="noreferrer"><Btn kind="ghost" sm>看课 ↗</Btn></a><a href={`/lab/studio/${c.id}`} target="_blank" rel="noreferrer"><Btn kind="ghost" sm>工作室 ↗</Btn></a></div></td>
              </tr>))}</tbody></table>)}
      </Card>
      <Modal open={!!pick} onCancel={() => setPick(null)} onOk={doPick} okText="录入" confirmLoading={busy} title={`给「${pick?.course?.role || ''}」招一位学员`}>
        {pick && <Select style={{ width: '100%', marginTop: 8 }} value={pick.student_id} onChange={v => setPick({ ...pick, student_id: v })} options={students.map((s: any) => ({ value: s.id, label: `${s.name}${s.kind === 'customer' ? ' · 客户模型' : ''}${!s.model_id ? '（未接接口）' : ''}` }))} />}
      </Modal>
    </div>
  );
}
