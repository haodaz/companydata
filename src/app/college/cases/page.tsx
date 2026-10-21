'use client';

/**
 * 案例：分析型的活和新兴职业，在百业大学怎么配 AI 员工（2026-10-21，用户点名的四个例子）。
 *   ① 出海团队怎么搭 AI ② 车间怎么设计采集场景的有效数据 ③ 新公司没有组织经验，怎么在百业大学招人 ④ 基金投人工智能、材料、能源，AI 员工怎么看懂产业
 * 都是示例场景（不是具体客户），以叙述为主：处境 → 团队里怎么配 AI（替代 / 增强 / 协同）→ 怎么教、怎么考 → 换来什么。
 */
import React from 'react';
import Link from 'next/link';
import { CU_BASE, H2, SubHero } from '../ui';
import { CASES } from './data';

export default function Cases() {
  return (
    <div className="cu">
      <style>{CU_BASE + CS_CSS}</style>
      <SubHero crumb="案例" title="案例" en="How organizations put AI graduates to work" video="/college/work.mp4" poster="/college/work.jpg"
        lead="不用先想职位名。直接说你要找什么样的人，我们就拿真活考有没有这个本事，过了再交给你。下面是四个示例场景。">
        <a className="cu-btn light" href={`#${CASES[0].id}`}>从第一个看起</a>
        <a className="cu-btn line" href="/college/hire#apply">说说你的场景 →</a>
      </SubHero>

      <nav className="cs-index">
        <div className="cu-in">
          {CASES.map(c => <a key={c.id} href={`#${c.id}`}><span>{c.n}</span>{c.q}</a>)}
        </div>
      </nav>

      {CASES.map((c, i) => (
        <section key={c.id} id={c.id} className={`cu-sec cs-case${i % 2 ? ' cu-ivory' : ''}`}>
          <div className="cu-in">
            <div className="cs-head">
              <div className="cs-n">{c.n}</div>
              <div>
                <H2 eyebrow={`案例 · CASE ${c.n}`} zh={c.q} en={c.en} />
                <div className="cs-who">{c.who}</div>
              </div>
            </div>
            <div className="cs-said">
              <span>我要找这样的人</span>
              <q>{c.said}</q>
            </div>
            <div className="cs-body">
              <div className="cs-team">
                <h3>就考这几件事</h3>
                <ul>
                  {c.exams.map(([t, d]) => (
                    <li key={t}><div className="r"><b>{t}</b></div><p>看：{d}</p></li>
                  ))}
                </ul>
              </div>
              <div className="cs-sit">
                <h3>交付</h3>
                <ul className="cs-del">{c.deliver.map(x => <li key={x}>{x}</li>)}</ul>
                <div className="cs-humans">{c.humans}</div>
                <h3 style={{ marginTop: 26 }}>换来什么</h3>
                <p className="cs-result">{c.result}</p>
              </div>
            </div>
          </div>
        </section>
      ))}

      <section className="cu-sec cu-navy">
        <div className="cu-in cs-end">
          <H2 light eyebrow="你的场景 · YOUR CASE" zh="你们的活，也可以这样配" en="Bring us your case" />
          <p className="cu-p">不用想好职位名。直接说你要找什么样的人，再把手上的材料交过来。我们拿真活考有没有这个本事，过了再交给你。</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link className="cu-btn light" href="/college/hire#apply">提交人才培养需求</Link>
            <Link className="cu-btn line" href="/college/graduates">先看看毕业生 →</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

const CS_CSS = `
.cs-index { position: sticky; top: 69px; z-index: 10; background: rgba(255,255,255,.95); backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
.cs-index .cu-in { display: flex; gap: 6px; overflow-x: auto; }
.cs-index a { flex-shrink: 0; padding: 14px 14px; font-size: 14px; font-weight: 700; color: var(--navy); white-space: nowrap; }
.cs-index a span { font-family: var(--en); color: var(--gold); margin-right: 8px; font-weight: 400; }
.cs-index a:hover { box-shadow: inset 0 -2px 0 var(--gold); }
.cs-case { scroll-margin-top: 120px; }
.cs-head { display: grid; grid-template-columns: 120px 1fr; gap: 20px; align-items: start; }
.cs-n { font: 400 96px/1 var(--en); color: var(--gold); opacity: .7; }
.cs-head .cu-h2 { margin-bottom: 12px; }
.cs-who { font-size: 16px; color: var(--ink2); padding-left: 14px; border-left: 3px solid var(--gold); margin-bottom: 40px; }
.cs-body { display: grid; grid-template-columns: 1fr 1.25fr; gap: clamp(28px, 5vw, 70px); margin-left: 140px; }
.cs-body h3 { font: 700 12.5px/1.4 var(--en); letter-spacing: .2em; color: var(--gold); text-transform: uppercase; margin: 0 0 12px; }
.cs-body h3:not(:first-child) { margin-top: 30px; }
.cs-sit p { font-size: 16.5px; line-height: 1.95; color: var(--ink2); margin: 0; }
.cs-sit p.cs-result { font-family: var(--serif); font-size: 21px; line-height: 1.7; color: var(--navy); font-weight: 900; }
.cs-said { margin: 0 0 40px 140px; padding: 22px 26px; background: rgba(176,141,87,.1); border-left: 3px solid var(--gold); }
.cs-said span { display: block; font: 700 12px var(--en); letter-spacing: .2em; color: var(--gold); margin-bottom: 8px; }
.cs-said q { font-family: var(--serif); font-size: 20px; line-height: 1.8; color: var(--navy); quotes: "「" "」"; }
.cs-abl, .cs-del { margin: 0; padding-left: 20px; display: grid; gap: 8px; font-size: 15.5px; line-height: 1.8; color: var(--ink2); }
.cs-del { margin-bottom: 14px; }
.cs-tags { margin-top: 26px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.cs-tags b { font-size: 13px; color: var(--ink3); margin-right: 6px; }
.cs-tags span { padding: 5px 12px; font-size: 13px; background: rgba(176,141,87,.12); color: #7a5c2a; }
.cs-team ul { list-style: none; margin: 0; padding: 0; border-top: 2px solid var(--navy); }
.cs-team li { padding: 16px 0; border-bottom: 1px solid var(--line); }
.cs-team .r { display: flex; align-items: center; gap: 10px; }
.cs-team .r b { font-family: var(--serif); font-size: 19px; }
.cs-team .r em { font-style: normal; font-size: 12px; font-weight: 700; padding: 2px 9px; border: 1px solid currentColor; }
.cs-team em[data-m='替代'] { color: #8a6a2f; } .cs-team em[data-m='增强'] { color: #2c3768; } .cs-team em[data-m='协同'] { color: #0d7a52; }
.cs-team li p { margin: 8px 0 0; font-size: 15px; line-height: 1.85; color: var(--ink2); }
.cs-humans { margin-top: 16px; padding: 12px 16px; background: var(--navy); color: #fff; font-size: 15px; }
.cs-team dl { display: grid; grid-template-columns: 70px 1fr; gap: 10px 14px; margin: 0; }
.cs-team dt { font-family: var(--serif); font-weight: 900; font-size: 16px; color: var(--navy); }
.cs-team dd { margin: 0; font-size: 15px; line-height: 1.8; color: var(--ink2); }
.cs-end .cu-p { margin-bottom: 26px; }
@media (max-width: 980px) {
  .cs-head { grid-template-columns: 1fr; gap: 0; }
  .cs-n { font-size: 60px; }
  .cs-body { grid-template-columns: 1fr; margin-left: 0; }
  .cs-said { margin-left: 0; } .cs-said q { font-size: 17px; }
  .cs-index { top: 0; position: relative; }
}
`;
