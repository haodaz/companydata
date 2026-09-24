import type { Metadata } from 'next';
import '@/styles/report.css';
import { ReportNav, ReportFoot } from '@/components/report/ReportShell';
import { WeaveTexture } from '@/components/report/Texture';
import { IllustrationBand } from '@/components/report/Illustration';
import { Reveal, CountUp, HeroStat, BarRow, Gauge, SectionHead, ActDivider } from '@/components/report/primitives';
import { PipelineFlow } from '@/components/report/PipelineFlow';
import { CaseCarousel } from '@/components/report/CaseCarousel';
import { Donut } from '@/components/report/Donut';
import { ShotGallery } from '@/components/report/ShotGallery';
import { GraphCanvas } from '@/components/report/GraphCanvas';
import { SpaceGrowth } from '@/components/report/SpaceGrowth';
import { Manifesto } from '@/components/report/Manifesto';
import { TrustEquation } from '@/components/report/TrustEquation';
import { R, COMPANIES, SOURCES, PIPE, SUBS, JOBS, COMPS, LAB, COSTS, SAMPLES, BATCHES, HQ, HQ_PER_COMPANY_USD, FIRST_PASS, PUBLIC_LIST, fmt, pct, cny, USD_CNY, fill, ENTITY_TOTAL, TOOL_CN, ROUND_CN, NEWS_CN, TYPE_CN, COMP_KIND_CN } from '@/lib/report/data';

export const metadata: Metadata = {
  title: '智能企业数据工厂 · 企业数据底座答卷 | 平方创想 VisionSquare',
  description: '一份完整答卷：平方创想如何把一整份高新技术企业名单变成可信任的企业数据底座、这些数据凭什么不一样、能产生什么业务价值、壁垒在哪里，以及它能长到多大。',
};

const SECTIONS = [
  { id: 'act-1', label: '一 · 怎么拿到' },
  { id: 'act-2', label: '二 · 有何不同' },
  { id: 'act-3', label: '三 · 业务价值' },
  { id: 'act-4', label: '四 · 壁垒' },
  { id: 'act-5', label: '五 · 规模与想象' },
];

export default function Report() {
  const entities = ENTITY_TOTAL();
  const profiled = COMPANIES.profiled as number;
  const total = COMPANIES.total as number;
  // 体检口径：存活率 = 能打开（含跳转）/ 已体检；「确认失效」只算 404 / 410；超时与连不上单列为「本次未能访问」，不判失效
  const health = { checked: SOURCES.checked as number, alive: SOURCES.alive as number, dead: SOURCES.dead as number, gone: (SOURCES.gone || 0) as number, blocked: (SOURCES.blocked || 0) as number, unreachable: (SOURCES.unreachable || 0) as number, rate: pct(SOURCES.alive, SOURCES.checked), rateConclusive: pct(SOURCES.alive, Math.max(1, SOURCES.checked - (SOURCES.unreachable || 0))) };
  const samples = SAMPLES.companies as any[];
  const henlius = samples.find(s => /复宏汉霖/.test(s.name)) || samples[0];
  const unisound = samples.find(s => /云知声/.test(s.name)) || samples[1];
  const qingflow = samples.find(s => /轻流/.test(s.name)) || samples[2];
  const firstPassRate = pct(FIRST_PASS.attempted - FIRST_PASS.failed, FIRST_PASS.attempted);
  const perCompanyCny = HQ_PER_COMPANY_USD * USD_CNY;
  const catCost: [string, number][] = (COSTS.byTool as any[]).map(t => [TOOL_CN[t.tool] || t.tool, t.usd as number]);
  const studentCoverage = pct(COMPANIES.withEvaluate, profiled);
  const rounds = Object.entries(SUBS.financings.byRound as Record<string, number>).slice(0, 8);
  const newsKinds = Object.entries(SUBS.news.byKind as Record<string, number>).slice(0, 8);
  const types = Object.entries(COMPANIES.byTypeCompleteness as Record<string, { n: number; avg: number }>).filter(([, v]) => v.n >= 10).sort((a, b) => b[1].avg - a[1].avg);
  const industries = (SAMPLES.topIndustries as [string, number][]).slice(0, 8);

  // ── 八个工位 ──
  const stages = [
    {
      step: '01', icon: '🔍', title: '定位官网',
      agent: { name: 'Jarvis', role: '寻源侦察员', avatar: '/report/factory/avatar_hugo.png' },
      desc: <>名单上只有一个公司名。工位一让带联网检索的模型去找<strong>官方域名</strong>，并明确拒绝天眼查、企查查、维基、领英这类第三方聚合站——只认企业自己的站和交易所披露。{fmt(HQ.companies)} 家企业里，{fmt(fill('official_website'))} 家找到了官网。</>,
      metric: fmt(fill('official_website')), metricLabel: '家找到官网',
    },
    {
      step: '02', icon: '🏷️', title: '分类与归属',
      agent: { name: 'Scout', role: '信源档案员', avatar: '/report/factory/avatar_scout.png' },
      desc: <>每条 URL 都要回答两个问题：它是哪一类页面（关于我们 / 投资者关系 / 新闻中心 / 管理团队 / 文化福利 / 产品中心 / 校招入口）、它属于哪家企业。三类入口沉淀成 <strong>{fmt(SOURCES.total)}</strong> 条信源，分布在 <strong>{fmt(SOURCES.hosts)}</strong> 个不同主机域名上，全部挂在企业实体名下。</>,
      metric: fmt(SOURCES.total), metricLabel: '条信源',
    },
    {
      step: '03', icon: '📄', title: '抓取原文',
      agent: { name: 'Kelly', role: '网页抓取工', avatar: '/report/factory/avatar_kelly.png' },
      desc: <>官方页面整页转成 Markdown 原文保留——不是只留摘要。平均每家企业抓下 <strong>{fmt(PIPE.avgMarkdownLen)}</strong> 字原文，本轮共处理 <strong>{fmt(PIPE.pagesFetched)}</strong> 个页面，其中 {pct(PIPE.pagesOk, PIPE.pagesFetched)}% 成功拿到正文；抓不到的页面会被记下来，而不是当作「没有」。</>,
      metric: fmt(PIPE.pagesFetched), metricLabel: '个页面',
    },
    {
      step: '04', icon: '🧬', title: '官方原文结构化',
      agent: { name: 'Dr. Thorne', role: '结构化分析师', avatar: '/report/factory/avatar_iris.png' },
      desc: <>先不联网，只从企业自己的页面里抽：<strong>{COMPANIES.fieldCount} 个画像字段</strong>（英文名、简介、行业、总部、规模、工商登记、产品范围……）加管理团队、产品线和公司动态。官网说了的，就以官网为准；官网没说的，留空给下一个工位。</>,
      metric: String(COMPANIES.fieldCount), metricLabel: '个画像字段',
    },
    {
      step: '05', icon: '🌐', title: '六路联网检索',
      agent: { name: 'Leo', role: '联网检索员', avatar: '/report/factory/avatar_radar.png' },
      desc: <>只补空字段。六个主题分别派工：基础与工商、融资历史、近期动态与舆情、管理团队、核心产品、行业与赛道——本轮共 <strong>{fmt(PIPE.steps.search)}</strong> 次检索工序。每个填上的字段都要交出它的来源 URL；找不到就是 null，<strong>不允许猜</strong>。</>,
      metric: fmt(PIPE.steps.search), metricLabel: '次检索工序',
    },
    {
      step: '06', icon: '🧩', title: '归并去重',
      agent: { name: 'Alice', role: '实体归并师', avatar: '/report/factory/avatar_alice.png' },
      desc: <>同一轮融资出现在三篇报道里、同一位高管在官网和年报里各有一个头衔、同一款产品官网和新闻叫法不同——都要收敛成一条。融资按「轮次 + 日期」、高管按姓名、产品按名称归并，信息更丰富的那条胜出。收敛后 <strong>{fmt(entities)}</strong> 条子实体。</>,
      metric: fmt(entities), metricLabel: '条子实体',
    },
    {
      step: '07', icon: '📊', title: 'AI 质检 · 完整度评分',
      agent: { name: 'Nova', role: 'AI 质检员', avatar: '/report/factory/avatar_edda.png' },
      desc: <>每家企业按核心字段 ×3、重要字段 ×2、普通字段 ×1 打完整度分，列出缺失项。名单进厂时平均只有 <strong>{PIPE.completenessBefore} 分</strong>（只有名字和工商码），出厂时平均 <strong>{PIPE.completenessAfter} 分</strong>。低分的会被挑回待补齐队列。</>,
      metric: `${PIPE.completenessBefore} → ${PIPE.completenessAfter}`, metricLabel: '平均完整度',
    },
    {
      step: '08', icon: '🔒', title: '人类总质检与锁定',
      agent: { name: '数据同事', role: '人类总质检', avatar: '/report/factory/avatar_david.png', human: true },
      desc: <><strong>产线的最后一道是人类总质检。</strong>AI 质检解决「有没有缺」，人解决「对不对、算不算数」：审核通过 / 不通过 / 隐藏的企业，AI 补全不再覆盖；人工编辑过的字段单独上锁，重跑自动跳过。企业与岗位、融资、高管、产品用的是<strong>同一套审核机制</strong>。</>,
      metric: '5', metricLabel: '种质检状态',
    },
  ];

  // ── 七类底数 ──
  const ASSETS = [
    {
      key: 'profile', tag: '画像底数', color: 'var(--rp-primary)',
      title: '一家公司到底是干什么的、多大、在哪、谁说了算',
      value: profiled, unit: '家企业的结构化画像',
      what: `每家按 ${COMPANIES.fieldCount} 个字段落库：一句话定位、业务档案、行业与细分、技术优势、研究方向、行业位置、增长信号、工商登记、总部与联系方式。其中 ${fmt(fill('tech_advantage'))} 家有技术优势描述、${fmt(fill('industry_position'))} 家有行业位置判断。`,
      use: ['按行业 / 技术方向 / 规模筛出一批「对口」的企业，而不是靠名字猜', '给园区 / 政府做区域产业结构地图', '院校做校企合作对象的初筛与画像'],
      detail: [['技术优势', fill('tech_advantage')], ['行业位置', fill('industry_position')], ['增长信号', fill('growth_signals')], ['公开舆情', fill('public_sentiment')], ['研究方向', fill('research_area')]] as [string, number][],
    },
    {
      key: 'product', tag: '产品底数', color: 'var(--rp-orange)',
      title: '不是「主营业务」四个字，是一条条产品线',
      value: SUBS.products.total, unit: '个核心产品 / 产品线',
      what: `覆盖 ${fmt(SUBS.products.companies)} 家企业，每个产品带品类、技术关键词、软硬件形态、在售 / 停产状态，${fmt(SUBS.products.flagship)} 个被标为拳头产品。来源优先级是官网产品中心 > 年报 > 旗舰店 > 新闻。`,
      use: ['技术方向对标：谁在做同一类产品', '学生投递前先知道这家公司「卖什么」', '产业链上下游梳理与招商图谱'],
    },
    {
      key: 'people', tag: '人的底数', color: '#0891b2',
      title: '不是「管理层经验丰富」，是分别是谁',
      value: SUBS.executives.total, unit: '位有名有姓的高管',
      what: `覆盖 ${fmt(SUBS.executives.companies)} 家企业，${pct(SUBS.executives.withTitle, SUBS.executives.total)}% 带职务，${fmt(SUBS.executives.founders)} 位被标为创始人，${fmt(SUBS.executives.withEducation)} 位带教育背景。董事长、CEO、CTO 同时回填到企业画像上。`,
      use: ['校友网络：哪些高管出自哪些学校', '产学研对接：找到真正拍板的人', '投资尽调：创始团队构成与履历'],
    },
    {
      key: 'capital', tag: '资本底数', color: '#8b5cf6',
      title: '融了几轮、多少钱、谁投的',
      value: SUBS.financings.total, unit: '轮融资记录',
      what: `覆盖 ${fmt(SUBS.financings.companies)} 家企业，${pct(SUBS.financings.withAmount, SUBS.financings.total)}% 带金额、${pct(SUBS.financings.withInvestor, SUBS.financings.total)}% 带投资方、${pct(SUBS.financings.withDate, SUBS.financings.total)}% 带日期；另有 ${fmt(COMPANIES.withStock)} 家带股票代码。轮次统一归一（种子 / 天使 / A / B / C……），可横向比较。`,
      use: ['判断一家公司的阶段与资金状况', '沿投资方找同一赛道的兄弟公司', '政府 / 园区看本地企业的资本活跃度'],
      detail: rounds.map(([k, v]) => [ROUND_CN[k] || k, v]) as [string, number][],
    },
    {
      key: 'news', tag: '动态与舆情底数', color: 'var(--rp-green)',
      title: '近 12 个月发生了什么，有没有坏消息',
      value: SUBS.news.total, unit: '条公司动态',
      what: `覆盖 ${fmt(SUBS.news.companies)} 家，按产品发布 / 奖项 / 合作 / 扩张 / 风险 / 人事 / 校招分类，${pct(SUBS.news.withDate, SUBS.news.total)}% 带日期、${pct(SUBS.news.withSource, SUBS.news.total)}% 带来源链接。舆情摘要只用可搜到的公开报道，裁员、处罚、诉讼单独列出——${fmt(SUBS.news.byKind.risk || 0)} 条被标为风险。`,
      use: ['投递前的一次「体检」：这家公司最近怎么样', '监测：季度重跑就能看到变化', '媒体 / 研究：一个行业的动态时间线'],
      detail: newsKinds.map(([k, v]) => [NEWS_CN[k] || k, v]) as [string, number][],
    },
    {
      key: 'campus', tag: '校招底数', color: '#d97706',
      title: '这家公司招不招应届生、怎么招、值不值得去',
      value: fill('ai_comprehensive_evaluate'), unit: '家有学生视角的综合评价',
      what: `${fmt(fill('careers_url') + fill('campus_url'))} 个校招 / 招聘入口、${fmt(fill('campus_overview'))} 份校招概况、${fmt(fill('benefits_package'))} 份福利待遇摘要、${fmt(fill('candidate_reputation'))} 份候选人口碑（面经）；另有 ${fmt(JOBS.total)} 个结构化校招岗位、${fmt(COMPS.total)} 场带奖品的企业赛事。这是整个底座里为学生专门长出来的一层。`,
      use: ['学生选公司像选学校一样有据可依', '院校就业指导：一个专业对应哪些企业', '企业自己看：我们在学生眼里长什么样'],
    },
    {
      key: 'source', tag: '信源底数', color: '#64748b',
      title: '每条数据都知道自己从哪来',
      value: SOURCES.total, unit: '条已分类信源',
      what: `分布在 ${fmt(SOURCES.hosts)} 个主机域名上，按官网首页、关于 / 投资者关系 / 新闻 / 团队 / 文化 / 产品、校招入口三大类归档${health.checked ? `，全部做过存活体检：${fmt(health.alive)} 条能打开，${health.gone} 条已确认下线（404），${health.blocked} 条被反爬拦截，${health.unreachable} 条本次未能访问、待复检` : ''}。每个非空字段还单独记录自己的来源 URL。`,
      use: ['可核验：任何一个字段都能点回原文', '监测更新：页面变了能发现、能重跑', '资产化：信源目录本身持续增值'],
    },
  ];

  const SCENES = [
    { tag: 'ToC', icon: '🧭', t: '学生与求职者', d: '选公司像选学校：招不招应届生、福利怎么样、面经怎么说、最近有没有坏消息——逐字段可比，不必一家家翻官网和论坛。再往下，是每个岗位的数字技能空间。' },
    { tag: 'ToS', icon: '🎓', t: '院校 · 就业与产教融合', d: '一个专业对应哪些企业、这些企业招什么岗位、有过哪些校企合作——就业指导、实习基地、产教融合项目的事实基础。' },
    { tag: 'ToB', icon: '🏢', t: '企业自身与招聘品牌', d: '看自己在学生眼里长什么样，和同行比校招入口、福利透明度、舆情；找同一投资方 / 同一赛道的对标公司。' },
    { tag: 'ToG', icon: '🏛️', t: '政府 / 园区 / 监管', d: '区域产业结构地图、高企成长监测、资本活跃度、风险动态——招商、扶持与监管的可核验底数。' },
    { tag: 'ToB', icon: '💰', t: '投资与研究机构', d: '沿投资方、行业、产品线做赛道扫描；创始团队与融资阶段一目了然；季度重跑得到变化轨迹。' },
    { tag: 'ToA', icon: '🤖', t: '智能体与开放生态', d: '底数以 API / 工具形式开放给智能体调用——让 AI 在回答「这家公司怎么样」时，有真实可核验的数据可依。' },
  ];

  // ── 图谱：三家样本企业 → 行业 / 投资方 / 产品 / 高管 ──
  const graphNodes: any[] = []; const graphEdges: any[] = []; const seen = new Set<string>();
  const addNode = (n: any) => { if (!seen.has(n.id)) { seen.add(n.id); graphNodes.push(n); } };
  for (const c of samples) {
    const cid = `c:${c.id}`; addNode({ id: cid, label: c.name.replace(/（.*?）|\(.*?\)|有限公司|股份/g, ''), type: 'company', size: 40 });
    if (c.industry) { const iid = `i:${c.industry}`; addNode({ id: iid, label: c.industry, type: 'industry', size: 22 }); graphEdges.push({ source: cid, target: iid, type: 'has' }); }
    const investors = new Set<string>();
    for (const f of c.financings || []) for (const inv of String(f.finance_enterprise || '').split(/\s*\/\s*|、|，/).map((x: string) => x.trim()).filter(Boolean)) investors.add(inv);
    [...investors].slice(0, 8).forEach(inv => { const id = `v:${inv}`; addNode({ id, label: inv, type: 'investor', size: 18 }); graphEdges.push({ source: id, target: cid, type: 'owns' }); });
    (c.products || []).slice(0, 6).forEach((p: any) => { const id = `p:${c.id}:${p.name}`; addNode({ id, label: p.name, type: 'product', size: p.is_flagship ? 16 : 12 }); graphEdges.push({ source: cid, target: id, type: 'offers' }); });
    (c.executives || []).slice(0, 6).forEach((e: any) => { const id = `e:${c.id}:${e.name}`; addNode({ id, label: e.name, type: 'executive', size: e.is_founder ? 14 : 11 }); graphEdges.push({ source: cid, target: id, type: 'member' }); });
  }

  const SLIDE_TABLE = (c: any) => (
    <div className="rp-table-scroll">
      <table className="rp-table">
        <thead><tr><th>融资轮次</th><th>金额</th><th>投资方</th><th>日期</th></tr></thead>
        <tbody>
          {(c.financings || []).slice(0, 5).map((f: any, i: number) => (
            <tr key={i}><td><b>{ROUND_CN[f.finance_round] || f.finance_round || '未标注'}</b></td><td>{f.finance_amount || '—'}</td><td className="rp-muted" style={{ maxWidth: 200 }}>{String(f.finance_enterprise || '—').slice(0, 40)}</td><td className="rp-muted" style={{ whiteSpace: 'nowrap' }}>{f.publish_date_str || '—'}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="rp">
      <ReportNav sections={SECTIONS} />

      {/* ── Hero ───────────────────────────── */}
      <header className="rp-hero">
        <WeaveTexture id="w1" />
        <div className="rp-wrap rp-hero-in">
          <div className="rp-hero-badge">◆ 平方创想 VisionSquare · 企业数据底座答卷</div>
          <h1>把真实世界的企业，<br />变成<em>可信任的数据底座</em></h1>
          <p className="rp-hero-sub">
            平方创想十年只做一件事：构建教育科技人才一体化领域的「可信任」基础设施。
            这份报告不挑三家漂亮的公司做样板，而是拿一整份公开名单——<strong>上海市高新技术企业名单里的 {fmt(HQ.companies)} 家</strong>——
            从只有一个名字开始，在一天之内跑完整条产线，完整回答五个问题：
            数据<strong>怎么拿到</strong>的、它<strong>凭什么不一样</strong>、能产生<strong>什么业务价值</strong>、
            我们的<strong>壁垒</strong>在哪里，以及这件事<strong>能长到多大</strong>。
          </p>
          <div className="rp-hero-meta">
            <span className="rp-chip">{fmt(HQ.companies)} 家上海高新技术企业 · 一整份名单</span>
            <span className="rp-chip">科技求真 · 可信任基础设施</span>
            <span className="rp-chip">字段级出处可回溯</span>
            <span className="rp-chip">总成本 {cny(HQ.usd)}</span>
          </div>
          <div className="rp-hero-stats">
            <HeroStat value={SOURCES.total} label="条信源 · 覆盖 3 类入口" />
            <HeroStat value={entities} label="条结构化子实体" />
            <HeroStat value={SUBS.executives.total} label="位有名有姓的高管" />
            <HeroStat value={SUBS.products.total} label="个核心产品" />
            <HeroStat value={SUBS.financings.total} label="轮融资记录" />
            <HeroStat value={HQ.usd * USD_CNY} prefix="¥" label="全部模型成本" />
          </div>
        </div>
      </header>

      <ActDivider
        id="act-1"
        no="第 一 幕"
        title="我们怎么拿到这些数据"
        lead="过程、结果与成本，全部摊开——包括失败率和花了多少钱。"
        points={['企业数据为什么「公开却不可用」', '智能数据工厂的八个工位', `${fmt(HQ.companies)} 家企业真实跑出来的产出、质量与花费`]}
      />

      {/* ── 难题 ───────────────────────────── */}
      <section className="rp-section" id="s-problem">
        <div className="rp-wrap">
          <SectionHead
            eyebrow="Why it is hard"
            title="企业数据的难，不在「找不到」，在「拼不起来」"
            lead="每家公司的官网都是公开的，工商信息也是公开的，新闻更是满天飞。但公开不等于可用。真正的门槛有四道——平方创想的智能企业数据工厂，就是为了把这四道门槛逐个拆掉而建的。"
          />
          <IllustrationBand src="/report/illu/problem.png" alt="散落、互不相连的企业页面" height={190} />
          <div className="rp-grid rp-grid-4" style={{ marginTop: 30 }}>
            {[
              { n: `${fmt(SOURCES.hosts)}`, u: '个主机域名', t: '数据是散的', d: `${fmt(HQ.companies)} 家企业的 ${fmt(SOURCES.total)} 条信源分散在 ${fmt(SOURCES.hosts)} 个不同主机上：官网、投资者关系站、招聘系统（zhiye / moka / 牛客）、公众号，各建各的，命名和结构毫无共性。` },
              { n: '1', u: '列', t: '名单是薄的', d: `公示名单只有一列——企业名称。它无法回答：这家公司做什么产品、融了几轮、谁是创始人、招不招应届生。进厂时平均完整度只有 ${PIPE.completenessBefore} 分。` },
              { n: `${fmt(fill('operating_revenue'))}`, u: '家披露营收', t: '口径是缺的', d: `${fmt(profiled)} 家里只有 ${fmt(fill('operating_revenue'))} 家能查到营收、${fmt(fill('company_employees'))} 家能查到员工数。非上市公司的经营规模，公开渠道就是没有——抽不到不能硬填。` },
              { n: '4', u: '个字段', t: '网页不是数据', d: '一句「近亿元 B 轮融资，源码资本领投」对人是一句话，对系统必须拆成轮次、金额、投资方、日期四个可比字段，再和另外两篇报道里的同一轮归并成一条。' },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 80}>
                <div className="rp-card rp-card-hover" style={{ height: '100%' }}>
                  <div style={{ fontSize: 30, fontWeight: 740, letterSpacing: '-.02em', color: 'var(--rp-primary)' }}>
                    {c.n}<span style={{ fontSize: 13, fontWeight: 600, color: 'var(--rp-ink3)', marginLeft: 5 }}>{c.u}</span>
                  </div>
                  <div className="rp-h3" style={{ marginTop: 10 }}>{c.t}</div>
                  <p style={{ fontSize: 13.5, margin: 0 }}>{c.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 流水线 ─────────────────────────── */}
      <section className="rp-section rp-section-tint" id="s-pipeline">
        <div className="rp-wrap">
          <SectionHead
            eyebrow="Raw Data → Feasible Data"
            title="平方创想的智能企业数据工厂：八个工位，把一个公司名变成可信任的实体"
            lead={`名单进厂之后，要依次经过定位官网、归档、抓取、官方原文结构化、六路联网检索、归并、AI 质检，最后交到人类总质检台，才能成为支撑决策的可用数据。每个工位上站着一位各司其职的 AI 员工——下面不是示意图，右侧的数字来自这 ${fmt(HQ.companies)} 家企业这一轮真实开工的结果。`}
          />
          <IllustrationBand src="/report/illu/factory.png" alt="源数据经过智能数据工厂变成结构化实体" height={210} />
          <div style={{ marginTop: 32 }}>
            <PipelineFlow stages={stages} />
          </div>
          <Reveal>
            <div className="rp-quote" style={{ marginTop: 28 }}>
              这座工厂的价值不在某一个工位特别聪明，而在于<strong>八个工位是连着的，并且遵循同一套数据标准</strong>——
              官方优先、只填空不覆盖、每个字段带出处、找不到就留空。
              这条产线和院校数据工厂是<strong>同一套骨架</strong>：换的只是入口类型、字段表和检索主题——
              这正是平方创想所说的「可信任」：不是声称准确，而是<strong>随时可以被查证</strong>。
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 实例走查 ───────────────────────── */}
      <section className="rp-section" id="s-case">
        <div className="rp-wrap">
          <SectionHead
            eyebrow="Walkthrough"
            title="四个真实实例：可信任数据长什么样"
            lead={`统计数字容易看腻。下面从 ${fmt(HQ.companies)} 家里挑三家不同类型的企业——港股上市的生物药企、港股上市的 AI 公司、专精特新的 SaaS 初创——看这条产线交付出来的具体产出，每一条都可以逐条核对、回到原始页面。左右切换查看。`}
          />
          <div style={{ marginTop: 30 }}>
            <CaseCarousel
              slides={[
                {
                  key: 'henlius', kicker: '港股上市 · 生物制药',
                  title: henlius.name,
                  body: (
                    <div className="rp-case">
                      <div className="rp-case-note">
                        <p>
                          从名单上的一个名字出发，工位一找到 <code style={{ fontSize: 13, background: 'var(--rp-line-soft)', padding: '1px 6px', borderRadius: 5 }}>{String(henlius.website || '').replace(/^https?:\/\//, '')}</code>，
                          并沿着「关于 / 投资者关系 / 新闻 / 管理团队 / 文化」{henlius.log?.pages || 0} 个官方页面抓下 <strong>{fmt(henlius.log?.markdown_len || 0)}</strong> 字原文。
                        </p>
                        <p>
                          这一家最后落下 <strong>{henlius.counts.fin}</strong> 轮融资、<strong>{henlius.counts.exec}</strong> 位高管、<strong>{henlius.counts.prod}</strong> 个核心产品、<strong>{henlius.counts.news}</strong> 条近期动态，
                          完整度从 {henlius.log?.before} 分到 <strong>{henlius.log?.after} 分</strong>，用时 {henlius.log?.seconds} 秒，成本 {cny(henlius.log?.cost_usd || 0, 2)}。
                        </p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 16 }}>
                          <span className="rp-tag rp-tag-p">{henlius.stock_code}</span>
                          <span className="rp-tag rp-tag-g">{henlius.industry}</span>
                          <span className="rp-tag rp-tag-o">{henlius.counts.prod} 个产品</span>
                          <span className="rp-tag rp-tag-c">{henlius.counts.exec} 位高管</span>
                        </div>
                      </div>
                      <div>
                        {henlius.highlights?.industry_position ? (
                          <div style={{ background: 'var(--rp-line-soft)', borderRadius: 10, padding: '16px 18px', fontSize: 13, lineHeight: 1.85, color: 'var(--rp-ink2)' }}>
                            <div style={{ fontWeight: 650, color: 'var(--rp-ink)', marginBottom: 8 }}>抽取到的行业位置</div>
                            {String(henlius.highlights.industry_position).slice(0, 220)}
                          </div>
                        ) : null}
                        <div style={{ marginTop: 14 }}>{SLIDE_TABLE(henlius)}</div>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'unisound', kicker: '港股上市 · 人工智能',
                  title: unisound.name,
                  body: (
                    <div className="rp-case">
                      <div className="rp-case-note">
                        <p>
                          {unisound.brief}。这一家是 {fmt(HQ.companies)} 家里完整度最高的之一：<strong>{unisound.completeness} 分</strong>，{unisound.fieldsFilled} 个非空字段，
                          {unisound.counts.fin} 轮融资、{unisound.counts.prod} 个产品、{unisound.counts.exec} 位高管。
                        </p>
                        <p>
                          值得看的是「增长信号」和「舆情」这两个字段：不是官网口号，而是把过去 12 个月的公开报道交叉之后写下的判断，
                          每一句都带来源标注。
                        </p>
                        {unisound.highlights?.growth_signals ? <div className="rp-muted" style={{ marginTop: 14 }}>增长信号：{String(unisound.highlights.growth_signals).slice(0, 120)}…</div> : null}
                      </div>
                      <div className="rp-table-scroll">
                        <table className="rp-table">
                          <thead><tr><th>高管</th><th>职务</th><th>产品</th><th>品类</th></tr></thead>
                          <tbody>
                            {Array.from({ length: 5 }).map((_, i) => {
                              const e = (unisound.executives || [])[i], p = (unisound.products || [])[i];
                              return (
                                <tr key={i}>
                                  <td><b>{e?.name || ''}</b>{e?.is_founder ? <span className="rp-tag rp-tag-o" style={{ marginLeft: 4 }}>创始人</span> : null}</td>
                                  <td className="rp-muted">{String(e?.title || '').slice(0, 22)}</td>
                                  <td><b>{String(p?.name || '').slice(0, 22)}</b></td>
                                  <td className="rp-muted">{String(p?.category || '').slice(0, 16)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'qingflow', kicker: '专精特新 · SaaS 初创',
                  title: qingflow.name,
                  body: (
                    <div className="rp-case">
                      <div className="rp-case-note">
                        <p>
                          没有上市、没有年报、官网只有三个页面——这是名单里最常见的那类公司。
                          产线照样把它从 {qingflow.log?.before} 分补到 <strong>{qingflow.log?.after} 分</strong>：{qingflow.counts.fin} 轮融资史（从种子轮到 B 轮）、{qingflow.counts.prod} 条产品线、{qingflow.counts.news} 条动态。
                        </p>
                        <p>
                          它的「福利待遇」字段是这样写的：官网没公开薪资区间和具体待遇，第三方平台上的标签不能替代正式政策——
                          <strong>抽不到就说抽不到</strong>，并且说清为什么。这比一段漂亮的套话有用得多。
                        </p>
                        {qingflow.highlights?.benefits_package ? <div style={{ background: 'linear-gradient(135deg, rgba(217,119,6,.06), rgba(217,119,6,.02))', border: '1px solid rgba(217,119,6,.2)', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, lineHeight: 1.8, color: 'var(--rp-ink2)', marginTop: 12 }}>{String(qingflow.highlights.benefits_package).slice(0, 200)}…</div> : null}
                      </div>
                      <div>{SLIDE_TABLE(qingflow)}</div>
                    </div>
                  ),
                },
                {
                  key: 'student', kicker: '学生视角',
                  title: '「这家公司值不值得去」也是一个字段',
                  body: (
                    <div className="rp-case">
                      <div className="rp-case-note">
                        <p>
                          企业数据库市面上不少，但没有一个是站在学生这一边写的。平方创想在每家企业的画像里专门长出一层：
                          <strong>校招入口、校招概况、福利待遇、候选人口碑（面经）、综合评价、录取分析</strong>。
                        </p>
                        <p>
                          {fmt(HQ.companies)} 家里 {fmt(fill('ai_comprehensive_evaluate'))} 家写出了综合评价、{fmt(fill('ai_admission_analysis'))} 家写出了录取分析、{fmt(fill('candidate_reputation'))} 家找到了公开面经。
                          写不出来的，同样会说清是「公开渠道没有」，而不是编一段。
                        </p>
                      </div>
                      <div style={{ background: 'var(--rp-line-soft)', borderRadius: 10, padding: '16px 18px', fontSize: 13, lineHeight: 1.85, color: 'var(--rp-ink2)' }}>
                        <div style={{ fontWeight: 650, color: 'var(--rp-ink)', marginBottom: 8 }}>{unisound.name} · 综合评价（原文摘录）</div>
                        {String(unisound.highlights?.ai_comprehensive_evaluate || '').slice(0, 260)}…
                        <div style={{ fontWeight: 650, color: 'var(--rp-ink)', margin: '12px 0 8px' }}>录取分析（原文摘录）</div>
                        {String(unisound.highlights?.ai_admission_analysis || '').slice(0, 200)}…
                      </div>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </div>
      </section>

      {/* ── 成果 ───────────────────────────── */}
      <section className="rp-section rp-section-tint" id="s-result">
        <div className="rp-wrap">
          <SectionHead
            eyebrow="What we got"
            title={`${fmt(HQ.companies)} 家企业，沉淀下了什么`}
            lead={`同一条产线、同一个模型、${HQ.batches} 个批次、同一天之内的产出。每个批次 90 家并发 6 路，平均一家 ${HQ.avgSeconds} 秒。`}
          />
          <Reveal>
            <div className="rp-card rp-table-scroll" style={{ marginTop: 28, padding: 8 }}>
              <table className="rp-table">
                <thead>
                  <tr><th>批次</th><th>企业</th><th>完成</th><th>新增字段</th><th>子实体（融资 / 动态 / 高管）</th><th>模型调用</th><th>平均用时</th><th>成本</th></tr>
                </thead>
                <tbody>
                  {BATCHES.map(b => (
                    <tr key={b.id}>
                      <td><b>{b.name.replace(/高企名单 · /, '')}</b></td>
                      <td>{b.total}</td>
                      <td><span className="rp-tag rp-tag-g">{b.completed} / {b.total}</span></td>
                      <td>{fmt(b.fields || 0)}</td>
                      <td>{fmt(b.subs || 0)}</td>
                      <td>{fmt(b.llmCalls || 0)}</td>
                      <td>{b.avgSeconds} 秒</td>
                      <td><b>{cny(b.cost_usd)}</b></td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700 }}>
                    <td>合计</td><td>{fmt(HQ.companies)}</td><td>{fmt(HQ.completed)}</td><td>{fmt(HQ.fields)}</td><td>{fmt(HQ.subs)}</td><td>{fmt(HQ.llmCalls)}</td><td>{HQ.avgSeconds} 秒</td><td>{cny(HQ.usd)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Reveal>

          <div className="rp-grid rp-grid-3" style={{ marginTop: 22 }}>
            {samples.map((s, i) => (
              <Reveal key={s.id} delay={i * 90}>
                <div className="rp-card" style={{ height: '100%' }}>
                  <div className="rp-h3">{s.name}</div>
                  <div className="rp-muted" style={{ marginBottom: 14 }}>{s.name_en || s.industry} · {s.city}</div>
                  <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginBottom: 16 }}>
                    <Gauge value={s.completeness} label="画像完整度" size={104} />
                    <Gauge value={pct(s.log?.pagesOk || 0, s.log?.pages || 1)} label="官方页面抓取" size={104} />
                  </div>
                  <BarRow label="核心产品" value={s.counts.prod} max={30} display={String(s.counts.prod)} color="var(--rp-orange)" />
                  <BarRow label="高管" value={s.counts.exec} max={30} display={String(s.counts.exec)} color="#0891b2" />
                  <BarRow label="融资轮次" value={s.counts.fin} max={30} display={String(s.counts.fin)} color="#8b5cf6" />
                  <BarRow label="近期动态" value={s.counts.news} max={30} display={String(s.counts.news)} color="var(--rp-green)" />
                  <BarRow label="信源" value={s.counts.src} max={30} display={String(s.counts.src)} color="var(--rp-primary)" />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 分析 ───────────────────────────── */}
      <section className="rp-section" id="s-analysis">
        <div className="rp-wrap">
          <SectionHead
            eyebrow="Analysis"
            title="有了可信任数据，才谈得上可信任的判断"
            lead="平方创想做基础设施的目的，从来不是把数据堆起来，而是让判断有据可依。下面三组对比，都是从这批数据里直接算出来的——它们也正是校企合作、区域产业与学生择业最常被问到的问题。"
          />

          <Reveal>
            <div className="rp-h3" style={{ marginTop: 32 }}>一、信息公开度：企业对学生最不透明的，恰恰是学生最想知道的</div>
            <p className="rp-lead">
              把 {fmt(profiled)} 家企业的字段按来源分组，看「这个字段公开渠道有没有」的比例。工商登记几乎家家齐全，因为那是政府公示的；
              经营规模只有一两成，因为非上市公司不必披露；而<strong>校招入口、福利待遇、候选人口碑</strong>这一组，是最薄的一层——
              这不是数据质量的差异，而是<strong>企业信息公开程度的真实差异</strong>。
            </p>
          </Reveal>
          <Reveal>
            <div className="rp-card" style={{ marginTop: 18 }}>
              <div className="rp-grid rp-grid-3">
                <div>
                  <div style={{ fontWeight: 650, marginBottom: 10 }}>工商登记<span className="rp-muted" style={{ marginLeft: 8 }}>政府公示</span></div>
                  <BarRow label="统一社会信用代码" value={pct(fill('unified_social_credit_code'), total)} color="var(--rp-primary)" />
                  <BarRow label="注册资本" value={pct(fill('registered_capital'), profiled)} color="var(--rp-primary)" />
                  <BarRow label="法定代表人" value={pct(fill('legal_representative'), profiled)} color="var(--rp-primary)" />
                  <BarRow label="注册地址" value={pct(fill('registration_address'), profiled)} color="var(--rp-primary)" />
                  <BarRow label="经营范围" value={pct(fill('business_range'), profiled)} color="var(--rp-primary)" />
                </div>
                <div>
                  <div style={{ fontWeight: 650, marginBottom: 10 }}>经营规模<span className="rp-muted" style={{ marginLeft: 8 }}>企业自愿披露</span></div>
                  <BarRow label="规模区间" value={pct(fill('company_scale'), profiled)} color="var(--rp-orange)" />
                  <BarRow label="员工人数" value={pct(fill('company_employees'), profiled)} color="var(--rp-orange)" />
                  <BarRow label="营业收入" value={pct(fill('operating_revenue'), profiled)} color="var(--rp-orange)" />
                  <BarRow label="利润" value={pct(fill('profit'), profiled)} color="var(--rp-orange)" />
                  <BarRow label="股票代码" value={pct(fill('stock_code'), profiled)} color="var(--rp-orange)" />
                </div>
                <div>
                  <div style={{ fontWeight: 650, marginBottom: 10 }}>校招与人<span className="rp-muted" style={{ marginLeft: 8 }}>学生最关心</span></div>
                  <BarRow label="校招 / 招聘入口" value={pct(fill('careers_url') + fill('campus_url'), profiled)} color="#0891b2" />
                  <BarRow label="校招概况" value={pct(fill('campus_overview'), profiled)} color="#0891b2" />
                  <BarRow label="福利待遇" value={pct(fill('benefits_package'), profiled)} color="#0891b2" />
                  <BarRow label="校企合作经历" value={pct(fill('school_company_coop_exp'), profiled)} color="#0891b2" />
                  <BarRow label="候选人口碑（面经）" value={pct(fill('candidate_reputation'), profiled)} color="#0891b2" />
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal>
            <div className="rp-h3" style={{ marginTop: 40 }}>二、上市与否：同一条产线，公开得越多的公司，底数越厚</div>
            <p className="rp-lead">
              {fmt(COMPANIES.listed.n)} 家带股票代码的公司平均完整度 <strong>{COMPANIES.listed.avg} 分</strong>，{fmt(COMPANIES.unlisted.n)} 家非上市公司平均 <strong>{COMPANIES.unlisted.avg} 分</strong>。
              差距来自投资者关系页与交易所披露——它们让高管、财务、融资这几组字段有了权威来源。这也说明：<strong>产线抽不到的，往往是公开渠道就没有的</strong>。
            </p>
          </Reveal>
          <Reveal>
            <div className="rp-card rp-table-scroll" style={{ marginTop: 18, padding: 8 }}>
              <table className="rp-table">
                <thead><tr><th>企业类型</th><th>家数</th><th>平均完整度</th><th></th></tr></thead>
                <tbody>
                  {types.map(([k, v]) => (
                    <tr key={k}>
                      <td><b>{TYPE_CN[k] || k}</b></td>
                      <td>{v.n}</td>
                      <td><b style={{ color: 'var(--rp-primary)' }}>{v.avg}</b> 分</td>
                      <td style={{ width: '40%' }}><BarRow label="" value={v.avg} color="var(--rp-primary)" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>

          <Reveal>
            <div className="rp-h3" style={{ marginTop: 40 }}>三、资本与动态：一份名单里藏着一张赛道图</div>
            <p className="rp-lead">
              {fmt(SUBS.financings.companies)} 家有融资史，{fmt(SUBS.financings.total)} 轮里 A 轮最多；{fmt(SUBS.news.companies)} 家有近期动态，其中 {fmt(SUBS.news.byKind.risk || 0)} 条被标为风险。
              把行业分布、融资阶段和动态类型放在一起，就是一张区域产业的实时切面。
            </p>
          </Reveal>
          <div className="rp-grid rp-grid-3" style={{ marginTop: 18 }}>
            <Reveal>
              <div className="rp-card" style={{ height: '100%' }}>
                <div style={{ fontWeight: 650, marginBottom: 12 }}>行业分布 · TOP 8</div>
                {industries.map(([k, v]) => <BarRow key={k} label={k} value={v} max={industries[0][1]} display={String(v)} color="var(--rp-primary)" />)}
              </div>
            </Reveal>
            <Reveal delay={80}>
              <div className="rp-card" style={{ height: '100%' }}>
                <div style={{ fontWeight: 650, marginBottom: 12 }}>融资轮次分布</div>
                {rounds.map(([k, v]) => <BarRow key={k} label={ROUND_CN[k] || k} value={v} max={rounds[0][1]} display={String(v)} color="#8b5cf6" />)}
              </div>
            </Reveal>
            <Reveal delay={160}>
              <div className="rp-card" style={{ height: '100%' }}>
                <div style={{ fontWeight: 650, marginBottom: 12 }}>动态类型分布</div>
                {newsKinds.map(([k, v]) => <BarRow key={k} label={NEWS_CN[k] || k} value={v} max={newsKinds[0][1]} display={String(v)} color={k === 'risk' ? 'var(--rp-red)' : 'var(--rp-green)'} />)}
                <div className="rp-muted" style={{ marginTop: 8 }}>近 3 个月 {fmt(SUBS.news.fresh?.m3 || 0)} 条 · 近 12 个月 {fmt((SUBS.news.fresh?.m3 || 0) + (SUBS.news.fresh?.m12 || 0))} 条</div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── 质量与成本 ─────────────────────── */}
      <section className="rp-section rp-section-alt" id="s-cost">
        <div className="rp-wrap">
          <SectionHead
            eyebrow="Quality & cost"
            title="成功率、失败在哪、边际成本多少"
            lead={`基础设施的价值要用边际成本来衡量。平方创想把失败率与成本完整摊开——这决定了这套能力能不能从 ${fmt(HQ.companies)} 家扩到几十万家。`}
          />

          <div className="rp-grid rp-grid-4" style={{ marginTop: 30 }}>
            {[
              { v: `${firstPassRate}%`, k: '首轮成功率', d: `${fmt(FIRST_PASS.attempted - FIRST_PASS.failed)} / ${fmt(FIRST_PASS.attempted)}，重试后 100%` },
              { v: `${FIRST_PASS.failed}`, k: '首轮失败', d: `${FIRST_PASS.timeouts} 次超时 · ${FIRST_PASS.badJson} 次模型返回坏 JSON` },
              { v: cny(HQ_PER_COMPANY_USD, 2), k: '平均每家成本', d: `${HQ.avgSeconds} 秒 / 家 · ${fmt(Math.round(HQ.llmCalls / Math.max(1, HQ.companies)))} 次模型调用` },
              { v: cny(HQ.usd / Math.max(1, entities) * 1000, 1), k: '每千条子实体成本', d: `共 ${fmt(entities)} 条子实体` },
            ].map((c, i) => (
              <Reveal key={c.k} delay={i * 70}>
                <div className="rp-card" style={{ height: '100%' }}>
                  <div style={{ fontSize: 30, fontWeight: 730, color: 'var(--rp-primary)', letterSpacing: '-.02em' }}>{c.v}</div>
                  <div style={{ fontSize: 13, color: 'var(--rp-ink2)', marginTop: 6, fontWeight: 600 }}>{c.k}</div>
                  <div className="rp-muted" style={{ marginTop: 3 }}>{c.d}</div>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="rp-grid rp-grid-2" style={{ marginTop: 22 }}>
            <Reveal>
              <div className="rp-card" style={{ height: '100%' }}>
                <div className="rp-h3">各工位的工作量与失败原因</div>
                <table className="rp-table">
                  <thead><tr><th>工序</th><th>次数</th><th>说明</th></tr></thead>
                  <tbody>
                    <tr><td><b>定位官网</b></td><td>{fmt(PIPE.steps.locate)}</td><td className="rp-muted">找到 {fmt(fill('official_website'))} 个官网</td></tr>
                    <tr><td><b>抓取原文</b></td><td>{fmt(PIPE.steps.fetch)}</td><td className="rp-muted">{fmt(PIPE.pagesFetched)} 页 · {pct(PIPE.pagesOk, PIPE.pagesFetched)}% 抓到正文</td></tr>
                    <tr><td><b>官方原文结构化</b></td><td>{fmt(PIPE.steps.extract)}</td><td className="rp-muted">不联网，只从官方页面抽</td></tr>
                    <tr><td><b>联网检索</b></td><td>{fmt(PIPE.steps.search)}</td><td className="rp-muted">6 个主题 · 只补空字段</td></tr>
                    <tr><td><b>归并入库</b></td><td>{fmt(PIPE.steps.save)}</td><td className="rp-muted">平均每家填上 {PIPE.avgFieldsFilled} 个字段</td></tr>
                  </tbody>
                </table>
                <p style={{ fontSize: 13, marginTop: 14, marginBottom: 0 }}>
                  首轮 {FIRST_PASS.failed} 次失败里，{FIRST_PASS.timeouts} 次是<strong>整家超时</strong>（联网检索卡住），{FIRST_PASS.badJson} 次是<strong>模型返回了不合法的 JSON</strong>——
                  没有一次是抽错内容。这类失败可以重试，平台内置了失败重置与重跑，第二轮全部成功。
                </p>
              </div>
            </Reveal>

            <Reveal delay={90}>
              <div className="rp-card" style={{ height: '100%' }}>
                <div className="rp-h3">成本花在哪里</div>
                <Donut
                  items={catCost.slice(0, 6).map(([k, v]) => ({ label: k, value: v, display: cny(v, 0) }))}
                  centerTop={cny(COSTS.total.usd)}
                  centerBottom="平台各工具合计"
                />
                <p style={{ fontSize: 13, marginTop: 16, marginBottom: 0 }}>
                  企业画像这 {HQ.batches} 个批次共 {fmt(HQ.llmCalls)} 次模型调用、{(HQ.tokens / 1e6).toFixed(0)}M token，按批次日志核算 {cny(HQ.usd)}——
                  换算下来，<strong>一家企业的完整数据底盘，成本约 {cny(HQ_PER_COMPANY_USD, 2)}</strong>。圆环里是平台上线以来各工具的成本构成：画像流水线占了九成以上，校招岗位提取、技能空间、赛事雷达合计不到一成。
                </p>
                <div className="rp-muted" style={{ marginTop: 8 }}>
                  口径说明：金额按 1 美元 ≈ {USD_CNY} 元折算，并<strong>按个人开发者账号的公开零售价结算</strong>——这是价格的上限；
                  规模化商业采购的单价显著低于此，真正铺开时只会更便宜。
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── 结尾 ───────────────────────────── */}
      <section className="rp-section rp-section-tint">
        <div className="rp-wrap-narrow" style={{ textAlign: 'center' }}>
          <Reveal>
            <div className="rp-eyebrow">What it means</div>
            <h2 className="rp-h2" style={{ maxWidth: 'none' }}>
              {fmt(HQ.companies)} 家企业 · {cny(HQ.usd)} · {fmt(entities)} 条可信任实体
            </h2>
            <p className="rp-lead" style={{ margin: '0 auto' }}>
              这不是一次性的项目交付，而是平方创想行业基础设施的一次常规输出。
              换一份名单，只是换一组企业名；换一座城市，只是换一个公示页。
              真正的资产是这座工厂本身——它把「公开但拼不起来」的企业信息，
              变成可检索、可比较、可追溯、可直接支撑决策的<strong>可信任数据底座</strong>，
              也正是平方创想「教育—科技—人才」一体化知识图谱在企业侧的底层供给。
            </p>
            <div style={{ marginTop: 26 }}>
              <a href="#act-2" style={{
                display: 'inline-block', background: 'linear-gradient(135deg, var(--rp-primary), var(--rp-primary-2))',
                color: '#fff', padding: '13px 26px', borderRadius: 12, fontWeight: 650, fontSize: 15,
                boxShadow: '0 8px 24px rgba(96,85,245,.3)',
              }}>
                接着看：这些数据凭什么不一样 →
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <ActDivider
        id="act-2"
        no="第 二 幕"
        title="我们的数据凭什么不一样"
        lead="可信任、有空间、能编织成知识——这三件事决定了它是资产，还是一堆字符。"
        points={['可信任知识 + 可信任数据 = 行业级知识图谱', '每一条都能被查证', '不是一张越来越长的表，是一个会变密的空间']}
      />

      <TrustEquation role={
        <>这份报告，是<strong>可信任数据</strong>在企业侧的完整实证：平方创想如何把一整份只有名字的公示名单，
        变成 {fmt(entities)} 条带字段、带出处、可回溯的实体，并沉淀为知识图谱的底层供给——与院校侧的底座同一套骨架、同一套标准。</>
      } />

      {/* ── 可信度 ─────────────────────────── */}
      <section className="rp-section" id="s-trust">
        <div className="rp-wrap">
          <SectionHead
            eyebrow="Why trust it"
            title="底数要敢用，前提是敢查"
            lead="「可信任」不是一句形容词，而是一套可被验证的机制。所有数据都来自企业官网、交易所披露、政府公示与可搜到的公开报道，没有任何一条是估算或推测出来的。"
          />
          <div className="rp-grid rp-grid-3" style={{ marginTop: 28 }}>
            {[
              { t: '字段级出处', d: '每个非空字段都记录它来自哪个 URL；每条融资、高管、动态、产品都带来源链接，任何一个值都能点回原始页面核对。', v: `${pct(SUBS.financings.withSource + SUBS.executives.withSource + SUBS.news.withSource, SUBS.financings.total + SUBS.executives.total + SUBS.news.total)}% 的子实体带来源链接` },
              { t: '存活体检 · 链接会烂', d: `信源做 HTTP 存活校验，页面下线或改版能被发现，而不是悄悄过期。本次体检 ${fmt(health.checked)} 条：${health.gone} 条已确认 404 下线（其中有整站换域名的官网），反爬拦截与网络超时分开判定、不算失效。`, v: `能打开 ${health.rate}% · 确认下线 ${health.gone} 条` },
              { t: '人工质检不被覆盖', d: '审核通过 / 不通过 / 隐藏的企业，AI 补全不再覆盖；人工编辑过的字段单独上锁，重跑自动跳过。企业与岗位、子实体用同一套机制。', v: '机器负责规模，人负责定论' },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 70}>
                <div className="rp-card" style={{ height: '100%' }}>
                  <div className="rp-h3" style={{ fontSize: 16.5 }}>{c.t}</div>
                  <p style={{ fontSize: 13.5 }}>{c.d}</p>
                  <div className="rp-tag rp-tag-p">{c.v}</div>
                </div>
              </Reveal>
            ))}
          </div>

          <div style={{ marginTop: 26 }}>
            <ShotGallery
              items={[
                {
                  src: '/report/shot-company-detail.png',
                  url: `智能企业数据工厂 / 企业实体库 / ${unisound.name}`,
                  title: '每一家企业都可以被打开核对',
                  caption: '档案画像、核心产品、融资、近期动态、管理团队、校招岗位分标签页；右侧是人工审核区、校招入口与关联企业。顶部的完整度、产品数、信源数直接告诉你这家盘到了什么程度。',
                  points: ['字段旁的链接图标点回原始出处', '审核通过后 AI 补全不再覆盖', '同行业 / 同投资方的关联企业可横向跳转'],
                },
                {
                  src: '/report/shot-journal.png',
                  url: '智能企业数据工厂 / 企业画像日志',
                  title: '每一次画像都留痕',
                  caption: '这是流水线的「黑匣子」：企业、任务批次、状态、走了几道工序、抓了多少字原文、完整度从几分到几分、新增了几个字段 / 融资 / 动态 / 高管、花了多少钱、用的哪个模型。',
                  points: ['Raw Markdown 原文与合并后的终局 JSON 双份留存', '每个主题的检索原始返回单独保存', '失败可单条重跑，不必整批重来'],
                },
              ]}
            />
          </div>
        </div>
      </section>

      {/* ── 网络空间示意 ───────────────────── */}
      <section className="rp-section" id="s-space">
        <div className="rp-wrap">
          <SectionHead
            eyebrow="From three to a space"
            title="从三家企业，长成一个网络空间"
            lead="底数不是一张越来越长的表。每接入一家企业，它带来的信源、产品、高管、融资与动态都会挂进同一个空间，并与已有的实体产生新的关系——空间会变密，而不是变长。"
          />
          <SpaceGrowth
            height={500}
            schools={samples.slice(0, 3).map(s => ({
              name: s.name.replace(/（.*?）|\(.*?\)|有限公司|股份|网络科技|生物制药|智能科技/g, ''),
              entities: { source: s.counts.src, product: s.counts.prod, executive: s.counts.exec, financing: s.counts.fin, news: s.counts.news },
            }))}
          />
          <Reveal>
            <p className="rp-muted" style={{ marginTop: 14, textAlign: 'center' }}>
              点的数量按真实规模等比缩放：企业与其信源、产品、高管、融资、动态之间的连线，是平台里已经建立的真实归属关系；
              <strong>跨企业之间的连线为示意</strong>——真实世界里同一座城市的企业本就通过共同投资方、同一赛道、供应链和人员流动彼此交织，
              这层「企业连企业」的关系图谱由平方创想在平台内单独构建。
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── 图谱 ───────────────────────────── */}
      <section className="rp-section rp-section-alt" id="s-graph">
        <div className="rp-wrap">
          <SectionHead
            eyebrow="The network"
            title="底数与知识编织，构建行业级知识图谱"
            lead="平方创想用数据与知识的编织，把实体连成网络：企业 → 行业 / 投资方 → 核心产品 / 高管。下面这张图是三家样本企业当前入库数据的真实关系，可以拖动查看（⌘/Ctrl + 滚轮缩放）。"
          />
          <Reveal>
            <div style={{ marginTop: 26 }}>
              <GraphCanvas nodes={graphNodes} edges={graphEdges} height={580} />
            </div>
          </Reveal>
          <Reveal>
            <p className="rp-muted" style={{ marginTop: 14, textAlign: 'center' }}>
              图中共 {graphNodes.length} 个节点、{graphEdges.length} 条关系，全部来自这三家企业已入库的融资、产品与高管记录。
              这里呈现的只是「知识图谱（物连物）」的一层；完整的认知图谱（物连人）与关系图谱（人连人）、
              以及图谱检索与路径分析能力，在平方创想的平台内提供。
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── 界面截图 ───────────────────────── */}
      <section className="rp-section" id="s-ui">
        <div className="rp-wrap">
          <SectionHead
            eyebrow="Inside the platform"
            title="这些数据在平方创想的平台里长什么样"
            lead="采集、质检、实体库、实验室四层界面：每一条数据都能点到它的来源页面和那一次提取过程。点击任意一张可放大查看细节。"
          />
          <div style={{ marginTop: 28 }}>
            <ShotGallery
              items={[
                { src: '/report/shot-company-list.png', url: '智能企业数据工厂 / 企业实体库', title: '企业实体库：以企业为个体', caption: '中国企业、中外合资、海外百强分类；名单可由 AI 从无到有生成，也可粘贴导入；每一行都能进档案或直接跑画像。', points: ['分类 / 行业 / 类型 / 总部 / 500 强 / 校招官网 / 信源数一表看清', '采集时遇到新企业会自动建档', '审核状态贯穿企业与岗位'] },
                { src: '/report/shot-company-detail.png', url: `智能企业数据工厂 / 企业实体库 / ${unisound.name}`, title: '企业档案：一家公司的全部底数', caption: '画像、产品、融资、动态、团队、岗位分页；右侧人工审核、校招入口与关联企业。空缺的字段直接标出「空缺 N 项」。', points: ['完整度 / 产品数 / 岗位数 / 信源数顶部计数', '「找校招 URL」「跑画像流水线」「找比赛」「快速补全」四个动作', '关联企业按同行业 / 同投资方推荐'] },
                { src: '/report/shot-tool.png', url: '智能企业数据工厂 / 企业画像工具', title: '画像工具：任务制批量开工', caption: '定位官方页面 → 抓取原文 → 提取 → 分主题联网检索 → 只填空写入。每个任务卡显示企业数、新增字段、子实体与成本。', points: ['9 个批次 798 家，每批 90 家并发 6 路', '进度、成本、状态实时可见', '单家画像与批量画像同一条产线'] },
                { src: '/report/shot-journal.png', url: '智能企业数据工厂 / 企业画像日志', title: '画像日志：每一次提取的黑匣子', caption: '走了几道工序、检索了几个主题、抓了多少字、完整度从几到几、新增了什么、花了多少钱。', points: ['Raw 原文与终局 JSON 双份留存', '失败可单条重跑', '成本按 batch 从 token 日志汇总'] },
                { src: '/report/shot-health.png', url: '智能企业数据工厂 / 企业画像健康', title: '画像健康看板：底数盘到了什么程度', caption: '字段填充率、子实体覆盖、完整度分布、动态新鲜度、审核与成本——先看清自己，再决定下一步补哪里。', points: ['字段按核心 / 重要 / 普通加权', '动态按近 3 个月 / 12 个月分档', '按分类筛选（中国企业 / 合资 / 海外百强）'] },
                { src: '/report/shot-job.png', url: '智能企业数据工厂 / 校招岗位库', title: '校招岗位库：与企业实体挂钩', caption: '从企业校招站提取的结构化岗位：职责、要求、专业、地点、项目名称、是否接受海外学生，与企业档案互通。', points: ['岗位字段与数据同事的字段表对齐', '缺 JD 的岗位单独筛出', '每个岗位可一键构建数字技能空间'] },
                { src: '/report/shot-competition.png', url: '智能企业数据工厂 / 企业赛事库', title: '企业赛事雷达：奔着奖品找比赛', caption: '黑客松、开发者大赛、校园创新赛——奖金、硬件奖品、Offer 直通、报名截止一表可比。', points: [`${fmt(COMPS.total)} 场赛事 · ${fmt(COMPS.hardwarePrize)} 场有硬件奖品 · ${fmt(COMPS.offerTrack)} 场有 Offer 通道`, '按主办企业挂回企业实体', '任务制，可按行业 / 区域定向搜'] },
                { src: '/report/shot-lab.png', url: '智能企业数据工厂 / 数字技能空间', title: '数字技能空间：每份 JD 一个岗位 AI', caption: '岗位 JD 被拆成技能集、检验故事线与虚拟操作空间；新人上操作台走一遍，专家来教一遍，AI 核心把经验吸收成自己的。', points: [`${fmt(LAB.spaces)} 个空间 · ${fmt(LAB.bench)} 个带虚拟工位 · ${fmt(LAB.career)} 个职业探索`, '只给一个职业名也能自动生成', '沉浸场景 + NPC 对话 + 事件流采集'] },
                { src: '/report/shot-office.png', url: '智能企业数据工厂 / 虚拟工厂', title: '虚拟工厂：给 AI 员工下达总任务', caption: '寻源、抓取、结构化、归并、质检各有其人；总监接到一句话任务后拆解派工，产线上的每一步都可见。', points: ['每个工位一位 AI 员工，与本报告的八个工位一一对应', '任务历史与成本全部记账', '人类总质检是最后一道'] },
              ]}
            />
          </div>
        </div>
      </section>

      <ActDivider
        id="act-3"
        no="第 三 幕"
        title="这些数据能拿去做什么"
        lead="底数的价值在于被调用——七类资产，六类用户。"
        points={['围绕一家企业能盘出的七类底数', '「一份名单」和「能开工的档案」的差别', '同一份底数，向六类用户交付']}
      />

      {/* ── 什么是底数 ─────────────────────── */}
      <section className="rp-section" id="s-what">
        <div className="rp-wrap">
          <SectionHead
            eyebrow="The premise"
            title="「底数」不是工商信息，是能点开、能核对、能拿去用的档案"
            lead="工商查询告诉你一家公司的注册资本和法定代表人，新闻告诉你它昨天发了什么。但要真正和一家企业发生关系——投递、合作、对接、投资——你需要的是另一种东西。这正是平方创想坚持「求真」的原因：决策要建立在真实、专业、可核验的底数之上。"
          />
          <div className="rp-grid rp-grid-2" style={{ marginTop: 28, alignItems: 'start' }}>
            <Reveal>
              <div className="rp-card">
                <div className="rp-kicker">常见的「企业数据」</div>
                <ul className="rp-list" style={{ marginTop: 12 }}>
                  <li>注册资本 1 亿元，法定代表人某某</li>
                  <li>高新技术企业，成立于 2012 年</li>
                  <li>官网一句话：「领先的 AI 解决方案提供商」</li>
                  <li>昨天的一条新闻</li>
                </ul>
                <div className="rp-muted" style={{ marginTop: 10 }}>
                  可以写进 PPT，但没办法据此判断要不要投这家公司、去不去这家公司、找谁谈合作。
                </div>
              </div>
            </Reveal>
            <Reveal delay={90}>
              <div className="rp-card" style={{ borderColor: 'rgba(96,85,245,.28)', boxShadow: '0 10px 40px rgba(96,85,245,.10)' }}>
                <div className="rp-kicker" style={{ color: 'var(--rp-primary)' }}>我们说的「底数」</div>
                <ul className="rp-list" style={{ marginTop: 12 }}>
                  <li>这家公司有 <strong>{unisound.counts.prod} 条</strong>产品线，哪几款是拳头产品、各自什么品类</li>
                  <li>它融了 <strong>{unisound.counts.fin} 轮</strong>，A 轮是启明创投，B 轮高通创投跟进，哪一年上的市</li>
                  <li>它的 <strong>{unisound.counts.exec} 位</strong>高管里，谁是创始人、谁管研发</li>
                  <li>它招不招应届生、面经怎么说、福利公开到什么程度、过去 12 个月有没有坏消息</li>
                </ul>
                <div className="rp-muted" style={{ marginTop: 10 }}>
                  每一条都能点回原始页面核对。这才是可以直接开工的东西。
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal>
            <div className="rp-quote" style={{ marginTop: 26 }}>
              一句话概括这份报告：<strong>平方创想把「公开但没人整理」的企业信息，变成了「可检索、可比较、可追溯」的行业资产清单。</strong>
              下面七类底数，是这张清单目前的全部内容——它们同时也是知识图谱里的七类实体。
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 七类资产 ───────────────────────── */}
      <section className="rp-section rp-section-tint" id="s-assets">
        <div className="rp-wrap">
          <SectionHead
            eyebrow="The assets"
            title="围绕一家企业，平方创想能盘出七类底数"
            lead={`这七类是平方创想在企业侧的采集与加工能力清单——换任何一家企业，都能盘出同样的七类。下面的数字是 ${fmt(HQ.companies)} 家样本企业当前已真实入库的量（不是规划，也不是数据总量的上限）；每一类都对应知识图谱中的一类实体，并可直接向院校、企业、政府与个人用户交付。`}
          />
          <IllustrationBand src="/report/illu/assets.png" alt="被盘点清楚、可随时取用的资产清单" height={200} />

          <div style={{ marginTop: 30, display: 'grid', gap: 16 }}>
            {ASSETS.map((a, i) => (
              <Reveal key={a.key} delay={i * 50}>
                <div className="rp-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 0 }} className="rp-asset">
                    <div style={{ padding: '24px 26px', background: 'linear-gradient(160deg, rgba(96,85,245,.045), rgba(96,85,245,.01))', borderRight: '1px solid var(--rp-line-soft)' }}>
                      <span className="rp-tag" style={{ background: 'rgba(96,85,245,.1)', color: a.color }}>{a.tag}</span>
                      <div style={{ fontSize: 42, fontWeight: 740, letterSpacing: '-.03em', color: a.color, marginTop: 14, lineHeight: 1.05 }}>
                        <CountUp to={a.value} />
                      </div>
                      <div className="rp-muted" style={{ marginTop: 4 }}>{a.unit}</div>
                      {a.detail ? (
                        <div style={{ marginTop: 16 }}>
                          {a.detail.map(([k, v]) => (
                            <BarRow key={k} label={k} value={v} max={Math.max(...a.detail!.map(d => d[1]))} display={String(v)} color={a.color} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ padding: '24px 26px' }}>
                      <div className="rp-h3">{a.title}</div>
                      <p style={{ fontSize: 14.5, marginBottom: 16 }}>{a.what}</p>
                      <div className="rp-kicker" style={{ marginBottom: 8 }}>能用来做什么</div>
                      <ul className="rp-list">
                        {a.use.map(u => <li key={u} style={{ fontSize: 14 }}>{u}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="rp-grid rp-grid-2" style={{ marginTop: 26, alignItems: 'start' }}>
            <Reveal>
              <div className="rp-card">
                <div className="rp-h3">资本底数长什么样</div>
                <p style={{ fontSize: 13.5 }}>从平台里直接取的融资记录样例，带轮次、金额、投资方与日期：</p>
                <div className="rp-table-scroll">
                  <table className="rp-table">
                    <thead><tr><th>企业</th><th>轮次</th><th>金额</th><th>日期</th></tr></thead>
                    <tbody>
                      {(SAMPLES.financings as any[]).slice(0, 7).map((f, i) => (
                        <tr key={i}>
                          <td style={{ maxWidth: 200 }}><b>{String(f.company).replace(/有限公司|股份/g, '').slice(0, 16)}</b></td>
                          <td><span className="rp-tag rp-tag-p">{ROUND_CN[f.finance_round] || f.finance_round}</span></td>
                          <td>{String(f.finance_amount || '—').slice(0, 14)}</td>
                          <td className="rp-muted" style={{ whiteSpace: 'nowrap' }}>{f.publish_date_str || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Reveal>

            <Reveal delay={90}>
              <div className="rp-card">
                <div className="rp-h3">校招底数长什么样</div>
                <p style={{ fontSize: 13.5 }}>
                  企业赛事是学生最直接的入口：奖金、硬件、Offer 直通。下面是赛事雷达抓到的几场——每一场都挂回主办企业的实体：
                </p>
                <div className="rp-table-scroll">
                  <table className="rp-table">
                    <thead><tr><th>赛事</th><th>主办</th><th>奖品</th><th></th></tr></thead>
                    <tbody>
                      {(SAMPLES.competitions as any[]).slice(0, 6).map((c, i) => (
                        <tr key={i}>
                          <td style={{ maxWidth: 200 }}><b>{String(c.name).slice(0, 18)}</b></td>
                          <td className="rp-muted" style={{ maxWidth: 120 }}>{String(c.organizer || '').slice(0, 12)}</td>
                          <td className="rp-muted">{String(c.prize_total || '—').slice(0, 14)}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{c.hardware_prize ? <span className="rp-tag rp-tag-o">硬件</span> : null}{c.offer_track && c.offer_track !== 'unknown' ? <span className="rp-tag rp-tag-g" style={{ marginLeft: 4 }}>Offer</span> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="rp-muted" style={{ marginTop: 10 }}>
                  {fmt(COMPS.total)} 场赛事里 {fmt(COMPS.hardwarePrize)} 场有硬件奖品、{fmt(COMPS.offerTrack)} 场有 Offer 通道、{fmt(COMPS.studentOnly)} 场限学生参加；
                  {Object.entries(COMPS.byKind as Record<string, number>).slice(0, 3).map(([k, v]) => `${COMP_KIND_CN[k] || k} ${v}`).join(' · ')}。
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── 名单 vs 档案 ───────────────────── */}
      <section className="rp-section" id="s-reach">
        <div className="rp-wrap">
          <SectionHead
            eyebrow="以人为本 · For students"
            title={<>「一份名单」和「{fmt(profiled)} 份能开工的档案」的差别</>}
            lead="可信任基础设施的核心对象之一，是人——这一次，是站在学生这一边的人。这是整份报告里平方创想最想让你看清楚的一页。"
          />
          <IllustrationBand src="/report/illu/reach.png" alt="从一整份名单里看清每一家具体的企业" height={200} />

          <div className="rp-grid rp-grid-2" style={{ marginTop: 28, alignItems: 'stretch' }}>
            <Reveal>
              <div className="rp-card" style={{ height: '100%' }}>
                <div className="rp-kicker">公开渠道能拿到的</div>
                <div style={{ fontSize: 56, fontWeight: 750, letterSpacing: '-.03em', color: 'var(--rp-ink4)', lineHeight: 1.1, marginTop: 10 }}>
                  1 列名字
                </div>
                <p style={{ marginTop: 14, fontSize: 14.5 }}>
                  {PUBLIC_LIST.name}公示的是一列企业名称。{fmt(PUBLIC_LIST.sampled)} 个名字，加起来是一份 Excel。
                </p>
                <div className="rp-muted">
                  你没法从这份名单里知道：哪家在做大模型、哪家刚融了 B 轮、哪家招应届生、哪家最近被处罚过、哪家的面经说加班很凶。
                </div>
              </div>
            </Reveal>
            <Reveal delay={90}>
              <div className="rp-card" style={{ height: '100%', borderColor: 'rgba(96,85,245,.3)', boxShadow: '0 12px 44px rgba(96,85,245,.12)' }}>
                <div className="rp-kicker" style={{ color: 'var(--rp-primary)' }}>平台沉淀下来的</div>
                <div style={{ fontSize: 56, fontWeight: 750, letterSpacing: '-.03em', lineHeight: 1.1, marginTop: 10,
                  background: 'linear-gradient(120deg, #4c41d9, #8b5cf6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                  <CountUp to={profiled} /> 份档案
                </div>
                <p style={{ marginTop: 14, fontSize: 14.5 }}>
                  每一份平均 <strong>{PIPE.avgFieldsFilled} 个字段</strong>被填上、完整度从 {PIPE.completenessBefore} 到 {PIPE.completenessAfter}，
                  {fmt(fill('ai_comprehensive_evaluate'))} 家有学生视角的综合评价，{fmt(fill('careers_url') + fill('campus_url'))} 家找到了校招 / 招聘入口，
                  {fmt(fill('public_sentiment'))} 家有过去 12 个月的舆情摘要。
                </p>
                <div className="rp-muted">
                  这才是能拿来做决定的资产：可以按行业筛、按阶段筛、按「招不招应届生」筛，然后打开具体的那一家。
                  在平方创想的图谱里，「人」是一等实体——企业侧的底数最终都要收敛到岗位和人身上。
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal>
            <div className="rp-card" style={{ marginTop: 18 }}>
              <div className="rp-grid rp-grid-3" style={{ alignItems: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <Gauge value={studentCoverage} label="学生视角覆盖率" size={150} />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div className="rp-h3">学生视角覆盖率：这批企业里，有多少能被「看明白」</div>
                  <p style={{ fontSize: 14.5 }}>
                    我们把「写出了综合评价」定义为看明白——因为它意味着校招入口、业务、行业位置、舆情这几组信息里至少凑齐了做判断所需的那几样。
                    {fmt(profiled)} 家里有 <strong>{fmt(fill('ai_comprehensive_evaluate'))} 家</strong>满足这个条件；写不出来的，也说清了缺哪一样。
                  </p>
                  <BarRow label="综合评价" value={fill('ai_comprehensive_evaluate')} max={profiled} display={fmt(fill('ai_comprehensive_evaluate'))} color="var(--rp-primary)" />
                  <BarRow label="录取分析" value={fill('ai_admission_analysis')} max={profiled} display={fmt(fill('ai_admission_analysis'))} color="#8b5cf6" />
                  <BarRow label="福利待遇" value={fill('benefits_package')} max={profiled} display={fmt(fill('benefits_package'))} color="#0891b2" />
                  <BarRow label="校招 / 招聘入口" value={fill('careers_url') + fill('campus_url')} max={profiled} display={fmt(fill('careers_url') + fill('campus_url'))} color="var(--rp-green)" />
                  <BarRow label="候选人口碑" value={fill('candidate_reputation')} max={profiled} display={fmt(fill('candidate_reputation'))} color="var(--rp-orange)" />
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal>
            <div className="rp-note" style={{ marginTop: 14 }}>
              <b>严谨起见：</b>「综合评价」「录取分析」是模型在公开信息之上写下的判断，不是企业的官方口径；每一段都标注了它依据的来源，并在信息不足时明确写出「公开渠道不足以判断」。
              我们要强调的不是评价本身，而是<strong>颗粒度的差别</strong>：一边是一列名字，一边是一份份可以逐条打开的档案。
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── 谁在用 ─────────────────────────── */}
      <section className="rp-section" id="s-use">
        <div className="rp-wrap">
          <SectionHead
            eyebrow="Who needs it"
            title="同一份底数，向六类用户交付"
            lead="这也是为什么平方创想不把它做成一个企业名录或者一份行业报告——底数的价值在于被调用。ToC / ToS / ToB / ToG / ToA，同一个底座，六种交付方式。"
          />
          <div className="rp-grid rp-grid-3" style={{ marginTop: 28 }}>
            {SCENES.map((s, i) => (
              <Reveal key={s.t} delay={i * 60}>
                <div className="rp-card rp-card-hover" style={{ height: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 26 }}>{s.icon}</span>
                    <span className="rp-tag rp-tag-p">{s.tag}</span>
                  </div>
                  <div className="rp-h3" style={{ marginTop: 10, fontSize: 16.5 }}>{s.t}</div>
                  <p style={{ fontSize: 13.5, margin: 0 }}>{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <ActDivider
        id="act-4"
        no="第 四 幕"
        title="平方创想的壁垒在哪里"
        lead="AI 不会取代平方创想，只会让平方创想建得更快。"
        points={['数据知识编织', '空间的构建', '垂直的研究', '以人为本的实体核心']}
      />

      <Manifesto variant="r1" />

      <ActDivider
        id="act-5"
        no="第 五 幕"
        title="它能长到多大"
        lead={`${fmt(HQ.companies)} 家只是一份名单。同一条产线、同一个空间，换名单只是换一组企业名。`}
        points={[`${fmt(HQ.companies)} 家 → 一座城市 → 全国的线性推演`, '横向、纵向、时间、连接、人、服务化六个方向']}
      />

      {/* ── 规模推演 ───────────────────────── */}
      <section className="rp-section rp-section-tint" id="s-scale">
        <div className="rp-wrap">
          <SectionHead
            eyebrow="Scale"
            title={`${fmt(HQ.companies)} 家已经是这个量级，那全国呢`}
            lead={`这 ${fmt(HQ.companies)} 家企业的全部数据，模型成本合计 ${cny(HQ.usd)}，平均一家约 ${cny(HQ_PER_COMPANY_USD, 2)}。流水线是同一套，换名单只是换一组企业名。`}
          />
          <Reveal>
            <div className="rp-card rp-table-scroll" style={{ marginTop: 26, padding: 8 }}>
              <table className="rp-table">
                <thead>
                  <tr><th>规模</th><th>核心产品</th><th>高管</th><th>融资记录</th><th>结构化子实体</th><th>模型成本（线性外推）</th></tr>
                </thead>
                <tbody>
                  {[
                    { n: HQ.companies, label: '已完成 · 本次样本（上海高企名单一部分）' },
                    { n: 5000, label: '一座城市的重点企业' },
                    { n: 24000, label: '上海全部高新技术企业' },
                    { n: 460000, label: '全国高新技术企业' },
                  ].map(r => {
                    const k = r.n / HQ.companies;
                    return (
                      <tr key={r.n}>
                        <td><b>{fmt(r.n)} 家</b><div className="rp-muted">{r.label}</div></td>
                        <td>{fmt(Math.round(SUBS.products.total * k))}</td>
                        <td>{fmt(Math.round(SUBS.executives.total * k))}</td>
                        <td>{fmt(Math.round(SUBS.financings.total * k))}</td>
                        <td>{fmt(Math.round(entities * k))}</td>
                        <td><b>{cny(HQ.usd * k)}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Reveal>
          <Reveal>
            <p className="rp-muted" style={{ marginTop: 12 }}>
              金额按 1 美元 ≈ {USD_CNY} 元折算，按本次实测的单家均值线性外推，用于表达量级而非精确预算；
              实际会因企业规模、是否上市、官网结构与信息公开程度上下浮动。上海高企总数与全国高企总数取自公开统计的量级。真正值得注意的是数量级：
              <strong>把全国所有高新技术企业的底数盘一遍，模型成本在{cny(HQ_PER_COMPANY_USD * 460000)}量级——不到一个中型项目的预算。</strong>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── 结尾 ───────────────────────────── */}
      <section className="rp-section rp-section-tint">
        <div className="rp-wrap-narrow" style={{ textAlign: 'center' }}>
          <Reveal>
            <div className="rp-eyebrow">The point</div>
            <h2 className="rp-h2" style={{ maxWidth: 'none' }}>仅仅一份名单，就已经是这样一张表</h2>
            <p className="rp-lead" style={{ margin: '0 auto' }}>
              {fmt(profiled)} 份企业档案、{fmt(SUBS.products.total)} 个核心产品、{fmt(SUBS.executives.total)} 位有名有姓的高管、
              {fmt(SUBS.financings.total)} 轮融资、{fmt(SUBS.news.total)} 条带日期的动态、{fmt(fill('ai_comprehensive_evaluate'))} 份学生视角的评价——
              全部来自公开页面，全部可回溯，全部在一天之内、{cny(HQ.usd)} 的模型成本之内完成。
            </p>
            <p className="rp-lead" style={{ margin: '14px auto 0' }}>
              把这件事放大一百倍，就是一张<strong>全国企业的产业、资本与人才底数网</strong>。
            </p>
          </Reveal>

          <Reveal>
            <div className="rp-card" style={{ marginTop: 34, textAlign: 'left', padding: '28px 30px' }}>
              <div className="rp-eyebrow">拓展与想象力</div>
              <div className="rp-h3" style={{ marginTop: 14, fontSize: 20 }}>这张表还能往哪里长</div>
              <p style={{ fontSize: 14.5 }}>
                今天呈现的是一份名单、七类底数的一个静态切面。同一套数据空间，往任何一个方向延伸，
                都不需要推倒重来——这正是「空间」而非「表格」的意义。
              </p>
              <IllustrationBand src="/report/illu/future.png" alt="从一份名单扩展到全国规模的网络" height={200} />
              <div className="rp-grid rp-grid-2" style={{ marginTop: 6 }}>
                {[
                  { t: '横向：更多名单与城市', d: '高企名单之外还有专精特新、独角兽、上市公司、招商目标企业；上海之外还有每一座城市的公示页。流水线不变，换的只是一组企业名。' },
                  { t: '纵向：从企业到岗位到技能', d: `企业 → 校招岗位 → 数字技能空间：已经有 ${fmt(JOBS.total)} 个结构化岗位和 ${fmt(LAB.spaces)} 个技能空间。每一份 JD 都能长出一个会考人、会学人、会解决问题的岗位 AI。` },
                  { t: '时间：把切面变成轨迹', d: '同一批企业按季度重跑，就能看到新融资、高管变动、产品上新、风险动态——静态底数变成成长曲线，高企监测与投后跟踪都有了事实基础。' },
                  { t: '连接：企业侧与院校侧对接', d: `已有 ${fmt(fill('school_company_coop_exp'))} 家企业写下了校企合作经历。把企业底数与院校底座（专业、师资、科研）连起来，做真正的产教双向撮合。` },
                  { t: '人的维度：从高管到校友到专家', d: `${fmt(SUBS.executives.total)} 位高管里 ${fmt(SUBS.executives.withEducation)} 位带教育背景——织出校友、师承、任职、流动的网络；技能空间里的真人专家，是另一条「人连人」的线。` },
                  { t: '服务化：从数据到工具', d: '底数之上可以长出检索、对标、监测、推荐与报告能力，成为学生、院校、园区和投资机构日常工作里真正被调用的基础设施。' },
                ].map(x => (
                  <div key={x.t} style={{ padding: '14px 0', borderTop: '1px solid var(--rp-line-soft)' }}>
                    <div style={{ fontWeight: 660, fontSize: 15 }}>{x.t}</div>
                    <p style={{ fontSize: 13.5, margin: '6px 0 0' }}>{x.d}</p>
                  </div>
                ))}
              </div>
              <div className="rp-quote" style={{ marginTop: 18 }}>
                {fmt(HQ.companies)} 家是起点，不是规模上限。真正值得想象的是：
                当这张网覆盖全国主要企业、并且每个季度自动更新一次，
                <strong>学生择业、校企合作与区域产业决策的底层信息差，就基本被抹平了。</strong>
              </div>
            </div>
          </Reveal>

          <Reveal>
            <div style={{ marginTop: 26 }}>
              <a href="https://collegedataai.com/report" target="_blank" rel="noreferrer" style={{
                display: 'inline-block', background: 'linear-gradient(135deg, var(--rp-primary), var(--rp-primary-2))',
                color: '#fff', padding: '13px 26px', borderRadius: 12, fontWeight: 650, fontSize: 15,
                boxShadow: '0 8px 24px rgba(96,85,245,.3)',
              }}>
                另一半答卷：院校数据底座是怎么建的 →
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <ReportFoot generatedAt={R.generatedAt} />
    </div>
  );
}
