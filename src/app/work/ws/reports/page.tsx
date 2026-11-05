'use client';

/** 真活工作台 · 任务报告：一张库表看所有作答（候选人 × 题），可筛可搜；所有题的作答人（或 ?task= 一道题的），最近的在前。看报告在右边抽屉；勾 2–4 个人「让助理比」；每行「问助理」分析这个人 */
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ReportView } from '@/components/work/ReportView';
import { askHref, col, MODE, when } from '../ask';

export default function Page() { return <Suspense><People /></Suspense>; }

function People() {
  const task = useSearchParams().get('task');
  const [people, setPeople] = useState<any[] | null>(null);
  const [kw, setKw] = useState(''); const [onlyDone, setOnlyDone] = useState(true);
  const [pick, setPick] = useState<string[]>([]);
  const [open, setOpen] = useState<any>(null);
  useEffect(() => { setPeople(null); fetch(`/api/admin/work/home?view=people${task ? `&task=${task}` : ''}`, { cache: 'no-store' }).then(r => r.json()).then(j => setPeople(j.ok ? j.people : [])).catch(() => setPeople([])); }, [task]);
  const list = useMemo(() => (people || []).filter(p => (!onlyDone || p.submitted_at) && (!kw || [p.name, p.task_title, p.company].some((v: string) => String(v || '').includes(kw)))), [people, kw, onlyDone]);
  const picked = (people || []).filter(p => pick.includes(p.session_id));
  const sameTask = picked.length > 1 && picked.every(p => p.task_id === picked[0].task_id);
  return (
    <div className="wws-page">
      <h1 className="wws-h1">任务报告{task && people?.[0] ? ` · ${people[0].task_title}` : ''}</h1>
      <p className="wws-sub">{task ? <>这道题的作答人。<Link href="/work/ws/reports" style={{ color: '#6055f5' }}>看所有题的 →</Link></> : '你所有题的作答人，最近交卷的在前。'}点「看报告」在右边打开；勾同一道题的 2–4 个人可以让助理并排比。</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜名字 / 题目 / 企业" style={inp} />
        <label style={{ fontSize: 13, color: '#3b405a', display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={onlyDone} onChange={e => setOnlyDone(e.target.checked)} />只看交了卷的</label>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: '#8c8fa6' }}>{picked.length ? `已勾 ${picked.length} 人${picked.length > 1 && !sameTask ? '（不是同一道题，没法逐条比）' : ''}` : ''}</span>
        {sameTask && <Link href={askHref(`把这几个人并排比一下：${picked.map(p => p.name).join('、')}。推荐谁进面试？各自要追问什么？`, { task_id: picked[0].task_id, title: picked[0].task_title })}><button className="wws-ask" style={{ padding: '6px 14px', fontSize: 13.5 }}>让助理比这 {picked.length} 个人</button></Link>}
      </div>
      <div className="wws-card" style={{ overflowX: 'auto' }}>
        <table style={tbl}>
          <thead><tr>{['', '谁', '题目', '方式', '交卷', '用时', '总分', 'AI 使用', '一句话', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {people == null && <tr><td colSpan={10} style={{ ...td, color: '#999' }}>读取中…</td></tr>}
            {people && !list.length && <tr><td colSpan={10} style={{ ...td, color: '#999' }}>{people.length ? '没有符合的' : '还没有人做过你的题。题发布后把参与链接发给候选人。'}</td></tr>}
            {list.map(p => <tr key={p.session_id} style={{ borderTop: '1px solid #eef0f5', background: pick.includes(p.session_id) ? '#f8f7ff' : undefined }}>
              <td style={td}><input type="checkbox" disabled={!p.graded} checked={pick.includes(p.session_id)} onChange={e => setPick(x => e.target.checked ? [...x, p.session_id].slice(-4) : x.filter(y => y !== p.session_id))} /></td>
              <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{p.name}{p.contact && <div style={{ color: '#8c8fa6', fontSize: 12, fontWeight: 400 }}>{p.contact}</div>}</td>
              <td style={{ ...td, minWidth: 180 }}><Link href={`/work/ws/reports?task=${p.task_id}`} style={{ color: '#3b405a', textDecoration: 'none' }}>{p.task_title}</Link></td>
              <td style={{ ...td, color: '#777', whiteSpace: 'nowrap' }}>{MODE[p.mode] || p.mode}</td>
              <td style={{ ...td, color: '#777', whiteSpace: 'nowrap' }}>{p.submitted_at ? when(p.submitted_at) : <span style={{ color: '#b7791f' }}>做着 / 没交</span>}</td>
              <td style={{ ...td, color: '#777', whiteSpace: 'nowrap' }}>{p.minutes != null ? `${p.minutes} 分` : '—'}</td>
              <td style={{ ...td, color: col(p.score), fontWeight: 800 }}>{p.score ?? '—'}</td>
              <td style={{ ...td, color: col(p.ai_use), fontWeight: 700 }}>{p.ai_use ?? (p.graded ? '没用' : '—')}</td>
              <td style={{ ...td, color: '#555', minWidth: 240, fontSize: 13 }}>{p.summary || (p.submitted_at && !p.graded ? '报告生成中' : '')}</td>
              <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                {p.graded && <button onClick={() => setOpen(p)} style={{ ...lnkBtn, marginRight: 10 }}>看报告</button>}
                {p.graded && <Link href={askHref(`分析一下 ${p.name} 这份报告：强在哪、弱在哪、怎么用 AI 的，面试要追问什么？`, { task_id: p.task_id, token: p.token, sid: p.session_id, title: p.task_title, name: p.name })}><button className="wws-ask">问助理</button></Link>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {open && <Drawer p={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Drawer({ p, onClose }: { p: any; onClose: () => void }) {
  const [s, setS] = useState<any>(null);
  useEffect(() => { fetch(`/api/work/${p.token}/sessions/${p.session_id}?full=1`).then(r => r.json()).then(j => j.ok && setS(j.session)).catch(() => {}); }, [p]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,60,.28)', zIndex: 50 }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(920px, 100%)', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 30px rgba(20,24,60,.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #e8e9f0' }}>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, letterSpacing: 2, color: '#6055f5', fontWeight: 700 }}>{p.name} 的报告</div><div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.task_title}</div></div>
          <Link href={askHref(`分析一下 ${p.name} 这份报告：强在哪、弱在哪、怎么用 AI 的，面试要追问什么？`, { task_id: p.task_id, token: p.token, sid: p.session_id, title: p.task_title, name: p.name })} style={{ marginLeft: 'auto' }}><button className="wws-ask">问助理</button></Link>
          <button onClick={onClose} style={lnkBtn}>关闭</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 40px' }}>{s?.report ? <ReportView report={s.report} participant={s.participant} deliverable={s.deliverable} events={s.events || []} aiChat={s.ai_chat || []} defaultTab="deliv" /> : <div style={{ color: '#999' }}>读取报告…</div>}</div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { border: '1px solid #e0e0ee', borderRadius: 9, padding: '6px 12px', font: 'inherit', fontSize: 13.5, minWidth: 220, outline: 0 };
const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', color: '#8c8fa6', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap', background: '#fafbff' };
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' };
const lnkBtn: React.CSSProperties = { border: 0, background: 'transparent', color: '#6055f5', font: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 };
