'use client';

/**
 * 真活工作台 · 全站管理（只给 admin）：原来「管理全部」/work/admin 的东西搬进工作台，分 tab——
 * 全部真活（所有人出的题：谁出的、状态、作答，可上下架 / 删）/ 样本库 · 训练素材 / 任务库上架 / 法规清单 / 平台资产（题目资产库、外部参照入口）。
 * 样本库、任务库上架、法规清单直接用原来的面板组件（SamplesPanel / ShowcaseAdmin / GovernancePanel），两边一致。
 */
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { App, ConfigProvider } from 'antd';
import { SamplesPanel } from '@/components/work/SamplesPanel';
import { ShowcaseAdmin } from '@/components/work/ShowcaseAdmin';
import { GovernancePanel } from '@/components/work/GovernancePanel';
import { ScaleAdmin } from '@/components/work/ScaleAdmin';
import { askHref, col, STATUS, when } from '../ask';
import { Empty, Head } from '../ui';

type Tab = 'tasks' | 'samples' | 'showcase' | 'governance' | 'scale' | 'assets';
const TABS: [Tab, string, string][] = [['tasks', '全部真活', 'All tasks'], ['samples', '样本库 · 训练素材', 'Samples'], ['showcase', '任务库上架', 'Library'], ['governance', '法规清单', 'Governance'], ['scale', '评分方式', 'Scoring'], ['assets', '平台资产', 'Assets']];
const TONE: Record<string, string> = { published: 'ok', ready: 'warn', archived: 'mute' };

export default function Page() {
  return <Suspense><ConfigProvider theme={{ token: { colorPrimary: '#5148d6', borderRadius: 10 } }}><App><Admin /></App></ConfigProvider></Suspense>;
}

function Admin() {
  const sp = useSearchParams(); const router = useRouter();
  const tab = (sp.get('tab') as Tab) || 'tasks';
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => { fetch('/api/auth/me').then(r => r.json()).then(j => setRole(j?.user?.role || 'user')).catch(() => setRole('user')); }, []);
  if (role && role !== 'admin') return <div className="wws-page"><div className="wws-card"><Empty>全站管理只给管理员。</Empty></div></div>;
  return (
    <div className="wws-page">
      <Head eyebrow="ADMIN" zh="全站管理" en="Everything on the platform, for admins" lead="所有人出的题、训练样本、任务库上架、法规清单，和平台的题目资产。" />
      <div className="wws-tabs" role="tablist">{TABS.map(([k, t, en]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => router.replace(`/work/ws/admin?tab=${k}`)}>{t}<small>{en}</small></button>)}</div>
      {role == null ? <div className="wws-muted">读取中…</div> : <>
        {tab === 'tasks' && <AllTasks />}
        {tab === 'samples' && <div className="wws-card pad"><SamplesPanel /></div>}
        {tab === 'showcase' && <div className="wws-card pad"><ShowcaseAdmin /></div>}
        {tab === 'governance' && <div className="wws-card pad"><GovernancePanel /></div>}
        {tab === 'scale' && <div className="wws-card pad"><ScaleAdmin /></div>}
        {tab === 'assets' && <Assets />}
      </>}
    </div>
  );
}

function AllTasks() {
  const { message, modal } = App.useApp();
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [kw, setKw] = useState(''); const [st, setSt] = useState('all'); const [who, setWho] = useState('all');
  const load = useCallback(() => fetch('/api/admin/work/home?view=tasks&all=1', { cache: 'no-store' }).then(r => r.json()).then(j => setTasks(j.ok ? j.tasks : [])).catch(() => setTasks([])), []);
  useEffect(() => { load(); }, [load]);
  const people = useMemo(() => { const m: Record<string, number> = {}; for (const t of tasks || []) m[t.created_by || '—'] = (m[t.created_by || '—'] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [tasks]);
  const list = (tasks || []).filter(t => (st === 'all' || t.status === st) && (who === 'all' || (t.created_by || '—') === who) && (!kw || [t.title, t.company, t.role].some((v: string) => String(v || '').includes(kw))));
  const setStatus = async (t: any, status: string) => { const j = await (await fetch(`/api/admin/work/tasks/${t.task_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })).json().catch(() => ({ ok: false })); if (j.ok === false) message.error(j.error || '没改成'); else { message.success(status === 'published' ? '已发布' : '已下架'); load(); } };
  const remove = (t: any) => modal.confirm({ title: `删除「${t.title}」？`, content: '这道题和所有作答都会删掉，不能恢复。', okText: '删除', okButtonProps: { danger: true }, cancelText: '取消', onOk: async () => { await fetch(`/api/admin/work/tasks/${t.task_id}`, { method: 'DELETE' }); message.success('已删除'); load(); } });
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input className="wws-in" value={kw} onChange={e => setKw(e.target.value)} placeholder="搜标题 / 企业 / 岗位" style={{ minWidth: 220 }} />
        <select className="wws-in" value={who} onChange={e => setWho(e.target.value)}><option value="all">所有人出的</option>{people.map(([p, n]) => <option key={p} value={p}>{p}（{n}）</option>)}</select>
        {[['all', '全部'], ['published', '已发布'], ['ready', '待发布'], ['archived', '已下架']].map(([k, t]) => <button key={k} className={`wws-chip${st === k ? ' on' : ''}`} onClick={() => setSt(k)}>{t}</button>)}
        <span className="wws-muted" style={{ marginLeft: 'auto' }}>{tasks ? `${list.length} / ${tasks.length} 道` : ''}</span>
      </div>
      <div className="wws-card" style={{ overflowX: 'auto' }}>
        <table className="wws-table t-all">
          <thead><tr>{[['TASK', '题目'], ['BY', '谁出的'], ['STATUS', '状态'], ['TAKERS', '参与 / 交卷'], ['AVG', '平均'], ['AI', '基线'], ['CREATED', '出题时间'], ['', '']].map(([e, z], i) => <th key={i}>{e}<small>{z}</small></th>)}</tr></thead>
          <tbody>
            {tasks == null && <tr><td colSpan={8} className="wws-muted">读取中…</td></tr>}
            {tasks && !list.length && <tr><td colSpan={8}><Empty>没有符合的。</Empty></td></tr>}
            {list.map(t => <tr key={t.task_id}>
              <td style={{ minWidth: 260 }}><a className="t" href={`/work/${t.token}/owner?k=${encodeURIComponent(t.owner_key || '')}`} target="_blank" rel="noreferrer">{t.title}</a><div className="sub">{[t.company, t.role].filter(Boolean).join(' · ')}</div></td>
              <td className="wws-muted" style={{ whiteSpace: 'nowrap' }}>{t.created_by || '—'}</td>
              <td><span className={`wws-tag ${TONE[t.status] || 'mute'}`}>{STATUS[t.status]?.[0] || t.status}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>{t.started} / <b>{t.submitted}</b></td>
              <td><span className="wws-num" style={{ color: col(t.avg) }}>{t.avg ?? '—'}</span></td>
              <td className="wws-muted">{t.baseline ?? '—'}</td>
              <td className="wws-muted" style={{ whiteSpace: 'nowrap' }}>{when(t.created_at)}</td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                {t.status === 'published' ? <button className="wws-back" style={lnk} onClick={() => setStatus(t, 'archived')}>下架</button> : <button className="wws-back" style={lnk} onClick={() => setStatus(t, 'published')}>发布</button>}
                <button style={{ ...lnk, color: '#b42318' }} onClick={() => remove(t)}>删</button>
                {t.submitted > 0 && <Link href={`/work/ws/reports?task=${t.task_id}`} className="wws-back" style={{ marginRight: 10 }}>看报告</Link>}
                <Link href={askHref(t.submitted ? '这道题大家做得怎么样？卡在哪，推荐谁？' : '这道题现在什么情况？', { task_id: t.task_id, token: t.token, k: t.owner_key, title: t.title })}><button className="wws-ask">问助理</button></Link>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Assets() {
  const L: [string, string, string, string][] = [
    ['题目资产库', 'Question bank', '/admin/db-question', '所有出过的题按企业 / 行业 / 职能沉淀，出题时自动挑来参照（对客户不讲）。'],
    ['外部参照', 'External simulations', '/admin/db-external-sim', 'Forage / Extern 的公开模拟和作品墙，看行业真活怎么出、学员交什么。'],
  ];
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 12 }}>{L.map(([t, en, href, d]) => <a key={href} href={href} target="_blank" rel="noreferrer" className="wws-card lined pad" style={{ textDecoration: 'none' }}><div className="wws-eyebrow">{en}</div><div style={{ font: '800 17px var(--serif)', margin: '6px 0' }}>{t} ↗</div><div className="wws-muted" style={{ lineHeight: 1.75 }}>{d}</div></a>)}</div>;
}

const lnk: React.CSSProperties = { border: 0, background: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 700, fontSize: 13, marginRight: 10, padding: 0 };
