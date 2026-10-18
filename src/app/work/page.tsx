'use client';

/**
 * 百业AI｜真活 · 公开首页（照 /lab 首页和 NeoWork 的宣传效果：整幅环境、标题直说、真实界面当信息不当装饰）。
 * 出题 / 管理在 /work/mine（要登录），做题 /work/<token> 免登录。截图由 scripts/video/shot.mjs 截到 public/work/。
 */
import React from 'react';
import Link from 'next/link';

const ART = 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-art';
const SCENES = [
  { src: `${ART}/muprqaib23zv-research_office.jpg`, cap: '券商研究所 · 行业分析师' },
  { src: `${ART}/muprkhvgjivf-structure_office.jpg`, cap: '设计院 · 结构设计工程师' },
  { src: `${ART}/mufry2fd3tn2-production_control_room.jpg`, cap: '生产控制室 · 工艺工程师' },
  { src: `${ART}/mups6exyl3jv-partner_office.jpg`, cap: '律所 · 法务 / 律师' },
  { src: `${ART}/mupr9iqprqxe-bench.jpg`, cap: '数控加工台 · 机械加工' },
  { src: `${ART}/mupr4dxvunlf-formulation_lab.jpg`, cap: '研发实验室 · 材料工程师' },
  { src: `${ART}/muprgu4wkuxw-architect_studio.jpg`, cap: '设计事务所 · 建筑设计' },
  { src: `${ART}/mufry2fd3tn2-process_engineering_offi.jpg`, cap: '工艺工程办公室 · 工艺工程师' },
];
const MEDIA = 'https://jextsfzlbchbnsnxwgeu.supabase.co/storage/v1/object/public/lab-media/landing';
const DEMO_VIDEO = `${MEDIA}/work-demo-720.mp4`, DEMO_POSTER = `${MEDIA}/work-demo-poster.jpg`, DEMO_VTT = '/work/work-demo.vtt';

const I = (d: string) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const STEPS = [
  { t: '出题', d: '填企业和岗位，两三分钟出一道真活：任务书、材料包、逐条标准，AI 先做一遍。', icon: I('M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M14 4v6h6 M8 14h8 M8 18h5') },
  { t: '分享', d: '参与链接发给候选人或团队，留个名字就能做，不用登录。', icon: I('M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1') },
  { t: '候选人做真活', d: '在操作台上做，或用自己的软件做并录屏；每一步都留痕。', icon: I('M3 5h18v11H3z M2 20h20 M9 9l3 3 4-4') },
  { t: '看考评', d: '结果逐条有证据，过程有高光和风险时刻，还和 AI 基线比。', icon: I('M4 20V10 M10 20V4 M16 20v-7 M22 20H2') },
];
const ENVS = [
  { t: '文档 / 对账台', d: '方案、邮件、scorecard、口径对账。', img: '/work/shot-doc.png' },
  { t: '代码台', d: '写函数、写脚本；自测用例在浏览器里跑。', img: '/work/shot-code.png' },
  { t: '表格 / 数据台', d: '起始表直接改；单位混用、版本重复这种坑看他清不清。', img: '/work/shot-sheet.png' },
  { t: '设计台', d: '参数表 + 草图 + 设计说明，定值要有依据。', img: '/work/shot-design.png' },
];
/** 候选人对比：同样的交付物，过程不一样（报告里真实出现过的行为） */
const CMP = [
  ['打开了几份材料', '1 / 5，只看了背景简报', '5 / 5，先把需求表和调拨约束读完', false, true],
  ['问 AI 什么', '把任务书整段贴进去要答案', '问「三种单位怎么换算、材料里有没有单包电量」', false, true],
  ['AI 的建议怎么处理', '第一版答案原样放进交付物', 'pack 换算没直接采纳，自己设假设并写明影响', false, true],
  ['改稿方式', '20 秒内出现 883 字整段输入，之后不动', '一行一行改表，旧版本行标注作废原因', false, true],
  ['假设有没有写明', '没写，数字来源不明', '每个假设都标了「待确认」和影响范围', false, true],
] as const;
const REPORT_PARTS = [
  { img: '/work/rep-score.png', t: '结果分 + 过程摘要', d: '一眼看到分数、和 AI 基线的差距，以及这次是怎么做出来的：用时、问了几次 AI、看了几份材料、自己敲了多少字。' },
  { img: '/work/rep-items.png', t: '逐条核对，引用原句当证据', d: '每条标准给 BARS 等级和分数，证据是交付物里的原话；前置没做到的，后置自动封顶并写明被谁卡住。' },
  { img: '/work/rep-moments.png', t: '高光时刻 · 风险时刻', d: '指向具体的分秒和事件：哪一问问到了点子上，哪一段是整段粘贴，哪份材料从头到尾没打开。' },
  { img: '/work/rep-dims.png', t: '人机协作六维', d: '问题界定、信息核验、AI 协作、判断取舍、交付表达、风险意识——只写「观察到」，不下定性。' },
];

function SceneBackdrop({ onIndex }: { onIndex?: (i: number) => void }) {
  const [i, setI] = React.useState(0);
  React.useEffect(() => { const t = setInterval(() => setI(x => (x + 1) % SCENES.length), 4200); return () => clearInterval(t); }, []);
  React.useEffect(() => { onIndex?.(i); }, [i, onIndex]);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#e9ebf3' }}>
      {SCENES.map((sc, k) => <img key={sc.src} src={sc.src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: k === i ? 1 : 0, transition: 'opacity 1.6s ease, transform 7s linear', transform: k === i ? 'scale(1.07)' : 'scale(1.0)' }} />)}
      {/* 浅色蒙版：左边压白给文字，右边场景透出来 */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(248,246,241,.96) 0%, rgba(248,246,241,.9) 38%, rgba(248,246,241,.45) 68%, rgba(248,246,241,.2) 100%), linear-gradient(0deg, rgba(248,246,241,1) 0%, rgba(248,246,241,0) 28%)' }} />
    </div>
  );
}
const Img = ({ src, alt, style }: { src: string; alt: string; style?: React.CSSProperties }) => <img src={src} alt={alt} style={{ display: 'block', width: '100%', ...style }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />;

/** 评价模型：结果（标准有依赖）× 过程（事件流 → 时刻 → 六维）× AI 基线 → 招聘信号 */
function ModelChart() {
  const box = (x: number, y: number, w: number, h: number, t: string, sub?: string, fill = '#fff', stroke = '#d9dbe6', ink = '#1a1a2e') => <g><rect x={x} y={y} width={w} height={h} rx={12} fill={fill} stroke={stroke} /><text x={x + w / 2} y={y + (sub ? 28 : h / 2 + 5)} textAnchor="middle" fontSize={15} fontWeight={700} fill={ink}>{t}</text>{sub && <text x={x + w / 2} y={y + 48} textAnchor="middle" fontSize={11.5} fill={ink === '#fff' ? '#cfd3e6' : '#6b6f86'}>{sub}</text>}</g>;
  const arrow = (x1: number, y1: number, x2: number, y2: number) => <path d={`M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`} fill="none" stroke="#b9bdd0" strokeWidth={2} markerEnd="url(#ah)" />;
  return (
    <svg viewBox="0 0 980 420" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#b9bdd0" /></marker></defs>
      {box(20, 40, 170, 60, '交付物', '文档 / 表 / 代码 / 图')}
      {box(20, 180, 170, 60, '过程', '事件流 · 录屏抽帧')}
      {box(20, 320, 170, 60, 'AI 基线', '最强模型先做一遍')}
      {box(290, 20, 210, 100, '逐条标准（有依赖）', '证据 = 原句 · BARS · 依据', '#f3f2ff', '#c9c4ff')}
      <text x={395} y={104} textAnchor="middle" fontSize={11} fill="#6055f5">假设 → 测算 → 方案：前置没过，后置封顶</text>
      {box(290, 160, 210, 100, '时刻', '高光 · 风险 · 指向分秒', '#f0fbf6', '#b7ead0')}
      <text x={395} y={244} textAnchor="middle" fontSize={11} fill="#12a150">开材料 · 问 AI · 核验 · 粘贴 · 改稿</text>
      {box(290, 300, 210, 80, '同一套标准评', '基线分 · 逐条差距', '#fff8ea', '#f3dca6')}
      {box(580, 150, 180, 120, '人机协作六维', ' ', '#f0fbf6', '#b7ead0')}
      {['问题界定', '信息核验', 'AI 协作', '判断取舍', '交付表达', '风险意识'].map((d, k) => <text key={d} x={592 + (k % 2) * 86} y={198 + Math.floor(k / 2) * 22} fontSize={11.5} fill="#2d6a4f">· {d}</text>)}
      {box(820, 150, 140, 120, '招聘信号', '结果分 · 过程信号', '#1a1a2e', '#1a1a2e', '#fff')}
      <text x={890} y={236} textAnchor="middle" fontSize={11.5} fill="#cfd3e6">只写「观察到」</text>
      <text x={890} y={254} textAnchor="middle" fontSize={11.5} fill="#cfd3e6">不下定性</text>
      {arrow(190, 70, 290, 70)}{arrow(190, 210, 290, 210)}{arrow(190, 350, 290, 340)}
      {arrow(500, 210, 580, 210)}{arrow(500, 70, 820, 180)}{arrow(760, 210, 820, 210)}{arrow(500, 340, 820, 240)}
    </svg>
  );
}

/** 平方数据基础设施 → 生成器 → 真活 */
function InfraChart() {
  const col = (x: number, title: string, items: string[], color: string) => <g>
    <rect x={x} y={20} width={200} height={190} rx={14} fill="#fff" stroke="#e6e8f0" />
    <path d={`M${x} ${34} a14 14 0 0 1 14 -14 h172 a14 14 0 0 1 14 14 v26 h-200 z`} fill={color} />
    <text x={x + 100} y={46} textAnchor="middle" fontSize={15} fontWeight={700} fill="#fff">{title}</text>
    {items.map((it, k) => <text key={it} x={x + 16} y={92 + k * 30} fontSize={12.5} fill="#3b405a">· {it}</text>)}
  </g>;
  return (
    <svg viewBox="0 0 980 240" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs><marker id="ah2" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#b9bdd0" /></marker></defs>
      {col(0, '行业', ['行业标准与操作规程', '设备操作手册 · 厂商资料', '赛事 · 需求飞轮信号', '条款可引用、可追溯'], '#12b5cb')}
      {col(220, '企业', ['企业画像 12 个维度', '产品 · 动态 · 高管 · 舆情', '在招岗位 · 校招项目', '深度尽调专题'], '#6055f5')}
      {col(440, '职业', ['职业画像 · 发展图谱', '典型任务 · 工位 · 工具', '分年限薪资 · 各地薪资', '和企业岗位的图谱链接'], '#fa8c16')}
      <text x={320} y={232} textAnchor="middle" fontSize={11.5} fill="#8a8fa8">三层之间按名称 / 别名 / 图谱链接互相指回</text>
      <path d="M650 115 C 690 115, 690 115, 720 115" fill="none" stroke="#b9bdd0" strokeWidth={2} markerEnd="url(#ah2)" />
      <rect x={730} y={50} width={250} height={130} rx={14} fill="#1a1a2e" />
      <text x={855} y={90} textAnchor="middle" fontSize={16} fontWeight={700} fill="#fff">生成器</text>
      <text x={855} y={116} textAnchor="middle" fontSize={12} fill="#cfd3e6">问题 → 任务 → 材料包（留坑）</text>
      <text x={855} y={136} textAnchor="middle" fontSize={12} fill="#cfd3e6">→ 带依据的标准 → AI 基线</text>
      <text x={855} y={160} textAnchor="middle" fontSize={11.5} fill="#8f87ff">材料里没有的数字标「示例数据」</text>
      <text x={855} y={210} textAnchor="middle" fontSize={13} fontWeight={700} fill="#1a1a2e">一道此刻真实的真活</text>
      <text x={855} y={230} textAnchor="middle" fontSize={11.5} fill="#6b6f86">+ 取材清单：用了哪些数据，题里写得清楚</text>
    </svg>
  );
}

const MOMENTS_A = [
  { t: '00:16', kind: 'risk', skill: '信息获取', text: '只打开了 m1 需求表，m2 工厂邮件、m3 调拨约束、m5 单包电量没看', ev: 'materials_opened = 1 / 5' },
  { t: '00:20', kind: 'risk', skill: '任务委托', text: '把任务书整段贴进去要答案；四秒内出现 883 字整段输入', ev: 'paste 883 字 @ 00:20' },
  { t: '01:12', kind: 'risk', skill: '判断采纳', text: 'AI 第一版答案原样放进交付物，pack 换算用的假设没有写明', ev: 'adopt_ai → 交付物无改动' },
] as const;
const MOMENTS_B = [
  { t: '00:04', kind: 'high', skill: '信息获取', text: '先把需求表和调拨约束读完，再问问题', ev: 'materials_opened = 5 / 5' },
  { t: '01:12', kind: 'high', skill: '判断采纳', text: '问 AI 单位换算，追问「材料里有没有单包电量」；换算结果没直接采纳，自己设假设并注明影响', ev: 'ai_ask ×3 · 自己敲 2,140 字' },
  { t: '01:40', kind: 'high', skill: '可追溯', text: '一行一行改表，旧版本行标注作废原因，每个假设标「待确认」', ev: 'edit 事件 46 次 · 无整段粘贴' },
] as const;
function Moment({ m }: { m: { t: string; kind: string; skill: string; text: string; ev: string } }) {
  const c = m.kind === 'high' ? '#12a150' : '#c0392b';
  return <div style={{ padding: '6px 0', borderTop: '1px solid #f0ede6', lineHeight: 1.55 }}><span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: c, fontWeight: 800 }}>{m.t}</span><span style={{ marginLeft: 8, fontSize: 11.5, padding: '1px 7px', borderRadius: 999, background: m.kind === 'high' ? '#dcf5e7' : '#ffe3e0', color: c }}>{m.kind === 'high' ? '高光' : '风险'}</span><span style={{ marginLeft: 6, fontSize: 12, color: '#8a8fa8' }}>{m.skill}</span><div style={{ color: '#3b405a' }}>{m.text}</div><div style={{ fontSize: 12, color: '#8a8fa8' }}>证据：{m.ev}</div></div>;
}
function Strip({ segs, legend }: { segs: readonly (readonly [string, number])[]; legend: string }) {
  const total = segs.reduce((a, s) => a + s[1], 0);
  return <div><div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#eee' }}>{segs.map((s, i) => <div key={i} style={{ width: `${(s[1] / total) * 100}%`, background: s[0] }} />)}</div><div style={{ fontSize: 11.5, color: '#8a8fa8', marginTop: 4 }}>{legend}</div></div>;
}

export default function WorkLanding() {
  const [sceneIdx, setSceneIdx] = React.useState(0);
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => { const f = () => setScrolled(window.scrollY > 80); f(); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, []);
  return (
    <div style={{ minHeight: '100vh', background: '#f8f6f1', color: '#1a1a2e', fontFamily: 'var(--font-geist-sans), -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif' }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@600;700;900&display=swap" />
      <style>{`@keyframes wkcue { 0% { transform: translateY(0); opacity: .9 } 60% { transform: translateY(8px); opacity: .3 } 100% { transform: translateY(0); opacity: .9 } }`}</style>
      {/* 顶栏 */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 28px', maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ fontWeight: 800, letterSpacing: 1 }}>百业AI<span style={{ color: '#6055f5' }}>｜</span>真活</div>
          <span style={{ color: '#888', fontSize: 13 }}>平方智能</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 13, alignItems: 'center' }}>
            <a href="#why" style={lnk}>为什么看过程</a><a href="#how" style={lnk}>怎么用</a><a href="#modes" style={lnk}>两种做法</a><a href="#report" style={lnk}>评分报告</a><a href="#infra" style={lnk}>数据底座</a>
            <Link href="/work/mine" style={{ ...lnk, color: '#fff', background: '#6055f5', padding: '7px 16px', borderRadius: 999 }}>出一道真活</Link>
          </div>
        </div>
      </div>

      {/* 首屏：整幅工位场景当环境（浅色蒙版），字压在左边 */}
      <section style={{ position: 'relative', minHeight: '100svh', display: 'flex', alignItems: 'center' }}>
        <SceneBackdrop onIndex={setSceneIdx} />
        <div style={{ position: 'relative', width: '100%', maxWidth: 1180, margin: '0 auto', padding: '96px 28px 72px' }}>
          <div style={{ fontSize: 12, letterSpacing: 4, color: '#6055f5', fontWeight: 700 }}>百业AI｜真活 · REAL WORK, REAL TALENT</div>
          <h1 style={{ fontSize: 'clamp(46px, 6vw, 84px)', lineHeight: 1.16, margin: '14px 0 18px', fontWeight: 700, letterSpacing: '.01em', fontFamily: serif }}>寻找真人才，<br /><span style={{ background: 'linear-gradient(90deg,#6055f5,#12b5cb)', WebkitBackgroundClip: 'text', color: 'transparent' }}>看他干真活</span></h1>
          <p style={{ fontSize: 'clamp(15px, 1.5vw, 18px)', color: '#3b405a', lineHeight: 1.85, maxWidth: 560, margin: '0 0 22px' }}>给一家企业、一个岗位，生成此刻真实的业务题；候选人在操作台上做，或用自己的软件做并录屏。我们记录过程、逐条评价，并和 AI 基线对照。</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px 18px', marginBottom: 28, maxWidth: 440 }}>
            {['生成真实问题', '智能评价考核', '记录过程评估', 'AI 基线对照'].map(c => (
              <div key={c} style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 15, color: '#1a1a2e', fontWeight: 600 }}><span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: 'linear-gradient(120deg,#6055f5,#12b5cb)', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>{c}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/work/mine" style={{ ...btn, textDecoration: 'none', height: 54, display: 'inline-flex', alignItems: 'center', padding: '0 30px' }}>出一道真活 →</Link>
            <Link href="/work/T712yYY1swI" style={{ ...btnGhost, textDecoration: 'none', height: 54, display: 'inline-flex', alignItems: 'center' }}>先试一道示范题</Link>
          </div>
          <div style={{ marginTop: 16, fontSize: 13, color: '#6b6f86' }}>登录后出题 · 做题的人不用登录 · 出题约 2–3 分钟</div>
        </div>
        <div style={{ position: 'absolute', right: 28, bottom: 26, display: 'flex', alignItems: 'center', gap: 12, color: '#1a1a2e' }}>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, letterSpacing: 3, color: '#6b6f86' }}>真活发生的地方</div><div style={{ fontSize: 15, fontWeight: 700 }}>{SCENES[sceneIdx].cap}</div></div>
          <div style={{ display: 'flex', gap: 5 }}>{SCENES.map((_, k) => <span key={k} style={{ width: k === sceneIdx ? 18 : 6, height: 6, borderRadius: 3, background: k === sceneIdx ? '#1a1a2e' : 'rgba(26,26,46,.3)', transition: 'width .3s' }} />)}</div>
        </div>
        {/* 下滑提示（照 /lab 首页） */}
        <a href="#why" style={{ position: 'absolute', left: '50%', bottom: 22, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textDecoration: 'none', color: '#3b405a', opacity: scrolled ? 0 : 1, transition: 'opacity .4s', pointerEvents: scrolled ? 'none' : 'auto' }}>
          <span style={{ width: 22, height: 34, borderRadius: 12, border: '2px solid rgba(26,26,46,.45)', position: 'relative', display: 'block' }}><span style={{ position: 'absolute', left: 8, top: 6, width: 3, height: 7, borderRadius: 2, background: '#1a1a2e', animation: 'wkcue 1.6s ease-in-out infinite' }} /></span>
          <span style={{ fontSize: 12, letterSpacing: 2 }}>下滑了解真活</span>
        </a>
      </section>

      {/* 为什么看过程：同样的交付物，不同的信号 */}
      <section id="why" style={{ maxWidth: 1180, margin: '0 auto', padding: '64px 28px 8px' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}><div style={{ fontSize: 12, letterSpacing: 3, color: '#6055f5', fontWeight: 700 }}>WHY · 为什么看过程</div><h2 style={{ ...h2, fontSize: 34 }}>同样的交付物，不同的招聘信号</h2><div style={{ color: '#4a4f66' }}>两个人都交了一张对好账的表，结果分都是 71。差别在怎么做出来的——而这些，只有过程记录看得见。</div></div>
        <div style={{ background: '#fffdf9', border: '1px solid #ebe7de', borderRadius: 20, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.6fr 1.6fr', background: '#f3f1ea', fontSize: 13.5, fontWeight: 700 }}>
            <div style={{ padding: '14px 18px', color: '#6b6f86' }}>过程维度</div>
            <div style={{ padding: '14px 18px', borderLeft: '1px solid #ebe7de' }}>候选人 A <span style={{ marginLeft: 8, padding: '2px 10px', borderRadius: 999, background: '#ffe3e0', color: '#b42318', fontSize: 12 }}>过程信号 弱</span></div>
            <div style={{ padding: '14px 18px', borderLeft: '1px solid #ebe7de' }}>候选人 B <span style={{ marginLeft: 8, padding: '2px 10px', borderRadius: 999, background: '#dcf5e7', color: '#12753f', fontSize: 12 }}>过程信号 强</span></div>
          </div>
          {CMP.map(([k, a, b, okA, okB]) => <div key={k} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.6fr 1.6fr', borderTop: '1px solid #ebe7de', fontSize: 14 }}>
            <div style={{ padding: '12px 18px', fontWeight: 600 }}>{k}</div>
            <div style={{ padding: '12px 18px', borderLeft: '1px solid #ebe7de', color: '#3b405a' }}><span style={{ color: okA ? '#12a150' : '#c0392b', fontWeight: 800, marginRight: 6 }}>{okA ? '✓' : '✗'}</span>{a}</div>
            <div style={{ padding: '12px 18px', borderLeft: '1px solid #ebe7de', color: '#3b405a' }}><span style={{ color: okB ? '#12a150' : '#c0392b', fontWeight: 800, marginRight: 6 }}>{okB ? '✓' : '✗'}</span>{b}</div>
          </div>)}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.6fr 1.6fr', borderTop: '1px solid #ebe7de', fontSize: 14, background: '#fafaf7' }}>
            <div style={{ padding: '12px 18px', fontWeight: 600 }}>事件流（2 小时）</div>
            <div style={{ padding: '12px 18px', borderLeft: '1px solid #ebe7de' }}><Strip segs={[['#c9ccd6', 6], ['#6055f5', 2], ['#ffb3ad', 1], ['#e5484d', 5], ['#c9ccd6', 10]]} legend="灰 空闲 · 紫 看材料 · 红 整段粘贴" /></div>
            <div style={{ padding: '12px 18px', borderLeft: '1px solid #ebe7de' }}><Strip segs={[['#6055f5', 5], ['#12b5cb', 2], ['#6055f5', 3], ['#3ddc97', 8], ['#12b5cb', 1], ['#3ddc97', 5]]} legend="紫 看材料 · 青 问 AI · 绿 自己改稿" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.6fr 1.6fr', borderTop: '1px solid #ebe7de', fontSize: 13 }}>
            <div style={{ padding: '12px 18px', fontWeight: 600, fontSize: 14 }}>报告节选<div style={{ fontSize: 12, color: '#8a8fa8', fontWeight: 400, marginTop: 2 }}>高光 / 风险时刻</div></div>
            <div style={{ padding: '10px 18px 12px', borderLeft: '1px solid #ebe7de' }}>{MOMENTS_A.map(m => <Moment key={m.t} m={m} />)}</div>
            <div style={{ padding: '10px 18px 12px', borderLeft: '1px solid #ebe7de' }}>{MOMENTS_B.map(m => <Moment key={m.t} m={m} />)}</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 13, color: '#6b6f86', marginTop: 12 }}>上面每一行都来自评分报告里的「高光时刻」「风险时刻」：指向具体的分秒和证据，不下定性。结果人人能用 AI 生成，只有过程说明是谁在做。</div>
      </section>

      {/* 怎么用 */}
      <section id="how" style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 28px 8px' }}>
        <h2 style={h2}>一道真活，就是招聘里的一个小项目</h2>
        <div style={{ color: '#4a4f66', marginBottom: 18 }}>四步走完，不用懂 HR。每道真活有自己的空间：管理、分享、看做题情况、看评分报告。</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
          {STEPS.map((st, i) => <div key={st.t} style={{ ...card, position: 'relative', overflow: 'hidden', padding: '22px 20px 20px' }}>
            <div style={{ position: 'absolute', right: -10, top: -14, fontSize: 96, fontWeight: 900, color: 'rgba(96,85,245,.07)', lineHeight: 1 }}>{i + 1}</div>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#6055f5,#12b5cb)', display: 'grid', placeItems: 'center', marginBottom: 12 }}>{st.icon}</div>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>{st.t}</div>
            <div style={{ fontSize: 14, color: '#4a4f66', lineHeight: 1.75 }}>{st.d}</div>
          </div>)}
        </div>
      </section>

      {/* 看片 */}
      <section id="watch" style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 28px 8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 28, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 3, color: '#6055f5', fontWeight: 700 }}>WATCH · 2.5 MIN</div>
          <h2 style={{ ...h2, margin: '8px 0 10px' }}>看一道真活是怎么做完、怎么被评的</h2>
          <p style={{ color: '#4a4f66', lineHeight: 1.85, margin: '0 0 16px' }}>宁德时代供应链计划的一道题：候选人对账、问 AI、交卷，报告把他的高光和风险一条条指出来。两分半，一镜到底。</p>
          <Link href="/work/T712yYY1swI" style={{ ...btnGhost, textDecoration: 'none', height: 46, display: 'inline-flex', alignItems: 'center' }}>自己进去做一遍 →</Link>
        </div>
        <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #ebe7de', boxShadow: '0 24px 60px rgba(20,24,60,.14)', background: '#000' }}>
          <video controls playsInline preload="none" poster={DEMO_POSTER} style={{ display: 'block', width: '100%', aspectRatio: '16 / 9' }}>
            <source src={DEMO_VIDEO} type="video/mp4" />
            <track kind="subtitles" srcLang="zh" label="中文" src={DEMO_VTT} default />
          </video>
        </div>
      </section>

      {/* 两种做法 */}
      <section id="modes" style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 28px 8px' }}>
        <h2 style={h2}>两种做法，一样留痕</h2>
        <div style={{ color: '#4a4f66', marginBottom: 18 }}>候选人自己选：在我们的操作台上做，每个动作自动记录；或者用自己顺手的软件做，浏览器录屏 + 上传交付。评价用同一套。</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 18 }}>
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px 10px' }}><div style={{ fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700 }}>做法一 · 操作台记录</div><div style={{ fontWeight: 800, fontSize: 18, fontFamily: serif }}>四种操作台，按岗位自动选</div><div style={{ fontSize: 13.5, color: '#4a4f66', lineHeight: 1.7, marginTop: 4 }}>材料、编辑区、AI 都在页面里；打开材料、提问、采纳、粘贴、改稿、跑自测、画图，每一步自动记成事件流。</div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, padding: '0 14px 14px' }}>
              {ENVS.map(e => <div key={e.t} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #ebe7de', background: '#fff' }}><div style={{ aspectRatio: '16 / 9', overflow: 'hidden' }}><Img src={e.img} alt={e.t} style={{ objectFit: 'cover', objectPosition: 'top', height: '100%' }} /></div><div style={{ padding: '8px 10px' }}><div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.t}</div><div style={{ fontSize: 12, color: '#6b6f86', lineHeight: 1.5 }}>{e.d}</div></div></div>)}
            </div>
          </div>
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px 10px' }}><div style={{ fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700 }}>做法二 · 常用软件录屏</div><div style={{ fontWeight: 800, fontSize: 18, fontFamily: serif }}>Excel、CAD、IDE、任何 AI——用你顺手的</div><div style={{ fontSize: 13.5, color: '#4a4f66', lineHeight: 1.7, marginTop: 4 }}>材料下载走；浏览器直接录整个屏幕（不装任何东西）；做完上传交付文件 + 写交付说明。录屏抽帧让 AI 看：用了什么工具、怎么核验、怎么取舍。</div></div>
            <div style={{ padding: '0 14px 14px' }}><div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #ebe7de', background: '#fff' }}><Img src="/work/shot-open.png" alt="用自己的软件做：录屏 + 上传" /></div></div>
          </div>
        </div>
      </section>

      {/* 评分报告 */}
      <section id="report" style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 28px 8px' }}>
        <h2 style={h2}>评分报告：看结果，更看过程</h2>
        <div style={{ color: '#4a4f66', marginBottom: 18 }}>一份报告四个部分，每一部分都能回到证据。</div>
        <div style={{ display: 'grid', gap: 14 }}>
          {REPORT_PARTS.map((p, i) => <div key={p.t} style={{ ...card, padding: 0, overflow: 'hidden', display: 'grid', gridTemplateColumns: i % 2 ? 'minmax(260px, 1fr) 1.5fr' : '1.5fr minmax(260px, 1fr)', alignItems: 'center' }}>
            <div style={{ order: i % 2 ? 2 : 1, borderRight: i % 2 ? undefined : '1px solid #ebe7de', borderLeft: i % 2 ? '1px solid #ebe7de' : undefined, background: '#fff' }}><Img src={p.img} alt={p.t} /></div>
            <div style={{ order: i % 2 ? 1 : 2, padding: '20px 22px' }}><div style={{ fontSize: 12, letterSpacing: 2, color: '#6055f5', fontWeight: 700 }}>0{i + 1}</div><div style={{ fontWeight: 800, fontSize: 19, fontFamily: serif, margin: '4px 0 6px' }}>{p.t}</div><div style={{ fontSize: 14, color: '#4a4f66', lineHeight: 1.8 }}>{p.d}</div></div>
          </div>)}
        </div>
        <div style={{ ...card, marginTop: 18, padding: '22px 24px' }}>
          <div style={{ fontWeight: 800, fontSize: 19, fontFamily: serif, marginBottom: 4 }}>评价模型</div>
          <div style={{ fontSize: 13.5, color: '#4a4f66', marginBottom: 12 }}>结果按有依赖关系的标准逐条核对；过程从事件流（或录屏抽帧）里找时刻、归到六维；再和 AI 基线用同一套标准比。三路合成招聘信号，措辞只写「观察到」。</div>
          <ModelChart />
        </div>
      </section>

      {/* 数据底座 */}
      <section id="infra" style={{ maxWidth: 1180, margin: '0 auto', padding: '56px 28px 8px' }}>
        <h2 style={h2}>题从平方数据基础设施里长出来</h2>
        <div style={{ color: '#4a4f66', marginBottom: 18, maxWidth: 820, lineHeight: 1.8 }}>不是题库，不是模拟。行业的标准与规范、企业的画像与动态、职业的典型任务与图谱——三层数据和知识互相链接，生成器在这上面出题。给个企业名，出的是这家企业此刻的真活，每条标准都能指回出处。</div>
        <div style={{ ...card, padding: '22px 24px' }}><InfraChart /></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 14 }}>
          {[['10,000+', '企业画像', '12 个维度 + 产品 / 动态 / 高管 / 舆情子实体'], ['20,000+', '在招岗位', '按城市拆分、职责要求结构化'], ['630+', '职业画像', '典型任务 · 工位 · 工具 · 发展图谱'], ['标准与规程', '行业规范库', '条款级可引用，rubric 的依据']].map(([n, l, d]) => <div key={l} style={{ background: '#fffdf9', border: '1px solid #ebe7de', borderRadius: 14, padding: '14px 16px' }}><div style={{ fontSize: 24, fontWeight: 800, background: 'linear-gradient(90deg,#6055f5,#12b5cb)', WebkitBackgroundClip: 'text', color: 'transparent' }}>{n}</div><div style={{ fontSize: 14, fontWeight: 700 }}>{l}</div><div style={{ fontSize: 12.5, color: '#6b6f86', lineHeight: 1.6 }}>{d}</div></div>)}
        </div>
      </section>

      {/* 入口 */}
      <section id="create" style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 28px 72px' }}>
        <div style={{ borderRadius: 20, padding: '34px 32px', background: 'linear-gradient(135deg,#6055f5,#12b5cb)', color: '#fff', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, alignItems: 'center' }}>
          <div>
            <h2 style={{ ...h2, color: '#fff', marginBottom: 8 }}>出一道真活</h2>
            <div style={{ color: 'rgba(255,255,255,.9)', lineHeight: 1.8 }}>填企业和岗位，两三分钟出题。每道真活有自己的空间：管理、分享、看做题情况、看评分报告。出题要登录，做题的人不用。</div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Link href="/work/mine" style={{ ...btn, background: '#fff', color: '#6055f5', textDecoration: 'none', height: 52, display: 'inline-flex', alignItems: 'center', padding: '0 28px' }}>进入我的真活 →</Link>
            <Link href="/work/T712yYY1swI" style={{ ...btnGhost, borderColor: 'rgba(255,255,255,.6)', background: 'transparent', color: '#fff', textDecoration: 'none', height: 52, display: 'inline-flex', alignItems: 'center' }}>先试一道示范题</Link>
          </div>
        </div>
      </section>
      <div style={{ textAlign: 'center', fontSize: 12, color: '#8a8fa8', padding: '0 28px 36px' }}>百业AI｜真活 · 平方智能 · 和 AI 百业（aisimjob.com）同源：真活看他会不会，百业带他学会</div>
    </div>
  );
}

const serif = '"Noto Serif SC", "Songti SC", "STSong", serif';
const lnk: React.CSSProperties = { color: '#3b405a', textDecoration: 'none' };
const h2: React.CSSProperties = { fontSize: 30, margin: '0 0 14px', fontWeight: 700, fontFamily: serif, letterSpacing: '.01em' };
const card: React.CSSProperties = { background: '#fffdf9', border: '1px solid #ebe7de', borderRadius: 18, padding: '18px 20px' };
const btn: React.CSSProperties = { padding: '12px 24px', borderRadius: 999, border: 0, background: 'linear-gradient(135deg,#6055f5,#12b5cb)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15 };
const btnGhost: React.CSSProperties = { padding: '10px 18px', borderRadius: 999, border: '1px solid #d9dbe6', background: '#fff', color: '#1a1a2e', cursor: 'pointer', fontSize: 14 };
