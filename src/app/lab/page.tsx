'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * AI 百业 · 首页。
 *
 * 这一页只讲一件事：这套东西的落点是「人」，不是课程、题库或者培训模拟器。
 * 干活的部分全在 /lab/spaces——别再把宣传和列表混在一页里。
 * 数据来自 /api/lab/landing；拿不到就退回静态文案，页面照样成立。
 */

const CSS = `
.ai100-hero-strips { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; height: clamp(360px, 46vw, 540px); overflow: hidden;
  mask-image: linear-gradient(180deg, transparent, #000 13%, #000 87%, transparent); -webkit-mask-image: linear-gradient(180deg, transparent, #000 13%, #000 87%, transparent); }
.ai100-strip { display: flex; flex-direction: column; gap: 12px; animation: ai100-up linear infinite; will-change: transform; }
.ai100-strip.down { animation-name: ai100-down; }
.ai100-strip img { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 16px; background: rgba(106,92,255,.07);
  border: 1px solid rgba(255,255,255,.9); box-shadow: 0 10px 28px rgba(88,76,220,.14); }
@keyframes ai100-up { from { transform: translateY(0); } to { transform: translateY(calc(-50% - 6px)); } }
@keyframes ai100-down { from { transform: translateY(calc(-50% - 6px)); } to { transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .ai100-strip { animation: none !important; } }

.ai100-marquee { overflow: hidden; mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
.ai100-marquee > div { display: flex; gap: 34px; width: max-content; animation: ai100-left 46s linear infinite; }
@keyframes ai100-left { to { transform: translateX(calc(-50% - 17px)); } }

.ai100-h1 { font-size: clamp(34px, 5.4vw, 62px); font-weight: 900; line-height: 1.08; letter-spacing: -0.5px; margin: 12px 0 18px; }
.ai100-h2 { font-size: clamp(26px, 3.6vw, 44px); font-weight: 900; line-height: 1.16; letter-spacing: -0.3px; margin: 10px 0 14px; }
.ai100-grad { background: linear-gradient(118deg, var(--v), #8f7bff 40%, var(--c)); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.ai100-lead { font-size: clamp(15px, 1.5vw, 17.5px); color: var(--ink2); line-height: 2; max-width: 720px; }
.ai100-sec { padding: clamp(44px, 7vw, 86px) 0 0; }

.ai100-card { position: relative; border-radius: 20px; overflow: hidden; cursor: pointer; background: #e9e8ff; border: 1px solid rgba(255,255,255,.9);
  box-shadow: 0 12px 36px rgba(88,76,220,.14); transition: transform .25s, box-shadow .25s; }
.ai100-card:hover { transform: translateY(-4px); box-shadow: 0 22px 54px rgba(88,76,220,.24); }
.ai100-card img.bg { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; }
.ai100-card .ov { position: absolute; left: 0; right: 0; bottom: 0; padding: 40px 16px 14px; color: #fff;
  background: linear-gradient(180deg, transparent, rgba(12,14,34,.52) 42%, rgba(12,14,34,.9) 100%); }
.ai100-card .face { position: absolute; left: 14px; top: 14px; width: 54px; height: 54px; border-radius: 50%; object-fit: cover; object-position: 54% 10%;
  border: 2px solid rgba(255,255,255,.95); box-shadow: 0 6px 18px rgba(20,16,60,.35); }

.ai100-cols { columns: 5; column-gap: 26px; }
@media (max-width: 1100px) { .ai100-cols { columns: 3; } }
@media (max-width: 680px) { .ai100-cols { columns: 2; } .ai100-hero-strips { grid-template-columns: repeat(2, 1fr); } }
.ai100-cols a { display: block; break-inside: avoid; font-size: 13.5px; color: var(--ink2); padding: 5px 0; cursor: pointer; }
.ai100-cols a:hover { color: var(--v); }
`;

const CHECKS = [
  '资深从业者数字人：一个职业一个人，有手艺、有工位、有自己的判断',
  '专业技能空间：同行、在招岗位、上下游企业，全部来自真实产业数据',
  '在线职业探究 / 能力自测 / 技能演化 / 解决行业问题，四件事在同一个人身上完成',
];

const HAVE = [
  { k: '一门手艺', t: '技能集', d: '从真实 JD 或职业结构里长出来的能力项、判断规则和合格判据。先由 AI 起草，等第一位真人专家来校正。' },
  { k: '一条故事线', t: '最有代表性的一天', d: '不是习题，是接连发生的事。每一步都要做决定，每个决定都有代价，走完才知道这行难在哪。' },
  { k: '一个工位', t: '数据定义的虚拟设备', d: '能拧、能点、能开摄像头跟着轨迹走。参数窗口和违规判据按行业真实标准建模，做错了当场有后果。' },
  { k: '一片空间', t: '他在行业里的存在', d: '同行是谁、此刻哪些企业在招这个岗、上下游是哪些真实公司——全部来自我们自己的企业库与岗位库。' },
];

const DO = [
  { k: '向下', t: '考核新人', d: '让新人把这一天走一遍，他按岗位标准逐项评分，并说出每一分扣在哪。' },
  { k: '向上', t: '向专家学习', d: '让真人专家走一遍，他追问「你为什么这时候停」，把说不清的经验蒸馏成能复用的判断。' },
  { k: '平行', t: '解决别人的问题', d: '把真实问题交给他。专家不在场、不在同一个城市，也能按专家的做法给出解法。' },
  { k: '跨时空', t: '每一次都记账', d: '能力在 A 地 B 时被蒸馏，在 C 地 D 时发挥价值。谁贡献的、被谁用了，都留痕。' },
];

const HOW = [
  { t: '可视化优先', d: '能画出来的就不用文字解释。炉温窗口、焊缝成形、拉花轨迹、开腹层次，都是看得见、动得起来的量。' },
  { t: '角色化', d: '空间里说话的是一个有名字、有脸、有脾气的人，不是提示框。知识有出处，判断有口气。' },
  { t: '故事化', d: '没有知识点列表，只有一天里接连发生的事。先遇到问题，再需要知识——这才是职业真实的学习顺序。' },
  { t: '尊重专业', d: '宁可少做，不可做错。每个工位都要先让专家脚本自己走一遍能过，才允许上线，不然就是在添乱。' },
  { t: '数据不说谎', d: '同行、在招岗位、上下游企业全部来自真实抓取的企业库与岗位库。我们不编公司名，也不编薪资。' },
  { t: '可被创造', d: '不是我们预先做好一百个行业。任何人给一份 JD、甚至只给一个职业名，几分钟就能长出一个新的空间。' },
];

const VALUE = [
  { who: '对学生 / 想转行的人', d: '在决定要不要入行之前，先把这一行最有代表性的一天真的走一遍——比看一百篇「XX 专业就业前景」管用。' },
  { who: '对学校 / 培训机构', d: '一份企业官方 JD 进来，几分钟出一个可考核的空间。不用再自己编案例，案例来自真实在招的岗位。' },
  { who: '对企业 / 行业', d: '把老师傅手里说不清的判断变成可追溯、可复用、能异地调用的资产。人会退休，空间不会。' },
  { who: '对一个职业本身', d: '让它被看见。冷门的、新兴的、灵活就业的——收纳师、陪诊师、剧本杀 DM，一样配有自己的空间。' },
];

/** 概念图：没生成就整块不渲染，别在页面上留一个破图 */
function Art({ src, alt, ratio = '16 / 9' }: { src: string; alt: string; ratio?: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return null;
  return (
    <img src={src} alt={alt} onError={() => setBad(true)}
      style={{ display: 'block', width: '100%', aspectRatio: ratio, objectFit: 'cover', borderRadius: 22, border: '1px solid rgba(255,255,255,.9)', boxShadow: '0 18px 50px rgba(88,76,220,.18)' }} />
  );
}

function Stat({ n, k }: { n: React.ReactNode; k: string }) {
  return (
    <div>
      <div className="lab-mono" style={{ fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 900, letterSpacing: -1, lineHeight: 1.1, color: 'var(--v)' }}>{n}</div>
      <div style={{ fontSize: 11.5, color: 'var(--ink3)', letterSpacing: '.06em', marginTop: 3 }}>{k}</div>
    </div>
  );
}

export default function LabLanding() {
  const router = useRouter();
  const [d, setD] = useState<any>(null);
  const [t, setT] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try { const j = await (await fetch('/api/lab/landing')).json(); if (j.ok) setD(j); } catch { /* 静态文案照样能看 */ }
      try { const j = await (await fetch('/api/lab/spaces')).json(); if (j.ok) setT(j.totals || null); } catch { /* 同上 */ }
    })();
  }, []);

  const spaces: any[] = d?.spaces || [];
  const n = spaces.length || t?.spaces || 40;
  const famN = d?.families?.length || 13;

  // 胶片条：三列，一列向上一列向下。图不够就循环补，宁可重复也别留空
  const strips = useMemo(() => {
    const pool: string[] = (d?.tiles || []).filter(Boolean);
    if (pool.length < 6) return null;
    const cols: string[][] = [[], [], []];
    pool.forEach((u, i) => cols[i % 3].push(u));
    return cols.map(c => (c.length >= 5 ? c : [...c, ...c, ...c].slice(0, 5)));
  }, [d]);

  // 橱窗：一个领域先出一个人，凑够 8 个；优先有场景底图、有工位的
  const featured = useMemo(() => {
    const ok = spaces.filter(s => s.cover);
    const seen = new Set<string>(), out: any[] = [];
    for (const pass of [0, 1]) for (const s of ok) {
      if (out.length >= 8 || out.includes(s)) continue;
      if (pass === 0 && (seen.has(s.family) || !s.hasBench)) continue;
      seen.add(s.family); out.push(s);
    }
    return out;
  }, [spaces]);

  return (
    <>
      <style>{CSS}</style>

      {/* ══ 开场 ══ */}
      <section style={{ display: 'grid', gap: 'clamp(20px, 3vw, 46px)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'center', padding: '14px 0 0' }}>
        <div className="lab-in" style={{ minWidth: 0 }}>
          <div className="lab-mono lab-cap">AI 百业 · AI HUNDRED TRADES</div>
          <h1 className="ai100-h1">
            数字化从业者的技能空间，<br /><span className="ai100-grad" style={{ whiteSpace: 'nowrap' }}>走进千行百业</span>
          </h1>
          <p style={{ fontSize: 'clamp(15px, 1.6vw, 18px)', color: 'var(--ink2)', lineHeight: 1.85, margin: '0 0 24px', maxWidth: 580 }}>
            资深从业者数字人 × 专业技能空间——在线做职业探究、能力自测、技能演化，以及真正解决行业里的问题。
          </p>
          <div style={{ display: 'grid', gap: 9, marginBottom: 26 }}>
            {CHECKS.map(c => (
              <div key={c} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 14.5, color: 'var(--ink2)', lineHeight: 1.7 }}>
                <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', marginTop: 2, background: 'linear-gradient(120deg, var(--v), var(--c))', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
                {c}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="lab-btn" style={{ height: 50, padding: '0 26px', fontSize: 15 }} onClick={() => router.push('/lab/spaces')}>走进百业空间 →</button>
            <button className="lab-btn ghost" style={{ height: 50, padding: '0 24px', fontSize: 15 }} onClick={() => router.push('/lab/spaces?new=career')}>创造一个空间</button>
          </div>
          <div style={{ display: 'flex', gap: 'clamp(22px, 4vw, 46px)', flexWrap: 'wrap', marginTop: 34 }}>
            <Stat n={n} k="位从业者数字人" />
            <Stat n={famN} k="个一级领域" />
            {t?.served > 0 && <Stat n={t.served} k="人次走过他们的一天" />}
            {t?.places > 0 && <Stat n={t.places} k="个地方用过" />}
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          {strips ? (
            <div className="ai100-hero-strips">
              {strips.map((col, i) => (
                <div key={i} className={`ai100-strip${i % 2 ? ' down' : ''}`} style={{ animationDuration: `${44 + i * 9}s` }}>
                  {[...col, ...col].map((u, j) => <img key={j} src={u} alt="" loading="lazy" />)}
                </div>
              ))}
            </div>
          ) : (
            <div className="lab-glass lab-scan" style={{ height: 'clamp(300px, 40vw, 480px)' }} />
          )}
        </div>
      </section>

      {/* ══ 这些空间站在真实企业数据上 ══ */}
      {d?.companies?.length > 12 && (
        <section style={{ marginTop: 'clamp(26px, 4vw, 48px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12.5, color: 'var(--ink3)', whiteSpace: 'nowrap' }}>空间里的上下游，来自真实企业库</div>
            <div className="ai100-marquee" style={{ flex: '1 1 320px', minWidth: 0 }}>
              <div>
                {[0, 1].map(k => (
                  <React.Fragment key={k}>
                    {d.companies.slice(0, 22).map((c: string, i: number) => (
                      <span key={`${k}-${i}`} style={{ fontSize: 15, fontWeight: 700, color: 'rgba(74,79,106,.52)', whiteSpace: 'nowrap' }}>{c}</span>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ══ 01 落点是人 ══ */}
      <section className="ai100-sec">
        <div style={{ display: 'grid', gap: 'clamp(20px, 3.5vw, 54px)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', alignItems: 'center' }}>
          <div>
            <div className="lab-mono lab-cap" style={{ color: 'var(--v)' }}>01 / 落点</div>
            <h2 className="ai100-h2">技能是抽象的，<br /><span className="ai100-grad">人是具体的</span></h2>
            <p className="ai100-lead">
              我们不做课程，不做题库，也不做培训模拟器。<br />
              一个职业最难传递的部分，从来不写在岗位说明书里。它长在一个人手上——他在什么时候停下、凭什么判断、哪一步绝不能将就。<br />
              所以我们不把职业拆成知识点，而是把它收敛成一个人：他有编号（NOVA-07）、有行当里的称呼（「开腹医师」）、有脸、有一句口头禅、有自己的工位。
              你打开的不是一门课，是一位已经在岗的同行。
            </p>
          </div>
          <Art src="/lab-landing/concept-person.jpg" alt="一个职业收敛成一个人" />
        </div>
      </section>

      {/* ══ 02 身上有四样东西 ══ */}
      <section className="ai100-sec">
        <div className="lab-mono lab-cap" style={{ color: 'var(--v)' }}>02 / 构成</div>
        <h2 className="ai100-h2">一个数字人身上，有四样东西</h2>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 232px), 1fr))', marginTop: 24 }}>
          {HAVE.map((x, i) => (
            <div key={x.k} className="lab-glass lab-in" style={{ padding: '20px 22px', animationDelay: `${i * 70}ms` }}>
              <div className="lab-mono" style={{ fontSize: 12, color: 'var(--v)', fontWeight: 700 }}>{x.k}</div>
              <div style={{ fontSize: 18, fontWeight: 800, margin: '6px 0 8px' }}>{x.t}</div>
              <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.9 }}>{x.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ 橱窗：已经在岗的人 ══ */}
      {featured.length > 0 && (
        <section className="ai100-sec">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div className="lab-mono lab-cap" style={{ color: 'var(--v)' }}>NOW ON DUTY</div>
              <h2 className="ai100-h2">他们已经在各自的工位上</h2>
            </div>
            <button className="lab-btn ghost" onClick={() => router.push('/lab/spaces')}>看全部 {n} 位 →</button>
          </div>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', marginTop: 24 }}>
            {featured.map(s => (
              <div key={s.id} className="ai100-card lab-in" onClick={() => router.push(`/lab/${s.id}`)}>
                <img className="bg" src={s.cover} alt="" loading="lazy" />
                {s.avatar && <img className="face" src={s.avatar} alt="" loading="lazy" />}
                <div className="ov">
                  <div className="lab-mono" style={{ fontSize: 10.5, opacity: .75, letterSpacing: '.1em' }}>{s.name}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.3, marginTop: 2 }}>{s.role}</div>
                  <div style={{ fontSize: 12, opacity: .82, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.profession}</div>
                  {s.hasBench && <span style={{ display: 'inline-block', marginTop: 8, padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,.22)', backdropFilter: 'blur(6px)' }}>虚拟工位</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══ 03 三个方向 ══ */}
      <section className="ai100-sec">
        <div style={{ display: 'grid', gap: 'clamp(20px, 3.5vw, 54px)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', alignItems: 'center' }}>
          <Art src="/lab-landing/concept-three.jpg" alt="向下考核、向上学习、平行解决" />
          <div>
            <div className="lab-mono lab-cap" style={{ color: 'var(--v)' }}>03 / 能力</div>
            <h2 className="ai100-h2">一个在岗的人，能<span className="ai100-grad">向下、向上、向旁边</span>同时发力</h2>
            <p className="ai100-lead" style={{ marginBottom: 20 }}>这是数字人和「教学视频」最本质的区别：他不是等着被看的内容，他是一个能干活的对象。</p>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))' }}>
              {DO.map(x => (
                <div key={x.k} className="lab-glass" style={{ padding: '15px 17px' }}>
                  <span className="lab-chip c">{x.k}</span>
                  <div style={{ fontSize: 15.5, fontWeight: 800, margin: '8px 0 6px' }}>{x.t}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)', lineHeight: 1.85 }}>{x.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ 04 存在空间 ══ */}
      <section className="ai100-sec">
        <div style={{ display: 'grid', gap: 'clamp(20px, 3.5vw, 54px)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', alignItems: 'center' }}>
          <div>
            <div className="lab-mono lab-cap" style={{ color: 'var(--v)' }}>04 / 存在空间</div>
            <h2 className="ai100-h2">一个人不是悬在真空里的，<br />他有自己的<span className="ai100-grad">行当</span></h2>
            <p className="ai100-lead">
              这是最容易被做成「模拟器」的地方，也是我们最不想做成模拟器的地方。<br />
              一个空间不只给你一套操作，还要告诉你：和你同行的是谁、此刻哪些企业在招这个岗、你上游拿谁的料、下游谁在用你的活。
              环节划分由模型给出，挂在每个环节下面的公司<b>全部来自我们自己的企业库</b>——这一块培训模拟器长不出来，因为它不连真实产业数据。
            </p>
          </div>
          <Art src="/lab-landing/concept-space.jpg" alt="一个人在行业里的存在空间" />
        </div>
      </section>

      {/* ══ 05 做法 ══ */}
      <section className="ai100-sec">
        <div className="lab-mono lab-cap" style={{ color: 'var(--v)' }}>05 / 做法</div>
        <h2 className="ai100-h2">我们怎么把一个职业变成一座空间</h2>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 276px), 1fr))', marginTop: 24 }}>
          {HOW.map((x, i) => (
            <div key={x.t} className="lab-glass lab-in" style={{ padding: '20px 22px', animationDelay: `${i * 60}ms` }}>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>{x.t}</div>
              <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.9 }}>{x.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ 覆盖的职业 ══ */}
      {spaces.length > 0 && (
        <section className="ai100-sec">
          <div className="lab-mono lab-cap" style={{ color: 'var(--v)' }}>COVERAGE</div>
          <h2 className="ai100-h2">已经有 <span className="ai100-grad">{n}</span> 个职业住进来了</h2>
          <p className="ai100-lead" style={{ marginBottom: 22 }}>
            从高精尖材料、航天发动机试车，到剧本杀 DM、整理收纳师、陪诊师。
            覆盖 {famN} 个一级领域——冷门的、新兴的、灵活就业的，一样配有自己的空间。
          </p>
          <div className="ai100-cols">
            {spaces.map(s => (
              <a key={s.id} onClick={() => router.push(`/lab/${s.id}`)}>{s.profession}<span style={{ color: 'var(--ink3)', opacity: .7 }}> · {s.role}</span></a>
            ))}
          </div>
        </section>
      )}

      {/* ══ 06 价值 ══ */}
      <section className="ai100-sec">
        <div className="lab-mono lab-cap" style={{ color: 'var(--v)' }}>06 / 价值</div>
        <h2 className="ai100-h2">它对谁有用</h2>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 296px), 1fr))', marginTop: 24 }}>
          {VALUE.map((x, i) => (
            <div key={x.who} className="lab-glass lab-in" style={{ padding: '20px 22px', animationDelay: `${i * 60}ms`, borderLeft: '3px solid rgba(106,92,255,.5)' }}>
              <div className="lab-mono lab-cap" style={{ color: 'var(--v)' }}>{x.who}</div>
              <div style={{ fontSize: 14, color: 'var(--ink2)', lineHeight: 2, marginTop: 8 }}>{x.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ 07 创造 ══ */}
      <section className="ai100-sec">
        <div style={{ display: 'grid', gap: 'clamp(20px, 3.5vw, 54px)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', alignItems: 'center' }}>
          <Art src="/lab-landing/concept-create.jpg" alt="从一份 JD 长出一座空间" />
          <div>
            <div className="lab-mono lab-cap" style={{ color: 'var(--v)' }}>07 / 创造</div>
            <h2 className="ai100-h2">不只是走进去，<br /><span className="ai100-grad">还能亲手造一个</span></h2>
            <p className="ai100-lead" style={{ marginBottom: 20 }}>
              百业不是我们预先摆好的一百个展台。给一份企业官方 JD，或者只给一个职业名——
              岗位 AI 会自己拆职责、起草技能集、编出一条故事线、设计一台能用的工位，再把场景和人物画出来。
              全程两到四分钟，你能看着它一步步长出来。
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="lab-btn" style={{ height: 48, padding: '0 22px' }} onClick={() => router.push('/lab/spaces?new=jd')}>从一份 JD 建 →</button>
              <button className="lab-btn ghost" style={{ height: 48, padding: '0 22px' }} onClick={() => router.push('/lab/spaces?new=career')}>只给一个职业名</button>
            </div>
          </div>
        </div>
      </section>

      {/* ══ 收尾 ══ */}
      <section className="lab-glass lab-in" style={{ padding: 'clamp(26px, 5vw, 52px)', margin: 'clamp(44px, 7vw, 86px) 0 10px', textAlign: 'center' }}>
        <div className="lab-mono lab-cap">NOW LIVING IN AI 百业</div>
        <div className="ai100-h2" style={{ margin: '10px 0 20px' }}>{n} 位从业者数字人，正在各自的工位上</div>
        {(t?.faces?.length > 0 || spaces.length > 0) && (
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 8, margin: '0 auto 24px', maxWidth: 800 }}>
            {(spaces.map((s: any) => s.avatar).filter(Boolean).length ? spaces.map((s: any) => s.avatar).filter(Boolean) : t.faces).slice(0, 20).map((f: string, i: number) => (
              <img key={i} src={f} alt="" loading="lazy" style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', objectPosition: '54% 10%', border: '2px solid #fff', boxShadow: '0 4px 14px rgba(60,45,130,.18)' }} />
            ))}
          </div>
        )}
        <button className="lab-btn" style={{ height: 50, padding: '0 28px', fontSize: 15 }} onClick={() => router.push('/lab/spaces')}>去见见他们 →</button>
      </section>
    </>
  );
}
