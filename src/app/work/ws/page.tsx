'use client';

/** 真活工作台 · 首页：一句问候 + 输入框（写了就开一段新对话）+ 常用指令；下面是案头——几个数、最近交卷的人、最近的题，每块都能「问助理」接着往下看 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CHAT_CSS, Composer } from '@/components/work/ChatKit';
import { askHref, CMDS, col, savedModel, STATUS, when } from './ask';
import { Empty, Rule, WsTour } from './ui';
import type { TourStep } from '@/components/work/Tour';

const hello = () => { const h = new Date().getHours(); return h < 6 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'; };
// 第一次进工作台的引导：从输入框讲到侧栏每个入口，最后是账号菜单
const HOME_TOUR: TourStep[] = [
  { key: 'ask', title: '有事直接说', text: '出一道任务、看谁做得好、分析一份报告、改题、上下架，都在这里说一句，AI 来办。打「/」能看常用指令。' },
  { key: 'desk', title: '案头', text: '最近交卷的人、最近出的题。每一行的「问助理」会把这个人或这道题带进对话，接着往下问。' },
  { key: 'ham', title: '菜单', text: '管理真活、任务报告、知识库、任务库、最近的对话，还有设置和退出登录，都在这里。右上角的笔是开一段新对话。' },
  { key: 'nav-new', title: '新对话', text: '每件事开一段对话，都会存着；做出来的题、报告在对话右边打开。' },
  { key: 'recent', title: '最近的对话', text: '聊过的都在这里，点开接着聊。' },
  { key: 'nav-tasks', title: '管理真活', text: '你出过的每道题：状态、多少人做、平均分。右上「＋ 新建」也能手动一项项填。' },
  { key: 'nav-reports', title: '任务报告', text: '所有交卷的人一张表。看报告，或者勾同一道题的几个人让助理并排比。' },
  { key: 'nav-kb', title: '知识库', text: '企业介绍、岗位要求、你过往的题和素材存在这里。助理出任务前会先查，不用每次重说。' },
  { key: 'nav-library', title: '任务库', text: '平台上现成的好任务，可以原题直出换成你们公司，或者只做参考。' },
  { key: 'account', title: '账号菜单', text: '设置、使用教程、切换到传统版、退出登录都在这里。想再看一遍这份引导，也点这里的「新手引导」。' },
];
const TONE: Record<string, string> = { published: 'ok', ready: 'warn', archived: 'mute' };

export default function HomePage() {
  const router = useRouter();
  const [text, setText] = useState(''); const [model, setModel] = useState('claude-opus-5-5');
  const [greet, setGreet] = useState('你好');
  useEffect(() => { setGreet(hello()); setModel(savedModel()); }, []);
  const go = (t: string) => { try { sessionStorage.setItem('wws-pending', JSON.stringify({ text: t, model })); } catch {} router.push('/work/ws/chat'); };
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch('/api/admin/work/home?view=overview', { cache: 'no-store' }).then(r => r.json()).then(j => setD(j.ok ? j : { stats: {}, tasks: [], recent: [] })).catch(() => setD({ stats: {}, tasks: [], recent: [] })); }, []);
  const st = d?.stats || {};
  const nums: [string, string, any][] = [['TASKS', '出过的题', st.tasks], ['LIVE', '已发布', st.live], ['DRAFT', '待发布', st.pending], ['TAKERS', '参与', st.started], ['SUBMITTED', '交卷', st.submitted]];
  return (
    <div className="wws-page h-page">
      <style>{CHAT_CSS + CSS}</style>
      <WsTour id="home" steps={HOME_TOUR} />
      <section className="h-hero">
        <div className="wws-eyebrow">TRUE WORK, TRUE TALENT</div>
        <h1>{greet}。你需要做什么，让 AI 来办<span>Tell it what you need. It drafts, reads, compares — you decide.</span></h1>
        <div data-tour="ask"><Composer text={text} setText={setText} busy={false} send={go} stop={() => {}} model={model} setModel={setModel} autoFocus commands={CMDS} placeholder="说你要做什么，或者打 / 看常用指令" /></div>
      </section>

      <Rule zh="案头" en="At a glance" />
      <div className="wws-stats">{nums.map(([en, zh, v]) => <div key={en} className="wws-card wws-stat"><i>{en}</i><b>{d ? v ?? 0 : '…'}</b><span>{zh}</span></div>)}</div>

      <div className="h-cols" data-tour="desk">
        <section className="wws-card lined pad">
          <div className="wws-card-h"><h2 className="wws-h2">最近交卷<small>Latest submissions</small></h2><Link href={askHref('最近交卷的这几个人里，谁值得我先看？为什么？')} style={{ marginLeft: 'auto' }}><button className="wws-ask">问助理：先看谁</button></Link></div>
          {d && !d.recent.length && <Empty>还没有人交卷。题发布后，把参与链接发给候选人。</Empty>}
          {(d?.recent || []).map((p: any) => <div key={p.session_id} className="h-row">
            <b className="wws-num" style={{ width: 34, color: col(p.score) }}>{p.score ?? '—'}</b>
            <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontWeight: 800 }}>{p.name}</div><div className="h-sub">{p.task_title} · {when(p.submitted_at)}{p.minutes != null ? ` · ${p.minutes} 分钟` : ''}</div></div>
            {p.graded && <Link href={askHref(`分析一下 ${p.name} 这份报告：强在哪、弱在哪、面试要追问什么？`, { task_id: p.task_id, token: p.token, sid: p.session_id, title: p.task_title, name: p.name })}><button className="wws-ask">分析</button></Link>}
          </div>)}
          {(d?.recent || []).length > 0 && <Link href="/work/ws/reports" className="h-more">全部任务报告 →</Link>}
        </section>
        <section className="wws-card lined pad">
          <div className="wws-card-h"><h2 className="wws-h2">最近的题<small>Recent tasks</small></h2><Link href="/work/ws/tasks" style={{ marginLeft: 'auto' }}><button className="wws-ask">管理真活</button></Link></div>
          {d && !d.tasks.length && <Empty>还没出过题。在上面说一句你缺什么样的人就能出。</Empty>}
          {(d?.tasks || []).map((t: any) => <div key={t.task_id} className="h-row">
            <span className={`wws-tag ${TONE[t.status] || 'mute'}`}>{STATUS[t.status]?.[0] || t.status}</span>
            <div style={{ minWidth: 0, flex: 1 }}><a href={`/work/${t.token}/owner?k=${encodeURIComponent(t.owner_key || '')}`} target="_blank" rel="noreferrer" style={{ fontWeight: 800, textDecoration: 'none' }}>{t.title}</a><div className="h-sub">{t.company} · {t.started} 人做 / {t.submitted} 人交{t.avg != null ? ` · 平均 ${t.avg}` : ''}</div></div>
            <Link href={askHref(t.submitted ? '这道题大家做得怎么样？卡在哪，推荐谁？' : '这道题现在什么情况？下一步该做什么？', { task_id: t.task_id, token: t.token, k: t.owner_key, title: t.title })}><button className="wws-ask">问助理</button></Link>
          </div>)}
        </section>
      </div>
    </div>
  );
}

const CSS = `
.h-page { max-width: 1080px; }   /* 输入框、案头、两栏同一个宽度（11-05：以前输入框 800、下面 1240，不齐） */
.h-hero { margin: 26px 0 8px; position: relative; }
.h-hero h1 { font: 900 32px/1.3 var(--serif); letter-spacing: .03em; margin: 10px 0 18px; }
.h-hero h1 span { display: block; font: italic 400 15.5px var(--en); color: var(--ink2); margin-top: 8px; letter-spacing: .005em; }
.h-hero .wc-composer { background: var(--paper); border-color: var(--line); box-shadow: 0 18px 40px -28px rgba(27,29,54,.35); }
.h-hero .wc-composer:focus-within { border-color: var(--acc); }
@media (max-width: 640px) { .h-hero { margin-top: 6px; } .h-hero h1 { font-size: 24px; } .h-hero h1 span { font-size: 14px; } }
.h-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(380px, 100%), 1fr)); gap: 14px; margin-top: 14px; }
.h-row { display: flex; align-items: center; gap: 12px; padding: 11px 0; border-top: 1px solid var(--line2); font-size: 13.5px; }
.h-sub { color: var(--ink3); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.h-more { display: inline-block; margin-top: 10px; color: var(--acc); font-weight: 700; font-size: 13px; text-decoration: none; }
`;
