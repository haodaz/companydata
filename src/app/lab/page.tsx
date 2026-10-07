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
/* 首页是整站唯一的深色页：靠 :has 把外壳一起压暗，不动 layout，别的页照旧浅色 */
.lab:has(.ai100-root) { background: #080a16; --ink: #eef0fb; --ink2: #c0c5e2; --ink3: #878dae; --line: rgba(255,255,255,.10); }
.lab:has(.ai100-root) .lab-bg { opacity: .35; }
.lab:has(.ai100-root) .lab-blob { filter: blur(100px); opacity: .34; }
.lab:has(.ai100-root) .lab-grid { opacity: .3; }
.lab:has(.ai100-root) > header { background: rgba(8,10,22,.76) !important; border-bottom-color: rgba(255,255,255,.08) !important; }
.lab:has(.ai100-root) .lab-glass { background: rgba(255,255,255,.055); border-color: rgba(255,255,255,.1);
  box-shadow: 0 1px 0 rgba(255,255,255,.07) inset, 0 16px 44px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.07); }
.lab:has(.ai100-root) .lab-chip { color: #b9b1ff; background: rgba(140,126,255,.16); border-color: rgba(140,126,255,.3); }
.lab:has(.ai100-root) .lab-chip.c { color: #6fe3f2; background: rgba(18,181,203,.16); border-color: rgba(18,181,203,.32); }
.lab:has(.ai100-root) .lab-btn.ghost { color: #dfe2f5; background: rgba(255,255,255,.08); box-shadow: 0 0 0 1px rgba(255,255,255,.16); }
.lab:has(.ai100-root) .lab-btn.ghost:hover { color: #fff; box-shadow: 0 0 0 1px rgba(140,126,255,.6); }
.ai100-root { color: var(--ink); }

/* 整页出血 */
.ai100-bleed { margin-left: calc(50% - 50vw); margin-right: calc(50% - 50vw); width: 100vw; }

/* banner：一次真实点火当背景，字压在上面 */
.ai100-hero { position: relative; min-height: min(90vh, 820px); display: flex; align-items: center; overflow: hidden; margin-top: -24px; }
.ai100-hero > video, .ai100-hero > img.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.ai100-hero .veil { position: absolute; inset: 0;
  background: linear-gradient(90deg, #080a16 2%, rgba(8,10,22,.94) 36%, rgba(8,10,22,.6) 66%, rgba(8,10,22,.3) 100%),
              linear-gradient(0deg, #080a16 1%, rgba(8,10,22,.2) 32%, transparent 60%); }
.ai100-hero .in { position: relative; width: 100%; max-width: 1280px; margin: 0 auto; padding: 72px 28px; }

/* 胶片：横着走的一条，压在 banner 下沿 */
.ai100-film { overflow: hidden; padding: 16px 0; display: grid; gap: 12px; background: #0b0d1c; border-bottom: 1px solid rgba(255,255,255,.08);
  mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); }
.ai100-film-track { display: flex; gap: 12px; width: max-content; animation: ai100-left 96s linear infinite; }
.ai100-film-track.back { animation-name: ai100-right; }
.ai100-film img { display: block; height: clamp(96px, 10vw, 136px); width: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); }
@keyframes ai100-left { to { transform: translateX(calc(-50% - 6px)); } }
@keyframes ai100-right { from { transform: translateX(calc(-50% - 6px)); } to { transform: translateX(0); } }

.ai100-band { background: rgba(255,255,255,.035); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); padding: 26px 0; margin-top: clamp(44px, 7vw, 80px); margin-bottom: clamp(44px, 7vw, 80px); }
.ai100-band-in { max-width: 1280px; margin: 0 auto; padding: 0 28px; }
.ai100-marquee { overflow: hidden; mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); }
.ai100-marquee > div { display: flex; gap: 44px; width: max-content; animation: ai100-left 58s linear infinite; align-items: center; }

/* 整屏沉浸带：场景图是环境本身 */
.ai100-stage { position: relative; min-height: min(78vh, 660px); display: flex; align-items: center; overflow: hidden; margin-top: clamp(44px, 7vw, 86px); margin-bottom: clamp(44px, 7vw, 86px); }
.ai100-stage > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.ai100-stage .veil { position: absolute; inset: 0; background: linear-gradient(90deg, #080a16 0%, rgba(8,10,22,.9) 40%, rgba(8,10,22,.45) 74%, rgba(8,10,22,.18) 100%); }
.ai100-stage .in { position: relative; max-width: 1280px; margin: 0 auto; padding: 56px 28px; width: 100%; }

.ai100-h1 { font-size: clamp(27px, 4.6vw, 62px); font-weight: 900; line-height: 1.08; letter-spacing: -0.5px; margin: 12px 0 18px; }
.ai100-h2 { font-size: clamp(26px, 3.6vw, 46px); font-weight: 900; line-height: 1.16; letter-spacing: -0.3px; margin: 10px 0 14px; }
.ai100-grad { background: linear-gradient(118deg, #9f91ff, #b9aaff 40%, #4fe0f2); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.ai100-lead { font-size: clamp(15px, 1.5vw, 17.5px); color: var(--ink2); line-height: 2; max-width: 720px; }
.ai100-sec { padding: clamp(44px, 7vw, 86px) 0 0; }
.ai100-01 { display: grid; gap: clamp(16px, 2.5vw, 40px); grid-template-columns: minmax(0, 1fr) minmax(0, 1.18fr); align-items: center; }
@media (max-width: 860px) { .ai100-01 { grid-template-columns: minmax(0, 1fr); } }
/* 技能留存：整页宽的一块，图在右上，三步在下，底下是真实的账 */
.ai100-keep { background: linear-gradient(180deg, rgba(140,126,255,.1), rgba(18,181,203,.05) 55%, transparent),
  radial-gradient(900px 340px at 14% 0%, rgba(140,126,255,.16), transparent 70%), rgba(255,255,255,.028);
  border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
  margin-top: clamp(44px, 7vw, 86px); margin-bottom: clamp(44px, 7vw, 86px); }
.ai100-keep .in { max-width: 1280px; margin: 0 auto; padding: clamp(40px, 6vw, 72px) 28px; }
.ai100-keep .hd { display: grid; gap: clamp(20px, 3vw, 48px); grid-template-columns: minmax(0, 1fr) minmax(0, .92fr); align-items: center; }
.ai100-keep .hd img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 20px; border: 1px solid rgba(255,255,255,.1); box-shadow: 0 22px 60px rgba(0,0,0,.5); }
@media (max-width: 860px) { .ai100-keep .hd { grid-template-columns: minmax(0, 1fr); } }
.ai100-keep .steps { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); margin-top: clamp(26px, 4vw, 44px); }
.ai100-keep .steps > div { padding: 20px 22px 22px; border-radius: 18px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); }
.ai100-keep .steps .n { font-size: 12px; font-weight: 700; color: #9f91ff; letter-spacing: .14em; }
.ai100-keep .steps .t { font-size: 16.5px; font-weight: 800; color: #fff; margin: 7px 0 9px; line-height: 1.45; }
.ai100-keep .steps .d { font-size: 13px; color: var(--ink3); line-height: 1.95; }
.ai100-keep .ledger { margin-top: clamp(22px, 3vw, 34px); padding-top: 22px; border-top: 1px solid var(--line); }
.ai100-keep .ledger .row { display: flex; gap: clamp(22px, 4vw, 54px); flex-wrap: wrap; margin-top: 10px; }

/* 它对谁有用：上图下字，身份字大 */
.ai100-value { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 248px), 1fr)); margin-top: 26px; }
.ai100-value > div { border-radius: 20px; overflow: hidden; background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.1); box-shadow: 0 16px 44px rgba(0,0,0,.4); }
.ai100-value img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; }
.ai100-value .t { padding: 16px 18px 20px; }
.ai100-value .who { font-size: 26px; font-weight: 900; letter-spacing: -.3px; color: #fff; line-height: 1.2; }
.ai100-value .who span { display: block; font-size: 12px; font-weight: 600; color: #9f91ff; letter-spacing: .04em; margin-top: 4px; }
.ai100-value .d { font-size: 13px; color: var(--ink3); line-height: 1.9; margin-top: 11px; }

/* 一个一个换人：原地消融，不滑动 */
.ai100-faces { position: relative; aspect-ratio: 4 / 3.4; min-height: 320px; cursor: pointer; }
.ai100-faces .halo { position: absolute; left: 50%; top: 46%; width: 76%; aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%;
  background: radial-gradient(circle, rgba(140,126,255,.3), rgba(18,181,203,.12) 55%, transparent 72%); }
.ai100-faces > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center bottom;
  opacity: 0; transform: scale(.985); transition: opacity 1s ease, transform 1.6s ease; filter: drop-shadow(0 26px 46px rgba(0,0,0,.6));
  /* 有几张立绘不是透明底的，会露出一个方框——拿一层椭圆遮罩把边收掉 */
  mask-image: radial-gradient(ellipse 80% 90% at 50% 48%, #000 66%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 80% 90% at 50% 48%, #000 66%, transparent 100%); }
.ai100-faces > img.on { opacity: 1; transform: scale(1); }
.ai100-faces .cap { position: absolute; left: 0; bottom: 0; padding: 12px 16px 10px; border-radius: 14px;
  background: rgba(9,11,24,.72); border: 1px solid rgba(255,255,255,.14); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
.ai100-faces .dots { position: absolute; right: 2px; bottom: 14px; display: flex; flex-direction: column; gap: 5px; }
.ai100-faces .dots i { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,.22); transition: background .4s, height .4s; }
.ai100-faces .dots i.on { background: #9f91ff; height: 14px; border-radius: 3px; }
@media (prefers-reduced-motion: reduce) { .ai100-faces > img { transition: none; } }

/* 去背立绘：不套框、不加底，稍微溢出到容器外，人就像站在页面里 */
.ai100-cut { display: block; width: 112%; max-width: none; margin-right: -12%; filter: drop-shadow(0 26px 50px rgba(0,0,0,.55)); }
@media (max-width: 860px) { .ai100-cut { width: 100%; margin-right: 0; } }

.ai100-art { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 22px; border: 1px solid rgba(255,255,255,.1); box-shadow: 0 22px 60px rgba(0,0,0,.5); }

/* 真实截图走马灯 */
.ai100-reel { overflow: hidden; padding: 4px 0 8px;
  mask-image: linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent); -webkit-mask-image: linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent); }
.ai100-reel-track { display: flex; gap: 18px; width: max-content; animation: ai100-left 78s linear infinite; }
.ai100-reel:hover .ai100-reel-track { animation-play-state: paused; }
.ai100-shot { margin: 0; width: clamp(300px, 46vw, 620px); flex-shrink: 0; border-radius: 20px; overflow: hidden; background: rgba(255,255,255,.055);
  border: 1px solid rgba(255,255,255,.1); box-shadow: 0 16px 44px rgba(0,0,0,.42); }
.ai100-shot img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; object-position: top center; }
.ai100-shot figcaption { padding: 13px 18px 16px; }
.ai100-shot figcaption b { display: block; font-size: 15.5px; font-weight: 800; margin-bottom: 4px; }
.ai100-shot figcaption span { font-size: 12.5px; color: var(--ink3); line-height: 1.85; }

/* 橱窗：有大有小 */
.ai100-mosaic { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: clamp(140px, 13vw, 182px); gap: 14px; grid-auto-flow: dense; }
.ai100-mosaic > *:nth-child(1), .ai100-mosaic > *:nth-child(6) { grid-column: span 2; grid-row: span 2; }
@media (max-width: 900px) { .ai100-mosaic { grid-template-columns: repeat(2, 1fr); } }
.ai100-card { position: relative; height: 100%; border-radius: 20px; overflow: hidden; cursor: pointer; background: #1a1d33; border: 1px solid rgba(255,255,255,.1);
  box-shadow: 0 14px 40px rgba(0,0,0,.42); transition: transform .25s, box-shadow .25s; }
.ai100-card:hover { transform: translateY(-4px); box-shadow: 0 26px 60px rgba(0,0,0,.6); }
.ai100-card img.bg { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform .5s; }
.ai100-card:hover img.bg { transform: scale(1.05); }
.ai100-card .ov { position: absolute; left: 0; right: 0; bottom: 0; padding: 44px 16px 15px; color: #fff;
  background: linear-gradient(180deg, transparent, rgba(8,10,22,.56) 40%, rgba(8,10,22,.95) 100%); }
.ai100-card .face { position: absolute; left: 14px; top: 14px; width: 52px; height: 52px; border-radius: 50%; object-fit: cover; object-position: 54% 10%;
  border: 2px solid rgba(255,255,255,.9); box-shadow: 0 6px 18px rgba(0,0,0,.5); }
.ai100-card.big .face { width: 68px; height: 68px; }
.ai100-card.big .ov { padding: 60px 22px 22px; }

.ai100-stage.block { align-items: flex-start; }
.ai100-stage.block .in { padding-top: clamp(44px, 6vw, 76px); padding-bottom: clamp(44px, 6vw, 76px); }
.ai100-how { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: 10px; margin-top: 28px; max-width: 1000px; }
.ai100-how > div { padding: 16px 18px; border-radius: 16px; background: rgba(9,11,24,.74); border: 1px solid rgba(255,255,255,.16); backdrop-filter: blur(22px) saturate(1.3); -webkit-backdrop-filter: blur(22px) saturate(1.3); box-shadow: 0 10px 30px rgba(0,0,0,.35); }

.ai100-cols { columns: 5; column-gap: 26px; }
@media (max-width: 1100px) { .ai100-cols { columns: 3; } }
@media (max-width: 680px) { .ai100-cols { columns: 2; } }
.ai100-cols a { display: block; break-inside: avoid; font-size: 13.5px; color: var(--ink2); padding: 5px 0; cursor: pointer; }
.ai100-cols a:hover { color: #b9aaff; }
@media (prefers-reduced-motion: reduce) { .ai100-film-track, .ai100-reel-track, .ai100-marquee > div { animation: none; } }
`;

const CHECKS = [
  '数字职人：一个职业一个人，有手艺、有工位、有自己的判断',
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

const KEEP = [
  { n: '01', t: '采集：问的是判断，不是答案', d: '让真人专家把自己的故事线走一遍。每到一个决定点，AI 核心就追问「为什么是现在」「凭什么是这个数」「换个条件你还这么做吗」——它要的是他脑子里那套判断，不是一个标准答案。' },
  { n: '02', t: '蒸馏：落成一张能被检验的技能卡', d: '回答被结构化成能力项、判断规则、参数窗口、合格判据，以及常见错误和它们的归因。先由 AI 起草，专家逐条校正；没人校正过的，卡上就老实写着「AI 自学草案 · 等待第一位专家」。' },
  { n: '03', t: '调用：每一次都记账', d: '技能卡进了空间就能反复被用——考新人、答疑、异地解决问题。这门手艺来自谁、在哪一年被蒸馏、此刻正被哪个地方的谁用着，全部留痕。' },
];

const VALUE = [
  { k: '学生', sub: '以及想转行的人', img: '/lab-landing/value-student.jpg', d: '在决定要不要入行之前，先把这一行最有代表性的一天真的走一遍——比看一百篇「XX 专业就业前景」管用。' },
  { k: '学校', sub: '以及培训机构', img: '/lab-landing/value-school.jpg', d: '一份企业官方 JD 进来，几分钟出一个可考核的空间。不用再自己编案例，案例来自真实在招的岗位。' },
  { k: '企业', sub: '以及整个行业', img: '/lab-landing/value-firm.jpg', d: '把老师傅手里说不清的判断变成可追溯、可复用、能异地调用的资产。人会退休，空间不会。' },
  { k: '职业', sub: '它自己', img: '/lab-landing/value-career.jpg', d: '让它被看见。冷门的、新兴的、灵活就业的——收纳师、陪诊师、剧本杀 DM，一样配有自己的空间。' },
];

/** 空间里直接截的图。手法镜那块是真人摄像头，上页面前已经糊过（scripts/lab-landing-shots.mts） */
const SHOTS = [
  { src: '/lab-landing/shots/bench-lap.jpg', t: '虚拟工位 · 第一台主刀', d: '层次、下刀深度、牵开器、器械托盘都是数据定义的。切深了切浅了，事件流当场记一笔。' },
  { src: '/lab-landing/shots/npc-rehab.jpg', t: '人和场景同框', d: '带教导师站在治疗室里跟你说话——皮温、浮髌试验，问题先来，知识后到。' },
  { src: '/lab-landing/shots/npc-fire.jpg', t: '故事线里的一刻', d: '班长撬开防盗门的一道缝，下一步归你：现在射流，还是再等一秒。' },
  { src: '/lab-landing/shots/npc-brand.jpg', t: '不止动手的行当', d: '50 万、3 个月、一页纸——判断型岗位的空间，考的是决定，不是手速。' },
];

/**
 * 一个一个地换人：十来位数字职人的立绘原地消融交替。
 * 不滑动、不留按钮——这一段讲的是「人是具体的」，让具体的人自己出现就够了。
 */
function FaceReel({ people, onPick }: { people: any[]; onPick: (id: string) => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (people.length < 2) return;
    const iv = setInterval(() => setI(x => (x + 1) % people.length), 3600);
    return () => clearInterval(iv);
  }, [people.length]);
  if (!people.length) return null;
  const cur = people[i];
  return (
    <div className="ai100-faces" onClick={() => onPick(cur.id)} title={`${cur.name} · ${cur.role}`}>
      <div className="halo" />
      {people.map((p, k) => <img key={p.id} src={p.avatar} alt="" loading={k < 2 ? 'eager' : 'lazy'} className={k === i ? 'on' : ''} />)}
      <div className="cap">
        <div className="lab-mono" style={{ fontSize: 10.5, letterSpacing: '.12em', color: '#9f91ff' }}>{cur.name}</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginTop: 2 }}>{cur.role}</div>
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>{cur.profession}</div>
      </div>
      <div className="dots">{people.map((p, k) => <i key={p.id} className={k === i ? 'on' : ''} />)}</div>
    </div>
  );
}

/** 概念图：没生成就整块不渲染，别在页面上留一个破图 */
function Art({ src, alt }: { src: string; alt: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return null;
  return <img className="ai100-art" src={src} alt={alt} loading="lazy" onError={() => setBad(true)} />;
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
      // 首页是公开的，只问这一个公开接口；挂了就退回静态文案
      try { const j = await (await fetch('/api/lab/landing')).json(); if (j.ok) { setD(j); setT(j.totals || null); } } catch { /* 静态文案照样能看 */ }
    })();
  }, []);

  const spaces: any[] = d?.spaces || [];
  const n = spaces.length || t?.spaces || 40;
  const famN = d?.families?.length || 13;

  // 胶片：banner 下沿横着走的一条。图不够就循环补，宁可重复也别留空
  const film = useMemo(() => {
    const pool: string[] = (d?.tiles || []).filter(Boolean);
    if (pool.length < 6) return null;
    const full = pool.length >= 16 ? pool.slice(0, 24) : [...pool, ...pool, ...pool].slice(0, 16);
    const a: string[] = [], b: string[] = [];
    full.forEach((u, i) => (i % 2 ? b : a).push(u));
    return [a, b];
  }, [d]);

  // 01 的轮播：有立绘的人，一个领域先出一个，凑十来个
  const faces = useMemo(() => {
    const ok = spaces.filter(x => x.avatar);
    const seen = new Set<string>(), out: any[] = [];
    for (const pass of [0, 1]) for (const x of ok) {
      if (out.length >= 10 || out.includes(x)) continue;
      if (pass === 0 && seen.has(x.family)) continue;
      seen.add(x.family); out.push(x);
    }
    return out;
  }, [spaces]);

  // 橱窗：一个领域先出一个人，凑够 8 个；优先有场景底图、有工位的
  const featured = useMemo(() => {
    const ok = spaces.filter(s => s.cover);
    const seen = new Set<string>(), out: any[] = [];
    for (const pass of [0, 1]) for (const s of ok) {
      if (out.length >= 10 || out.includes(s)) continue;
      if (pass === 0 && (seen.has(s.family) || !s.hasBench)) continue;
      seen.add(s.family); out.push(s);
    }
    return out;
  }, [spaces]);

  // 沉浸带的背景直接用真实工位截图：环境和 HUD 都是产品本身，不是配图
  const stageBg = '/lab-landing/shots/bench-latte.jpg';
  const stageBg2 = useMemo(() => {
    const used = new Set([stageBg]);
    return spaces.find(x => x.cover && !used.has(x.cover) && /潜水|农业|咖啡|手术|医/.test(x.profession))?.cover
      || spaces.map(x => x.cover).filter(Boolean).reverse()[0] || '';
  }, [spaces, stageBg]);

  return (
    <div className="ai100-root">
      <style>{CSS}</style>

      {/* ══ 开场：一次真实点火当背景 ══ */}
      <section className="ai100-bleed ai100-hero">
        <video autoPlay muted loop playsInline preload="metadata" poster="/lab-landing/rocket-wide.jpg">
          <source src="/lab-landing/rocket-wide.webm" type="video/webm" />
          <source src="/lab-landing/rocket-wide.mp4" type="video/mp4" />
        </video>
        <div className="veil" />
        <div className="in">
          <div className="lab-in" style={{ maxWidth: 660 }}>
            <div className="lab-mono lab-cap" style={{ color: 'rgba(255,255,255,.6)' }}>AI 百业 · AI HUNDRED TRADES</div>
            <h1 className="ai100-h1">
              <span style={{ whiteSpace: 'nowrap' }}>AI 技能空间 ＋ 数字职人，</span><br /><span className="ai100-grad" style={{ whiteSpace: 'nowrap' }}>带你走进数智化千行百业</span>
            </h1>
            <p style={{ fontSize: 'clamp(15px, 1.6vw, 18px)', color: 'rgba(255,255,255,.78)', lineHeight: 1.85, margin: '0 0 24px', maxWidth: 580 }}>
              在线做职业探究、能力自测、技能演化，以及真正解决行业里的问题。
            </p>
            <div style={{ display: 'grid', gap: 9, marginBottom: 28 }}>
              {CHECKS.map(c => (
                <div key={c} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 14.5, color: 'rgba(255,255,255,.76)', lineHeight: 1.7 }}>
                  <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', marginTop: 2, background: 'linear-gradient(120deg, var(--v), var(--c))', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
                  {c}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="lab-btn" style={{ height: 52, padding: '0 28px', fontSize: 15 }} onClick={() => router.push('/lab/spaces')}>走进百业空间 →</button>
              <button className="lab-btn ghost" style={{ height: 52, padding: '0 26px', fontSize: 15 }} onClick={() => router.push('/lab/spaces?new=career')}>创造一个空间</button>
            </div>
            <div style={{ display: 'flex', gap: 'clamp(22px, 4vw, 50px)', flexWrap: 'wrap', marginTop: 36 }}>
              <Stat n={n} k="位数字职人" />
              <Stat n={famN} k="个一级领域" />
              {t?.served > 0 && <Stat n={t.served} k="人次走过他们的一天" />}
              {t?.places > 0 && <Stat n={t.places} k="个地方用过" />}
            </div>
          </div>
        </div>
      </section>

      {/* 胶片：这些都是空间里的真实场景 */}
      {film && (
        <div className="ai100-bleed ai100-film">
          {film.map((row, r) => (
            <div key={r} className={`ai100-film-track${r ? ' back' : ''}`} style={{ animationDuration: `${96 + r * 22}s` }}>
              {[0, 1].map(k => (
                <React.Fragment key={k}>
                  {row.map((u, i) => <img key={`${k}-${i}`} src={u} alt="" loading="lazy" />)}
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ══ 分割带：这些名字来自真实企业库 ══ */}
      {d?.companies?.length > 12 && (
        <div className="ai100-bleed ai100-band">
          <div className="ai100-band-in" style={{ display: 'flex', alignItems: 'center', gap: 26, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--ink3)', whiteSpace: 'nowrap', fontWeight: 600 }}>空间里的上下游，来自真实企业库</div>
            <div className="ai100-marquee" style={{ flex: '1 1 320px', minWidth: 0 }}>
              <div>
                {[0, 1].map(k => (
                  <React.Fragment key={k}>
                    {d.companies.slice(0, 20).map((c: string, i: number) => (
                      <span key={`${k}-${i}`} style={{ fontSize: 17, fontWeight: 800, color: 'rgba(74,79,106,.42)', whiteSpace: 'nowrap', letterSpacing: .3 }}>{c}</span>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ 01 落点是人 ══ */}
      <section>
        <div className="ai100-01">
          <div>
            <div className="lab-mono lab-cap" style={{ color: '#9f91ff' }}>01 / 落点</div>
            <h2 className="ai100-h2">技能是抽象的，<br /><span className="ai100-grad">人是具体的</span></h2>
            <p className="ai100-lead">
              我们不做课程，不做题库，也不做培训模拟器。<br />
              一个职业最难传递的部分，从来不写在岗位说明书里。它长在一个人手上——他在什么时候停下、凭什么判断、哪一步绝不能将就。<br />
              所以我们不把职业拆成知识点，而是把它收敛成一个人：他有编号（NOVA-07）、有行当里的称呼（「开腹医师」）、有脸、有一句口头禅、有自己的工位。
              你打开的不是一门课，是一位已经在岗的同行。
            </p>
          </div>
          {faces.length > 1
            ? <FaceReel people={faces} onPick={id => router.push(`/lab/${id}`)} />
            : <img className="ai100-cut" src="/lab-landing/concept-person.png" alt="散落的抽象资料，向右收拢成一个具体的人" loading="lazy" />}
        </div>
      </section>

      {/* ══ 02 身上有四样东西 ══ */}
      <section className="ai100-sec">
        <div className="lab-mono lab-cap" style={{ color: 'var(--v)' }}>02 / 构成</div>
        <h2 className="ai100-h2">一个数字职人身上，有四样东西</h2>
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

      {/* ══ 一整块：可视化的职业空间怎么建起来 ══ */}
      <div className="ai100-bleed ai100-stage block">
        <img src={stageBg} alt="" />
        <div className="veil" />
        <div className="in">
          <div style={{ maxWidth: 640, color: '#fff' }}>
            <div className="lab-mono lab-cap" style={{ color: 'rgba(255,255,255,.6)' }}>VISUALIZED WORKSPACE</div>
            <h2 className="ai100-h2" style={{ color: '#fff' }}>按行业真实的场景构建<br />可视化的职业空间</h2>
          </div>
          <div style={{ maxWidth: 640, marginTop: 6, padding: '2px 18px 6px', borderRadius: 16, background: 'rgba(9,11,24,.56)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
            {[
              ['环境', '贮箱、试车台、凌晨四点的烘焙间——照着这个行当的真实现场生成。'],
              ['工位', '数据定义的虚拟设备。控件、量表、参数窗口、违规判据和合格线都按行业标准建模，摄像头可以接进来，手上的轨迹直接驱动它。'],
              ['在场的人', '师傅、客户、同事会跟你说话，告诉你这一步为什么不能将就。'],
            ].map(([k, v], i) => (
              <div key={k} style={{ display: 'flex', gap: 16, padding: '13px 0', borderTop: i ? '1px solid rgba(255,255,255,.16)' : 0 }}>
                <div style={{ flexShrink: 0, width: 72, fontSize: 15.5, fontWeight: 800, color: '#fff' }}>{k}</div>
                <div style={{ fontSize: 14.5, lineHeight: 1.95, color: 'rgba(255,255,255,.8)' }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="ai100-how">
            {HOW.map((x, i) => (
              <div key={x.t} className="lab-in" style={{ animationDelay: `${i * 60}ms` }}>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 7, color: '#fff' }}>{x.t}</div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.86)', lineHeight: 1.9 }}>{x.d}</div>
              </div>
            ))}
          </div>
          <button className="lab-btn" style={{ height: 50, padding: '0 26px', marginTop: 28 }} onClick={() => router.push('/lab/spaces')}>立刻体验 →</button>
        </div>
      </div>

      {/* ══ 沉浸感与参与感：真实截图走马灯 ══ */}
      <section className="ai100-sec">
        <div className="lab-mono lab-cap" style={{ color: 'var(--v)' }}>INSIDE A SPACE</div>
        <h2 className="ai100-h2">为用户营造真实的<span className="ai100-grad">沉浸感与参与感</span></h2>
        <p className="ai100-lead" style={{ marginBottom: 26 }}>
          你不是在看别人怎么做。场景里的人直接朝你说话，台子上每一个控件都归你，
          手上的动作可以由摄像头接进来直接驱动设备——走到哪一步、错在哪一拍，事件流当场记下。
        </p>
      </section>
      <div className="ai100-bleed ai100-reel">
        <div className="ai100-reel-track">
          {[0, 1].map(k => (
            <React.Fragment key={k}>
              {SHOTS.map(x => (
                <figure key={`${k}-${x.src}`} className="ai100-shot">
                  <img src={x.src} alt={x.t} loading="lazy" />
                  <figcaption><b>{x.t}</b><span>{x.d}</span></figcaption>
                </figure>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ══ 03 三个方向 ══ */}
      <section className="ai100-sec">
        <div style={{ display: 'grid', gap: 'clamp(20px, 3.5vw, 58px)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', alignItems: 'center' }}>
          <Art src="/lab-landing/concept-three.jpg" alt="向下考核、向上学习、平行解决" />
          <div>
            <div className="lab-mono lab-cap" style={{ color: '#9f91ff' }}>03 / 能力</div>
            <h2 className="ai100-h2">AI 数字职人，<span className="ai100-grad">向下、向上、向四方</span>同时发力</h2>
            <p className="ai100-lead" style={{ marginBottom: 20 }}>他是一个能接活的 AI：你可以把人交给他考，把经验交给他学，也可以把一个具体的问题直接扔给他办。</p>
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

      {/* ══ 让资深技能被记录和留存 ══ */}
      <div className="ai100-bleed ai100-keep">
        <div className="in">
          <div className="hd">
            <div>
              <div className="lab-mono lab-cap" style={{ color: '#9f91ff' }}>SKILL PRESERVATION</div>
              <h2 className="ai100-h2">让资深技能<br /><span className="ai100-grad">被记录、被校正、被再用起来</span></h2>
              <p className="ai100-lead" style={{ margin: 0 }}>
                一个老师傅手上的判断，大多说不清，也没人记。退休、转行、换一家厂，一套手艺就跟着走了。
                我们把「留住」这件事拆成三步，每一步都落在数据上，而不是落在一段录像里。
              </p>
            </div>
            <img src="/lab-landing/skill-keep.jpg" alt="老师傅的手艺被记录成一张张可以被取用的技能卡" loading="lazy" />
          </div>
          <div className="steps">
            {KEEP.map((x, i) => (
              <div key={x.n} className="lab-in" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="lab-mono n">{x.n}</div>
                <div className="t">{x.t}</div>
                <div className="d">{x.d}</div>
              </div>
            ))}
          </div>
          {(t?.experts > 0 || t?.served > 0) && (
            <div className="ledger">
              <div className="lab-mono lab-cap" style={{ color: 'var(--ink3)' }}>已经留下来的</div>
              <div className="row">
                {t?.experts > 0 && <Stat n={t.experts} k="位真人专家校正过" />}
                {t?.expertPlaces?.length > 0 && <Stat n={t.expertPlaces.length} k="个地方的手艺" />}
                {t?.served > 0 && <Stat n={t.served} k="人次调用过" />}
                {t?.places > 0 && <Stat n={t.places} k="个地方用过" />}
              </div>
              {t?.expertPlaces?.length > 0 && (
                <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 12, lineHeight: 1.9, maxWidth: 900 }}>
                  手艺来自 {t.expertPlaces.slice(0, 6).join('、')}{t.expertPlaces.length > 6 ? ' 等地' : ''}——
                  这些名字和地点不是写在宣传页上的，它们记在每一张技能卡的来处里，进空间点开就能看见。
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ 04 从一个人，长成一座空间 ══ */}
      <section className="ai100-sec">
        <div style={{ display: 'grid', gap: 'clamp(20px, 3.5vw, 58px)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', alignItems: 'center' }}>
          <div>
            <div className="lab-mono lab-cap" style={{ color: '#9f91ff' }}>04 / 存在空间</div>
            <h2 className="ai100-h2">从一个数字职人，<br /><span className="ai100-grad">长成一整座空间</span></h2>
            <p className="ai100-lead">
              先有一个人：他的手艺、他的工位、他最有代表性的一天。<br />
              再由这个人向外展开他所在的行当——和他同行的是谁、此刻哪些企业在招这个岗、他上游拿谁的料、下游谁在用他的活。
              环节划分由模型给出，挂在每个环节下面的公司全部来自我们自己的企业库，在招的岗位来自真实抓取的岗位库。
              一个人、一门手艺、一张产业图谱，是同一个空间的三种看法。
            </p>
          </div>
          <Art src="/lab-landing/concept-space.jpg" alt="一个人在行业里的存在空间" />
        </div>
      </section>

      {/* ══ 一整块：在岗的人 + 已经住进来的职业 ══ */}
      {featured.length > 0 && (
        <section className="ai100-sec">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 26 }}>
            <div>
              <div className="lab-mono lab-cap" style={{ color: '#9f91ff' }}>NOW ON DUTY</div>
              <h2 className="ai100-h2">已经有 <span className="ai100-grad">{n}</span> 位数字职人在岗</h2>
              <p className="ai100-lead" style={{ margin: 0 }}>
                从高精尖材料、航天发动机试车，到剧本杀 DM、整理收纳师、陪诊师。覆盖 {famN} 个一级领域——冷门的、新兴的、灵活就业的，一样配有自己的空间。
              </p>
            </div>
            <button className="lab-btn ghost" onClick={() => router.push('/lab/spaces')}>看全部 {n} 位 →</button>
          </div>
          <div className="ai100-mosaic">
            {featured.map((s, i) => {
              const big = i === 0 || i === 5;
              return (
                <div key={s.id} className={`ai100-card lab-in${big ? ' big' : ''}`} onClick={() => router.push(`/lab/${s.id}`)}>
                  <img className="bg" src={s.cover} alt="" loading="lazy" />
                  {s.avatar && <img className="face" src={s.avatar} alt="" loading="lazy" />}
                  <div className="ov">
                    <div className="lab-mono" style={{ fontSize: 10.5, opacity: .75, letterSpacing: '.1em' }}>{s.name}</div>
                    <div style={{ fontSize: big ? 22 : 17, fontWeight: 800, lineHeight: 1.3, marginTop: 2 }}>{s.role}</div>
                    <div style={{ fontSize: big ? 13.5 : 12, opacity: .82, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.profession}</div>
                    {big && s.tagline && <div style={{ fontSize: 13.5, opacity: .9, marginTop: 8, lineHeight: 1.7 }}>「{s.tagline}」</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="ai100-cols" style={{ marginTop: 28, paddingTop: 24, borderTop: '1px solid var(--line)' }}>
            {spaces.map(x => (
              <a key={x.id} onClick={() => router.push(`/lab/${x.id}`)}>{x.profession}<span style={{ color: 'var(--ink3)', opacity: .75 }}> · {x.role}</span></a>
            ))}
          </div>
        </section>
      )}

      {/* ══ 06 价值 ══ */}
      <section className="ai100-sec">
        <div className="lab-mono lab-cap" style={{ color: 'var(--v)' }}>06 / 价值</div>
        <h2 className="ai100-h2">它对谁有用</h2>
        <div className="ai100-value">
          {VALUE.map((x, i) => (
            <div key={x.k} className="lab-in" style={{ animationDelay: `${i * 70}ms` }}>
              <img src={x.img} alt="" loading="lazy" />
              <div className="t">
                <div className="who">{x.k}<span>{x.sub}</span></div>
                <div className="d">{x.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ 07 创造 ══ */}
      <section className="ai100-sec">
        <div style={{ display: 'grid', gap: 'clamp(20px, 3.5vw, 58px)', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', alignItems: 'center' }}>
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
      <section className="lab-glass lab-in" style={{ padding: 'clamp(26px, 5vw, 56px)', margin: 'clamp(44px, 7vw, 86px) 0 10px', textAlign: 'center' }}>
        <div className="lab-mono lab-cap">NOW LIVING IN AI 百业</div>
        <div className="ai100-h2" style={{ margin: '10px 0 20px' }}>{n} 位数字职人，正在各自的工位上</div>
        {(t?.faces?.length > 0 || spaces.length > 0) && (
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 8, margin: '0 auto 24px', maxWidth: 800 }}>
            {(spaces.map((x: any) => x.avatar).filter(Boolean).length ? spaces.map((x: any) => x.avatar).filter(Boolean) : t.faces).slice(0, 20).map((f: string, i: number) => (
              <img key={i} src={f} alt="" loading="lazy" style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', objectPosition: '54% 10%', border: '2px solid #fff', boxShadow: '0 4px 14px rgba(60,45,130,.18)' }} />
            ))}
          </div>
        )}
        <button className="lab-btn" style={{ height: 50, padding: '0 28px', fontSize: 15 }} onClick={() => router.push('/lab/spaces')}>去见见他们 →</button>
      </section>
    </div>
  );
}
