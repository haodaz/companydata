'use client';

/**
 * 百业AI｜真活 · 公开首页（浅色互联网风，照 /lab 首页的宣传效果：标题直说、真实界面当图）。
 * 出题 / 管理 / 分享 / 看考评在独立页 /work/mine，每道真活有自己的空间 /work/<token>/owner；这里只讲价值 + 入口。
 * 截图由 scripts/video/shot.mjs 截到 public/work/。
 */
import React from 'react';
import Link from 'next/link';

/** 首屏右侧：工位场景走马灯（百业工作场所库的图，不放火箭） */
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
const DEMO_VIDEO = `${MEDIA}/work-demo-720.mp4`, DEMO_POSTER = `${MEDIA}/work-demo-poster.jpg`, DEMO_VTT = '/work/work-demo.vtt';   // 字幕轨要同源，放本地
const I = (d: string) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const STEPS = [
  { t: '出题', d: '填企业和岗位，两三分钟出一道真活：任务书、材料包、逐条标准，AI 先做一遍。', icon: I('M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M14 4v6h6 M8 14h8 M8 18h5') },
  { t: '分享', d: '参与链接发给候选人或团队，留个名字就能做。', icon: I('M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1') },
  { t: '候选人做真活', d: '看材料、用 AI、交付成果，每一步都留痕。', icon: I('M3 5h18v11H3z M2 20h20 M9 9l3 3 4-4') },
  { t: '看考评', d: '结果逐条有证据，过程有高光和风险时刻，还和 AI 基线比。', icon: I('M4 20V10 M10 20V4 M16 20v-7 M22 20H2') },
];
const ENVS = [
  { t: '文档 / 对账台', d: '方案、邮件、scorecard、口径对账。材料包里故意留坑：数据不全、口径不一致、过期。', img: '/work/shot-doc.png', eg: '复宏汉霖 · 市场经理 · 海外合作伙伴对外一页纸' },
  { t: '代码台', d: '写函数、写脚本；自测用例直接在浏览器里跑，跑了几次、过了几个都记着。', img: '/work/shot-code.png', eg: '宁德时代 · 嵌入式软件 · 单体电压采样保护判定' },
  { t: '表格 / 数据台', d: '起始表直接改、实时预览；单位混用、新旧版本重复这种坑，看他清不清得出来。', img: '/work/shot-sheet.png', eg: '宁德时代 · 供应链计划 · 德布勒森爬坡期欧洲供需平衡' },
  { t: '设计台', d: '参数表 + 草图 + 设计说明：定值要有依据，画轮廓、标尺寸、写校核。', img: '/work/shot-design.png', eg: '宁德时代 · 结构设计 · 授权线电池包吊梁' },
];
const REPORT_POINTS = [
  ['结果逐条，引用原句当证据', '每条标准给 BARS 等级和分数，证据是交付物里的原话；没做到就写「未见」，不脑补。'],
  ['标准之间有依赖', '假设没立住，后面的估算自动封顶，并写明被哪一条卡住——像老手看活，不像卷子打勾。'],
  ['过程回放：高光与风险时刻', '打开了哪些材料、问了 AI 什么、采纳时核没核、哪段是整段粘贴——都指向具体的分秒和事件。'],
  ['和 AI 基线逐条比', '最强模型先做一遍，同一套标准评。大部分人做不过 AI，差距在哪一条，就练哪一条。'],
  ['六维人机协作，只写观察', '问题界定、信息核验、AI 协作、判断取舍、交付表达、风险意识——写「观察到」，不下定性。'],
  ['标准有出处', '每条标准指回行业条款、企业事实或岗位职责；没有依据的写明「待业务负责人确认」。'],
];

function SceneBackdrop({ onIndex }: { onIndex?: (i: number) => void }) {
  const [i, setI] = React.useState(0);
  React.useEffect(() => { const t = setInterval(() => setI(x => (x + 1) % SCENES.length), 4200); return () => clearInterval(t); }, []);
  React.useEffect(() => { onIndex?.(i); }, [i, onIndex]);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#141729' }}>
      {SCENES.map((sc, k) => <img key={sc.src} src={sc.src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: k === i ? 1 : 0, transition: 'opacity 1.6s ease, transform 7s linear', transform: k === i ? 'scale(1.07)' : 'scale(1.0)' }} />)}
      {/* 左暗右亮：字压在左边，场景在右边透出来 */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(12,14,30,.88) 0%, rgba(12,14,30,.72) 42%, rgba(12,14,30,.28) 75%, rgba(12,14,30,.15) 100%), linear-gradient(0deg, rgba(12,14,30,.75) 0%, rgba(12,14,30,0) 35%)' }} />
    </div>
  );
}

const Img = ({ src, alt, style }: { src: string; alt: string; style?: React.CSSProperties }) => <img src={src} alt={alt} style={{ display: 'block', width: '100%', ...style }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />;

export default function WorkLanding() {
  const [sceneIdx, setSceneIdx] = React.useState(0);
  return (
    <div style={{ minHeight: '100vh', background: '#f8f6f1', color: '#1a1a2e', fontFamily: 'var(--font-geist-sans), -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif' }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@600;700;900&display=swap" />
      {/* 顶栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 28px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ fontWeight: 800, letterSpacing: 1 }}>百业AI<span style={{ color: '#6055f5' }}>｜</span>真活</div>
        <span style={{ color: '#888', fontSize: 13 }}>平方智能</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 13, alignItems: 'center' }}>
          <a href="#watch" style={lnk}>看片</a><a href="#how" style={lnk}>怎么用</a><a href="#envs" style={lnk}>操作台</a><a href="#report" style={lnk}>报告</a>
          <Link href="/work/mine" style={{ ...lnk, color: '#fff', background: '#6055f5', padding: '7px 16px', borderRadius: 999 }}>出一道真活</Link>
        </div>
      </div>

      {/* 首屏：整幅工位场景当环境（照 NeoWork 的整幅首屏），字压在左边 */}
      <section style={{ position: 'relative', minHeight: 'calc(100svh - 64px)', display: 'flex', alignItems: 'center', color: '#fff' }}>
        <SceneBackdrop onIndex={setSceneIdx} />
        <div style={{ position: 'relative', width: '100%', maxWidth: 1180, margin: '0 auto', padding: '72px 28px' }}>
          <div style={{ fontSize: 12, letterSpacing: 4, color: '#b3adff', fontWeight: 700 }}>百业AI｜真活 · REAL WORK, REAL TALENT</div>
          <h1 style={{ fontSize: 'clamp(46px, 6vw, 84px)', lineHeight: 1.16, margin: '14px 0 18px', fontWeight: 700, letterSpacing: '.01em', fontFamily: serif, textShadow: '0 4px 30px rgba(0,0,0,.45)' }}>寻找真人才，<br /><span style={{ background: 'linear-gradient(90deg,#b3adff,#5fe3d2)', WebkitBackgroundClip: 'text', color: 'transparent' }}>看他干真活</span></h1>
          <p style={{ fontSize: 'clamp(15px, 1.5vw, 18px)', color: 'rgba(255,255,255,.86)', lineHeight: 1.85, maxWidth: 560, margin: '0 0 22px', textShadow: '0 1px 10px rgba(0,0,0,.5)' }}>给一家企业、一个岗位，生成此刻真实的业务题；候选人在操作台上做，我们记录过程、逐条评价，并和 AI 基线对照。</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px 18px', marginBottom: 28, maxWidth: 440 }}>
            {['生成真实问题', '智能评价考核', '记录过程评估', 'AI 基线对照'].map(c => (
              <div key={c} style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 15, color: 'rgba(255,255,255,.9)', fontWeight: 600 }}><span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: 'linear-gradient(120deg,#6055f5,#12b5cb)', color: '#fff', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>{c}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/work/mine" style={{ ...btn, textDecoration: 'none', height: 54, display: 'inline-flex', alignItems: 'center', padding: '0 30px' }}>出一道真活 →</Link>
            <Link href="/work/T712yYY1swI" style={{ ...btnGhost, background: 'rgba(255,255,255,.12)', color: '#fff', borderColor: 'rgba(255,255,255,.45)', backdropFilter: 'blur(6px)', textDecoration: 'none', height: 54, display: 'inline-flex', alignItems: 'center' }}>先试一道示范题</Link>
          </div>
          <div style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,.6)' }}>登录后出题 · 做题的人不用登录 · 出题约 2–3 分钟</div>
        </div>
        <div style={{ position: 'absolute', right: 28, bottom: 22, display: 'flex', alignItems: 'center', gap: 12, color: '#fff' }}>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, letterSpacing: 3, opacity: .7 }}>真活发生的地方</div><div style={{ fontSize: 15, fontWeight: 700, textShadow: '0 1px 8px rgba(0,0,0,.6)' }}>{SCENES[sceneIdx].cap}</div></div>
          <div style={{ display: 'flex', gap: 5 }}>{SCENES.map((_, k) => <span key={k} style={{ width: k === sceneIdx ? 18 : 6, height: 6, borderRadius: 3, background: k === sceneIdx ? '#fff' : 'rgba(255,255,255,.45)', transition: 'width .3s' }} />)}</div>
        </div>
      </section>

      {/* 同样的结果，不同的信号（照 NeoWork 的叙事，但用我们报告里真实出现过的证据） */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 28px 8px' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}><div style={{ fontSize: 12, letterSpacing: 3, color: '#6055f5', fontWeight: 700 }}>WHY · 为什么看过程</div><h2 style={{ ...h2, fontSize: 34 }}>同样的交付物，不同的招聘信号</h2><div style={{ color: '#4a4f66' }}>两个人都交了一张对好账的表，分数一样。差别在怎么做出来的。</div></div>
        <div style={{ background: '#15172a', borderRadius: 22, padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, color: '#e9eaf2' }}>
          {[
            { who: '候选人 A', score: 71, signal: '弱', color: '#ff6b6b', ev: ['00:12 把任务书整段贴给 AI，第一版答案原样放进交付物', '只打开了 1 / 5 份材料；没问过「单包电量是多少」', '20 秒内出现 883 字整段输入，之后无改动'] },
            { who: '候选人 B', score: 71, signal: '强', color: '#3ddc97', ev: ['01:12 问 AI 三种单位怎么换算，追问「材料里有没有给单包电量」', '打开 m2、m5 核了口径，再改表；旧版本行标注作废原因', '对 AI 的 pack 换算建议没直接采纳，自己设了假设并写明影响'] },
          ].map(c => <div key={c.who} style={{ background: '#1f2238', borderRadius: 16, padding: '18px 20px', border: '1px solid rgba(255,255,255,.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><div style={{ fontSize: 18, fontWeight: 700, fontFamily: serif }}>{c.who}</div><div style={{ fontSize: 13, opacity: .8 }}>结果分 <b style={{ fontSize: 20 }}>{c.score}</b></div></div>
            <div style={{ margin: '12px 0 8px', fontSize: 13 }}>过程信号 <span style={{ padding: '2px 10px', borderRadius: 999, background: c.color, color: '#0b1020', fontWeight: 800 }}>{c.signal}</span></div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.8, color: 'rgba(255,255,255,.82)' }}>{c.ev.map(e => <li key={e}>{e}</li>)}</ul>
          </div>)}
        </div>
      </section>

      {/* 看片：两分半走一遍真活 */}
      <section id="watch" style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 28px 8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 28, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 3, color: '#6055f5', fontWeight: 700 }}>WATCH · 2.5 MIN</div>
          <h2 style={{ ...h2, margin: '8px 0 10px' }}>两分半，走一遍真活</h2>
          <p style={{ color: '#4a4f66', lineHeight: 1.85, margin: '0 0 16px' }}>从出题到候选人在操作台上做，到评分报告里的高光与风险时刻——四种操作台都在里面。</p>
          <Link href="/work/T712yYY1swI" style={{ ...btnGhost, textDecoration: 'none', height: 46, display: 'inline-flex', alignItems: 'center' }}>自己进去试试 →</Link>
        </div>
        <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #e8e9f0', boxShadow: '0 24px 60px rgba(20,24,60,.14)', background: '#000' }}>
          <video controls playsInline preload="none" poster={DEMO_POSTER} style={{ display: 'block', width: '100%', aspectRatio: '16 / 9' }}>
            <source src={DEMO_VIDEO} type="video/mp4" />
            <track kind="subtitles" srcLang="zh" label="中文" src={DEMO_VTT} default />
          </video>
        </div>
      </section>

      {/* 怎么用：一道真活 = 招聘里的一个小项目 */}
      <section id="how" style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 28px 8px' }}>
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

      {/* 四种操作台：各落一张界面 */}
      <section id="envs" style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 28px 8px' }}>
        <h2 style={h2}>四种操作台，按岗位自动选</h2>
        <div style={{ color: '#4a4f66', marginBottom: 18 }}>做什么活，就在什么台子上做。</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 18 }}>
          {ENVS.map(e => <div key={e.t} style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ borderBottom: '1px solid #e8e9f0', background: '#fff', aspectRatio: '16 / 9', overflow: 'hidden' }}><Img src={e.img} alt={e.t} style={{ objectFit: 'cover', objectPosition: 'top', height: '100%' }} /></div>
            <div style={{ padding: '14px 18px 16px' }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{e.t}</div>
              <div style={{ fontSize: 14, color: '#4a4f66', lineHeight: 1.75, margin: '4px 0 6px' }}>{e.d}</div>
              <div style={{ fontSize: 12.5, color: '#8a8fa8' }}>示范题 · {e.eg}</div>
            </div>
          </div>)}
        </div>
      </section>

      {/* 报告：能分析什么、专业在哪 */}
      <section id="report" style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 28px 8px' }}>
        <h2 style={h2}>评分报告：看结果，更看过程</h2>
        <div style={{ color: '#4a4f66', marginBottom: 18 }}>结果人人能用 AI 生成，只有过程说明是谁在做。报告两边一起看，证据都在。</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24, alignItems: 'start' }}>
          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #e8e9f0', boxShadow: '0 24px 60px rgba(20,24,60,.14)', background: '#fff' }}>
            <Img src="/work/shot-report.png" alt="真活评分报告" />
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {REPORT_POINTS.map(([t, d]) => <div key={t} style={{ ...card, padding: '14px 16px' }}><div style={{ fontWeight: 700, marginBottom: 3 }}>{t}</div><div style={{ fontSize: 13.5, color: '#4a4f66', lineHeight: 1.7 }}>{d}</div></div>)}
          </div>
        </div>
      </section>

      {/* 题从数据里长出来 */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 28px 8px' }}>
        <div style={{ ...card, padding: '26px 28px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, alignItems: 'center' }}>
          <div>
            <h2 style={{ ...h2, marginBottom: 8 }}>题从数据里长出来</h2>
            <div style={{ color: '#4a4f66', lineHeight: 1.8 }}>一万多家企业画像、两万多个岗位、六百多条职业画像、行业标准与规程做底。给个企业名，出的是这家企业此刻的真活——近期动态、产品、在招岗位、典型任务、规范条款，都进了题。材料里没有的数字，题里会写明「示例数据」。</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {[['10,000+', '企业画像'], ['20,000+', '在招岗位'], ['630+', '职业画像'], ['行业规范', '标准与操作规程']].map(([n, l]) => <div key={l} style={{ background: '#fff', border: '1px solid #e8e9f0', borderRadius: 12, padding: '14px 16px' }}><div style={{ fontSize: 24, fontWeight: 800, background: 'linear-gradient(90deg,#6055f5,#12b5cb)', WebkitBackgroundClip: 'text', color: 'transparent' }}>{n}</div><div style={{ fontSize: 13, color: '#6b6f86' }}>{l}</div></div>)}
          </div>
        </div>
      </section>

      {/* 入口 */}
      <section id="create" style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 28px 72px' }}>
        <div style={{ borderRadius: 18, padding: '32px 30px', background: 'linear-gradient(135deg,#6055f5,#12b5cb)', color: '#fff', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, alignItems: 'center' }}>
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

const lnk: React.CSSProperties = { color: '#4a4f66', textDecoration: 'none' };
const serif = '"Noto Serif SC", "Songti SC", "STSong", serif';
const h2: React.CSSProperties = { fontSize: 30, margin: '0 0 14px', fontWeight: 700, fontFamily: serif, letterSpacing: '.01em' };
const card: React.CSSProperties = { background: '#fffdf9', border: '1px solid #ebe7de', borderRadius: 18, padding: '18px 20px' };
const btn: React.CSSProperties = { padding: '12px 24px', borderRadius: 999, border: 0, background: 'linear-gradient(135deg,#6055f5,#12b5cb)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15 };
const btnGhost: React.CSSProperties = { padding: '10px 18px', borderRadius: 999, border: '1px solid #d9dbe6', background: '#fff', color: '#1a1a2e', cursor: 'pointer', fontSize: 14 };
