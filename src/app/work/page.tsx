'use client';

/**
 * 百业AI｜真活 · 公开首页（静态宣传页 + C 端自助出题，老板 / 带队的人不绑 HR、不用登录）
 * 口径照 lab-landing-style：标题直说不自问自答；截图当环境、要真实截图（public/work/*.png 由录制脚本截）。
 */
import React, { useState } from 'react';
import Link from 'next/link';

const ENVS = [{ v: '', l: '按岗位自动选' }, { v: 'doc', l: '文档 / 对账台' }, { v: 'code', l: '代码台' }, { v: 'sheet', l: '表格 / 数据台' }, { v: 'design', l: '设计台' }];
const ENV_NAME: Record<string, string> = { doc: '文档 / 对账台', code: '代码台', sheet: '表格 / 数据台', design: '设计台' };

const SHOTS = [
  { src: '/work/shot-sheet.png', cap: '表格 / 数据台 · 宁德时代 · 供应链计划：三种单位混在一张需求表里，先把账对清' },
  { src: '/work/shot-code.png', cap: '代码台 · 嵌入式软件：写函数、跑自测用例，AI 随便用' },
  { src: '/work/shot-design.png', cap: '设计台 · 结构设计：定参数、画草图、写依据' },
  { src: '/work/shot-report.png', cap: '报告 · 结果逐条有证据，过程看高光 / 风险时刻，和 AI 基线比' },
];

export default function WorkLanding() {
  const [f, setF] = useState({ company: '', role: '', env: '', focus: '', name: '', contact: '' });
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [done, setDone] = useState<any>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(x => ({ ...x, [k]: e.target.value }));
  const go = async () => {
    setErr(''); if (!f.company.trim() || !f.role.trim()) return setErr('企业和岗位都要填'); if (!f.name.trim() || !f.contact.trim()) return setErr('留个称呼和联系方式，管理链接只给你');
    setBusy('在拼这家企业的材料、出题、做材料包、定标准、让 AI 先做一遍……约 2–3 分钟，别关页面');
    try {
      const j = await (await fetch('/api/work/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })).json();
      if (!j.ok) throw new Error(j.error);
      setDone(j);
    } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const origin = typeof location !== 'undefined' ? location.origin : '';
  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#1a1a2e', fontFamily: 'var(--font-geist-sans), -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif' }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 28px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ fontWeight: 800, letterSpacing: 1 }}>百业AI<span style={{ color: '#6055f5' }}>｜</span>真活</div>
        <span style={{ color: '#888', fontSize: 13 }}>平方智能</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 13 }}>
          <a href="#how" style={lnk}>怎么用</a><a href="#envs" style={lnk}>操作台</a><a href="#shots" style={lnk}>看看长什么样</a><a href="#create" style={{ ...lnk, color: '#fff', background: '#6055f5', padding: '6px 14px', borderRadius: 999 }}>出一道真活</a>
        </div>
      </div>

      {/* 首屏：照 /lab 首页的做法——整屏、底图当环境、标题直说 */}
      <section style={{ position: 'relative', minHeight: 'calc(100svh - 60px)', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <img src="/work/shot-sheet.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', opacity: .35 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(255,255,255,.98) 0%, rgba(255,255,255,.94) 48%, rgba(255,255,255,.55) 100%), linear-gradient(0deg, #ffffff 0%, rgba(255,255,255,0) 40%)' }} />
        <div style={{ position: 'relative', width: '100%', maxWidth: 1180, margin: '0 auto', padding: '64px 28px' }}>
          <div style={{ fontSize: 12, letterSpacing: 4, color: '#6055f5', fontWeight: 700 }}>百业AI｜真活 · REAL WORK, REAL TALENT</div>
          <h1 style={{ fontSize: 'clamp(44px, 6.2vw, 78px)', lineHeight: 1.15, margin: '14px 0 18px', fontWeight: 800, letterSpacing: '.02em', color: '#1a1a2e' }}>寻找真人才，<br /><span style={{ background: 'linear-gradient(90deg,#6055f5,#12b5cb)', WebkitBackgroundClip: 'text', color: 'transparent' }}>看他干真活</span></h1>
          <p style={{ fontSize: 'clamp(15px, 1.6vw, 18px)', color: '#4a4f66', lineHeight: 1.85, maxWidth: 580, margin: '0 0 22px' }}>给一家企业、一个岗位，生成此刻真实的业务题；他在操作台上做，我们记录过程、逐条评价，并和 AI 基线对照。</p>
          <div style={{ display: 'grid', gap: 9, marginBottom: 28 }}>
            {['生成真实问题：从企业画像、在招岗位、职业典型任务、行业规范里出题，带材料包和逐条标准', '智能评价考核：结果按标准逐条核对、引用原句当证据，前置没做到后置自动封顶', '记录过程评估：打开了哪些材料、问了 AI 什么、采纳时核没核——高光与风险时刻都指向具体时间', 'AI 基线对照：最强模型先做一遍，差距就是要看的人的本事'].map(c => (
              <div key={c} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 14.5, color: '#3b405a', lineHeight: 1.7 }}><span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', marginTop: 2, background: 'linear-gradient(120deg,#6055f5,#12b5cb)', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>{c}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="#create" style={{ ...btn, textDecoration: 'none', height: 52, display: 'inline-flex', alignItems: 'center', padding: '0 28px' }}>出一道真活 →</a>
            <a href="#shots" style={{ ...btnGhost, textDecoration: 'none', height: 52, display: 'inline-flex', alignItems: 'center' }}>看看长什么样</a>
          </div>
          <div style={{ marginTop: 18, fontSize: 13, color: '#8a8fa8' }}>不用注册 · 出题约 2–3 分钟 · 每人每天 3 道 · 报告只写「观察到」，不下定性</div>
        </div>
      </section>

      {/* 三个价值 */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 28px 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {[
            ['生成真实问题', '不是题库，不是模拟。一万多家企业画像、两万多个岗位、六百多条职业画像和行业标准做底，给个企业名，几分钟出一道这家企业此刻的真活：任务书、材料包（故意留坑）、带依据的逐条标准。'],
            ['智能评价考核', '标准之间有依赖，像老手看活：假设没立住，后面的估算自动封顶。每条打分都引用交付物原句当证据，看得见为什么。'],
            ['记录过程评估', '结果人人能用 AI 生成，只有过程说明是谁在做。工作台把每个动作记成事件流，报告里有高光时刻、风险时刻、六维人机协作观察，都指向具体的分秒。'],
          ].map(([t, d]) => <div key={t} style={{ ...card, padding: '22px 24px' }}><div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>{t}</div><div style={{ fontSize: 14.5, color: '#4a4f66', lineHeight: 1.8 }}>{d}</div></div>)}
        </div>
      </section>

      {/* 怎么用 */}
      <section id="how" style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 28px 8px' }}>
        <h2 style={h2}>四步，不用懂 HR</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {[['1 · 出题', '填企业 + 岗位（想考什么可以多说一句）。生成器拼材料 → 锚定业务问题 → 展开成任务、材料包、逐条标准 → AI 先做一遍。'], ['2 · 甩链接', '参与链接给候选人或团队，留个名字就能做；你拿管理链接，谁做了、做得怎样都在里面。'], ['3 · 他做', '在自己的操作台上做：看材料、随便用 AI、写交付物。所有动作记成事件流。'], ['4 · 看报告', '结果逐条带证据、和 AI 基线比；过程有高光 / 风险时刻；六维人机协作观察。']].map(([t, d]) => <div key={t} style={card}><div style={{ color: '#6055f5', fontWeight: 800, marginBottom: 6 }}>{t}</div><div style={{ fontSize: 14, color: '#4a4f66', lineHeight: 1.75 }}>{d}</div></div>)}
        </div>
      </section>

      {/* 操作台 */}
      <section id="envs" style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 28px 8px' }}>
        <h2 style={h2}>四种操作台，按岗位自动选</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          {[['文档 / 对账台', '方案、邮件、scorecard、口径对账。材料包里故意留坑：数据不全、口径不一致、过期。'], ['代码台', '写函数、脚本；JavaScript 的自测用例直接在浏览器里跑，跑了几次、过了几个都记着。'], ['表格 / 数据台', '起始表直接改、实时预览；单位混用、新旧版本重复这种坑，看他清不清得出来。'], ['设计台', '参数表 + 草图 + 设计说明：定值要有依据，画轮廓、标尺寸、写校核。']].map(([t, d]) => <div key={t} style={card}><div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{t}</div><div style={{ fontSize: 14, color: '#4a4f66', lineHeight: 1.75 }}>{d}</div></div>)}
        </div>
      </section>

      {/* 截图 */}
      <section id="shots" style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 28px 8px' }}>
        <h2 style={h2}>长什么样</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 18 }}>
          {SHOTS.map(s => <figure key={s.src} style={{ margin: 0 }}><div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #e8e9f0', background: '#f7f8fc', minHeight: 120, boxShadow: '0 10px 30px rgba(20,24,60,.08)' }}><img src={s.src} alt={s.cap} style={{ display: 'block', width: '100%' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /></div><figcaption style={{ fontSize: 13, color: '#6b6f86', marginTop: 8, lineHeight: 1.6 }}>{s.cap}</figcaption></figure>)}
        </div>
      </section>

      {/* 出题 */}
      <section id="create" style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 28px 72px' }}>
        <h2 style={h2}>出一道真活</h2>
        {!done ? (
          <div style={{ ...card, padding: '22px 24px' }}>
            <div style={grid}>
              <L label="企业"><input value={f.company} onChange={set('company')} placeholder="公司名，如 宁德时代" style={inp} /></L>
              <L label="岗位"><input value={f.role} onChange={set('role')} placeholder="要考的岗位 / 职业，如 供应链计划、后端开发" style={inp} /></L>
              <L label="操作台"><select value={f.env} onChange={set('env')} style={inp}>{ENVS.map(e => <option key={e.v} value={e.v}>{e.l}</option>)}</select></L>
              <L label="你想考什么（选填）"><input value={f.focus} onChange={set('focus')} placeholder="比如：聚焦某条产线的排产冲突；给 3 年以内的人；难一点" style={inp} /></L>
              <L label="你的称呼"><input value={f.name} onChange={set('name')} placeholder="如 王经理" style={inp} /></L>
              <L label="联系方式"><input value={f.contact} onChange={set('contact')} placeholder="手机 / 微信 / 邮箱（管理链接只发给你）" style={inp} /></L>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={go} disabled={!!busy} style={btn}>{busy ? '出题中…' : '出一道真活 →'}</button>
              <span style={{ fontSize: 13, color: '#8a8fa8' }}>每人每天 3 道 · 出题约 2–3 分钟 · 不用注册</span>
            </div>
            {busy && <div style={{ marginTop: 12, color: '#4c43c9', fontSize: 14 }}>{busy}</div>}
            {err && <div style={{ marginTop: 12, color: '#c0392b', fontSize: 14 }}>{err}</div>}
          </div>
        ) : (
          <div style={{ ...card, padding: '22px 24px' }}>
            <div style={{ fontSize: 12, letterSpacing: 2, color: '#12a150', fontWeight: 700 }}>题出好了</div>
            <h3 style={{ margin: '6px 0 4px', fontSize: 22 }}>{done.title}</h3>
            <div style={{ color: '#4a4f66', marginBottom: 16 }}>{ENV_NAME[done.env]} · AI 基线 {done.baseline ?? '未跑成（管理页可重跑）'} 分</div>
            <Row label="参与链接（甩给候选人 / 团队）" value={`${origin}/work/${done.share_token}`} />
            <Row label="管理链接（只给你：看每个人的报告、发布 / 下架、重跑基线）" value={`${origin}/work/${done.share_token}/owner?k=${done.owner_key}`} warn />
            {done.notes?.length ? <div style={{ fontSize: 13, color: '#b7791f', marginTop: 10 }}>材料缺口：{done.notes.join('；')}（题里会如实标「示例数据」）</div> : null}
            <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href={`/work/${done.share_token}/owner?k=${done.owner_key}`} style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}>先看看题 →</Link>
              <button onClick={() => setDone(null)} style={btnGhost}>再出一道</button>
            </div>
          </div>
        )}
      </section>
      <div style={{ textAlign: 'center', fontSize: 12, color: '#8a8fa8', padding: '0 28px 36px' }}>百业AI｜真活 · 平方智能 · 和 AI 百业（aisimjob.com）同源：真活看他会不会，百业带他学会</div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) { return <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#8a8fa8', fontWeight: 600 }}>{label}{children}</label>; }
function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  const [c, setC] = useState(false);
  return <div style={{ marginBottom: 10 }}><div style={{ fontSize: 12, color: warn ? '#b7791f' : '#8a8fa8', fontWeight: 600 }}>{label}</div><div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><code style={{ fontSize: 13, background: '#f7f8fc', padding: '6px 10px', borderRadius: 8, border: '1px solid #e8e9f0', wordBreak: 'break-all', color: '#1a1a2e' }}>{value}</code><button onClick={() => { navigator.clipboard.writeText(value); setC(true); setTimeout(() => setC(false), 1500); }} style={btnGhost}>{c ? '已复制' : '复制'}</button></div></div>;
}
const lnk: React.CSSProperties = { color: '#4a4f66', textDecoration: 'none' };
const h2: React.CSSProperties = { fontSize: 26, margin: '0 0 16px', fontWeight: 800 };
const card: React.CSSProperties = { background: '#f7f8fc', border: '1px solid #e8e9f0', borderRadius: 16, padding: '18px 20px' };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 };
const inp: React.CSSProperties = { padding: '10px 12px', border: '1px solid #d9dbe6', borderRadius: 10, fontSize: 14, outline: 'none', color: '#1a1a2e', fontWeight: 400, background: '#fff' };
const btn: React.CSSProperties = { padding: '12px 24px', borderRadius: 999, border: 0, background: 'linear-gradient(135deg,#6055f5,#12b5cb)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15 };
const btnGhost: React.CSSProperties = { padding: '10px 18px', borderRadius: 999, border: '1px solid #d9dbe6', background: '#fff', color: '#1a1a2e', cursor: 'pointer', fontSize: 14 };
