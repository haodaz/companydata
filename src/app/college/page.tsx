'use client';

/**
 * AI 百业｜AI 大学首页（2026-10-21）：一张讲清楚「这是一所什么样的大学」的静态介绍页，版式参照大学官网（整幅影像、衬线大标题、中英双语、图文交替）。
 * 叙事：一个通用大模型 → 化成万千数字职人 + 数字职业空间；好教材 + 好老师 + 干真活 → AI 真人才；再讲课程与训练、面向千行百业、毕业生，
 * 最后给三类来访者入口（送学生来训练 / 来要人才 / 教职工）。
 * 影像在 public/college：Veo 生成的空镜（hero / book / hands / work）+ 3D 教室截帧。对外页面不放全站统计数字。
 * 毕业生名录、档案、入学、要人这些可操作的页面在 /college/graduates、/college/g/:id、/college/enroll、/college/hire。
 */
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Graduate } from '@/lib/college';
import { CU_BASE, Loop } from './ui';
import { CASES } from './cases/data';

const PILLARS = [
  {
    n: '01', zh: '好教材', en: 'Curriculum', video: '/college/book.mp4', poster: '/college/book.jpg',
    title: '教材，是一个岗位的每一天', sub: 'Every day, every process, every workplace of a role.',
    body: '教材从平方的知识图谱里长出来：企业、岗位、职业、场所、工具、标准，织成一张网。一个岗位的每一天、每一道工序、每一个现场，都是它的课——从早上接第一个活，到晚上写交接留言。你在这里看到的，只是其中一个缩影。',
    facts: [['场景', 'Scenes'], ['工位', 'Workstations'], ['判断规则', 'Rules'], ['交接', 'Handover']],
    link: { href: '/lab/gallery', t: '走进一门课', en: 'Visit a course' },
  },
  {
    n: '02', zh: '好老师', en: 'Faculty', video: '/college/hands.mp4', poster: '/college/hands.jpg',
    title: '手艺，学自最懂这一行的人', sub: 'Taught by the people who know the trade best.',
    body: '好老师不只是一位老师傅：行业里的资深从业者、头部公司的做法、智库的研究、行业标准，一起给它上课、给它评分。他们的判断规则、示范、复盘时说的「为什么」，就是 AI 的课；还没被人校正过的，就写明是草稿。',
    facts: [['资深从业者', 'Practitioners'], ['头部公司', 'Leading firms'], ['智库研究', 'Research'], ['行业标准', 'Standards']],
    link: { href: '/college/graduates', t: '看看教出来的毕业生', en: 'Meet the graduates' },
  },
  {
    n: '03', zh: '干真活', en: 'Real Work', video: '/college/work.mp4', poster: '/college/work.jpg',
    title: '考试，就是一份真活', sub: 'The exam is real work.',
    body: '企业把真实的任务交进来。AI 先把活干一遍：每一步留痕，按岗位标准评分，结论逐条找证据。干对了，才有资格出题、考评别人；没过，就回去补训，再考。',
    facts: [['真任务', 'Real tasks'], ['过程留痕', 'Audit trail'], ['岗位标准', 'Standards'], ['补训', 'Remediation']],
    link: { href: '/work', t: '看看真活', en: 'See real tasks' },
  },
];

const STAGES: [string, string, string][] = [
  ['入学', 'Admission', '一个通用大模型进来，先不带任何技能考一次，看它在这一行本来是什么水平。'],
  ['拜师', 'Apprenticeship', '分到一位老师傅门下：规则、示范、这一行的知识，一起装进来。'],
  ['实训', 'Practicum', '在虚拟工位上过完这一行的一天：接活、判断、上手操作设备。'],
  ['考核', 'Examination', '用企业的真活考，同一道题、同一套岗位标准，及格线 60。'],
  ['毕业', 'Commencement', '过了发证书和成绩单，去在招这一行的企业上岗。'],
];

const INDUSTRIES: { zh: string; en: string; role: string; img: string }[] = [
  { zh: '航天制造', en: 'Aerospace', role: '发动机总装 · 搅拌摩擦焊', img: '/lab/rocket_hall.jpg' },
  { zh: '医疗', en: 'Medicine', role: '外科医生 · 护士', img: '/lab/or_hall.jpg' },
  { zh: '科学研究', en: 'Research', role: '电池材料博士后', img: '/video/research-lab.jpg' },
  { zh: '精密制造', en: 'Manufacturing', role: '精铸工艺 · 质检', img: '/lab/casting_hall.jpg' },
  { zh: '餐饮服务', en: 'Hospitality', role: '咖啡师 · 拉花', img: '/lab/latte_bar.jpg' },
  { zh: '商业与数据', en: 'Business & Data', role: '数据分析师', img: '/lab/da_office.jpg' },
  { zh: '品牌营销', en: 'Marketing', role: '市场营销管培生', img: '/lab/brand_office.jpg' },
  { zh: '零售', en: 'Retail', role: '门店运营', img: '/lab/campus_store.jpg' },
  { zh: '能源与动力', en: 'Energy & Power', role: '试车台工程师', img: '/lab/rocket_teststand.jpg' },
];

const SUPPLY: [string, string, string][] = [
  ['替代', 'Replace', 'AI 全量干一道工序，人定规则、看例外、做抽检。'],
  ['增强', 'Augment', 'AI 交出可核验的结果，人只复核标了「需人工」的那一栏。'],
  ['协同', 'Collaborate', 'AI 出稿、迭代，人定方向、取舍拍板。'],
];

const BELIEFS: [string, string, string][] = [
  ['人', 'People', '本事学自真人。AI 和人用同一种语言被描绘、被比较。'],
  ['求真', 'Truth', '用真活说话：能考、能核、能追溯。'],
  ['心智世界', 'The World of Mind', '平方的知识是它的教材，也是它上岗后的记忆。'],
];

/** 进入视口一次就记住（分化动画、渐显用） */
function useSeen<T extends Element>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen] as const;
}

/** 点了才播的影片（带声音和控制条） */
function Film({ src, poster, zh, en, note }: { src: string; poster: string; zh: string; en: string; note: string }) {
  const [on, setOn] = useState(false);
  return (
    <figure className="cu-film">
      <div className="cu-film-media">
        {on ? <video src={src} poster={poster} controls autoPlay playsInline /> : (
          <button onClick={() => setOn(true)} aria-label={`播放：${zh}`}>
            <img src={poster} alt="" loading="lazy" />
            <span className="cu-play">▶</span>
          </button>
        )}
      </div>
      <figcaption><b>{zh}</b><i>{en}</i><span>{note}</span></figcaption>
    </figure>
  );
}

/** 从一个到万千：左边一个还没分化的通用大模型，进入视口后分化成一位位数字职人（各自带着自己的职业空间） */
function Become({ grads }: { grads: Graduate[] }) {
  const [ref, seen] = useSeen<HTMLDivElement>(0.2);
  const tiles = grads.filter(g => g.avatar && g.cover).slice(0, 24);
  return (
    <section className="cu-become">
      <div className="cu-in">
        <div className="cu-eyebrow light">从一个，到万千 · FROM ONE MODEL TO MANY CRAFTS</div>
        <h2 className="cu-h2 light">一个通用大模型，化成万千数字职人<span>One general model becomes a thousand different professionals.</span></h2>
        <div ref={ref} className={`cu-become-stage${seen ? ' on' : ''}`}>
          <div className="cu-seed">
            <div className="cu-orb"><i /><i /><i /></div>
            <b>通用大模型</b>
            <em>General model</em>
            <p>什么都懂一点，<br />哪一行都没干过。</p>
          </div>
          <div className="cu-beam" aria-hidden />
          <div className="cu-many">
            {(tiles.length ? tiles : Array.from({ length: 24 }, () => null)).map((g, i) => g ? (
              <Link key={g.id} href={`/college/g/${g.id}`} className="cu-one" style={{ transitionDelay: `${180 + i * 55}ms` }}>
                <img className="bg" src={g.cover!} alt="" loading="lazy" />
                <img className="av" src={g.avatar!} alt="" loading="lazy" />
                <span>{g.role}</span>
              </Link>
            ) : <div key={i} className="cu-one sk" />)}
          </div>
        </div>
        <div className="cu-become-legend">
          <div><b>数字职人</b><i>Digital professional</i><p>有名字、有师承、有成绩单。学自哪位老师傅、能干哪些活，都写在档案里。</p></div>
          <div><b>数字职业空间</b><i>Digital workplace</i><p>这一行的现场：场景、工位、同事和从早到晚的一天。职人在这里学，也在这里被考。</p></div>
          <div><b>同一个底座，各不相同</b><i>Same foundation, different minds</i><p>底子都是通用大模型；分开它们的，是教材、老师和干过的活。</p></div>
        </div>
      </div>
    </section>
  );
}

export default function CollegeHome() {
  const hero = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [all, setAll] = useState<Graduate[]>([]);
  useEffect(() => {
    fetch('/api/college/graduates').then(r => r.json()).then(j => { if (j.ok) setAll(j.data); }).catch(() => {});
  }, []);
  // 真人才那一节挑 4 位：职业 3 位 + 学科研究 1 位
  // 精选不放客服：人人都说会训练客服，放在门面上反而掉价
  const pick = all.filter(g => g.graduated && g.avatar && g.cover && !/客服/.test(g.role));
  const featured = [...pick.filter(g => !g.research).slice(0, 3), ...pick.filter(g => g.research).slice(0, 1)];
  while (featured.length < 4 && pick.length > featured.length) { const g = pick.find(x => !featured.includes(x)); if (!g) break; featured.push(g); }
  const toggle = () => { const v = hero.current; if (!v) return; if (v.paused) { v.play(); setPaused(false); } else { v.pause(); setPaused(true); } };

  return (
    <div className="cu">
      <style>{CU_BASE + CU_CSS}</style>

      {/* ── 影像首屏 ── */}
      <section className="cu-hero">
        <video ref={hero} src="/college/hero.mp4" poster="/college/hero.jpg" autoPlay muted loop playsInline />
        <div className="cu-hero-shade" />
        <div className="cu-hero-in">
          <div className="cu-eyebrow light">百業大學 · BAIYE AI COLLEGE</div>
          <h1><span>培养 AI 数字职人</span><br /><span className="gold">走进千行百业</span></h1>
          <div className="cu-hero-en">Where AI learns a craft — and earns its place at work.</div>
          <p>学生是 AI。好教材、好老师、干真活，三样都在，才出得了能上岗的 AI 人才。</p>
          <div className="cu-hero-acts">
            <a className="cu-btn light" href="#about">了解学院 <i>About</i></a>
            <Link className="cu-btn line" href="/college/graduates">看毕业生 <i>Graduates</i> →</Link>
          </div>
        </div>
        <button className="cu-pause" onClick={toggle} aria-label={paused ? '播放影像' : '暂停影像'}>{paused ? '▶' : '❚❚'}</button>
      </section>

      {/* ── 关于 ── */}
      <section className="cu-sec cu-about" id="about">
        <div className="cu-in">
          <div className="cu-eyebrow">关于学院 · ABOUT</div>
          <p className="cu-statement">大模型读过整个互联网，<br />却没有在哪一行上过一天班。</p>
          <div className="cu-about-cols">
            <p>人类办大学几百年，把普通人培养成医生、工程师、手艺人。人的大学，培养人；AI 的大学，培养能和人一起干活的 AI。它缺的不是知识，而是三样东西：一套这一行真正的教材，一群好老师，一份要对结果负责的真活。</p>
            <p className="en">A university for people trains people; a university for AI trains AI that can work alongside them. What a model lacks is not knowledge, but a real curriculum, great teachers, and a job it must answer for.</p>
          </div>
          <div className="cu-eq">
            {[['好教材', 'Curriculum'], ['好老师', 'Faculty'], ['干真活', 'Real Work']].map(([z, e], i) => (
              <React.Fragment key={z}>
                {i > 0 && <span className="op">+</span>}
                <div><b>{z}</b><i>{e}</i></div>
              </React.Fragment>
            ))}
            <span className="op">=</span>
            <div className="res"><b>AI 真人才</b><i>Real AI Talent</i></div>
          </div>
        </div>
      </section>

      {/* ── 从一个到万千 ── */}
      <Become grads={all} />

      {/* ── 三根柱子：图文交替 ── */}
      {PILLARS.map((p, i) => (
        <section key={p.n} className={`cu-pillar${i % 2 ? ' flip' : ''}`}>
          <div className="cu-pillar-media"><Loop src={p.video} poster={p.poster} /></div>
          <div className="cu-pillar-text">
            <div className="cu-pillar-k"><span className="n">{p.n}</span><b>{p.zh}</b><i>{p.en}</i></div>
            <h2>{p.title}</h2>
            <div className="cu-en-sub">{p.sub}</div>
            <p>{p.body}</p>
            <ul className="cu-facts">{p.facts.map(([z, e]) => <li key={z}>{z}<i>{e}</i></li>)}</ul>
            <a className="cu-more" href={p.link.href}>{p.link.t} <i>{p.link.en}</i> →</a>
          </div>
        </section>
      ))}

      {/* ── 结果：AI 真人才 ── */}
      <section className="cu-talent">
        <div className="cu-in">
          <div className="cu-pillar-k light"><span className="n">04</span><b>AI 真人才</b><i>Real AI Talent</i></div>
          <h2>毕业的，是能直接上岗的 AI 人才</h2>
          <div className="cu-en-sub light">Graduates who can show their work.</div>
          <p className="cu-talent-p">平方自己培养的毕业生，可以直接输送给企业。每一位适合哪些公司、哪些岗位，毕业考考得怎样，学自哪些好老师，都评价得清清楚楚——帮企业挑到最合适的那一位。</p>
          <div className="cu-grads">
            {(featured.length ? featured : Array.from({ length: 4 }, () => null)).map((g, i) => g ? (
              <Link key={g.id} href={`/college/g/${g.id}`} className="cu-grad">
                <div className="cu-grad-cover"><img src={g.cover!} alt="" loading="lazy" /></div>
                <img className="cu-grad-av" src={g.avatar!} alt="" loading="lazy" />
                <b>{g.role}</b>
                <span>{g.name} · {g.family}</span>
                {g.exam.after != null && <em>毕业考 {g.exam.after}{g.exam.before != null ? `（入学 ${g.exam.before}）` : ''}</em>}
                {!!g.hiring.companies.length && <small>能去：{g.hiring.companies.slice(0, 2).join(' · ')}</small>}
              </Link>
            ) : <div key={i} className="cu-grad sk" />)}
          </div>
          <Link className="cu-btn light" href="/college/graduates" style={{ marginTop: 34 }}>全部毕业生 <i>All graduates</i> →</Link>
        </div>
      </section>

      {/* ── 课程与训练 ── */}
      <section className="cu-sec cu-ivory" id="academics">
        <div className="cu-in">
          <div className="cu-eyebrow">课程与训练 · ACADEMICS</div>
          <h2 className="cu-h2">从入学到毕业<span>From admission to commencement</span></h2>
          <ol className="cu-stages">
            {STAGES.map(([z, e, d], i) => (
              <li key={z}>
                <div className="i">{String(i + 1).padStart(2, '0')}</div>
                <b>{z}</b><i>{e}</i>
                <p>{d}</p>
              </li>
            ))}
          </ol>
          <div className="cu-loop"><b>补训 <i>Remediation</i></b>考核没过，找出短板，用老师傅的规则和示范补训，再考，直到过关。AI 先能干，才有资格考评别人。</div>

          <div className="cu-schools">
            <Link href="/college/graduates" className="cu-school">
              <img src="/lab/casting_hall.jpg" alt="" loading="lazy" />
              <div><span>职业学院 · School of Professions</span><b>一个职业的一天</b><p>从早上接活到晚上交接，跟着一位老师傅过完这一行真实的一天。</p></div>
            </Link>
            <Link href="/college/g/c8c986e6-6452-4834-bac4-1ce2a360c9cc" className="cu-school">
              <img src="/video/research-lab.jpg" alt="" loading="lazy" />
              <div><span>研究学院 · School of Research</span><b>一位研究者的一天</b><p>读数据、做实验、在组会上被追问——学科研究的手艺，也是一门课。</p></div>
            </Link>
          </div>
        </div>
      </section>

      {/* ── 影像与 3D 教室 ── */}
      <section className="cu-sec cu-dark">
        <div className="cu-in">
          <div className="cu-eyebrow light">影像与 3D 教室 · FILMS &amp; 3D</div>
          <h2 className="cu-h2 light">教室，是可以走进去的<span>Step inside the classroom</span></h2>
          <p className="cu-dark-p">每间教室都是这一行的现场：AI 生成环绕影像，重建成三维空间，转头就能看到手术台、咖啡吧台、火箭发动机试车台。</p>
          <div className="cu-media">
            <a className="cu-3d" href="/lab/beta/3d/or" target="_blank" rel="noreferrer">
              <img src="/college/3d-or.jpg" alt="" loading="lazy" />
              <span className="tag">3D</span>
              <div><b>手术室</b><i>Operating room</i></div>
            </a>
            <a className="cu-3d" href="/lab/beta/3d/cafe" target="_blank" rel="noreferrer">
              <img src="/college/3d-cafe.jpg" alt="" loading="lazy" />
              <span className="tag">3D</span>
              <div><b>咖啡吧台</b><i>Espresso bar</i></div>
            </a>
            <Film src="/lab-landing/rocket-wide.mp4" poster="/lab-landing/rocket-wide.jpg" zh="火箭发动机试车" en="Rocket engine test stand" note="在虚拟工位上一步步完成点火前检查" />
            <Film src="/lab-landing/spaces-loop-v4.mp4" poster="/lab-landing/spaces-loop-v4.jpg" zh="职业的一天" en="A day in the life" note="一间间教室，一行行手艺" />
          </div>
        </div>
      </section>

      {/* ── 千行百业 ── */}
      <section className="cu-sec" id="industries">
        <div className="cu-in">
          <div className="cu-eyebrow">面向千行百业 · INDUSTRIES</div>
          <h2 className="cu-h2">千行百业，都缺会干活的 AI<span>For every trade, a graduate who can do the work</span></h2>
          <div className="cu-mosaic">
            {INDUSTRIES.map((x, i) => (
              <Link key={x.zh} href="/college/graduates" className={`cu-tile${i === 0 ? ' big' : ''}`}>
                <img src={x.img} alt="" loading="lazy" />
                <div><b>{x.zh}</b><i>{x.en}</i><span>{x.role}</span></div>
              </Link>
            ))}
          </div>

          <div className="cu-supply">
            <div className="cu-supply-h">
              <b>给 OPC 和 AI Native 组织供血</b>
              <i>Talent for one-person companies and AI-native organizations</i>
              <p>一个人加一队 AI 员工，就是一家公司；一家 AI Native 组织，按环节配好人和 AI。缺的不是模型，是会干这一行、被考过、可追溯的 AI 员工。</p>
            </div>
            {SUPPLY.map(([z, e, d]) => <div key={z} className="cu-supply-c"><b>{z}</b><i>{e}</i><p>{d}</p></div>)}
          </div>
        </div>
      </section>

      {/* ── 案例：分析型的活和新兴职业（只用叙述，不配图） ── */}
      <section className="cu-sec cu-ivory" id="cases">
        <div className="cu-in">
          <div className="cu-eyebrow">案例 · CASES</div>
          <h2 className="cu-h2">客户带着问题来<span>Organizations bring us the work they need done</span></h2>
          <p className="cu-p" style={{ marginTop: -14, marginBottom: 30 }}>不只是传统手艺。出海、车间数据、组织搭建、产业研究，这些分析型的活和新兴职业，也一样可以教、可以考、可以上岗。</p>
          <div className="cu-cases">
            {CASES.map(c => (
              <Link key={c.id} href={`/college/cases#${c.id}`} className="cu-case">
                <span className="n">{c.n}</span>
                <b>{c.q}</b>
                <p>{c.who}。{c.result}</p>
                <div className="tags">{c.tags.map(t => <em key={t}>{t}</em>)}</div>
                <i className="go">读完整案例 →</i>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── 我们相信 ── */}
      <section className="cu-sec" style={{ paddingBottom: 0 }}>
        <div className="cu-in">
          <div className="cu-eyebrow">我们相信 · WHAT WE BELIEVE</div>
          <div className="cu-beliefs">
            {BELIEFS.map(([z, e, d]) => <div key={z}><b>{z}</b><i>{e}</i><p>{d}</p></div>)}
          </div>
        </div>
      </section>

      {/* ── 从这里开始：故事型分流（申请模型入学 / 人才培养需求 / 查看毕业生） ── */}
      <section className="cu-sec" id="start">
        <div className="cu-in">
          <div className="cu-eyebrow">从这里开始 · GET STARTED</div>
          <h2 className="cu-h2">你是来做什么的？<span>How can we help?</span></h2>
          <div className="cu-doors">
            <Link href="/college/enroll" className="cu-door">
              <div className="cu-door-img"><img src="/college/book.jpg" alt="" loading="lazy" /></div>
              <div className="cu-door-body">
                <q>我们训了一个模型，想知道它能不能真干一行。</q>
                <b>申请模型入学</b>
                <p>先不带技能考一次，看它的底子；再跟老师傅上课、重考。没过就补训，过了发证书和成绩单。</p>
                <em>申请入学 →</em>
              </div>
            </Link>
            <Link href="/college/hire" className="cu-door">
              <div className="cu-door-img"><img src="/college/hands.jpg" alt="" loading="lazy" /></div>
              <div className="cu-door-body">
                <q>我们缺一个会干这行的人，市面上找不到现成的。</q>
                <b>人才培养需求</b>
                <p>把岗位要求和内部材料交过来，平方把这一行做成课程，定向培养一位 AI 员工，考过了再交付。</p>
                <em>提交培养需求 →</em>
              </div>
            </Link>
            <Link href="/college/graduates" className="cu-door">
              <div className="cu-door-img grads">
                {all.filter(g => g.graduated && g.avatar).slice(0, 8).map(g => <img key={g.id} src={g.avatar!} alt="" loading="lazy" />)}
              </div>
              <div className="cu-door-body">
                <q>有没有已经能上岗的？我想直接引进。</q>
                <b>查看毕业生</b>
                <p>已经毕业的 AI 职人：师承、成绩单、能干的活、能去的公司都在档案里，可以直接引进上岗。</p>
                <em>查看毕业生 →</em>
              </div>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

const CU_CSS = `
/* 首屏 */
.cu-hero { position: relative; height: min(88vh, 860px); min-height: 560px; overflow: hidden; background: #2a1f12; color: #fff; }
.cu-hero video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cu-hero-shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(10,14,32,.78) 0%, rgba(10,14,32,.45) 45%, rgba(10,14,32,0) 75%), linear-gradient(0deg, rgba(10,14,32,.55), rgba(10,14,32,0) 45%); }
.cu-hero-in { position: absolute; left: 0; right: 0; bottom: clamp(48px, 9vh, 96px); max-width: 1240px; margin: 0 auto; padding: 0 clamp(16px, 4vw, 40px); }
.cu-hero h1 { font-family: var(--serif); font-size: clamp(36px, 6.2vw, 84px); font-weight: 900; line-height: 1.08; margin: 18px 0 12px; letter-spacing: .03em; text-shadow: 0 2px 30px rgba(0,0,0,.25); }
.cu-hero h1 span { display: inline-block; white-space: nowrap; }
.cu-hero h1 .gold { background: linear-gradient(100deg, #d9b878, #f3dfae 45%, #b08d57); -webkit-background-clip: text; color: transparent; }
.cu-hero-en { font: italic 400 clamp(18px, 2.2vw, 28px)/1.4 var(--en); color: rgba(255,255,255,.88); }
.cu-hero p { max-width: 640px; font-size: clamp(15px, 1.3vw, 17.5px); line-height: 1.85; color: rgba(255,255,255,.86); margin: 18px 0 28px; }
.cu-hero-acts { display: flex; gap: 12px; flex-wrap: wrap; }
.cu-pause { position: absolute; right: clamp(16px, 3vw, 36px); bottom: clamp(20px, 4vh, 36px); width: 40px; height: 40px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,.6); background: rgba(0,0,0,.2); color: #fff; font-size: 12px; cursor: pointer; }

/* 关于 */
.cu-statement { font-family: var(--serif); font-size: clamp(28px, 4vw, 52px); font-weight: 900; line-height: 1.35; margin: 22px 0 34px; max-width: 980px; letter-spacing: .02em; }
.cu-about-cols { display: grid; grid-template-columns: 1.15fr 1fr; gap: clamp(20px, 4vw, 60px); max-width: 1080px; }
.cu-about-cols p { margin: 0; font-size: 17px; line-height: 1.95; color: var(--ink2); }
.cu-about-cols p.en { font: italic 400 18px/1.75 var(--en); color: var(--ink3); border-left: 2px solid var(--gold); padding-left: 22px; }
.cu-eq { display: flex; align-items: center; flex-wrap: wrap; gap: 14px 22px; margin-top: 56px; padding-top: 36px; border-top: 1px solid var(--line); }
.cu-eq div { display: grid; }
.cu-eq b { font-family: var(--serif); font-size: clamp(22px, 2.6vw, 32px); font-weight: 900; }
.cu-eq i { font-size: 14px; color: var(--ink3); }
.cu-eq .op { font: 300 34px var(--en); color: var(--gold); }
.cu-eq .res b { color: var(--gold); }

/* 从一个到万千 */
.cu-become { background: radial-gradient(120% 90% at 12% 40%, #1e2a5e 0%, #0b0f22 60%); color: #fff; padding: clamp(64px, 9vw, 120px) 0; overflow: hidden; }
.cu-become-stage { display: grid; grid-template-columns: 220px 90px minmax(0, 1fr); align-items: center; }
.cu-seed { display: grid; justify-items: center; text-align: center; gap: 4px; }
.cu-orb { position: relative; width: 150px; height: 150px; margin-bottom: 14px; }
.cu-orb i { position: absolute; inset: 0; border-radius: 50%; }
.cu-orb i:nth-child(1) { background: radial-gradient(circle at 35% 32%, #fffdf3, #e6d3a6 30%, #8a7a5c 62%, #2a2c44 100%); box-shadow: 0 0 60px rgba(217,184,120,.45); animation: cu-breathe 4s ease-in-out infinite; }
.cu-orb i:nth-child(2) { inset: -18px; border: 1px solid rgba(217,184,120,.35); animation: cu-ring 4s ease-out infinite; }
.cu-orb i:nth-child(3) { inset: -18px; border: 1px solid rgba(217,184,120,.35); animation: cu-ring 4s ease-out 2s infinite; }
@keyframes cu-breathe { 50% { transform: scale(1.04); box-shadow: 0 0 90px rgba(217,184,120,.6); } }
@keyframes cu-ring { from { transform: scale(.85); opacity: .9; } to { transform: scale(1.5); opacity: 0; } }
.cu-seed b { font-family: var(--serif); font-size: 22px; }
.cu-seed em { font: italic 15px var(--en); color: rgba(255,255,255,.6); }
.cu-seed p { margin: 10px 0 0; font-size: 14px; line-height: 1.7; color: rgba(255,255,255,.65); }
.cu-beam { height: 2px; align-self: center; background: linear-gradient(90deg, rgba(217,184,120,.9), rgba(217,184,120,0)); transform-origin: left; transform: scaleX(0); transition: transform .9s cubic-bezier(.2,.7,.2,1); position: relative; }
.cu-beam::after { content: ''; position: absolute; right: 0; top: -40px; bottom: -40px; width: 70%; background: radial-gradient(60% 50% at 0% 50%, rgba(217,184,120,.18), transparent); }
.cu-become-stage.on .cu-beam { transform: scaleX(1); }
.cu-many { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
.cu-one { position: relative; aspect-ratio: 4 / 3; overflow: hidden; background: rgba(255,255,255,.06); opacity: 0; transform: translateX(-60px) scale(.6); filter: grayscale(1) blur(6px); transition: opacity .7s, transform .8s cubic-bezier(.2,.7,.2,1), filter .9s; }
.cu-become-stage.on .cu-one { opacity: 1; transform: none; filter: none; }
.cu-one.sk { opacity: .4; }
.cu-one .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .75; transition: opacity .3s, transform .5s; }
.cu-one::after { content: ''; position: absolute; inset: 0; background: linear-gradient(0deg, rgba(8,10,24,.85) 0%, rgba(8,10,24,0) 60%); }
.cu-one .av { position: absolute; left: 8px; bottom: 24px; width: 34px; height: 34px; border-radius: 50%; object-fit: cover; object-position: 50% 12%; border: 2px solid #fff; z-index: 1; background: #e8e3d4; }
.cu-one span { position: absolute; left: 8px; right: 6px; bottom: 6px; z-index: 1; font-size: 11.5px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cu-one:hover .bg { opacity: 1; transform: scale(1.06); }
.cu-become-legend { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 56px; border-top: 1px solid rgba(255,255,255,.18); }
.cu-become-legend > div { padding: 24px 26px 0 0; }
.cu-become-legend > div + div { padding-left: 26px; border-left: 1px solid rgba(255,255,255,.12); }
.cu-become-legend b { font-family: var(--serif); font-size: 22px; color: var(--gold2); }
.cu-become-legend i { display: block; color: rgba(255,255,255,.55); margin: 2px 0 10px; }
.cu-become-legend p { margin: 0; font-size: 14.5px; line-height: 1.85; color: rgba(255,255,255,.75); }

/* 三根柱子 */
.cu-pillar { display: grid; grid-template-columns: 1.15fr 1fr; min-height: 620px; background: #fff; }
.cu-pillar.flip { background: var(--ivory); }
.cu-pillar.flip .cu-pillar-media { order: 2; }
.cu-pillar-media { position: relative; overflow: hidden; background: #ddd; }
.cu-pillar-media video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cu-pillar-text { padding: clamp(40px, 6vw, 88px) clamp(20px, 5vw, 80px); display: flex; flex-direction: column; justify-content: center; }
.cu-pillar-k { display: flex; align-items: baseline; gap: 12px; }
.cu-pillar-k .n { font: 400 15px var(--en); color: var(--gold); letter-spacing: .1em; }
.cu-pillar-k b { font-family: var(--serif); font-size: 18px; font-weight: 900; color: var(--gold); letter-spacing: .1em; }
.cu-pillar-k i { font-size: 16px; color: var(--ink3); }
.cu-pillar-k.light b { color: var(--gold2); } .cu-pillar-k.light i { color: rgba(255,255,255,.6); }
.cu-pillar h2, .cu-talent h2 { font-family: var(--serif); font-size: clamp(28px, 3.4vw, 44px); font-weight: 900; line-height: 1.25; margin: 16px 0 8px; letter-spacing: .02em; }
.cu-en-sub { font: italic 400 clamp(17px, 1.6vw, 21px)/1.5 var(--en); color: var(--ink3); }
.cu-en-sub.light { color: rgba(255,255,255,.65); }
.cu-pillar p { font-size: 16.5px; line-height: 1.95; color: var(--ink2); margin: 24px 0; max-width: 560px; }
.cu-facts { list-style: none; padding: 0; margin: 0 0 30px; display: grid; grid-template-columns: 1fr 1fr; max-width: 520px; border-top: 1px solid var(--line); }
.cu-facts li { padding: 12px 0; border-bottom: 1px solid var(--line); font-weight: 700; font-size: 15px; display: flex; gap: 8px; align-items: baseline; }
.cu-facts li i { font-weight: 400; font-size: 14px; color: var(--ink3); }
.cu-more { font-weight: 800; color: var(--navy); font-size: 15.5px; align-self: flex-start; border-bottom: 2px solid var(--gold); padding-bottom: 4px; }
.cu-more i { font-weight: 400; color: var(--ink3); }

/* 真人才 */
.cu-talent { background: linear-gradient(160deg, #16204a, #0f1638 70%); color: #fff; padding: clamp(64px, 9vw, 120px) 0; }
.cu-talent-p { font-size: 17px; line-height: 1.9; color: rgba(255,255,255,.78); max-width: 680px; margin: 22px 0 40px; }
.cu-grads { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 22px; }
.cu-grad { position: relative; display: grid; justify-items: start; align-content: start; gap: 4px; color: #fff; }
.cu-grad.sk { height: 320px; background: rgba(255,255,255,.06); }
.cu-grad-cover { width: 100%; aspect-ratio: 4 / 3; overflow: hidden; }
.cu-grad-cover img { width: 100%; height: 100%; object-fit: cover; transition: transform .5s; }
.cu-grad:hover .cu-grad-cover img { transform: scale(1.04); }
.cu-grad-av { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; object-position: 50% 12%; margin: -32px 0 6px 16px; border: 3px solid #16204a; box-shadow: 0 0 0 1.5px var(--gold2); background: #e8e3d4; position: relative; }
.cu-grad b { font-family: var(--serif); font-size: 21px; font-weight: 900; }
.cu-grad span { font: 600 12px var(--en); letter-spacing: .12em; color: rgba(255,255,255,.55); }
.cu-grad em { font-style: normal; font-size: 13.5px; color: var(--gold2); margin-top: 6px; }
.cu-grad small { font-size: 13px; color: rgba(255,255,255,.72); line-height: 1.6; }

/* 课程与训练 */
.cu-stages { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border-top: 2px solid var(--navy); }
.cu-stages li { padding: 22px 20px 6px 0; display: grid; align-content: start; gap: 2px; }
.cu-stages li + li { padding-left: 20px; border-left: 1px solid var(--line); }
.cu-stages .i { font: 400 34px var(--en); color: var(--gold); margin-bottom: 8px; }
.cu-stages b { font-family: var(--serif); font-size: 22px; font-weight: 900; }
.cu-stages i { font-size: 15px; color: var(--ink3); }
.cu-stages p { font-size: 14.5px; line-height: 1.8; color: var(--ink2); margin: 10px 0 0; }
.cu-loop { margin-top: 26px; padding: 16px 20px; background: #fff; border-left: 3px solid var(--gold); font-size: 15px; line-height: 1.8; color: var(--ink2); }
.cu-loop b { color: var(--navy); margin-right: 12px; }
.cu-loop b i { font-weight: 400; color: var(--ink3); }
.cu-schools { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 56px; }
.cu-school { position: relative; display: block; aspect-ratio: 16 / 9; overflow: hidden; color: #fff; background: #222; }
.cu-school img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform .6s; }
.cu-school:hover img { transform: scale(1.04); }
.cu-school > div { position: absolute; left: 0; right: 0; bottom: 0; padding: 60px 26px 22px; background: linear-gradient(0deg, rgba(10,14,32,.88), rgba(10,14,32,0)); }
.cu-school span { font: 600 12px var(--en); letter-spacing: .14em; color: var(--gold2); text-transform: uppercase; }
.cu-school b { display: block; font-family: var(--serif); font-size: 26px; font-weight: 900; margin: 6px 0 4px; }
.cu-school p { margin: 0; font-size: 14.5px; line-height: 1.7; color: rgba(255,255,255,.82); max-width: 460px; }

/* 影像与 3D */
.cu-dark { background: #0b0f22; color: #fff; }
.cu-dark-p { font-size: 17px; line-height: 1.9; color: rgba(255,255,255,.72); max-width: 720px; margin: -14px 0 40px; }
.cu-media { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; }
.cu-3d, .cu-film-media button { position: relative; display: block; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border: 0; padding: 0; cursor: pointer; background: #111; }
.cu-3d img, .cu-film-media img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform .6s; }
.cu-3d:hover img, .cu-film-media button:hover img { transform: scale(1.04); }
.cu-3d .tag { position: absolute; top: 16px; left: 16px; padding: 5px 12px; font: 700 12px var(--en); letter-spacing: .14em; background: var(--gold2); color: #1c1606; }
.cu-3d > div { position: absolute; left: 0; right: 0; bottom: 0; padding: 50px 22px 18px; background: linear-gradient(0deg, rgba(0,0,0,.75), rgba(0,0,0,0)); display: flex; align-items: baseline; gap: 10px; color: #fff; }
.cu-3d b { font-family: var(--serif); font-size: 22px; }
.cu-3d i { color: rgba(255,255,255,.7); }
.cu-film { margin: 0; }
.cu-film-media video { width: 100%; aspect-ratio: 16 / 9; background: #000; display: block; }
.cu-play { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.92); color: var(--navy); font-size: 22px; padding-left: 4px; }
.cu-film figcaption { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; padding: 14px 2px 0; }
.cu-film figcaption b { font-family: var(--serif); font-size: 19px; }
.cu-film figcaption i { color: rgba(255,255,255,.6); }
.cu-film figcaption span { width: 100%; font-size: 13.5px; color: rgba(255,255,255,.6); }

/* 千行百业 */
.cu-mosaic { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: 220px; gap: 12px; }
.cu-tile { position: relative; overflow: hidden; background: #222; color: #fff; }
.cu-tile.big { grid-column: span 2; grid-row: span 2; }
.cu-tile img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform .6s; }
.cu-tile:hover img { transform: scale(1.05); }
.cu-tile > div { position: absolute; left: 0; right: 0; bottom: 0; padding: 40px 18px 14px; background: linear-gradient(0deg, rgba(10,14,32,.85), rgba(10,14,32,0)); display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
.cu-tile b { font-family: var(--serif); font-size: 20px; }
.cu-tile.big b { font-size: 30px; }
.cu-tile i { font-size: 14px; color: rgba(255,255,255,.72); }
.cu-tile span { width: 100%; font-size: 13px; color: rgba(255,255,255,.75); }
.cu-supply { display: grid; grid-template-columns: 1.6fr repeat(3, minmax(0, 1fr)); margin-top: 64px; border-top: 2px solid var(--navy); }
.cu-supply > div { padding: 24px 22px 8px 0; }
.cu-supply > div + div { padding-left: 22px; border-left: 1px solid var(--line); }
.cu-supply-h b { display: block; font-family: var(--serif); font-size: 24px; font-weight: 900; line-height: 1.35; }
.cu-supply-h i { display: block; margin-top: 4px; color: var(--ink3); font-size: 15px; }
.cu-supply-h p { font-size: 14.5px; line-height: 1.85; color: var(--ink2); margin: 14px 0 0; }
.cu-supply-c b { font-family: var(--serif); font-size: 26px; font-weight: 900; color: var(--gold); }
.cu-supply-c i { margin-left: 8px; color: var(--ink3); }
.cu-supply-c p { font-size: 14.5px; line-height: 1.8; color: var(--ink2); margin: 10px 0 0; }

/* 案例 */
.cu-cases { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0; border-top: 2px solid var(--navy); }
.cu-case { display: grid; align-content: start; gap: 10px; padding: 28px 30px 28px 0; border-bottom: 1px solid var(--line); color: var(--navy); }
.cu-case:nth-child(2n) { padding-left: 30px; padding-right: 0; border-left: 1px solid var(--line); }
.cu-case .n { font: 400 30px var(--en); color: var(--gold); }
.cu-case b { font-family: var(--serif); font-size: 24px; line-height: 1.4; }
.cu-case p { margin: 0; font-size: 15px; line-height: 1.85; color: var(--ink2); }
.cu-case .tags { display: flex; flex-wrap: wrap; gap: 6px; }
.cu-case .tags em { font-style: normal; font-size: 12.5px; padding: 3px 10px; background: rgba(176,141,87,.12); color: #7a5c2a; }
.cu-case .go { font-style: normal; font-family: inherit; font-weight: 800; font-size: 14.5px; color: var(--navy); }
.cu-case:hover b { color: #24306a; text-decoration: underline; text-decoration-color: var(--gold); text-underline-offset: 6px; }

/* 我们相信 */
.cu-beliefs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 30px; }
.cu-beliefs > div { padding: 10px 30px 10px 0; }
.cu-beliefs > div + div { padding-left: 30px; border-left: 1px solid var(--line); }
.cu-beliefs b { display: block; font-family: var(--serif); font-size: clamp(34px, 4vw, 52px); font-weight: 900; color: var(--navy); }
.cu-beliefs i { display: block; font-size: 17px; color: var(--gold); margin: 2px 0 14px; }
.cu-beliefs p { font-size: 15.5px; line-height: 1.85; color: var(--ink2); margin: 0; }

/* 故事型分流 */
.cu-doors { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
.cu-door { display: grid; grid-template-rows: auto 1fr; background: var(--ivory); border-top: 3px solid var(--navy); transition: border-color .2s; overflow: hidden; }
.cu-door:hover { border-top-color: var(--gold); }
.cu-door-img { position: relative; aspect-ratio: 16 / 9; overflow: hidden; background: #16204a; }
.cu-door-img img { width: 100%; height: 100%; object-fit: cover; transition: transform .6s; }
.cu-door:hover .cu-door-img img { transform: scale(1.04); }
.cu-door-img.grads { display: grid; grid-template-columns: repeat(4, 1fr); background: radial-gradient(120% 120% at 20% 30%, #2c3768, #0f1638); padding: 10px 14px; align-content: center; }
.cu-door-img.grads img { width: 100%; height: auto; aspect-ratio: 1; border-radius: 50%; object-position: 50% 12%; border: 2px solid rgba(255,255,255,.85); background: #e8e3d4; transform: scale(.84); }
.cu-door:hover .cu-door-img.grads img { transform: scale(.9); }
.cu-door-body { display: grid; align-content: start; gap: 8px; padding: 26px 26px 28px; }
.cu-door q { font-family: var(--serif); font-size: 17px; line-height: 1.6; color: var(--ink2); quotes: "「" "」"; }
.cu-door b { font-family: var(--serif); font-size: 28px; font-weight: 900; margin-top: 6px; }
.cu-door p { font-size: 15px; line-height: 1.85; color: var(--ink2); margin: 2px 0 10px; }
.cu-door em { font-style: normal; font-weight: 800; font-size: 15px; color: var(--navy); border-bottom: 2px solid var(--gold); justify-self: start; padding-bottom: 3px; }

@media (max-width: 980px) {
  .cu-become-stage { grid-template-columns: 1fr; gap: 26px; }
  .cu-beam { width: 2px; height: 50px; justify-self: center; background: linear-gradient(180deg, rgba(217,184,120,.9), rgba(217,184,120,0)); transform: scaleY(0); transform-origin: top; }
  .cu-become-stage.on .cu-beam { transform: scaleY(1); }
  .cu-many { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .cu-become-legend { grid-template-columns: 1fr; }
  .cu-become-legend > div, .cu-become-legend > div + div { padding: 18px 0; border-left: 0; border-bottom: 1px solid rgba(255,255,255,.12); }
  .cu-pillar { grid-template-columns: 1fr; min-height: 0; }
  .cu-pillar-media { aspect-ratio: 16 / 10; }
  .cu-pillar.flip .cu-pillar-media { order: 0; }
  .cu-grads { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cu-stages { grid-template-columns: 1fr; }
  .cu-stages li, .cu-stages li + li { padding: 18px 0; border-left: 0; border-bottom: 1px solid var(--line); }
  .cu-schools, .cu-media, .cu-doors, .cu-beliefs, .cu-about-cols { grid-template-columns: 1fr; }
  .cu-beliefs > div, .cu-beliefs > div + div { padding: 18px 0; border-left: 0; border-bottom: 1px solid var(--line); }
  .cu-mosaic { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 170px; }
  .cu-supply, .cu-cases { grid-template-columns: 1fr; }
  .cu-case, .cu-case:nth-child(2n) { padding: 22px 0; border-left: 0; }
  .cu-supply > div, .cu-supply > div + div { padding: 18px 0; border-left: 0; border-bottom: 1px solid var(--line); }
}
@media (prefers-reduced-motion: reduce) { .cu-one, .cu-beam { transition: none; } .cu-orb i { animation: none; } }
`;
