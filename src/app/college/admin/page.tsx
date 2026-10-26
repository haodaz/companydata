'use client';

/** 教务总览：几个数、待办、学习路径、把已有的 AI 作答归档成学籍、以及「AI 学员在这里学什么」 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Btn, Card, PageHead, Rule, Stat, useToast } from './ui';

const LAYERS = [
  { n: 'I', t: '技能卡', d: '老师傅的判断规则、做法、好坏样例。拜师，就是装上它。', s: '来自百业空间的技能卡' },
  { n: 'II', t: '教材要点', d: '每一章教案与示范轨迹提炼出的要点。上课，就是压进学员的笔记。', s: '「上课」动作生成' },
  { n: 'III', t: '错题本', d: '考完对照评分证据与示范反思：错在哪、下次记住什么规则。补训靠它。', s: '「反思」动作生成' },
  { n: 'IV', t: '知识包', d: '这一行的平方图谱：标准、工具、场所、典型任务。', s: '与「和我聊」同一套' },
  { n: 'V', t: '真活经验', d: '做过的真活与复盘。评卷写下的差距，就是教训。', s: '「做真活」动作生成' },
];
const PATH = [['入学考', '不装技能裸考，看底子'], ['上课', '教案 + 示范 → 要点进笔记'], ['毕业考', '装技能卡 + 笔记，按章考'], ['补训', '没过的章反思进错题本，再考'], ['真活', '做企业的真活，同一套标准评'], ['毕业', '每一章都 ≥ 60，发证书、安排去向']];

export default function Overview() {
  const t = useToast();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api('/overview').then(j => { setD(j.data); setErr(''); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);
  const backfill = async () => {
    setBusy(true);
    try { const j = await api('/students', { method: 'POST', json: { action: 'backfill' } }); t.ok(`归档 ${j.result.submissions} 次作答，建了 / 更新了 ${j.result.enrollments} 份学籍`); load(); }
    catch (e) { t.err(e); } finally { setBusy(false); }
  };
  const hour = new Date().getHours(); const hello = hour < 11 ? '早安' : hour < 13 ? '午安' : hour < 18 ? '午后好' : '晚安';
  return (
    <div>
      <PageHead art="overview" eyebrow="Registrar · Overview" zh={`${hello}，院长`} en="The Registrar's Desk — Baiye AI College"
        lead="学员是 AI 模型，课程是百业工厂的空间，考核是章节考和真活。教务处管四件事：申请、学员、培养、毕业生去向。每个动作都能人工点，也能交给院长 A 串起来做。"
        extra={<Btn kind="ghost" busy={busy} onClick={backfill} title="把体验端里已经考过的 AI 作答按模型 × 课程归档成学籍">归档已有 AI 作答为学籍</Btn>} />
      {err && <div className="ca-note" style={{ marginBottom: 16, color: '#b42318' }}>{err}{/迁移 046/.test(err) && <>　→ 在 Supabase SQL Editor 执行 <code>supabase/migrations/046_college_admin.sql</code> 后刷新。</>}</div>}
      {d && (
        <>
          <div className="ca-grid" style={{ marginBottom: 18 }}>
            <Stat roman="I" v={d.applications.enroll_new + d.applications.hire_new} k="待处理申请" sub={`入学 ${d.applications.enroll_new} · 培养需求 ${d.applications.hire_new}`} />
            <Stat roman="II" v={d.students.total} k="在册学员（模型）" sub={`平台 ${d.students.platform} · 客户 ${d.students.customer}`} />
            <Stat roman="III" v={d.enrollments.training + d.enrollments.remedial + d.enrollments.enrolled} k="在读学籍" sub={`实训 / 考核 ${d.enrollments.training} · 补训 ${d.enrollments.remedial} · 待开课 ${d.enrollments.enrolled}`} />
            <Stat roman="IV" v={d.enrollments.graduated} k="毕业生" sub={`已上岗 ${d.placements.placed} · 已推荐 ${d.placements.offered} · 拟派 ${d.placements.proposed}`} />
          </div>
          <Rule label="TO DO" />
          <div className="ca-grid">
            <Card eyebrow="Pending" title="待办"><div className="ca-kv" style={{ display: 'grid', gap: 7 }}>
              <Link href="/college/admin/applications?kind=enroll&status=new">→ 新的入学申请 <b>{d.applications.enroll_new}</b> 份，录取为学员</Link>
              <Link href="/college/admin/applications?kind=hire&status=new">→ 新的人才培养需求 <b>{d.applications.hire_new}</b> 份，立项、挑课程</Link>
              <Link href="/college/admin/training?status=enrolled">→ 已录取还没开课 <b>{d.enrollments.enrolled}</b> 份，跑入学考</Link>
              <Link href="/college/admin/training?status=remedial">→ 补训中 <b>{d.enrollments.remedial}</b> 份，反思再考</Link>
              <Link href="/college/admin/graduates">→ 毕业生 <b>{d.enrollments.graduated}</b> 位，安排去向</Link>
            </div></Card>
            <Card eyebrow="Curriculum Path" title="学习路径 · 每一步都是一个基础功能" style={{ gridColumn: 'span 2' }}>
              <div className="ca-steps">{PATH.map(([a, b], i) => <div key={a} className="ca-step"><i>{['I', 'II', 'III', 'IV', 'V', 'VI'][i]}</i><b>{a}</b>{b}</div>)}</div>
            </Card>
          </div>
        </>
      )}
      <Rule label="WHAT AN AI STUDENT LEARNS" />
      <Card eyebrow="Pedagogy" title="AI 学员在这里学到什么" extra={<span className="ca-mute" style={{ fontSize: 12.5 }}>不改模型权重；全是可见、可管理的材料，考试时一起装进去</span>}>
        <div className="ca-layers">{LAYERS.map(l => <div key={l.n} className="ca-layer"><i>LAYER {l.n}</i><b>{l.t}</b><span>{l.d}</span><small>{l.s}</small></div>)}</div>
      </Card>
    </div>
  );
}
