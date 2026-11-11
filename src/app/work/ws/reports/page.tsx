'use client';

/**
 * 真活工作台 · 任务报告：一张库表看所有作答（候选人 × 题），或 ?task= 一道题的；最近交卷的在前，可搜可筛。
 * 「看报告」在右边抽屉（和报告链接同一个 ReportView，出任务的人先看交了什么）；勾同一道题的 2–4 个人「让助理比」；每行「问助理」分析这个人。
 */
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ReportView } from '@/components/work/ReportView';
import { useWorkScale } from '@/lib/work/scale-client';
import { askHref, col, MODE, when } from '../ask';
import { Empty, Head } from '../ui';

export default function Page() { return <Suspense><Reports /></Suspense>; }

function Reports() {
  const task = useSearchParams().get('task'); const ai = useWorkScale() === 'ai_use';
  const [people, setPeople] = useState<any[] | null>(null);
  const [kw, setKw] = useState(''); const [onlyDone, setOnlyDone] = useState(true);
  const [pick, setPick] = useState<string[]>([]);
  const [open, setOpen] = useState<any>(null);
  useEffect(() => { setPeople(null); setPick([]); fetch(`/api/admin/work/home?view=people${task ? `&task=${task}` : ''}`, { cache: 'no-store' }).then(r => r.json()).then(j => setPeople(j.ok ? j.people : [])).catch(() => setPeople([])); }, [task]);
  const list = useMemo(() => (people || []).filter(p => (!onlyDone || p.submitted_at) && (!kw || [p.name, p.task_title, p.company].some((v: string) => String(v || '').includes(kw)))), [people, kw, onlyDone]);
  const picked = (people || []).filter(p => pick.includes(p.session_id));
  const sameTask = picked.length > 1 && picked.every(p => p.task_id === picked[0].task_id);
  const analyze = (p: any) => askHref(`分析一下 ${p.name} 这份报告：强在哪、弱在哪、怎么用 AI 的，面试要追问什么？`, { task_id: p.task_id, token: p.token, sid: p.session_id, title: p.task_title, name: p.name });
  return (
    <div className="wws-page">
      <Head eyebrow="REPORTS" zh={task && people?.[0] ? people[0].task_title : '任务报告'} en={task ? 'Everyone who took this task' : 'Every submission, across all your tasks'}
        lead={<>{task ? <><Link href="/work/ws/reports" className="wws-back">← 看所有题的</Link>　</> : null}点「看报告」在右边打开；勾同一道题的 2–4 个人，可以让助理并排比、给录用建议。</>}
        acts={sameTask ? <Link href={askHref(`把这几个人并排比一下：${picked.map(p => p.name).join('、')}。推荐谁进面试？各自要追问什么？`, { task_id: picked[0].task_id, title: picked[0].task_title })}><button className="wws-btn p">让助理比这 {picked.length} 个人</button></Link> : undefined} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input className="wws-in" value={kw} onChange={e => setKw(e.target.value)} placeholder="搜名字 / 题目 / 企业" style={{ minWidth: 240 }} />
        <label style={{ fontSize: 13, color: 'var(--ink2)', display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={onlyDone} onChange={e => setOnlyDone(e.target.checked)} />只看交了卷的</label>
        <span className="wws-muted" style={{ marginLeft: 'auto' }}>{people ? `${list.length} 份` : ''}{picked.length ? ` · 已勾 ${picked.length} 人${picked.length > 1 && !sameTask ? '（不是同一道题，没法逐条比）' : ''}` : ''}</span>
      </div>
      <div className="wws-card" style={{ overflowX: 'auto' }}>
        <table className="wws-table t-reports">
          <thead><tr>{[['', ''], ['NAME', '谁'], ['TASK', '题目'], ['MODE', '方式'], ['SUBMITTED', '交卷'], ['TIME', '用时'], ...(ai ? [] : [['SCORE', '总分']]), ['AI USE', 'AI 使用'], ['IN A LINE', '一句话'], ['', '']].map(([e, z], i) => <th key={i}>{e}<small>{z}</small></th>)}</tr></thead>
          <tbody>
            {people == null && <tr><td colSpan={10} className="wws-muted">读取中…</td></tr>}
            {people && !list.length && <tr><td colSpan={10}><Empty>{people.length ? '没有符合的。' : '还没有人做过你的题。题发布后把参与链接发给候选人。'}</Empty></td></tr>}
            {list.map(p => <tr key={p.session_id} style={pick.includes(p.session_id) ? { background: 'rgba(96,85,245,.04)' } : undefined}>
              <td><input type="checkbox" disabled={!p.graded} checked={pick.includes(p.session_id)} onChange={e => setPick(x => e.target.checked ? [...x, p.session_id].slice(-4) : x.filter(y => y !== p.session_id))} /></td>
              <td style={{ whiteSpace: 'nowrap' }}><b>{p.name}</b>{p.contact && <div className="sub">{p.contact}</div>}</td>
              <td style={{ minWidth: 180 }}><Link href={`/work/ws/reports?task=${p.task_id}`} className="t" style={{ fontWeight: 600 }}>{p.task_title}</Link></td>
              <td className="wws-muted" style={{ whiteSpace: 'nowrap' }}>{MODE[p.mode] || p.mode}</td>
              <td className="wws-muted" style={{ whiteSpace: 'nowrap' }}>{p.submitted_at ? when(p.submitted_at) : <span className="wws-tag warn">做着 / 没交</span>}</td>
              <td className="wws-muted" style={{ whiteSpace: 'nowrap' }}>{p.minutes != null ? `${p.minutes} 分` : '—'}</td>
              {!ai && <td><span className="wws-num" style={{ color: col(p.score) }}>{p.score ?? '—'}</span></td>}
              <td>{p.ai_use != null ? <span className="wws-num" style={{ fontSize: 15, color: col(p.ai_use) }}>{p.ai_use}</span> : <span className="wws-muted">{p.graded ? '没用' : '—'}</span>}</td>
              <td style={{ color: 'var(--ink2)', minWidth: 240, fontSize: 13 }}>{p.summary || (p.submitted_at && !p.graded ? '报告生成中' : '')}</td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                {p.graded && <button onClick={() => setOpen(p)} className="wws-back" style={{ border: 0, background: 'none', cursor: 'pointer', marginRight: 12, font: 'inherit', fontWeight: 700, fontSize: 13 }}>看报告</button>}
                {p.graded && <Link href={analyze(p)}><button className="wws-ask">问助理</button></Link>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {open && <Drawer p={open} ask={analyze(open)} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Drawer({ p, ask, onClose }: { p: any; ask: string; onClose: () => void }) {
  const [s, setS] = useState<any>(null);
  useEffect(() => { fetch(`/api/work/${p.token}/sessions/${p.session_id}?full=1`).then(r => r.json()).then(j => j.ok && setS(j.session)).catch(() => {}); }, [p]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(27,29,54,.26)', zIndex: 50 }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(940px, 100%)', background: 'var(--paper)', display: 'flex', flexDirection: 'column', boxShadow: '-10px 0 34px rgba(27,29,54,.14)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ minWidth: 0 }}><div className="wws-eyebrow">REPORT · {p.name}</div><div style={{ font: '800 17px var(--serif)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{p.task_title}</div></div>
          <Link href={ask} style={{ marginLeft: 'auto' }}><button className="wws-ask">问助理</button></Link>
          <button onClick={onClose} className="wws-btn">关闭</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 40px' }}>{s?.report ? <ReportView report={s.report} participant={s.participant} deliverable={s.deliverable} events={s.events || []} aiChat={s.ai_chat || []} defaultTab="deliv" /> : <div className="wws-muted">读取报告…</div>}</div>
      </div>
    </div>
  );
}
