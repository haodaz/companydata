'use client';

/**
 * 百业 · AI 与我的工作（2026-11-01，C 端最小版本）：输入职位 / JD / 简历 → 选职业 → 一屏一件事地看：
 * 暴露分 → 任务怎么分（AI 接手 / 人机协作 / 人来做）→ 新增的任务和薪资 → 强项与风险 → 接下来（试一天、做一道真活）。
 * 数据来自职业库；逻辑在 src/lib/lab-ai-change.ts。
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ChangeResult, OccHit } from '@/lib/lab-ai-change';

type Phase = 'input' | 'matching' | 'pick' | 'analyzing' | 'reveal';
const LOADING = ['读你写的…', '对上职业库…', '拆这一行的任务…', '看哪些 AI 能接手…', '找你的强项…'];
const KIND = { ai: { t: 'AI 接手', c: '#ef4444', bg: '#fff1f0', d: 'AI 基本能做，人抽查' }, hybrid: { t: '人机协作', c: '#6055f5', bg: '#f3f2ff', d: 'AI 做一部分，人把关定方向' }, human: { t: '人来做', c: '#16a34a', bg: '#ecfdf3', d: '现场、关系、担责、手上功夫' } } as const;
const STEPS = ['暴露分', '任务', '新增与薪资', '强项与风险', '接下来'];

async function post(body: any) {
  const r = await fetch('/api/lab/ai-change', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
  if (r.status === 401) { window.location.href = `/lab/login?next=${encodeURIComponent('/lab/ai-change')}`; throw new Error('先登录'); }
  if (!j.ok) throw new Error(j.error || '没成功');
  return j;
}

export default function AiChangePage() {
  const [phase, setPhase] = useState<Phase>('input');
  const [text, setText] = useState('');
  const [hits, setHits] = useState<OccHit[]>([]);
  const [res, setRes] = useState<ChangeResult | null>(null);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => { if (phase !== 'matching' && phase !== 'analyzing') return; const t = setInterval(() => setTick(v => v + 1), 1600); return () => clearInterval(t); }, [phase]);

  const match = async () => {
    if (text.trim().length < 2) return setErr('写一下你的职位，或者贴一段 JD / 简历');
    setErr(''); setPhase('matching'); setTick(0);
    try { const j = await post({ step: 'match', text }); if (!j.hits.length) throw new Error('职业库里没对上，换个说法试试（比如「数据分析师」「护士」）'); setHits(j.hits); setPhase('pick'); }
    catch (e: any) { setErr(e.message); setPhase('input'); }
  };
  const busy = React.useRef(false);   // 分析进行中再点卡片不重复发
  const analyze = async (id: number) => {
    if (busy.current) return; busy.current = true;
    setErr(''); setPhase('analyzing'); setTick(0);
    try { const j = await post({ step: 'analyze', occupation_id: id, text }); setRes(j.result); setStep(0); setPhase('reveal'); }
    catch (e: any) { setErr(e.message); setPhase('pick'); }
    finally { busy.current = false; }
  };

  return (
    <div className="aic">
      <style>{CSS}</style>
      {phase === 'input' && <section className="aic-in aic-hero">
        <div className="aic-eb">AI 与我的工作</div>
        <h1>AI 会怎么改变<br /><em>你的工作？</em></h1>
        <p className="aic-lead">写下你的职位，或者贴一段 JD、简历。我们对着职业库，把这份工作拆成一项项任务，看哪些 AI 会接手、哪些更需要你。</p>
        <div className="aic-box lab-glass">
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder={'比如：数据分析师\n或者贴一段 JD / 简历（贴了简历，结果会按你的经历调整）'} rows={5} />
          <div className="aic-row"><span className="aic-hint">只用来分析这一次，不会存你的简历</span><button className="lab-btn" onClick={match}>开始 →</button></div>
        </div>
        <div className="aic-try">试试：{['数据分析师', '护士', '产品经理', '会计', '电工'].map(x => <button key={x} onClick={() => setText(x)}>{x}</button>)}</div>
        {err && <div className="aic-err">{err}</div>}
      </section>}

      {(phase === 'matching' || phase === 'analyzing') && <section className="aic-in aic-wait">
        <div className="aic-orb" />
        <h2>{LOADING[tick % LOADING.length]}</h2>
        <p>{phase === 'matching' ? '在 631 个职业里找最像你的' : '第一次分析大约半分钟'}</p>
      </section>}

      {phase === 'pick' && <section className="aic-in">
        <div className="aic-eb">第一步</div>
        <h2 className="aic-h2">哪个最像你的工作？</h2>
        <div className="aic-picks">{hits.map((h, i) => (
          <button key={h.id} className="aic-pick lab-glass" style={{ animationDelay: `${i * 0.08}s` }} onClick={() => analyze(h.id)}>
            <b>{h.name}</b><span>{h.category}</span><p>{h.intro}</p>
          </button>))}</div>
        <button className="aic-back" onClick={() => setPhase('input')}>← 改一下输入</button>
        {err && <div className="aic-err">{err}</div>}
      </section>}

      {phase === 'reveal' && res && <section className="aic-in aic-rev">
        <div className="aic-top"><span className="aic-eb">{res.occupation.name}{res.occupation.category ? ` · ${res.occupation.category}` : ''}</span><span className="aic-dots">{STEPS.map((s, i) => <i key={s} className={i === step ? 'on' : i < step ? 'past' : ''} onClick={() => setStep(i)} title={s} />)}</span></div>

        {step === 0 && <div className="aic-screen" key="s0">
          <h2 className="aic-h2">AI 能接手你工作的多少？</h2>
          <div className="aic-score">
            <div className="aic-ring" style={{ ['--p' as string]: res.score }}><b>{res.score}</b><span>/ 100</span></div>
            <div className="aic-score-side">
              <div>这一行平均 <b>{res.baseline}</b></div>
              {res.adjustments.length ? <div className="aic-adj">{res.adjustments.map((a, i) => <div key={i}><span className={a.delta < 0 ? 'down' : 'up'}>{a.delta > 0 ? '+' : ''}{a.delta}</span>「{a.quote}」<em>{a.why}</em></div>)}</div>
                : <div className="aic-muted">贴一段简历，会按你的经历加减</div>}
            </div>
          </div>
          <p className="aic-verdict">{res.verdict}</p>
        </div>}

        {step === 1 && <div className="aic-screen" key="s1">
          <h2 className="aic-h2">这一行的 {res.tasks.length} 项任务，会这样分</h2>
          <div className="aic-cols">{(['ai', 'hybrid', 'human'] as const).map((k, ci) => { const list = res.tasks.filter(t => t.kind === k); return (
            <div key={k} className="aic-col" style={{ animationDelay: `${ci * 0.15}s` }}>
              <div className="aic-col-h" style={{ color: KIND[k].c }}><b>{list.length}</b> 项 · {KIND[k].t}<span>{KIND[k].d}</span></div>
              {list.map((t, i) => <div key={i} className="aic-task" style={{ background: KIND[k].bg, borderColor: `${KIND[k].c}33` }}><b>{t.name}</b>{t.how && <p>{t.how}</p>}</div>)}
            </div>); })}</div>
          <div className="aic-src">任务来自{res.task_source}</div>
        </div>}

        {step === 2 && <div className="aic-screen" key="s2">
          <h2 className="aic-h2">AI 时代，这一行会多出来的事</h2>
          <div className="aic-new">{res.new_tasks.map((t, i) => <div key={i} className="lab-glass"><span>新增</span><b>{t.name}</b><p>{t.why}</p></div>)}</div>
          {(res.salary.bands.length > 0 || res.salary.monthly) && <div className="aic-sal lab-glass">
            <div className="aic-sal-h">这一行现在的月薪{res.salary.monthly ? <> · 全国平均 <b>¥{res.salary.monthly.toLocaleString()}</b></> : null}</div>
            {res.salary.bands.map(b => { const max = Math.max(...res.salary.bands.map(x => x.salary)); return <div key={b.label} className="aic-bar"><span>{b.label}</span><i style={{ width: `${(b.salary / max) * 100}%` }} /><b>¥{b.salary.toLocaleString()}</b></div>; })}
            <div className="aic-src">来自职业库{res.salary.source ? <> · <a href={res.salary.source} target="_blank" rel="noreferrer">原始来源</a></> : null}。不预测 AI 之后的薪资。</div>
          </div>}
        </div>}

        {step === 3 && <div className="aic-screen" key="s3">
          <h2 className="aic-h2">你的强项，和要提前准备的</h2>
          <div className="aic-sr">
            <div><div className="aic-sr-h good">AI 拿不走的</div>{res.strengths.map((x, i) => <div key={i} className="aic-card lab-glass"><b>{x.title}</b><p>{x.why}</p><div className="aic-next">这周可以做：{x.next}</div></div>)}</div>
            <div><div className="aic-sr-h risk">最先被 AI 接手的</div>{res.risks.map((x, i) => <div key={i} className="aic-card lab-glass"><b>{x.title}</b><p>{x.why}</p><div className="aic-next">这周可以做：{x.next}</div></div>)}</div>
          </div>
        </div>}

        {step === 4 && <div className="aic-screen" key="s4">
          <h2 className="aic-h2">别只看，去试一试</h2>
          <div className="aic-go">
            {res.next.spaces.map(s => <Link key={s.id} href={`/lab/${s.id}`} className="aic-go-card lab-glass">{s.avatar ? <img src={s.avatar} alt="" /> : <div className="aic-ph">试</div>}<div><span>亲手试一天</span><b>{s.role || s.title}</b><p>跟数字职人走一遍这一行最有代表性的一天</p></div></Link>)}
            {!res.next.spaces.length && <Link href="/lab/gallery" className="aic-go-card lab-glass"><div className="aic-ph">试</div><div><span>亲手试一天</span><b>去体验百业找相近的职业</b><p>还没有「{res.occupation.name}」的空间，看看相近的</p></div></Link>}
            {res.next.work.map(w => <Link key={w.id} href="/work/library" className="aic-go-card lab-glass"><div className="aic-ph work">真</div><div><span>做一道真活 · {w.industry}</span><b>{w.title}</b><p>用一道真实任务证明你会用 AI，拿一份报告</p></div></Link>)}
            {!res.next.work.length && <Link href="/work/library" className="aic-go-card lab-glass"><div className="aic-ph work">真</div><div><span>做一道真活</span><b>去真活任务库挑一道</b><p>用一道真实任务证明你会用 AI</p></div></Link>}
          </div>
          <button className="aic-back" onClick={() => { setPhase('input'); setRes(null); }}>换一份工作再看 →</button>
        </div>}

        <div className="aic-nav">
          <button className="lab-btn ghost" disabled={step === 0} onClick={() => setStep(s => s - 1)}>← 上一步</button>
          <span>{step + 1} / {STEPS.length} · {STEPS[step]}</span>
          {step < STEPS.length - 1 ? <button className="lab-btn" onClick={() => setStep(s => s + 1)}>下一步 →</button> : <span style={{ width: 96 }} />}
        </div>
      </section>}
    </div>
  );
}

const CSS = `
.aic { max-width: 1080px; margin: 0 auto; padding: 36px 20px 90px; min-height: calc(100vh - 80px); }
.aic-in { animation: aicUp .5s both; }
@keyframes aicUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.aic-eb { display: inline-block; font-size: 13px; letter-spacing: .14em; font-weight: 700; color: var(--v, #6055f5); padding: 5px 12px; border-radius: 999px; background: rgba(96,85,245,.08); }
.aic-hero { text-align: center; padding-top: 6vh; }
.aic-hero h1 { font-size: clamp(38px, 6vw, 64px); line-height: 1.15; margin: 18px 0 14px; font-weight: 900; }
.aic-hero h1 em, .aic-h2 em { font-style: normal; background: linear-gradient(120deg, #6055f5, #12b5cb); -webkit-background-clip: text; background-clip: text; color: transparent; }
.aic-lead { font-size: 17px; color: var(--ink2); max-width: 620px; margin: 0 auto 26px; line-height: 1.8; }
.aic-box { max-width: 640px; margin: 0 auto; padding: 14px; text-align: left; }
.aic-box textarea { width: 100%; border: 0; outline: none; resize: vertical; background: transparent; font: inherit; font-size: 16px; line-height: 1.7; color: var(--ink); }
.aic-row { display: flex; align-items: center; gap: 10px; } .aic-hint { flex: 1; font-size: 12.5px; color: var(--ink3); }
.aic-try { margin-top: 16px; font-size: 13px; color: var(--ink3); display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; align-items: center; }
.aic-try button { border: 1px solid var(--line); background: rgba(255,255,255,.7); border-radius: 999px; padding: 4px 12px; font: inherit; cursor: pointer; color: var(--ink2); }
.aic-err { margin-top: 14px; color: #d6336c; font-size: 14px; text-align: center; }
.aic-wait { text-align: center; padding-top: 18vh; }
.aic-wait h2 { font-size: 28px; margin: 26px 0 6px; } .aic-wait p { color: var(--ink3); }
.aic-orb { width: 120px; height: 120px; margin: 0 auto; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #b8b0ff, #6055f5 55%, #12b5cb); animation: aicPulse 1.6s ease-in-out infinite; box-shadow: 0 20px 60px -10px rgba(96,85,245,.5); }
@keyframes aicPulse { 50% { transform: scale(1.08); filter: hue-rotate(20deg); } }
.aic-h2 { font-size: clamp(26px, 3.6vw, 38px); font-weight: 900; margin: 14px 0 24px; line-height: 1.25; }
.aic-picks { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
.aic-pick { text-align: left; padding: 20px 22px; border: 0; cursor: pointer; font: inherit; color: var(--ink); animation: aicUp .5s both; transition: transform .2s; }
.aic-pick:hover { transform: translateY(-3px); } .aic-pick b { font-size: 21px; display: block; } .aic-pick span { font-size: 12.5px; color: var(--v, #6055f5); } .aic-pick p { font-size: 13.5px; color: var(--ink2); line-height: 1.6; margin: 8px 0 0; }
.aic-back { margin-top: 18px; border: 0; background: none; color: var(--ink3); cursor: pointer; font: inherit; }
.aic-top { display: flex; align-items: center; gap: 12px; }
.aic-dots { margin-left: auto; display: flex; gap: 6px; } .aic-dots i { width: 26px; height: 6px; border-radius: 3px; background: rgba(96,85,245,.15); cursor: pointer; } .aic-dots i.past { background: rgba(96,85,245,.45); } .aic-dots i.on { background: #6055f5; }
.aic-screen { animation: aicUp .5s both; min-height: 52vh; }
.aic-score { display: flex; gap: 44px; align-items: center; flex-wrap: wrap; margin-top: 10px; }
.aic-ring { --p: 50; width: 230px; height: 230px; border-radius: 50%; display: grid; place-items: center; align-content: center; background: radial-gradient(closest-side, #fff 78%, transparent 79% 100%), conic-gradient(#6055f5 calc(var(--p) * 1%), rgba(96,85,245,.12) 0); box-shadow: 0 24px 60px -24px rgba(96,85,245,.45); }
.aic-ring b { font-size: 72px; font-weight: 900; line-height: 1; } .aic-ring span { font-size: 15px; color: var(--ink3); }
.aic-score-side { flex: 1; min-width: 260px; font-size: 17px; } .aic-score-side > div:first-child b { font-size: 26px; }
.aic-adj { margin-top: 14px; display: grid; gap: 8px; font-size: 14.5px; } .aic-adj span { display: inline-block; min-width: 34px; font-weight: 800; } .aic-adj .down { color: #16a34a; } .aic-adj .up { color: #ef4444; } .aic-adj em { font-style: normal; color: var(--ink3); margin-left: 6px; font-size: 13px; }
.aic-muted { color: var(--ink3); font-size: 14px; margin-top: 10px; }
.aic-verdict { font-size: 19px; line-height: 1.7; margin-top: 28px; max-width: 760px; }
.aic-cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.aic-col { animation: aicUp .5s both; } .aic-col-h { font-size: 16px; font-weight: 700; margin-bottom: 10px; } .aic-col-h b { font-size: 30px; font-weight: 900; margin-right: 2px; } .aic-col-h span { display: block; font-size: 12.5px; color: var(--ink3); font-weight: 400; }
.aic-task { border: 1px solid; border-radius: 12px; padding: 10px 12px; margin-bottom: 8px; } .aic-task b { font-size: 14.5px; } .aic-task p { margin: 4px 0 0; font-size: 12.5px; color: var(--ink2); line-height: 1.55; }
.aic-src { font-size: 12.5px; color: var(--ink3); margin-top: 12px; } .aic-src a { color: inherit; }
.aic-new { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .aic-new > div { padding: 18px 20px; } .aic-new span { font-size: 12px; font-weight: 700; color: #b45309; background: #fff7e6; padding: 2px 8px; border-radius: 6px; } .aic-new b { display: block; font-size: 20px; margin: 8px 0 4px; } .aic-new p { margin: 0; color: var(--ink2); line-height: 1.6; }
.aic-sal { margin-top: 18px; padding: 18px 22px; } .aic-sal-h { font-size: 15px; margin-bottom: 12px; } .aic-sal-h b { font-size: 20px; }
.aic-bar { display: grid; grid-template-columns: 80px 1fr 90px; gap: 10px; align-items: center; font-size: 13.5px; margin: 6px 0; } .aic-bar i { display: block; height: 12px; border-radius: 6px; background: linear-gradient(90deg, #b8b0ff, #6055f5); } .aic-bar b { text-align: right; }
.aic-sr { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; } .aic-sr-h { font-size: 15px; font-weight: 800; margin-bottom: 10px; } .aic-sr-h.good { color: #16a34a; } .aic-sr-h.risk { color: #ef4444; }
.aic-card { padding: 16px 18px; margin-bottom: 12px; } .aic-card b { font-size: 18px; } .aic-card p { margin: 6px 0 8px; color: var(--ink2); line-height: 1.6; } .aic-next { font-size: 13.5px; padding: 8px 12px; border-radius: 10px; background: rgba(96,85,245,.07); color: #4c43c9; }
.aic-go { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.aic-go-card { display: flex; gap: 16px; align-items: center; padding: 18px; text-decoration: none; color: var(--ink); transition: transform .2s; } .aic-go-card:hover { transform: translateY(-3px); }
.aic-go-card img, .aic-ph { width: 72px; height: 72px; border-radius: 18px; object-fit: cover; flex: none; } .aic-ph { display: grid; place-items: center; font-size: 26px; font-weight: 900; color: #fff; background: linear-gradient(135deg, #8f86ff, #6055f5); } .aic-ph.work { background: linear-gradient(135deg, #5eead4, #12b5cb); }
.aic-go-card span { font-size: 12.5px; color: var(--v, #6055f5); font-weight: 700; } .aic-go-card b { display: block; font-size: 18px; margin: 2px 0; } .aic-go-card p { margin: 0; font-size: 13px; color: var(--ink2); }
.aic-nav { display: flex; align-items: center; justify-content: space-between; margin-top: 30px; font-size: 13px; color: var(--ink3); }
@media (max-width: 760px) { .aic-cols, .aic-new, .aic-sr, .aic-go { grid-template-columns: 1fr; } .aic-score { gap: 20px; } .aic-ring { width: 180px; height: 180px; } .aic-ring b { font-size: 56px; } }
`;
