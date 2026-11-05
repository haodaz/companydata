'use client';

/** 真活工作台 · 首页：上面一个输入框（写了就开一段新对话），下面是总览——几个数 + 最近交卷的人 + 最近的题；每块都能「问助理」接着往下看 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CHAT_CSS, Composer } from '@/components/work/ChatKit';
import { askHref, col, STATUS, when } from './ask';

const SUGGEST = ['我出的题最近有人做吗？哪道值得先看？', '把最近那道题交卷的人并排比一下，推荐谁进面试', '这道题大家卡在哪？是不是出得太难了', '我们要招一个能把销售数据理清楚的人，帮我出一道真活'];

export default function HomePage() {
  const router = useRouter();
  const [text, setText] = useState(''); const [model, setModel] = useState('claude-opus-5-5');
  const go = (t: string) => { try { sessionStorage.setItem('wws-pending', JSON.stringify({ text: t, model })); } catch {} router.push('/work/ws/chat'); };
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch('/api/admin/work/home?view=overview', { cache: 'no-store' }).then(r => r.json()).then(j => setD(j.ok ? j : { stats: {}, tasks: [], recent: [] })).catch(() => setD({ stats: {}, tasks: [], recent: [] })); }, []);
  const st = d?.stats || {};
  const nums: [string, any, string?][] = [['出过的题', st.tasks], ['已发布', st.live], ['待发布', st.pending, st.pending ? '确认没问题就发布，参与链接才能用' : undefined], ['参与', st.started], ['交卷', st.submitted]];
  return (
    <div className="wws-page">
      <style>{CHAT_CSS}</style>
      <div style={{ maxWidth: 780, margin: '28px auto 34px' }}>
        <div className="wc-eyebrow">TRUE WORK, TRUE TALENT · 真活工作台</div>
        <h1 style={{ fontSize: 30, fontWeight: 900, margin: '8px 0 14px' }}>今天要做什么？</h1>
        <Composer text={text} setText={setText} busy={false} send={go} stop={() => {}} model={model} setModel={setModel} autoFocus placeholder="说你要做什么：出一道任务、看谁做得好、分析一份报告、改题……" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>{SUGGEST.map(x => <button key={x} onClick={() => setText(x)} style={sug}>{x}</button>)}</div>
      </div>
      <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 10px' }}>总览</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
        {nums.map(([t, v, tip]) => <div key={t} className="wws-card" title={tip} style={{ padding: '14px 16px' }}><div style={{ fontSize: 12.5, color: '#8c8fa6' }}>{t}</div><div style={{ fontSize: 28, fontWeight: 900 }}>{d ? v ?? 0 : '…'}</div></div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
        <section className="wws-card" style={{ padding: '14px 16px' }}>
          <div style={head}><b>最近交卷</b><Link href={askHref('最近交卷的这几个人里，谁值得我先看？为什么？')} style={{ marginLeft: 'auto' }}><button className="wws-ask">问助理：先看谁</button></Link></div>
          {d && !d.recent.length && <div style={empty}>还没有人交卷。</div>}
          {(d?.recent || []).map((p: any) => <div key={p.session_id} style={row}>
            <b style={{ width: 28, color: col(p.score), fontSize: 16 }}>{p.score ?? '—'}</b>
            <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 700 }}>{p.name}</div><div style={sub}>{p.task_title} · {when(p.submitted_at)}{p.minutes != null ? ` · ${p.minutes} 分钟` : ''}</div></div>
            {p.graded && <Link href={askHref(`分析一下 ${p.name} 这份报告：强在哪、弱在哪、面试要追问什么？`, { task_id: p.task_id, token: p.token, sid: p.session_id, title: p.task_title, name: p.name })}><button className="wws-ask">分析</button></Link>}
          </div>)}
          {(d?.recent || []).length > 0 && <Link href="/work/ws/reports" style={more}>所有任务报告 →</Link>}
        </section>
        <section className="wws-card" style={{ padding: '14px 16px' }}>
          <div style={head}><b>最近的题</b><Link href={askHref('帮我出一道新的真活')} style={{ marginLeft: 'auto' }}><button className="wws-ask">＋ 让助理出一道</button></Link></div>
          {d && !d.tasks.length && <div style={empty}>还没出过题。</div>}
          {(d?.tasks || []).map((t: any) => <div key={t.task_id} style={row}>
            <span style={{ fontSize: 12, fontWeight: 700, color: STATUS[t.status]?.[1], width: 44, flexShrink: 0 }}>{STATUS[t.status]?.[0]}</span>
            <div style={{ minWidth: 0, flex: 1 }}><a href={`/work/${t.token}/owner?k=${encodeURIComponent(t.owner_key || '')}`} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: '#1a1a2e', textDecoration: 'none' }}>{t.title}</a><div style={sub}>{t.company} · {t.started} 人做 / {t.submitted} 人交{t.avg != null ? ` · 平均 ${t.avg}` : ''}</div></div>
            <Link href={askHref(t.submitted ? '这道题大家做得怎么样？卡在哪，推荐谁？' : '这道题现在什么情况？下一步该做什么？', { task_id: t.task_id, token: t.token, k: t.owner_key, title: t.title })}><button className="wws-ask">问助理</button></Link>
          </div>)}
          {(d?.tasks || []).length > 0 && <Link href="/work/ws/tasks" style={more}>所有的题 →</Link>}
        </section>
      </div>
    </div>
  );
}

const sug: React.CSSProperties = { border: '1px solid #e0e0ee', background: '#fff', borderRadius: 999, padding: '6px 13px', font: 'inherit', fontSize: 13, color: '#3b405a', cursor: 'pointer' };
const head: React.CSSProperties = { display: 'flex', alignItems: 'center', marginBottom: 8, fontSize: 15 };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid #f0f1f6', fontSize: 13.5 };
const sub: React.CSSProperties = { color: '#8c8fa6', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const empty: React.CSSProperties = { color: '#999', fontSize: 13, padding: '8px 0' };
const more: React.CSSProperties = { display: 'inline-block', marginTop: 8, color: '#6055f5', fontWeight: 700, fontSize: 13, textDecoration: 'none' };
