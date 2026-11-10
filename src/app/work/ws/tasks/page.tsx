'use client';

/**
 * 真活工作台 · 管理真活：出过的每道题一行（状态、参与 / 交卷、平均 / 最高、基线、最近交卷）。
 * 「＋ 新建」两条路：手动填写（原来的填表出任务，嵌在工作台里）/ 跟助理说（进新对话）。点标题打开任务空间；「问助理」把这道题带进对话。
 */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { askHref, col, STATUS, when } from '../ask';
import { Empty, Head, Menu } from '../ui';

const TONE: Record<string, string> = { published: 'ok', ready: 'warn', archived: 'mute' };

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [kw, setKw] = useState(''); const [st, setSt] = useState('all');
  useEffect(() => { fetch('/api/admin/work/home?view=tasks', { cache: 'no-store' }).then(r => r.json()).then(j => setTasks(j.ok ? j.tasks : [])).catch(() => setTasks([])); }, []);
  const list = useMemo(() => (tasks || []).filter(t => (st === 'all' || t.status === st) && (!kw || [t.title, t.company, t.role].some((v: string) => String(v || '').includes(kw)))), [tasks, kw, st]);
  // 删除（11-10）：列表里拿掉、参与链接失效；作答和报告留在库里
  const remove = async (t: any) => {
    if (!confirm(`删除「${t.title}」？\n参与链接马上失效，候选人打不开。已有的作答和报告不会丢，要找回请联系我们。`)) return;
    const j = await (await fetch(`/api/work/${t.token}/owner?k=${encodeURIComponent(t.owner_key || '')}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'deleted' }) })).json();
    if (!j.ok) return alert(j.error || '没删掉');
    setTasks(x => (x || []).filter(y => y.task_id !== t.task_id));
  };
  const n = (k: string) => (tasks || []).filter(t => k === 'all' || t.status === k).length;
  return (
    <div className="wws-page">
      <Head eyebrow="MANAGE" zh="管理真活" en="Every task you've set, and how it's going"
        lead="点标题打开任务空间：改题、发参与链接、看每个人。「问助理」让它替你看这道题的作答情况。"
        acts={<Menu label="＋ 新建">
          <Link href="/work/ws/tasks/new">手动填写<small>一项项填：企业、岗位、考什么、用时</small></Link>
          <Link href={askHref('帮我出一道真活：', { fill: true })}>跟助理说<small>说一句你缺什么样的人，缺的它来问</small></Link>
          <Link href="/work/ws/kb?tab=sample">从任务样本 / 任务库挑<small>照一道现成的题出</small></Link>
        </Menu>} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <input className="wws-in" value={kw} onChange={e => setKw(e.target.value)} placeholder="搜标题 / 企业 / 岗位" style={{ minWidth: 240 }} />
        {[['all', '全部'], ['published', '已发布'], ['ready', '待发布'], ['archived', '已下架']].map(([k, t]) => <button key={k} className={`wws-chip${st === k ? ' on' : ''}`} onClick={() => setSt(k)}>{t} {tasks ? n(k) : ''}</button>)}
      </div>
      <div className="wws-card" style={{ overflowX: 'auto' }}>
        <table className="wws-table t-tasks">
          <thead><tr>{[['TASK', '题目'], ['STATUS', '状态'], ['TAKERS', '参与 / 交卷'], ['AVG', '平均'], ['BEST', '最高'], ['AI', '基线'], ['LAST', '最近交卷'], ['', '']].map(([e, z], i) => <th key={i}>{e}<small>{z}</small></th>)}</tr></thead>
          <tbody>
            {tasks == null && <tr><td colSpan={8} className="wws-muted">读取中…</td></tr>}
            {tasks && !list.length && <tr><td colSpan={8}><Empty>{tasks.length ? '没有符合的。' : '还没出过题。点右上「＋ 新建」，或者跟助理说一句你缺什么样的人。'}</Empty></td></tr>}
            {list.map(t => <tr key={t.task_id}>
              <td style={{ minWidth: 280 }}><a className="t" href={`/work/${t.token}/owner?k=${encodeURIComponent(t.owner_key || '')}`} target="_blank" rel="noreferrer">{t.title}</a><div className="sub">{[t.company, t.role].filter(Boolean).join(' · ')}{t.time_minutes ? ` · ${t.time_minutes} 分钟` : ''}</div></td>
              <td><span className={`wws-tag ${TONE[t.status] || 'mute'}`}>{STATUS[t.status]?.[0] || t.status}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>{t.started} / <b>{t.submitted}</b></td>
              <td><span className="wws-num" style={{ color: col(t.avg) }}>{t.avg ?? '—'}</span></td>
              <td><span className="wws-num" style={{ color: col(t.best) }}>{t.best ?? '—'}</span></td>
              <td className="wws-muted">{t.baseline ?? '—'}</td>
              <td className="wws-muted" style={{ whiteSpace: 'nowrap' }}>{when(t.last_submit)}</td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                {t.submitted > 0 && <Link href={`/work/ws/reports?task=${t.task_id}`} className="wws-back" style={{ marginRight: 12 }}>看报告</Link>}
                <Link href={askHref(t.submitted ? '这道题大家做得怎么样？卡在哪，推荐谁？' : '这道题现在什么情况？下一步该做什么？', { task_id: t.task_id, token: t.token, k: t.owner_key, title: t.title })}><button className="wws-ask">问助理</button></Link>
                <button className="wws-back" onClick={() => remove(t)} style={{ marginLeft: 10, border: 0, background: 'none', color: '#c0392b', cursor: 'pointer', font: 'inherit' }}>删除</button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
