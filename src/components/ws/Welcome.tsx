/**
 * 百业 AI 企业版（ToB）/ 科研版（ToS）登录前的介绍页（2026-10-20，参照 yida-company /welcome 的结构，样子和工作台一致：纸张底色、衬线标题、真实截图）。
 * 没登录的人打开 /workspace、/research 会先到这里（proxy）。文案直说，不自问自答，不放没核实的数字。
 */
import React from 'react';
import Link from 'next/link';

type Edition = 'company' | 'research';
type Sec = { k: string; h: string; p: string; bullets?: string[]; img?: string; alt?: string };

const C: Record<Edition, { name: string; other: { name: string; href: string }; kicker: string; h1: string[]; lead: string; hero: string; heroAlt: string; strip: [string, string][]; flowTitle: string; flow: [string, string][]; secs: Sec[]; rules: [string, string][]; cta: string }> = {
  company: {
    name: '企业版', other: { name: '科研版', href: '/research/welcome' },
    kicker: '百业 AI 企业版 · 给招人的人', h1: ['一次招人，', '就是一个项目'],
    lead: '说一句要招什么人。AI 先读懂你们企业，再写 JD、出真活、筛简历、核实履历，关键处停下来问你。老板、HR、带团队的人都能直接用。',
    hero: '/ws-welcome/b-home.png', heroAlt: '百业 AI 企业版工作台首页',
    strip: [['平方数据打底', '企业画像、岗位库、职业库、行业规范'], ['真活', '用你们此刻真实的业务问题出题'], ['人才检测', '智查查 2.0 逐条核对履历'], ['模型你选', 'Claude、GPT、Gemini、通义千问']],
    flowTitle: '一个项目，从岗位一直管到入职',
    flow: [['定岗位，写 JD', '用企业画像和你说的眼下难处写，写完你确认'], ['收候选人', '上传简历；做了真活的人自动进来'], ['适配分析', '逐条对照硬性要求，给理由、风险和面试追问'], ['真活', '看他怎么干活，不只看简历写了什么'], ['人才检测', '学历、经历、成果逐条核对'], ['面试与 offer', '阶段一目了然，推进前 AI 先问你'], ['入职带教', '给岗位建职业空间，新人上手练']],
    secs: [
      { k: '先懂你们', h: '先懂你们，再干活', p: '新企业注册后，AI 先去平方数据库和公开资料里找你们，一条一条问「是这样吗」。右边的企业档案跟着聊天长出来，每一项都写着它让 AI 能做什么。', bullets: ['平方企业库里没有你们，就当场新建，AI 联网补画像', '公开信息确认后回流平方；内部信息只留在你自己的工作台', '岗位从平方岗位库里选，或贴一份新 JD'], img: '/ws-welcome/b-setup.png', alt: '企业设置：平方数据里的公开画像和只给自己 AI 看的内部信息' },
      { k: '真活', h: '看他怎么干，不只看简历', p: 'AI 从企业动态、岗位职责、职业典型任务和行业规范里找出几个此刻真实的业务问题，你选一个，它出成任务书、材料包和逐条评分标准，再先自己做一遍当基线。候选人用操作台做，或者用自己的软件录屏做。', bullets: ['材料里有坑，看他能不能发现', '评分标准条目之间有依赖，前面没做到后面封顶', '交卷后 AI 分段回看过程，再出报告'], img: '/ws-welcome/b-chat.png', alt: '在对话里出真活：选业务问题、出题、跑 AI 基线' },
      { k: '人才检测', h: '简历上写的，逐条核一遍', p: '值得进面试的人，交给智查查 2.0：学历、任职、论文专利逐条找证据，说清哪些对上了、哪些对不上、哪些要人工确认，再做一次能力扫描。结果回到候选人卡片上。', img: '/ws-welcome/b-project.png', alt: '招聘项目：候选人列表与人才检测结果' },
    ],
    rules: [['只围绕本企业', '工作台只生成和你们自己企业有关的内容'], ['关键处停下来问你', '选哪个问题、发不发给候选人、推不推进，你拍板'], ['不编造', '企业事实只来自数据和你说的；查不到就说查不到'], ['人在环里', 'AI 干活，人做判断；每一步都看得见']],
    cta: '登录，开始第一个招聘项目',
  },
  research: {
    name: '科研版', other: { name: '企业版', href: '/workspace/welcome' },
    kicker: '百业 AI 科研版 · 给高校院系、研究院、实验室', h1: ['引进一位研究人员，', '就是一个项目'],
    lead: '说一句要招什么方向的博士后、研究员或教授。AI 读懂你们的研究方向和在研项目，写招聘启事、出研究真活、做学术验真，关键处停下来问你。',
    hero: '/ws-welcome/s-home.png', heroAlt: '百业 AI 科研版工作台首页',
    strip: [['研究真活', '用课题组此刻卡住的研究问题出题'], ['学术验真', '学历、论文、专利、项目逐条核对'], ['学科与研究岗空间', '给学生体验学科、给新人进组带教'], ['模型你选', 'Claude、GPT、Gemini、通义千问']],
    flowTitle: '一个项目，从招聘启事一直管到进组',
    flow: [['写招聘启事', '研究方向、职责、申请条件、支持条件、考核'], ['收候选人', '上传简历；做了研究真活的人自动进来'], ['引进评审', '方向是否对口、成果层次、研究技能有没有证据'], ['研究真活', '看真实的研究功夫，不只看论文列表'], ['学术验真', '逐条核对学历和学术成果'], ['面谈与聘用', '阶段一目了然，推进前 AI 先问你'], ['进组带教', '用本课题组的研究岗空间带新人']],
    secs: [
      { k: '研究真活', h: '看真实的研究功夫', p: 'AI 从你们的研究方向、在研项目、平台设备和岗位要求里，找出几个课题组此刻真正卡住的研究问题，每个配一种考法。你选一个，它出成任务书、材料包和逐条评分标准，再先自己做一遍当基线。', bullets: ['实验设计、数据分析、文献与选题、审稿、写基金本子、复现', '评分看科学严谨：可证伪的假设、对照、统计、伪影、局限、安全规范', '材料里埋了坑，比如学生的结论和数据对不上'], img: '/ws-welcome/s-rubric.png', alt: '研究真活的评分标准：从竞争假设到对照设计、取样矩阵' },
      { k: '机构档案', h: '先懂你们的研究，再干活', p: 'AI 边聊边问，把机构的研究方向、在研项目与基金、平台设备、课题组、要引进的层次和考核方式记下来。公开信息回流平方；内部信息只留在你自己的工作台，出题和评审都会用到。', img: '/ws-welcome/s-setup.png', alt: '机构设置：研究方向、平台与成果、内部信息' },
      { k: '学科与研究岗空间', h: '学科体验，和进组前的第一个月', p: '在百业里，一个学科或研究领域可以生成一间能走进去的空间：读文献、做实验或计算、处理有异常的数据、组会汇报。课题组也能给具体的研究岗建空间，章节贴着本组的项目、平台和导师要求，给新进的博士生、博后带教。', img: '/ws-welcome/s-discipline.png', alt: '材料科学与工程学科空间：新材料科研员' },
    ],
    rules: [['只围绕本机构', '工作台只生成和你们自己机构有关的内容'], ['关键处停下来问你', '选哪个研究问题、发不发给候选人、推不推进，你拍板'], ['成果以验真为准', '学术成果真伪交给智查查逐条核对，不凭印象'], ['人在环里', 'AI 干活，人做判断；每一步都看得见']],
    cta: '登录，开始第一个引进项目',
  },
};

export function Welcome({ edition }: { edition: Edition }) {
  const c = C[edition];
  const login = `/lab/login?next=${edition === 'research' ? '/research' : '/workspace'}`;
  return (
    <div className="wl">
      <header className="wl-top"><div className="wl-in wl-bar">
        <span className="wl-brand"><span className="wl-mark">百</span>百业 AI <span className="wl-muted">{c.name}</span></span>
        <nav className="wl-nav"><a href="#flow">怎么用</a>{c.secs.map(s => <a key={s.k} href={`#${s.k}`}>{s.k}</a>)}<Link href={c.other.href}>{c.other.name} ↗</Link></nav>
        <Link href={login} className="wl-btn">登录</Link>
      </div></header>

      <section className="wl-in wl-hero">
        <div className="wl-kicker">{c.kicker}</div>
        <h1 className="wl-h1">{c.h1[0]}<br /><span className="wl-accent">{c.h1[1]}</span></h1>
        <p className="wl-lead">{c.lead}</p>
        <div className="wl-ctas"><Link href={login} className="wl-btn lg">{c.cta} →</Link><a href="#flow" className="wl-ghost lg">看看怎么用</a></div>
        <Shot src={c.hero} alt={c.heroAlt} big />
      </section>

      <section className="wl-in"><div className="wl-strip">{c.strip.map(([t, d]) => <div key={t}><b>{t}</b><span>{d}</span></div>)}</div></section>

      <section id="flow" className="wl-in wl-sec">
        <div className="wl-kicker">怎么用</div>
        <h2 className="wl-h2">{c.flowTitle}</h2>
        <p className="wl-p">每一次招人都是左边栏里的一个项目。你在项目里说一句，AI 接着推进；它调用了什么、做到哪一步，对话里都看得见，产物在右边打开。</p>
        <ol className="wl-flow">{c.flow.map(([t, d], i) => <li key={t}><span className="wl-n">{String(i + 1).padStart(2, '0')}</span><b>{t}</b><span>{d}</span></li>)}</ol>
      </section>

      {c.secs.map((s, i) => (
        <section key={s.k} id={s.k} className={`wl-in wl-sec wl-split${i % 2 ? ' rev' : ''}`}>
          <div className="wl-text">
            <div className="wl-kicker">{s.k}</div>
            <h2 className="wl-h2">{s.h}</h2>
            <p className="wl-p">{s.p}</p>
            {s.bullets && <ul className="wl-ul">{s.bullets.map(b => <li key={b}>{b}</li>)}</ul>}
          </div>
          {s.img && <Shot src={s.img} alt={s.alt || s.h} />}
        </section>
      ))}

      <section className="wl-in wl-sec">
        <div className="wl-kicker">原则</div>
        <h2 className="wl-h2">AI 干活，你做判断</h2>
        <div className="wl-rules">{c.rules.map(([t, d]) => <div key={t}><b>{t}</b><span>{d}</span></div>)}</div>
      </section>

      <section className="wl-in wl-end">
        <h2 className="wl-h2" style={{ margin: 0 }}>{c.h1[0]}{c.h1[1]}</h2>
        <p className="wl-p" style={{ margin: '10px auto 22px', maxWidth: 560 }}>{c.lead}</p>
        <Link href={login} className="wl-btn lg">{c.cta} →</Link>
        <div className="wl-foot">平方智能 · 百业 AI {c.name} · <Link href={c.other.href}>也看看{c.other.name}</Link></div>
      </section>
      <style>{CSS}</style>
    </div>
  );
}

function Shot({ src, alt, big }: { src: string; alt: string; big?: boolean }) {
  return <figure className={`wl-shot${big ? ' big' : ''}`}><div className="wl-dots"><i /><i /><i /></div>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={src} alt={alt} loading={big ? 'eager' : 'lazy'} /></figure>;
}

const CSS = `
/* 2026-10-28：和工作台一起换浅色（照一答 /v2：极光白 + 中性灰 + 主色实色按钮、无衬线标题），不再用牛皮纸 + 黑按钮 */
.wl { --paper:#f8f9fd; --card:#ffffff; --line:#e6e7ec; --line2:#eff0f3; --ink:#1d2030; --ink2:#4a4f63; --ink3:#7c8193; --accent:#6055f5; --accent-soft:#efedfe;
  min-height:100dvh; background:radial-gradient(1100px 680px at 88% -12%, rgba(150,180,255,.20), transparent 62%), radial-gradient(900px 620px at 8% 112%, rgba(186,168,255,.16), transparent 60%), linear-gradient(180deg, #f9fbff 0%, #f7f7fd 100%); background-attachment:fixed; color:var(--ink); font-family:'PingFang SC',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
.wl * { box-sizing:border-box; }
.wl a { color:inherit; }
.wl-in { width:min(1120px, calc(100% - 32px)); margin:0 auto; }
.wl-muted { color:var(--ink3); font-weight:400; }
.wl-top { position:sticky; top:0; z-index:10; background:rgba(255,255,255,.72); backdrop-filter:blur(12px); border-bottom:1px solid var(--line2); }
.wl-bar { display:flex; align-items:center; gap:20px; height:60px; }
.wl-brand { display:flex; align-items:center; gap:9px; font-weight:700; font-size:16px; white-space:nowrap; }
.wl-mark { width:28px; height:28px; border-radius:8px; background:var(--accent); color:#fff; display:grid; place-items:center; font-size:14px; font-weight:700; }
.wl-nav { display:flex; gap:20px; margin-left:auto; font-size:14px; color:var(--ink2); }
.wl-nav a { text-decoration:none; } .wl-nav a:hover { color:var(--ink); }
.wl-btn { display:inline-flex; align-items:center; height:36px; padding:0 16px; border-radius:10px; background:var(--accent); color:#fff !important; text-decoration:none; font-weight:600; font-size:14px; white-space:nowrap; }
.wl-btn.lg, .wl-ghost.lg { height:48px; padding:0 22px; font-size:15px; border-radius:12px; }
.wl-ghost { display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:10px; text-decoration:none; color:var(--ink); background:var(--card); }
.wl-hero { padding:72px 0 28px; text-align:center; }
.wl-kicker { font-size:12.5px; letter-spacing:.08em; color:var(--accent); font-weight:600; margin-bottom:10px; }
.wl-h1 { font-weight:800; font-size:clamp(38px, 6vw, 64px); line-height:1.15; letter-spacing:.01em; margin:0 0 18px; }
.wl-accent { color:var(--accent); }
.wl-lead { font-size:clamp(16px, 2vw, 18.5px); line-height:1.8; color:var(--ink2); max-width:720px; margin:0 auto 26px; }
.wl-ctas { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-bottom:44px; }
.wl-shot { margin:0; background:var(--card); border:1px solid var(--line); border-radius:14px; overflow:hidden; box-shadow:0 24px 60px rgba(40,44,90,.10), 0 2px 8px rgba(40,44,90,.05); }
.wl-shot img { display:block; width:100%; height:auto; }
.wl-dots { display:flex; gap:6px; padding:9px 12px; border-bottom:1px solid var(--line2); background:#f6f7fb; } .wl-dots i { width:9px; height:9px; border-radius:50%; background:#dcdeea; }
.wl-strip { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:10px; margin:22px 0 10px; }
.wl-strip > div { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:4px; }
.wl-strip b { font-size:15px; } .wl-strip span { font-size:13px; color:var(--ink3); line-height:1.55; }
.wl-sec { padding:72px 0 8px; }
.wl-h2 { font-weight:800; font-size:clamp(28px, 3.6vw, 38px); line-height:1.3; margin:0 0 14px; }
.wl-p { font-size:16px; line-height:1.85; color:var(--ink2); margin:0 0 14px; max-width:720px; }
.wl-flow { list-style:none; padding:0; margin:26px 0 0; display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:10px; }
.wl-flow li { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px; display:flex; flex-direction:column; gap:5px; }
.wl-flow b { font-size:15px; } .wl-flow span { font-size:13px; color:var(--ink3); line-height:1.55; }
.wl-flow .wl-n { font-family:ui-monospace,Menlo,monospace; color:var(--accent); font-size:12px; font-weight:700; }
.wl-split { display:grid; grid-template-columns:minmax(0, .9fr) minmax(0, 1.25fr); gap:44px; align-items:center; }
.wl-split.rev .wl-text { order:2; }
.wl-ul { margin:4px 0 0; padding-left:20px; color:var(--ink2); line-height:1.9; font-size:15px; list-style:disc; }
.wl-ul li::marker { color:var(--accent); }
.wl-rules { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:10px; margin-top:22px; }
.wl-rules > div { border-top:2px solid var(--accent); padding:14px 2px 0; display:flex; flex-direction:column; gap:6px; }
.wl-rules b { font-size:16px; } .wl-rules span { font-size:13.5px; color:var(--ink2); line-height:1.65; }
.wl-end { text-align:center; padding:96px 0 48px; }
.wl-foot { margin-top:56px; font-size:13px; color:var(--ink3); }
@media (max-width: 860px) {
  .wl-nav { display:none; } .wl-bar { gap:10px; } .wl-bar .wl-btn { margin-left:auto; }
  .wl-hero { padding-top:44px; } .wl-strip, .wl-rules { grid-template-columns:1fr 1fr; }
  .wl-split { grid-template-columns:1fr; gap:22px; } .wl-split.rev .wl-text { order:0; } .wl-sec { padding-top:52px; }
}
@media (max-width: 480px) { .wl-strip, .wl-rules { grid-template-columns:1fr; } .wl-ctas { flex-direction:column; align-items:stretch; } .wl-ctas > * { justify-content:center; text-align:center; } }
`;
