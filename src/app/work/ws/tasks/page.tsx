'use client';

/** 真活工作台 · 管理真活：出过的每道题一行（状态、参与 / 交卷、平均 / 最高、基线、最近交卷）；点开是任务空间，「问助理」把这道题带进对话 */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { askHref, col, STATUS, when } from '../ask';

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [kw, setKw] = useState(''); const [st, setSt] = useState('all');
  useEffect(() => { fetch('/api/admin/work/home?view=tasks', { cache: 'no-store' }).then(r => r.json()).then(j => setTasks(j.ok ? j.tasks : [])).catch(() => setTasks([])); }, []);
  const list = useMemo(() => (tasks || []).filter(t => (st === 'all' || t.status === st) && (!kw || [t.title, t.company, t.role].some((v: string) => String(v || '').includes(kw)))), [tasks, kw, st]);
  return (
    <div className="wws-page">
      <h1 className="wws-h1">管理真活</h1>
      <p className="wws-sub">你出过的题。点标题打开任务空间（改题、发链接、看每个人）；「问助理」让它替你看这道题的作答情况。</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜标题 / 企业 / 岗位" style={inp} />
        {[['all', '全部'], ['published', '已发布'], ['ready', '待发布'], ['archived', '已下架']].map(([k, t]) => <button key={k} onClick={() => setSt(k)} style={{ ...chip, ...(st === k ? chipOn : {}) }}>{t}</button>)}
        <Link href={askHref('帮我出一道新的真活')} style={{ ...chip, marginLeft: 'auto', background: '#6055f5', color: '#fff', borderColor: '#6055f5', textDecoration: 'none' }}>＋ 让助理出一道</Link>
      </div>
      <div className="wws-card" style={{ overflowX: 'auto' }}>
        <table style={tbl}>
          <thead><tr>{['题目', '状态', '参与 / 交卷', '平均', '最高', 'AI 基线', '最近交卷', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {tasks == null && <tr><td colSpan={8} style={{ ...td, color: '#999' }}>读取中…</td></tr>}
            {tasks && !list.length && <tr><td colSpan={8} style={{ ...td, color: '#999' }}>{tasks.length ? '没有符合的' : '还没出过题。跟助理说一句你缺什么样的人就能出。'}</td></tr>}
            {list.map(t => <tr key={t.task_id} style={{ borderTop: '1px solid #eef0f5' }}>
              <td style={{ ...td, minWidth: 260 }}><a href={`/work/${t.token}/owner?k=${encodeURIComponent(t.owner_key || '')}`} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: '#1a1a2e', textDecoration: 'none' }}>{t.title}</a><div style={{ color: '#8c8fa6', fontSize: 12 }}>{[t.company, t.role].filter(Boolean).join(' · ')}{t.time_minutes ? ` · ${t.time_minutes} 分钟` : ''}</div></td>
              <td style={td}><span style={{ color: STATUS[t.status]?.[1] || '#999', fontWeight: 700 }}>{STATUS[t.status]?.[0] || t.status}</span></td>
              <td style={td}>{t.started} / <b>{t.submitted}</b></td>
              <td style={{ ...td, color: col(t.avg), fontWeight: 700 }}>{t.avg ?? '—'}</td>
              <td style={{ ...td, color: col(t.best), fontWeight: 700 }}>{t.best ?? '—'}</td>
              <td style={{ ...td, color: '#777' }}>{t.baseline ?? '—'}</td>
              <td style={{ ...td, color: '#777' }}>{when(t.last_submit)}</td>
              <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                {t.submitted > 0 && <Link href={`/work/ws/reports?task=${t.task_id}`} style={{ ...lnk, marginRight: 10 }}>看报告</Link>}
                <Link href={askHref(t.submitted ? '这道题大家做得怎么样？卡在哪，推荐谁？' : '这道题现在什么情况？下一步该做什么？', { task_id: t.task_id, token: t.token, k: t.owner_key, title: t.title })}><button className="wws-ask">问助理</button></Link>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { border: '1px solid #e0e0ee', borderRadius: 9, padding: '6px 12px', font: 'inherit', fontSize: 13.5, minWidth: 220, outline: 0 };
const chip: React.CSSProperties = { border: '1px solid #e0e0ee', background: '#fff', borderRadius: 999, padding: '5px 13px', font: 'inherit', fontSize: 13, color: '#3b405a', cursor: 'pointer', fontWeight: 600 };
const chipOn: React.CSSProperties = { background: '#ecebff', borderColor: '#cfcafc', color: '#2b2670' };
const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', color: '#8c8fa6', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap', background: '#fafbff' };
const td: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'top' };
const lnk: React.CSSProperties = { color: '#6055f5', fontWeight: 700, fontSize: 13, textDecoration: 'none' };
