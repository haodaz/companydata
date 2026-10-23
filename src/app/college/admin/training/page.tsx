'use client';

/** 学员培养 · 学籍一览：每一份学籍 = 一位学员上一门课。按状态筛，点进去看章节成绩、上课、考试、反思、真活。 */
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, Card, Empty, Face, fmtDate, PageHead, Pill, score, STATUS_TONE } from '../ui';

const TABS = [['', '全部'], ['enrolled', '已录取'], ['training', '实训中'], ['examining', '考核中'], ['remedial', '补训中'], ['graduated', '已毕业']];

export default function Page() { return <Suspense><Training /></Suspense>; }

function Training() {
  const router = useRouter(); const sp = useSearchParams();
  const [status, setStatus] = useState(sp.get('status') || '');
  const [rows, setRows] = useState<any[] | null>(null); const [err, setErr] = useState('');
  const load = useCallback(() => api(`/enrollments${status ? `?status=${status}` : ''}`).then(j => { setRows(j.data); setErr(''); }).catch(e => setErr(e.message)), [status]);
  useEffect(() => { load(); }, [load]);
  return (
    <div>
      <PageHead eyebrow="III · Training" zh="学员培养" en="Apprenticeship, Practicum & Examination"
        lead="一份学籍 = 一位学员上一门课。路径：入学考（裸考）→ 逐章上课 → 装技能卡 + 笔记考 → 没过的章反思再考 → 做真活 → 每章都 ≥ 60 毕业。点进一份学籍，每一步都能人工点。" />
      <div className="ca-tabs" style={{ marginBottom: 14 }}>{TABS.map(([v, l]) => <button key={v} className={status === v ? 'on' : ''} onClick={() => setStatus(v)}>{l}</button>)}</div>
      {err && <div className="ca-note" style={{ color: '#b42318', marginBottom: 14 }}>{err}</div>}
      <Card>
        {!rows ? <div className="ca-mute">读取中…</div> : !rows.length ? <Empty>这个状态下没有学籍。<br />去「学员管理」给一位学员录一门课，或在总览里把已有的 AI 作答归档成学籍。</Empty> : (
          <table className="ca-table"><thead><tr><th>学籍</th><th>学员（模型）</th><th>Status</th><th className="num">入学考</th><th className="num">毕业考</th><th className="num">去向</th><th>Updated</th></tr></thead>
            <tbody>{rows.map(e => (
              <tr key={e.id} className="click" onClick={() => router.push(`/college/admin/training/${e.id}`)}>
                <td className="who"><div className="ca-row" style={{ gap: 12 }}><Face src={e.course?.avatar} /><div><span className="serif">{e.course?.role || '—'}</span><div className="ca-mute" style={{ fontSize: 12.5 }}>{e.nova_name}{e.course?.company ? ` · ${e.course.company}` : ''}{e.course?.research ? ' · 学科研究' : ''}{e.demand_id ? ' · 定向培养' : ''}</div></div></div></td>
                <td>{e.student_name}{e.model_label && e.model_label !== e.student_name ? <div className="ca-mute" style={{ fontSize: 12 }}>{e.model_label}</div> : !e.model_id ? <div className="ca-mute" style={{ fontSize: 12 }}>未接接口</div> : null}</td>
                <td><Pill tone={STATUS_TONE[e.status]}>{e.status_label}</Pill></td>
                <td className="num">{score(e.entrance_score)}</td><td className="num">{score(e.final_score)}</td>
                <td className="num">{e.placements ? `${e.placed}/${e.placements}` : <span className="ca-mute">—</span>}</td>
                <td className="ca-mute" style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.updated_at)}</td>
              </tr>))}</tbody></table>)}
      </Card>
    </div>
  );
}
