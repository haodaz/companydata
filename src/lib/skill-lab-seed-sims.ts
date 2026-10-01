/**
 * 四个演示空间的「模拟操作台」脚本，以及专家 / 新兵 / AI 在台上留下的操作轨迹。
 * 最后一步（final）的文字就是 skill-lab-seed.ts 里各人的 answer，灌入时自动并进轨迹。
 */
import type { Sim, SimTrace } from '@/lib/skill-sim';
import { simulateScript } from '@/lib/bench';
import { BENCH_CASTING, CASTING_EXPERT_SCRIPT, CASTING_SCRIPTS, BENCH_WELD, WELD_EXPERT_SCRIPT, WELD_SCRIPTS } from '@/lib/skill-lab-seed-bench';
import { BENCH_LATTE_HEART, BENCH_LATTE_TULIP, BENCH_LATTE_ROSETTA, HEART_EXPERT_SCRIPT, HEART_SCRIPTS, TULIP_EXPERT_SCRIPT, TULIP_SCRIPTS, ROSETTA_EXPERT_SCRIPT, ROSETTA_SCRIPTS } from '@/lib/skill-lab-seed-bench-latte';
import { BENCH_SUTURE, SUTURE_EXPERT_SCRIPT, SUTURE_SCRIPTS } from '@/lib/skill-lab-seed-bench-surgery';
import { BENCH_LAPAROTOMY, LAP_EXPERT_SCRIPT, LAP_SCRIPTS } from '@/lib/skill-lab-seed-bench-laparotomy';
import { BENCH_FSW, BENCH_ENGINE, FSW_EXPERT_SCRIPT, FSW_SCRIPTS, ENGINE_EXPERT_SCRIPT, ENGINE_SCRIPTS } from '@/lib/skill-lab-seed-bench-rocket';

// ════════════════ A：指标异动归因 · 数据分析操作台 ════════════════
export const SIM_A: Sim = {
  title: '数据分析操作台 · DAU 异动',
  intro: '你坐在数据分析师的工位上。接下来的每一步，都是这份工作里真实会遇到的决策——没有标准答案的提示，做完才知道专家会怎么做。',
  art: {
    cover: '/lab/da_office.jpg',
    scenes: { first: '/lab/da_office.jpg', drill: '/lab/da_office.jpg', events: '/lab/da_office.jpg', cause: '/lab/da_meeting.jpg', confidence: '/lab/da_meeting.jpg', actions: '/lab/da_meeting.jpg', final: '/lab/da_meeting.jpg' },
    npcs: { '产品负责人': '/lab/npc_pm.png' },
  },
  steps: [
    {
      id: 'first', type: 'choose',
      scene: { who: '产品负责人', time: '周四 09:05', text: '昨天（周三）DAU 比上周三跌了 8%，1,000 万 → 920 万。上午 11 点周会，我要一个说法。' },
      prompt: '你的第一个动作是什么？',
      options: [
        { id: 'slice', label: '立刻按维度拆解，找是哪部分用户在跌' },
        { id: 'validate', label: '先确认数据本身可信：口径、埋点、数据是否到齐', reveal: { title: '数据组回复 · 09:12', note: '口径没变，数据已到齐。但提醒你：周二 16:00 我们升级过 Android 端埋点 SDK。' } },
        { id: 'ask_ops', label: '去问运营和市场，最近做了什么活动' },
        { id: 'competitor', label: '先看竞品动态和社交媒体舆情' },
      ],
    },
    {
      id: 'drill', type: 'drill', max: 4,
      scene: { who: '你', time: '09:20', text: '时间有限，周会前最多来得及下钻 4 个维度。点开一个维度，就会看到对应的数据。' },
      prompt: '你要下钻哪些维度？（最多 4 个，点开即可看到数据）',
      options: [
        { id: 'platform', label: '平台', reveal: { title: '按平台', rows: [{ label: 'iOS', a: '350 万', b: '349 万', delta: '-0.3%' }, { label: 'Android', a: '650 万', b: '571 万', delta: '-12.2%', hot: true }] } },
        { id: 'newold', label: '新老用户', reveal: { title: '按新老用户', rows: [{ label: '老用户', a: '800 万', b: '794 万', delta: '-0.8%' }, { label: '新用户', a: '200 万', b: '126 万', delta: '-37%', hot: true }] } },
        { id: 'channel', label: '获客渠道', reveal: { title: '新用户 · 按获客渠道', rows: [{ label: 'App Store（iOS）', a: '40 万', b: '40 万', delta: '0%' }, { label: '安卓应用商店', a: '120 万', b: '54 万', delta: '-55%', hot: true }, { label: '安卓其他渠道', a: '40 万', b: '32 万', delta: '-20%' }] } },
        { id: 'version', label: '客户端版本', reveal: { title: 'Android 新装用户 · 首日激活率', rows: [{ label: '8.1.x（上周三）', a: '—', b: '71%' }, { label: '8.2.0（本周三）', a: '—', b: '38%', hot: true }], note: '8.2.0 于周二 14:00 全量发布，iOS 本周未发版。' } },
        { id: 'region', label: '地域', reveal: { title: '按省份', note: '各省跌幅在 -7% ~ -9% 之间，分布均匀，没有异常省份。' } },
        { id: 'hour', label: '时段', reveal: { title: '按小时', note: '全天各时段同比例下跌，没有某个时段特别异常。' } },
      ],
    },
    {
      id: 'events', type: 'classify',
      scene: { who: '你', time: '09:50', text: '把本周发生的事排在时间线上，逐个判断：它影响的人群，和下跌的人群，是不是同一批？' },
      prompt: '给每个事件下判断',
      labels: [{ id: 'suspect', label: '嫌疑', tone: 'hot' }, { id: 'ruled_out', label: '排除', tone: 'cold' }],
      options: [
        { id: 'campaign', label: '周一 · 上线「夏日书单挑战」活动', detail: '面向全量用户' },
        { id: 'release', label: '周二 14:00 · Android 8.2.0 全量发布', detail: 'iOS 未发版' },
        { id: 'sdk', label: '周二 16:00 · 升级 Android 埋点 SDK', detail: '数据团队操作' },
        { id: 'rival', label: '周三 · 竞品阅读 App 上线新功能', detail: '社交媒体有讨论' },
      ],
    },
    {
      id: 'cause', type: 'choose',
      scene: { who: '产品负责人', time: '10:30', text: '还有半小时开会。所以到底是因为什么？' },
      prompt: '你给出的主因是？',
      options: [
        { id: 'release', label: '8.2.0 在 Android 新装 → 激活链路上出了问题' },
        { id: 'sdk', label: '埋点 SDK 升级导致漏报，用户其实没少' },
        { id: 'rival', label: '竞品新功能分流了新用户' },
        { id: 'campaign', label: '夏日书单挑战效果不及预期' },
        { id: 'multi', label: '版本、竞品、活动等多种因素共同作用' },
      ],
    },
    { id: 'confidence', type: 'slider', min: 0, maxValue: 100, unit: '%', prompt: '你对这个主因有多大把握？' },
    {
      id: 'actions', type: 'multi', max: 2,
      prompt: '今天只来得及做两件事，你选哪两件？',
      options: [
        { id: 'server_log', label: '用服务端登录日志核对 Android 新用户数' },
        { id: 'walkthrough', label: '请测试用新机走一遍 8.2.0 应用商店安装 → 注册' },
        { id: 'more_ads', label: '加大应用商店投放，把新用户补回来' },
        { id: 'content', label: '优化内容推荐，提升新用户留存' },
        { id: 'observe', label: '再观察一周，看趋势是否延续' },
        { id: 'rollback', label: '立刻全量回滚 8.2.0' },
      ],
    },
    { id: 'final', type: 'text', scene: { who: '产品负责人', time: '11:00', text: '好，周会开始。你来讲。' }, prompt: '写下你在周会上要说的话（不超过 500 字）', placeholder: '数据可信度、主因与证据、置信度、今天的下一步……' },
  ],
};

export const EXPERT_TRACE_A: SimTrace = {
  first: 'validate', drill: ['platform', 'newold', 'channel', 'version'],
  events: { campaign: 'ruled_out', release: 'suspect', sdk: 'suspect', rival: 'ruled_out' },
  cause: 'release', confidence: 65, actions: ['server_log', 'walkthrough'],
  final: '先说数据：周二 16:00 升级过 Android 埋点 SDK，和异动人群重合，所以这个跌幅暂时不能当成真实流失，上午会用服务端日志核对。\n\n在数据可信的前提下：总跌幅 80 万，Android 应用商店新用户 -66 万，贡献 82.5%，其余切片基本持平。活动和竞品都是全量影响，解释不了只跌 Android 新用户，排除。时间和范围都对得上的只有周二 14:00 的 8.2.0 发版。\n\n主因：8.2.0 在新装激活链路上的问题，置信度 65%。如果我错了，会看到服务端新用户数正常，或老版本的新装用户同样下跌。\n\n今天：10:30 前数据组核对服务端日志；测试组新机走查应用商店 8.2.0 安装注册；15:00 同步结论，确认是版本问题就回滚商店包。',
};

export const TRACES_A: Record<string, SimTrace> = {
  '林知夏（化名）': { first: 'validate', drill: ['platform', 'newold', 'channel', 'region'], events: { campaign: 'ruled_out', release: 'suspect', sdk: 'suspect', rival: 'ruled_out' }, cause: 'release', confidence: 60, actions: ['server_log', 'walkthrough'] },
  '陈一鸣（化名）': { first: 'competitor', drill: ['region', 'hour', 'newold'], events: { campaign: 'suspect', release: 'suspect', sdk: 'ruled_out', rival: 'suspect' }, cause: 'multi', confidence: 80, actions: ['more_ads', 'content'] },
  'AI 裸答': { first: 'slice', drill: ['platform', 'newold', 'channel', 'version'], events: { campaign: 'suspect', release: 'suspect', sdk: 'ruled_out', rival: 'suspect' }, cause: 'release', confidence: 85, actions: ['walkthrough', 'observe'] },
  'AI + 专家技能': { first: 'validate', drill: ['platform', 'newold', 'channel', 'version'], events: { campaign: 'ruled_out', release: 'suspect', sdk: 'suspect', rival: 'ruled_out' }, cause: 'release', confidence: 65, actions: ['server_log', 'walkthrough'] },
};

/** 专家在哪几步被追问（吸纳时的关键决策点），用于演示「模仿 + 追问」 */
export const EXPERT_WHY_A: Record<string, string> = {
  first: '业务方都急成这样了，你为什么不先拆数据，而是先验数？',
  drill: '地域和时段你一眼都没看，为什么？',
  confidence: '证据这么集中，为什么只给 65%？',
};

// ════════════════ B：新品上市一页纸 · 上市计划操作台 ════════════════
export const SIM_B: Sim = {
  title: '上市计划操作台 · 无糖气泡茶',
  intro: '你坐在品牌管培生的工位上。50 万、3 个月、华东 20 所高校。每一步都是一次取舍——做完才知道专家会怎么选。',
  art: {
    cover: '/lab/brand_office.jpg',
    scenes: { insight: '/lab/campus_store.jpg', goal: '/lab/brand_office.jpg', focus: '/lab/brand_office.jpg', budget: '/lab/brand_office.jpg', stoploss: '/lab/brand_office.jpg', final: '/lab/brand_office.jpg' },
    npcs: { '品牌经理': '/lab/npc_brand.png' },
  },
  steps: [
    {
      id: 'insight', type: 'choose',
      scene: { who: '品牌经理', time: '周一 10:00', text: '给你 50 万、3 个月，把无糖气泡茶打进华东高校。周五给我一页纸，我拿去跟总监要预算。先说说，你觉得学生为什么会买它？' },
      prompt: '你选哪一句作为这次上市的消费者洞察？',
      options: [
        { id: 'trend', label: '「Z 世代越来越注重健康，无糖是大趋势。」' },
        { id: 'moment', label: '「下午第三节课眼皮打架，想喝口带气的醒醒神，可一想到奶茶那半杯糖就算了。」' },
        { id: 'price', label: '「大学生对价格敏感，6 元的定价很有竞争力。」' },
        { id: 'novelty', label: '「气泡 + 茶是新品类，年轻人有尝鲜心理。」' },
      ],
    },
    {
      id: 'goal', type: 'choose',
      scene: { who: '品牌经理', time: '10:20', text: '行。那 3 个月后，我们怎么知道这事成了没有？' },
      prompt: '你定的目标是？',
      options: [
        { id: 'awareness', label: '提升品牌在高校人群中的知名度和美誉度' },
        { id: 'volume', label: '3 个月卖出 10 万瓶，品牌认知度达到 30%' },
        { id: 'trial', label: '12 周内，重点高校拿到 8% 试用率、30% 的四周复购率' },
        { id: 'exposure', label: '全网曝光 1,000 万次，话题阅读量破亿' },
      ],
    },
    {
      id: 'focus', type: 'multi', max: 3,
      scene: { who: '品牌经理', time: '周二 14:00', text: '50 万不多。你打算做哪些？——没选的，就写进「这次不做」。' },
      prompt: '选出你要做的事（最多 3 项）',
      options: [
        { id: 'fridge', label: '校内便利店冰柜黄金层陈列', detail: '约 3,000 元 / 店 / 月' },
        { id: 'sampling', label: '教学楼 / 图书馆下午试饮', detail: '约 2 元 / 人次' },
        { id: 'coupon', label: '试饮即送「第二瓶半价」' },
        { id: 'kol', label: '抖音 / 小红书校园达人种草', detail: '单条 0.5–3 万元' },
        { id: 'ambassador', label: '校园大使与社团合作' },
        { id: 'popup', label: '快闪店与品牌联名' },
      ],
    },
    {
      id: 'budget', type: 'allocate', total: 50, unit: ' 万',
      scene: { who: '你', time: '周三', text: '把 50 万分下去。每一笔钱，都要能说清它对应漏斗的哪一环。' },
      prompt: '分配 50 万预算',
      options: [
        { id: 'see', label: '看见 · 冰柜陈列' },
        { id: 'try', label: '第一口 · 试饮' },
        { id: 'repeat', label: '第二瓶 · 复购券' },
        { id: 'online', label: '线上声量 · 达人 / 社媒' },
        { id: 'events', label: '线下活动 · 大使 / 快闪' },
        { id: 'buffer', label: '机动' },
      ],
    },
    {
      id: 'stoploss', type: 'choose',
      scene: { who: '品牌经理', time: '周四', text: '最后一个问题：如果跑到一半发现不对，你怎么办？' },
      prompt: '你的止损方案是？',
      options: [
        { id: 'none', label: '方案已经充分论证，执行到底，结束后统一复盘' },
        { id: 'monthly', label: '每月复盘一次，根据数据灵活优化投放' },
        { id: 'lines', label: '第 4 周试用率 < 3% 就停地推转买赠；第 8 周复购率 < 15% 就判定场景不成立、停止续费' },
        { id: 'more', label: '如果销量不达标，申请追加预算加大投放' },
      ],
    },
    { id: 'final', type: 'text', scene: { who: '品牌经理', time: '周五 09:00', text: '一页纸给我吧。' }, prompt: '写下你的一页纸提案（不超过 600 字）', placeholder: '洞察、目标、策略（含不做什么）、预算、衡量与止损……' },
  ],
};

export const EXPERT_TRACE_B: SimTrace = {
  insight: 'moment', goal: 'trial', focus: ['fridge', 'sampling', 'coupon'],
  budget: { see: 32, try: 8, repeat: 6, online: 0, events: 0, buffer: 4 }, stoploss: 'lines',
  final: '洞察：「下午第三节课眼皮打架，想喝口带气的醒醒神，可一想到奶茶那半杯糖就算了。」\n目标：12 周内，重点 12 所高校 8% 试用率，四周复购 30%。\n策略：只打「下午犯困 × 校内便利店冰柜」。不做达人投放、校园大使、快闪联名，也不做另外 8 所高校——50 万撑不起线上声量，第一口必须发生在离冰柜 5 米以内。\n预算：陈列 32 万（看见）、试饮 8 万（第一口）、半价券 6 万（第二瓶）、机动 4 万。单个试用成本远高于单瓶毛利，这笔钱买的是「这个场景成不成立」的答案。\n止损：第 4 周试用率 < 3% 停地推转买赠；第 8 周复购 < 15% 判定场景不成立，停止续费并出复盘。',
};

export const TRACES_B: Record<string, SimTrace> = {
  '赵可心（化名）': { insight: 'moment', goal: 'trial', focus: ['fridge', 'sampling', 'coupon'], budget: { see: 22, try: 16, repeat: 8, online: 0, events: 0, buffer: 4 }, stoploss: 'monthly' },
  '王梓航（化名）': { insight: 'trend', goal: 'awareness', focus: ['kol', 'ambassador', 'popup'], budget: { see: 10, try: 0, repeat: 0, online: 25, events: 15, buffer: 0 }, stoploss: 'none' },
  'AI 裸答': { insight: 'novelty', goal: 'volume', focus: ['fridge', 'sampling', 'kol'], budget: { see: 18, try: 12, repeat: 0, online: 12, events: 6, buffer: 2 }, stoploss: 'monthly' },
  'AI + 专家技能': { insight: 'moment', goal: 'trial', focus: ['fridge', 'sampling', 'coupon'], budget: { see: 32, try: 8, repeat: 6, online: 0, events: 0, buffer: 4 }, stoploss: 'lines' },
};

export const EXPERT_WHY_B: Record<string, string> = {
  insight: '四句话听起来都对，你为什么只认第二句？',
  focus: '达人种草现在这么火，你一分钱都不投，不怕没声量吗？',
  stoploss: '方案还没开始就写什么时候认输，为什么？',
};

// ════════════════ C：真空熔炼浇注 · 虚拟工位（设备操作被逐拍采集） ════════════════
/**
 * 和 A / B 的区别：中间那一步不是选选项，而是一台数字模拟的设备。
 * 每一次拨动、每一次越线、每一个目标达成、每 5 秒一张面板快照（数字工位的「俯拍镜头」）都进事件流，
 * 评分看的是过程——先后顺序、温度窗口、违规——而不只是最后那段总结。
 */
export const SIM_C: Sim = {
  title: '熔炼浇注操作台 · 涡轮叶片试制',
  intro: '你坐在精密铸造工艺工程师的工位上。一炉高温合金、一组涡轮叶片模壳——这次中间那一步不是选选项，是真的把设备开起来。每一次拨动都会被记录。',
  // 沉浸模式美术（通义万相生成，见 scripts/gen-image.mjs / chroma-key.mjs）：全景 + 各步场景 + NPC 立绘
  art: {
    cover: '/lab/casting_hall.jpg',
    scenes: { check: '/lab/casting_hall.jpg', bench: '/lab/bench_casting.jpg', defect: '/lab/casting_inspect.jpg', fix: '/lab/casting_hall.jpg', final: '/lab/casting_office.jpg' },
    npcs: { '车间主任': '/lab/npc_supervisor.png', '检验员': '/lab/npc_inspector.png' },
  },
  steps: [
    {
      id: 'check', type: 'multi', max: 3,
      scene: { who: '车间主任', time: '周二 08:10', text: '新叶片首批试制，今天浇第一炉。开炉前你要核对什么？半小时内说清楚。' },
      prompt: '开炉前你先核对哪些？（最多 3 项）',
      options: [
        { id: 'shell_bake', label: '模壳焙烧记录与出炉温度', detail: '焙烧炉记录单' },
        { id: 'charge', label: '母合金炉料牌号、批次与重量', detail: '合金入库单 + 配料单' },
        { id: 'leak', label: '炉体真空检漏（压升率）', detail: '上一炉的压升率记录' },
        { id: 'sim', label: '重新跑一遍 ProCAST 充型模拟' },
        { id: 'drawing', label: '复核叶片图纸尺寸公差' },
        { id: 'schedule', label: '确认后续机加工排期' },
      ],
    },
    {
      id: 'bench', type: 'bench', bench: BENCH_CASTING,
      scene: { who: '车间主任', time: '09:00', text: '工位交给你。抽真空、烤模壳、化料、保温、浇注、停机——整段过程系统都会记下来，我下午看记录。' },
      prompt: '在虚拟工位上完成这一炉的熔炼与浇注',
    },
    {
      id: 'defect', type: 'classify',
      scene: { who: '检验员', time: '周三 10:30', text: '隔壁班组昨天浇的首批 12 片叶片，X 光和荧光结果出来了：4 片叶身有冷隔纹，2 片榫头厚大处有缩松，其余合格。他们的记录显示浇注温度 1 475℃、模壳出炉到浇注隔了 4 分钟。' },
      prompt: '逐个判断这些因素与本批缺陷的关系',
      labels: [{ id: 'cause', label: '主因', tone: 'hot' }, { id: 'minor', label: '次要' }, { id: 'no', label: '无关', tone: 'cold' }],
      options: [
        { id: 'pour_temp', label: '浇注温度与模壳温度偏低', detail: '冷隔的典型来源' },
        { id: 'gating', label: '浇注系统与冒口补缩设计', detail: '榫头厚大部位' },
        { id: 'vac', label: '真空度不足导致氧化夹杂' },
        { id: 'alloy', label: '母合金化学成分超差' },
        { id: 'operator', label: '操作工责任心不强' },
      ],
    },
    {
      id: 'fix', type: 'multi', max: 2,
      scene: { who: '车间主任', time: '周三 14:00', text: '下一炉周五浇。工艺上你打算改哪两处？' },
      prompt: '下一炉的工艺调整（最多 2 项）',
      options: [
        { id: 'raise_temp', label: '浇注温度目标提到 1 540–1 560℃，模壳出炉到浇注压缩到 60 秒内' },
        { id: 'riser', label: '榫头处加冒口 / 改冷铁，ProCAST 复算补缩' },
        { id: 'all_temp', label: '整体把熔炼温度提高 100℃，确保充型' },
        { id: 'slow_pour', label: '放慢浇注速度，减少卷气' },
        { id: 'change_alloy', label: '换一批母合金再试' },
        { id: 'blame', label: '对操作工进行批评教育并加强培训' },
      ],
    },
    { id: 'final', type: 'text', scene: { who: '车间主任', time: '周四 17:00', text: '把你这一炉写成工艺总结，周五评审会上讲。' }, prompt: '写下你的工艺总结（不超过 500 字）', placeholder: '本炉关键参数与先后顺序、缺陷与原因、下一炉调整、需要评审确认的风险……' },
  ],
};

/** 专家在虚拟工位上的轨迹：灌入时由专家脚本在模拟器里跑出来（确定性的） */
const BENCH_EXPERT = simulateScript(BENCH_CASTING, CASTING_EXPERT_SCRIPT, 800);
const benchRun = (key: keyof typeof CASTING_SCRIPTS) => { const s = CASTING_SCRIPTS[key]; return simulateScript(BENCH_CASTING, s, Math.max(...s.map(a => a.t)) + 40); };

export const EXPERT_TRACE_C: SimTrace = {
  check: ['shell_bake', 'charge', 'leak'],
  bench: BENCH_EXPERT,
  defect: { pour_temp: 'cause', gating: 'cause', vac: 'minor', alloy: 'no', operator: 'no' },
  fix: ['raise_temp', 'riser'],
  final: '本炉顺序：电源 → 模壳预热炉 → 关门抽真空，真空到 10 Pa 以下才给功率；功率 30% → 60% → 100% 分三级升，避免冷坩埚热冲击；1 500℃ 附近把功率降到 64% 让炉温在 1 520–1 580℃ 稳住，保温 60 秒（脱气 + 均温）后在 1 540℃ 浇注，模壳 980℃。浇注后功率归零、停泵、断电，全程无违规。\n\n隔壁班组的冷隔和缩松是两回事：冷隔来自 1 475℃ 浇注 + 模壳等了 4 分钟，温度窗口没守住；榫头缩松是补缩问题，和浇注温度关系不大，得改冒口 / 冷铁并用 ProCAST 复算。\n\n下一炉：浇注目标 1 540–1 560℃，模壳出炉到浇注 60 秒内；榫头加冒口后复算。风险：功率台阶如果按新人习惯一上来满功率，坩埚寿命会明显缩短，建议把三级升温写进作业指导书。',
};

export const TRACES_C: Record<string, SimTrace> = {
  '孟昭宇（化名）': { check: ['shell_bake', 'charge', 'sim'], bench: benchRun('careful_rookie'), defect: { pour_temp: 'cause', gating: 'minor', vac: 'minor', alloy: 'no', operator: 'no' }, fix: ['raise_temp', 'slow_pour'] },
  '李承泽（化名）': { check: ['drawing', 'sim', 'schedule'], bench: benchRun('careless_rookie'), defect: { pour_temp: 'minor', gating: 'no', vac: 'minor', alloy: 'cause', operator: 'cause' }, fix: ['all_temp', 'blame'] },
  'AI 裸答': { check: ['shell_bake', 'charge', 'sim'], bench: benchRun('ai_bare'), defect: { pour_temp: 'cause', gating: 'cause', vac: 'minor', alloy: 'minor', operator: 'no' }, fix: ['all_temp', 'riser'] },
  'AI + 专家技能': { check: ['shell_bake', 'charge', 'leak'], bench: benchRun('ai_skill'), defect: { pour_temp: 'cause', gating: 'cause', vac: 'minor', alloy: 'no', operator: 'no' }, fix: ['raise_temp', 'riser'] },
};

export const EXPERT_WHY_C: Record<string, string> = {
  check: '图纸和排期你一眼没看，为什么先看检漏记录？',
  bench: '1 500℃ 的时候你为什么把功率从 100 降到 64，而不是直接冲到 1 560 再降？',
  defect: '两种缺陷出在同一炉，你为什么坚持是两个不相干的原因？',
};

// ════════════════ D：气保焊平板对接 · 一维「沿焊缝行走」工位（正面摄像头也能接） ════════════════
export const SIM_D: Sim = {
  title: '焊接操作台 · 平板对接试板',
  intro: '你坐在焊接工艺工程师的工位上。今天先亲手焊一块试板——顺序、参数、行走速度全被记录，明天检验结果出来再归因。',
  art: {
    cover: '/lab/bench_weld.jpg',
    scenes: { prep: '/lab/bench_weld.jpg', bench: '/lab/bench_weld.jpg', defect: '/lab/casting_inspect.jpg', fix: '/lab/bench_weld.jpg', final: '/lab/casting_office.jpg' },
    npcs: { '焊接班组长': '/lab/npc_welder.png', '质检员': '/lab/npc_inspector.png' },
  },
  steps: [
    {
      id: 'prep', type: 'multi', max: 3,
      scene: { who: '焊接班组长', time: '周一 08:30', text: '新来的工艺员先上手焊一块试板，6 mm 板对接，CO₂ 气保焊。焊之前你先查什么？' },
      prompt: '起弧前先核对哪些？（最多 3 项）',
      options: [
        { id: 'gas', label: '气瓶压力与流量计（15–20 L/min）', detail: '气不够就是气孔' },
        { id: 'clean', label: '坡口两侧 20 mm 内的油污、铁锈打磨干净' },
        { id: 'ground', label: '地线夹紧在工件上，导电嘴、喷嘴无飞溅堵塞' },
        { id: 'wire', label: '换一盘新焊丝' },
        { id: 'drawing', label: '复核图纸的整体尺寸公差' },
        { id: 'overtime', label: '申请加班把明天的活也焊了' },
      ],
    },
    {
      id: 'bench', type: 'bench', bench: BENCH_WELD,
      scene: { who: '焊接班组长', time: '09:00', text: '焊枪给你。开气、调参数、起弧、走完、收弧、关机——速度稳住，别停。系统会把你每一下都记下来。' },
      prompt: '在虚拟工位上焊完这条 200 mm 焊缝',
    },
    {
      id: 'defect', type: 'classify',
      scene: { who: '质检员', time: '周二 10:00', text: '昨天另一位新人焊的试板外观和 X 光结果出来了：起弧段 30 mm 有密集气孔，中段有一处烧穿，收尾 40 mm 未焊透。记录显示保护气在起弧后 8 秒才打开，中途停顿约 4 秒，末段行走速度超过 9 mm/s。' },
      prompt: '逐个判断这些因素与该试板缺陷的关系',
      labels: [{ id: 'cause', label: '主因', tone: 'hot' }, { id: 'minor', label: '次要' }, { id: 'no', label: '无关', tone: 'cold' }],
      options: [
        { id: 'gas_late', label: '保护气晚开 / 流量不足', detail: '起弧段气孔' },
        { id: 'stall', label: '焊枪中途停顿', detail: '中段烧穿' },
        { id: 'fast', label: '末段行走过快', detail: '未焊透' },
        { id: 'wire_brand', label: '焊丝牌号' },
        { id: 'attitude', label: '焊工责任心不强' },
      ],
    },
    {
      id: 'fix', type: 'multi', max: 2,
      scene: { who: '焊接班组长', time: '周二 14:00', text: '下一块试板明天焊。工艺上你打算改哪两处？' },
      prompt: '下一块试板的工艺调整（最多 2 项）',
      options: [
        { id: 'pregas', label: '起弧前提前送气 2 秒，流量核到 15–20 L/min' },
        { id: 'speed', label: '行走速度控制在 4–6 mm/s，要停就先收弧再停' },
        { id: 'current_up', label: '电流整体提高 60 A 保证熔透' },
        { id: 'voltage_up', label: '电压拉到 30 V 让电弧更稳' },
        { id: 'wire_change', label: '换一个品牌的焊丝' },
        { id: 'blame', label: '对焊工进行批评教育' },
      ],
    },
    { id: 'final', type: 'text', scene: { who: '焊接班组长', time: '周三 17:00', text: '把你这块试板写成一页工艺记录，周五工艺评审要用。' }, prompt: '写下你的工艺记录（不超过 400 字）', placeholder: '顺序、电流电压、行走速度、出现的问题、下一块怎么改……' },
  ],
};

const WELD_EXPERT = simulateScript(BENCH_WELD, WELD_EXPERT_SCRIPT, 60);
const weldRun = (key: keyof typeof WELD_SCRIPTS) => { const s = WELD_SCRIPTS[key]; return simulateScript(BENCH_WELD, s, Math.max(...s.map(a => a.t)) + 20); };

export const EXPERT_TRACE_D: SimTrace = {
  prep: ['gas', 'clean', 'ground'],
  bench: WELD_EXPERT,
  defect: { gas_late: 'cause', stall: 'cause', fast: 'cause', wire_brand: 'no', attitude: 'no' },
  fix: ['pregas', 'speed'],
  final: '顺序：电源 → 保护气 → 电流 180 A / 电压 22 V → 起弧 → 5 mm/s 匀速走完 200 mm → 收弧 → 断电、关气。全程无停顿、无过快段、起弧前有气，热输入约 0.8 kJ/mm。\n\n昨天那块试板的三处缺陷是三个动作：气晚开 8 秒 → 起弧段气孔；中途停 4 秒 → 烧穿；末段 9 mm/s → 未焊透。和焊丝牌号、责任心无关，是动作没练到位。\n\n下一块：起弧前提前送气 2 秒并核流量；速度守在 4–6 mm/s，要停先收弧。风险：新人容易用「提高电流」去补速度快造成的未焊透，会把咬边带进来，评审时要说明。',
};

export const TRACES_D: Record<string, SimTrace> = {
  '孙一帆（化名）': { prep: ['gas', 'clean', 'wire'], bench: weldRun('forgot_gas'), defect: { gas_late: 'cause', stall: 'cause', fast: 'minor', wire_brand: 'no', attitude: 'no' }, fix: ['pregas', 'current_up'] },
  '周天佑（化名）': { prep: ['drawing', 'wire', 'overtime'], bench: weldRun('fast_and_stall'), defect: { gas_late: 'minor', stall: 'no', fast: 'minor', wire_brand: 'cause', attitude: 'cause' }, fix: ['current_up', 'blame'] },
  'AI 裸答': { prep: ['gas', 'clean', 'ground'], bench: weldRun('ai_bare'), defect: { gas_late: 'cause', stall: 'cause', fast: 'cause', wire_brand: 'minor', attitude: 'no' }, fix: ['pregas', 'current_up'] },
  'AI + 专家技能': { prep: ['gas', 'clean', 'ground'], bench: weldRun('ai_skill'), defect: { gas_late: 'cause', stall: 'cause', fast: 'cause', wire_brand: 'no', attitude: 'no' }, fix: ['pregas', 'speed'] },
};

export const EXPERT_WHY_D: Record<string, string> = {
  prep: '换新焊丝你为什么不勾？一盘用到一半的焊丝不会有问题吗？',
  bench: '你起弧前特意等了两秒才动枪，为什么？',
  fix: '末段未焊透，为什么不直接把电流提上去？',
};

// ════════════════ E：意式奶咖拉花 · 三台轨迹工位（心形 / 郁金香 / 树叶）════════════════
/**
 * 这个空间里三步是真的上手：奶缸沿着轨迹走，鼠标拖或者打开摄像头捧住拇指和食指用手走。
 * 奶缸压得多低、流量多大、离轨迹多远，每一下都实时变成杯子里的图案——走歪了就是歪的，不需要老师在旁边说。
 */
export const SIM_E: Sim = {
  title: '拉花操作台 · 三个图案',
  intro: '你站在精品咖啡馆的吧台后面。今天不考理论——先把奶打好，再把心形、郁金香、树叶各拉一杯。奶缸要沿着轨迹走，每一下都会落在杯里。',
  art: {
    cover: '/lab/latte_cafe.jpg',
    scenes: { prep: '/lab/latte_cafe.jpg', heart: '/lab/latte_bar.jpg', tulip: '/lab/latte_bar.jpg', rosetta: '/lab/latte_bar.jpg', defect: '/lab/latte_judge.jpg', fix: '/lab/latte_bar.jpg', final: '/lab/latte_cafe.jpg' },
    npcs: { '主理人老陈': '/lab/npc_barista.png', '出品督导 Yuki': '/lab/npc_trainer.png' },
  },
  steps: [
    {
      id: 'prep', type: 'multi', max: 3,
      scene: { who: '主理人老陈', time: '周一 07:40', text: '今天让你站吧。开单之前，你先查什么？别给我背流程，说你真会动手的那几项。' },
      prompt: '出第一杯之前先核对哪几项？（最多 3 项）',
      options: [
        { id: 'shot', label: '试一支浓缩：粉量 20 g、液重 40 g、25–30 秒', detail: '豆子每天状态不一样' },
        { id: 'milk', label: '牛奶是不是 4℃ 冷藏、开封没超过一天', detail: '奶温起点决定你有多少时间打发' },
        { id: 'wand', label: '蒸汽棒排冷凝水、喷嘴孔没堵', detail: '堵了就打不出漩涡' },
        { id: 'cup', label: '杯子预热', detail: '冷杯会把温度和图案一起吃掉' },
        { id: 'poster', label: '把今天的新品海报摆到门口' },
        { id: 'forecast', label: '看一眼今天的客流预估和排班' },
      ],
    },
    {
      id: 'heart', type: 'bench', bench: BENCH_LATTE_HEART,
      scene: { who: '主理人老陈', time: '08:00', text: '吧台交给你。先打奶：进气就那几秒，40℃ 之前停手，63℃ 关汽。然后高位融合、压低出图、收细穿过——先给我一颗心。' },
      prompt: '在拉花工位上蒸好奶，拉出一颗心',
    },
    {
      id: 'tulip', type: 'bench', bench: BENCH_LATTE_TULIP,
      scene: { who: '主理人老陈', time: '08:25', text: '奶我帮你打好了。郁金香考的不是手稳，是你敢不敢停——推一瓣就把流量收掉、把奶缸退回来。不断流，三瓣就是一坨。' },
      prompt: '在拉花工位上推出三瓣郁金香',
    },
    {
      id: 'rosetta', type: 'bench', bench: BENCH_LATTE_ROSETTA,
      scene: { who: '主理人老陈', time: '08:45', text: '最后一杯树叶。摆快了叶片糊成一条，摆歪了整片叶子是斜的。跟着那个绿点走，它的速度就是我的速度。' },
      prompt: '在拉花工位上匀速摆出一片树叶',
    },
    {
      id: 'defect', type: 'classify',
      scene: { who: '出品督导 Yuki', time: '周二 10:30', text: '昨天晚班新人出的三杯被客人退了，图我拍下来了：第一杯白色发灰、和咖啡没对比；第二杯表面一层大泡，一勺子下去是空的；第三杯心歪在杯壁上。他的记录：关汽 71℃，进气一直进到 50℃，注入全程奶缸抬得老高。' },
      prompt: '逐个判断这些因素和这三杯的关系',
      labels: [{ id: 'cause', label: '主因', tone: 'hot' }, { id: 'minor', label: '次要' }, { id: 'no', label: '无关', tone: 'cold' }],
      options: [
        { id: 'high', label: '全程奶缸抬得太高，没压低', detail: '白色没浮上来' },
        { id: 'air_late', label: '50℃ 了还在进气', detail: '表面大泡、下面是空的' },
        { id: 'temp', label: '关汽温度 71℃', detail: '奶蛋白变性' },
        { id: 'center', label: '注入点没在杯心、轴线走歪' },
        { id: 'bean', label: '豆子烘焙度不对' },
        { id: 'attitude', label: '新人态度不认真' },
      ],
    },
    {
      id: 'fix', type: 'multi', max: 2,
      scene: { who: '主理人老陈', time: '周二 14:00', text: '晚班还是他。你只能给他两句话，说哪两句？' },
      prompt: '你给晚班新人的两条指令（最多 2 项）',
      options: [
        { id: 'air_stop', label: '进气只在 40℃ 以前，听不到“滋滋”就把棒子埋深；手摸奶缸烫手就关汽' },
        { id: 'drop', label: '融合完把奶缸压到贴着液面再加流量，白色才会浮上来' },
        { id: 'slow', label: '整体慢一点，慢就不会错' },
        { id: 'more_milk', label: '多打一点奶泡，泡厚了图案更清楚' },
        { id: 'change_bean', label: '换一支拼配豆' },
        { id: 'blame', label: '把退单费用从他工资里扣' },
      ],
    },
    { id: 'final', type: 'text', scene: { who: '出品督导 Yuki', time: '周三 18:00', text: '把你这三杯写成一页出品笔记，下周新人培训要用。' }, prompt: '写下你的出品笔记（不超过 400 字）', placeholder: '蒸奶的温度与进气窗口、融合与压低的时机、三个图案各自考什么、退单那三杯怎么改……' },
  ],
};

const HEART_RUN = simulateScript(BENCH_LATTE_HEART, HEART_EXPERT_SCRIPT, 120);
const TULIP_RUN = simulateScript(BENCH_LATTE_TULIP, TULIP_EXPERT_SCRIPT, 90);
const ROSETTA_RUN = simulateScript(BENCH_LATTE_ROSETTA, ROSETTA_EXPERT_SCRIPT, 75);
const latteRun = (spec: any, s: any[]) => simulateScript(spec, s, Math.max(...s.map(a => a.t)) + 12);

export const EXPERT_TRACE_E: SimTrace = {
  prep: ['shot', 'milk', 'wand'],
  heart: HEART_RUN, tulip: TULIP_RUN, rosetta: ROSETTA_RUN,
  defect: { high: 'cause', air_late: 'cause', temp: 'minor', center: 'minor', bean: 'no', attitude: 'no' },
  fix: ['air_stop', 'drop'],
  final: '三杯的顺序都一样：蒸奶 → 高位融合 → 压低出图 → 收细穿过。蒸奶开汽后进气五秒到 0.8 cm 就停（40℃ 之前），63℃ 关汽；融合奶缸抬到 5 cm、细水绕杯心两圈约 16 秒，让奶沉到咖啡下面；然后一下子压到 1 cm、流量加到 70%，白色才会浮上来；最后流量收到 25%、奶缸提起来穿。\n\n三个图案各考一件事：心形考「敢不敢压低」；郁金香考「敢不敢断流」——每推一瓣就把流量收掉再退回来，不断流三瓣就糊成一坨；树叶考节奏，摆得匀比摆得快重要，我全程跟着引导点走。\n\n退单那三杯是两个动作错了：50℃ 还在进气 → 表面大泡、下面是空的；全程没压低 → 奶沉底，白色发灰。和豆子、态度都没关系。晚班就给两句：进气只在 40℃ 以前；融合完必须压到贴着液面。别让他「慢一点」——慢不解决任何一个问题。',
};

export const TRACES_E: Record<string, SimTrace> = {
  '林舒窈（化名）': {
    prep: ['shot', 'milk', 'cup'],
    heart: latteRun(BENCH_LATTE_HEART, HEART_SCRIPTS.shy_rookie), tulip: latteRun(BENCH_LATTE_TULIP, TULIP_SCRIPTS.shaky), rosetta: latteRun(BENCH_LATTE_ROSETTA, ROSETTA_SCRIPTS.wobbly),
    defect: { high: 'cause', air_late: 'minor', temp: 'cause', center: 'minor', bean: 'no', attitude: 'no' }, fix: ['air_stop', 'slow'],
  },
  '郭小满（化名）': {
    prep: ['poster', 'forecast', 'cup'],
    heart: latteRun(BENCH_LATTE_HEART, HEART_SCRIPTS.burnt_milk), tulip: latteRun(BENCH_LATTE_TULIP, TULIP_SCRIPTS.no_break), rosetta: latteRun(BENCH_LATTE_ROSETTA, ROSETTA_SCRIPTS.too_fast),
    defect: { high: 'minor', air_late: 'no', temp: 'minor', center: 'no', bean: 'cause', attitude: 'cause' }, fix: ['change_bean', 'more_milk'],
  },
  'AI 裸答': {
    prep: ['shot', 'milk', 'wand'],
    heart: latteRun(BENCH_LATTE_HEART, HEART_SCRIPTS.ai_bare), tulip: latteRun(BENCH_LATTE_TULIP, TULIP_SCRIPTS.ai_bare), rosetta: latteRun(BENCH_LATTE_ROSETTA, ROSETTA_SCRIPTS.ai_bare),
    defect: { high: 'cause', air_late: 'cause', temp: 'cause', center: 'minor', bean: 'minor', attitude: 'no' }, fix: ['air_stop', 'more_milk'],
  },
  'AI + 专家技能': {
    prep: ['shot', 'milk', 'wand'],
    heart: latteRun(BENCH_LATTE_HEART, HEART_SCRIPTS.ai_skill), tulip: latteRun(BENCH_LATTE_TULIP, TULIP_SCRIPTS.ai_skill), rosetta: latteRun(BENCH_LATTE_ROSETTA, ROSETTA_SCRIPTS.ai_skill),
    defect: { high: 'cause', air_late: 'cause', temp: 'minor', center: 'minor', bean: 'no', attitude: 'no' }, fix: ['air_stop', 'drop'],
  },
};

export const EXPERT_WHY_E: Record<string, string> = {
  prep: '杯子预热你没勾，冷杯不是一样会把图案吃掉吗？',
  heart: '融合那十几秒你一直抬着奶缸不动手，客人还在等，为什么不早点压下去？',
  tulip: '你每推一瓣都把流量收到 0，不怕断层吗？',
  defect: '三杯三个样子，你为什么说其实只是两个动作错了？',
};

// ════════════════ F：急诊外科 · 清创缝合（手上动作 · 轨迹工位）════════════════
/**
 * 缝合本身就是「沿着一条线一针一针走」，所以中间那一步是真的拿起持针器：
 * 边距、深度、张力三个旋钮加上手离轨迹的距离，决定创缘对合得好不好——走到哪儿，伤口就合到哪儿。
 * 工艺参数为教学化的简化模型，用于演示过程采集与评估，不构成任何医疗指导。
 */
export const SIM_F: Sim = {
  title: '急诊清创缝合台 · 前臂裂伤',
  intro: '你是外科规培第一年的住院医师。今晚急诊夜班，来了一位前臂裂伤的患者。从接诊判断到亲手缝完八针，每一步都会被记录。',
  art: {
    cover: '/lab/er_room.jpg',
    scenes: { triage: '/lab/er_room.jpg', decide: '/lab/er_room.jpg', prep: '/lab/er_room.jpg', bench: '/lab/surgery_field.jpg', defect: '/lab/or_hall.jpg', orders: '/lab/er_room.jpg', final: '/lab/or_hall.jpg' },
    npcs: { '带教主治': '/lab/npc_surgeon.png', '器械护士': '/lab/npc_nurse.png' },
  },
  steps: [
    {
      id: 'triage', type: 'multi', max: 3,
      scene: { who: '带教主治', time: '周五 21:40', text: '32 岁男性，两小时前在家切菜被玻璃碗划伤右前臂，自行用毛巾压迫后来院。伤口大概 6 cm。你先问什么、查什么？别背教科书，说你今晚真要确认的三件事。' },
      prompt: '接诊时你优先确认哪三项？（最多 3 项）',
      options: [
        { id: 'time', label: '确切受伤时间与致伤物（玻璃／金属／动物咬伤）', detail: '决定还能不能一期缝合' },
        { id: 'neuro', label: '远端感觉、运动与血运：手指能否屈伸、指端血色', detail: '肌腱神经血管有没有断' },
        { id: 'tetanus', label: '破伤风免疫史：全程免疫过吗、末次加强多久了' },
        { id: 'contam', label: '伤口污染程度与异物（玻璃碴残留）' },
        { id: 'allergy', label: '麻醉药过敏史与基础疾病（糖尿病、抗凝药）' },
        { id: 'xray', label: '先开一张前臂正侧位 X 光' },
      ],
    },
    {
      id: 'decide', type: 'choose',
      scene: { who: '带教主治', time: '21:55', text: '查完了：伤后 2 小时，玻璃割伤，边缘整齐，深达皮下未及肌腱，手指活动与感觉正常，指端血运好，创面可见两粒细小玻璃碴。破伤风十年前打过，之后没加强。他问你：医生，这要缝吗？' },
      prompt: '你的处置决定是？',
      options: [
        { id: 'primary', label: '彻底清创取出异物后一期缝合——伤后 2 小时、边缘整齐、无深部结构损伤，在黄金期内' },
        { id: 'delay', label: '只做清创和湿敷，三天后观察无感染再延期缝合' },
        { id: 'strip', label: '不缝，用免缝胶带拉合即可' },
        { id: 'refer', label: '转手外科专科处理' },
      ],
    },
    {
      id: 'prep', type: 'multi', max: 2,
      scene: { who: '器械护士', time: '22:05', text: '清创包开好了。麻醉和冲洗你打算怎么做？我好准备东西。' },
      prompt: '麻醉与清创，你交代哪两件？（最多 2 项）',
      options: [
        { id: 'lido', label: '1% 利多卡因局部浸润，从创缘内侧进针、回抽无血再推药', detail: '注意总量上限' },
        { id: 'irrigate', label: '生理盐水大量加压冲洗（不少于 500–1000 ml），逐粒取净玻璃碴' },
        { id: 'excise', label: '把整条创缘都修剪掉 3 mm 做成新鲜切口', detail: '边缘本来就整齐' },
        { id: 'adrenaline', label: '利多卡因里加肾上腺素以减少出血' },
        { id: 'h2o2', label: '双氧水反复冲洗创面消毒' },
        { id: 'abx', label: '先静脉给一剂广谱抗生素' },
      ],
    },
    {
      id: 'bench', type: 'bench', bench: BENCH_SUTURE,
      scene: { who: '带教主治', time: '22:20', text: '持针器给你。八针间断缝合：距创缘五毫米进针、穿透真皮全层、打结只求对合不求勒紧。我在旁边看着，每一针系统都记。' },
      prompt: '在清创缝合工位上缝完这道 6 cm 裂伤',
    },
    {
      id: 'defect', type: 'classify',
      scene: { who: '带教主治', time: '次周三 10:00', text: '上周另一位规培医师缝的三个伤口，复诊结果出来了：一个缝线从创缘撕脱、伤口裂开；一个皮下积液继发感染；一个愈合了但疤特别宽。他的记录：边距 3 mm、进针深度 2 mm、打结「怕崩开所以都勒紧了」。逐条判断。' },
      prompt: '把这三种结局分别对到具体动作上',
      labels: [{ id: 'cause', label: '主因', tone: 'hot' }, { id: 'minor', label: '次要' }, { id: 'no', label: '无关', tone: 'cold' }],
      options: [
        { id: 'bite', label: '边距只有 3 mm', detail: '缝线撕脱、伤口裂开' },
        { id: 'shallow', label: '进针深度 2 mm，没穿透真皮全层', detail: '皮下留死腔' },
        { id: 'tight', label: '每一针都勒紧', detail: '组织缺血' },
        { id: 'suture_brand', label: '缝线品牌与型号' },
        { id: 'care', label: '患者没有按时换药' },
        { id: 'attitude', label: '规培医师态度不端正' },
      ],
    },
    {
      id: 'orders', type: 'multi', max: 3,
      scene: { who: '带教主治', time: '22:50', text: '缝完了。术后医嘱你开哪几条？' },
      prompt: '术后处置（最多 3 项）',
      options: [
        { id: 'tat', label: '破伤风类毒素加强一针（十年前全程免疫、已超 5 年，清洁伤口）' },
        { id: 'dress', label: '48 小时内保持敷料干燥，之后每日换药观察' },
        { id: 'remove', label: '10–14 天拆线（前臂），并交代拆线后 3 个月防晒减轻瘢痕' },
        { id: 'abx_all', label: '常规口服抗生素一周预防感染' },
        { id: 'tig', label: '同时注射破伤风免疫球蛋白' },
        { id: 'rest', label: '患肢制动一周，禁止一切活动' },
      ],
    },
    { id: 'final', type: 'text', scene: { who: '带教主治', time: '23:10', text: '写清创缝合记录，明天交班要用。' }, prompt: '写下你的清创缝合记录（不超过 400 字）', placeholder: '受伤机制与时间、查体阳性与阴性发现、处置决策依据、麻醉与清创、缝合方式与针数、术后医嘱与随访……' },
  ],
};

const SUTURE_RUN = simulateScript(BENCH_SUTURE, SUTURE_EXPERT_SCRIPT, 120);
const sutureRun = (k: keyof typeof SUTURE_SCRIPTS) => { const s = SUTURE_SCRIPTS[k]; return simulateScript(BENCH_SUTURE, s, Math.max(...s.map(a => a.t)) + 15); };

export const EXPERT_TRACE_F: SimTrace = {
  triage: ['time', 'neuro', 'tetanus'],
  decide: 'primary',
  prep: ['lido', 'irrigate'],
  bench: SUTURE_RUN,
  defect: { bite: 'cause', shallow: 'cause', tight: 'cause', suture_brand: 'no', care: 'minor', attitude: 'no' },
  orders: ['tat', 'dress', 'remove'],
  final: '32 岁男性，玻璃致右前臂掌侧裂伤 6 cm，伤后 2 小时就诊。查体：创缘整齐，深达皮下，未及肌腱；各指屈伸与感觉正常，指端血运好，桡动脉搏动可及；创面见两粒细小玻璃碴。破伤风十年前全程免疫，之后未加强。\\n\\n判断：伤后 2 小时、锐器致伤、边缘整齐、无深部结构损伤，在一期缝合窗口内。1% 利多卡因自创缘内侧浸润、回抽无血后推药；生理盐水约 800 ml 加压冲洗，直视下逐粒取净玻璃碴。4-0 不可吸收线间断缝合八针：边距 5 mm、穿透真皮全层、打结以创缘平整对合为度，不勒紧。创缘对合良好，无张力性发白。\\n\\n术后：破伤风类毒素加强一针（已超 5 年、清洁伤口，无需免疫球蛋白）；清洁伤口不常规用抗生素；48 小时内敷料保持干燥，之后每日换药；10–14 天拆线，拆线后防晒三个月。\\n\\n上周那三个伤口是三个动作的事：边距 3 mm 所以撕脱裂开；进针 2 mm 没过真皮全层、皮下留死腔所以积液感染；每针都勒紧所以缺血、疤增宽。和缝线牌子、患者依从性关系不大。',
};

export const TRACES_F: Record<string, SimTrace> = {
  '沈砚之（化名）': {
    triage: ['time', 'neuro', 'contam'], decide: 'primary', prep: ['lido', 'irrigate'], bench: sutureRun('too_shallow'),
    defect: { bite: 'cause', shallow: 'minor', tight: 'cause', suture_brand: 'no', care: 'minor', attitude: 'no' }, orders: ['tat', 'dress', 'abx_all'],
  },
  '何子骞（化名）': {
    triage: ['xray', 'allergy', 'contam'], decide: 'delay', prep: ['excise', 'h2o2'], bench: sutureRun('strangled'),
    defect: { bite: 'minor', shallow: 'no', tight: 'minor', suture_brand: 'cause', care: 'cause', attitude: 'cause' }, orders: ['abx_all', 'tig', 'rest'],
  },
  'AI 裸答': {
    triage: ['time', 'neuro', 'tetanus'], decide: 'primary', prep: ['lido', 'irrigate'], bench: sutureRun('ai_bare'),
    defect: { bite: 'cause', shallow: 'cause', tight: 'cause', suture_brand: 'minor', care: 'minor', attitude: 'no' }, orders: ['tat', 'dress', 'abx_all'],
  },
  'AI + 专家技能': {
    triage: ['time', 'neuro', 'tetanus'], decide: 'primary', prep: ['lido', 'irrigate'], bench: sutureRun('ai_skill'),
    defect: { bite: 'cause', shallow: 'cause', tight: 'cause', suture_brand: 'no', care: 'minor', attitude: 'no' }, orders: ['tat', 'dress', 'remove'],
  },
};

export const EXPERT_WHY_F: Record<string, string> = {
  triage: '污染程度你一眼没勾，为什么先问破伤风？',
  decide: '创面还有玻璃碴，你凭什么敢一期缝？',
  bench: '你把张力停在 40%，不怕创缘崩开吗？',
  defect: '三个结局，你为什么说是三个动作而不是运气？',
};

// ════════════════ G：普外科 · 开腹阑尾切除（分层入腹 · 轨迹工位）════════════════
/** 开腹最见功底的不是切得快，而是每一层用对的方式打开。中间那一步是真的拿起刀和钳。
 *  全部参数为教学化的简化模型，用于演示过程采集与评估，不构成任何医疗指导。 */
export const SIM_G: Sim = {
  title: '手术台 · 开腹阑尾切除',
  intro: '你是普外科规培第二年的住院医师。今天这台急性阑尾炎由你主刀，带教教授在对面当一助。从切口选择到分层入腹，每一刀都会被记录。',
  art: {
    cover: '/lab/or_hall.jpg',
    scenes: { preop: '/lab/or_hall.jpg', incision: '/lab/or_hall.jpg', bench: '/lab/surgery_field.jpg', find: '/lab/surgery_field.jpg', defect: '/lab/er_room.jpg', orders: '/lab/or_hall.jpg', final: '/lab/or_hall.jpg' },
    npcs: { '带教教授': '/lab/npc_surgeon.png', '器械护士': '/lab/npc_nurse.png' },
  },
  steps: [
    {
      id: 'preop', type: 'multi', max: 3,
      scene: { who: '带教教授', time: '周二 09:10', text: '28 岁男性，转移性右下腹痛 18 小时，麦氏点压痛反跳痛阳性，体温 38.2℃，白细胞 14.6×10⁹/L，超声提示阑尾增粗 11 mm。今天你主刀。切皮之前，哪几件事必须落实？' },
      prompt: '切皮前你一定要做的三件事（最多 3 项）',
      options: [
        { id: 'timeout', label: '三方核查（Time-out）：患者身份、手术部位与侧别、术式', detail: '医疗核心制度' },
        { id: 'abx', label: '切皮前 30–60 分钟内给预防性抗生素' },
        { id: 'consent', label: '确认知情同意已签，含中转开腹与并发症告知' },
        { id: 'mark', label: '术前在右下腹体表标记切口' },
        { id: 'blood', label: '常规备血 400 ml' },
        { id: 'ct', label: '再加做一个腹部增强 CT' },
      ],
    },
    {
      id: 'incision', type: 'choose',
      scene: { who: '带教教授', time: '09:35', text: '麻醉好了。诊断明确、体型中等、无腹部手术史。你打算怎么进去？' },
      prompt: '你选择的切口是？',
      options: [
        { id: 'mcburney', label: '右下腹麦氏点斜切口——诊断明确的单纯阑尾炎首选，沿肌纤维方向、创伤小' },
        { id: 'rectus', label: '经右侧腹直肌切口，显露范围大、好延长' },
        { id: 'midline', label: '下腹正中切口，万一需要探查方便' },
        { id: 'lap', label: '改腹腔镜三孔法' },
      ],
    },
    {
      id: 'bench', type: 'bench', bench: BENCH_LAPAROTOMY,
      scene: { who: '带教教授', time: '09:40', text: '刀给你。记住层次：皮肤皮下用刀，腱膜沿纤维切开，肌层换钳子钝性分离——别拿刀去切，腹膜一定要提起来形成帐篷再剪，刀尖下面就是肠管。' },
      prompt: '在开腹工位上完成麦氏切口分层入腹',
    },
    {
      id: 'find', type: 'choose',
      scene: { who: '带教教授', time: '09:58', text: '腹膜打开了，切口里涌出一点浑浊渗液。阑尾没有直接露在视野里。你怎么找？' },
      prompt: '找阑尾，你的第一个动作是？',
      options: [
        { id: 'taenia', label: '先找到盲肠，沿着结肠带向盲肠顶端汇聚处追踪——三条结肠带的交汇点就是阑尾根部' },
        { id: 'blind', label: '用手指在右下腹盲目探查，摸到条索状物就提出来' },
        { id: 'extend', label: '先把切口延长 5 cm 扩大显露' },
        { id: 'convert', label: '中转开腹改正中切口探查' },
      ],
    },
    {
      id: 'defect', type: 'classify',
      scene: { who: '带教教授', time: '次周一 08:30', text: '上个月另一位规培医师的三台阑尾，术后都出了状况：一台切口感染，一台术后肠梗阻、再次手术发现小肠浆膜撕裂，一台切口血肿。他的手术记录：肌层「用电刀一路切下去比较快」、腹膜「直接剪开」、止血「出血不多就没管」。逐条判断。' },
      prompt: '把这三个并发症分别对到具体动作上',
      labels: [{ id: 'cause', label: '主因', tone: 'hot' }, { id: 'minor', label: '次要' }, { id: 'no', label: '无关', tone: 'cold' }],
      options: [
        { id: 'sharp', label: '肌层用电刀锐性切开', detail: '创面大、焦痂多、出血' },
        { id: 'blind_cut', label: '腹膜没提起就直接剪开', detail: '小肠浆膜撕裂' },
        { id: 'hemo', label: '各层止血不彻底', detail: '切口血肿' },
        { id: 'knife', label: '手术刀品牌与刀片批次' },
        { id: 'patient', label: '患者体型偏胖' },
        { id: 'luck', label: '运气不好' },
      ],
    },
    {
      id: 'orders', type: 'multi', max: 3,
      scene: { who: '带教教授', time: '10:40', text: '关腹了。术后医嘱你开哪几条？' },
      prompt: '术后处置（最多 3 项）',
      options: [
        { id: 'early', label: '术后 6 小时起床活动、早期进食，促进肠功能恢复' },
        { id: 'abx_stop', label: '单纯性阑尾炎预防性抗生素不超过 24 小时即停' },
        { id: 'watch', label: '观察体温、切口与腹部体征，警惕切口感染与腹腔脓肿' },
        { id: 'abx_week', label: '静脉抗生素用满一周' },
        { id: 'fast', label: '绝对卧床禁食三天，等排气再说' },
        { id: 'drain', label: '常规放置腹腔引流管' },
      ],
    },
    { id: 'final', type: 'text', scene: { who: '带教教授', time: '11:20', text: '手术记录你来写，我签字。' }, prompt: '写下你的手术记录（不超过 400 字）', placeholder: '术前诊断、麻醉与体位、切口与分层、术中所见、阑尾处理、冲洗止血与关腹、术后医嘱……' },
  ],
};

const LAP_RUN = simulateScript(BENCH_LAPAROTOMY, LAP_EXPERT_SCRIPT, 140);
const lapRun = (k: keyof typeof LAP_SCRIPTS) => { const s = LAP_SCRIPTS[k]; return simulateScript(BENCH_LAPAROTOMY, s, Math.max(...s.map(a => a.t)) + 15); };

export const EXPERT_TRACE_G: SimTrace = {
  preop: ['timeout', 'abx', 'consent'],
  incision: 'mcburney',
  bench: LAP_RUN,
  find: 'taenia',
  defect: { sharp: 'cause', blind_cut: 'cause', hemo: 'cause', knife: 'no', patient: 'minor', luck: 'no' },
  orders: ['early', 'abx_stop', 'watch'],
  final: '术前诊断：急性阑尾炎。全麻仰卧位，常规消毒铺巾，三方核查无误，切皮前 40 分钟已给预防性抗生素。\\n\\n取右下腹麦氏点斜切口约 5 cm：刀切开皮肤皮下至 10 mm，沿纤维方向切开腹外斜肌腱膜；腹内斜肌与腹横肌以血管钳钝性分离、拉钩牵开，不用锐性；提起腹膜形成帐篷后剪开入腹，未伤及肠管。各层逐一止血。\\n\\n入腹后见少量浑浊渗液。先找到盲肠，沿结肠带向顶端汇聚处追踪至阑尾根部，见阑尾增粗充血、表面脓苔。系膜分束结扎，根部双重结扎后切断，残端消毒。吸净渗液，检查无活动性出血，清点器械敷料无误，逐层关腹。\\n\\n术后：6 小时起床活动、早期进食；单纯性阑尾炎预防性抗生素 24 小时内停；观察体温、切口与腹部体征。\\n\\n上月那三台是三个动作的事：肌层用电刀锐切 → 创面大、焦痂多，切口感染；腹膜没提起直接剪 → 小肠浆膜撕裂、术后肠梗阻；各层止血不彻底 → 切口血肿。和刀片批次无关，体型偏胖至多是次要因素。',
};

export const TRACES_G: Record<string, SimTrace> = {
  '钟亦然（化名）': {
    preop: ['timeout', 'consent', 'mark'], incision: 'mcburney', bench: lapRun('sharp_through'), find: 'taenia',
    defect: { sharp: 'minor', blind_cut: 'cause', hemo: 'cause', knife: 'no', patient: 'minor', luck: 'no' }, orders: ['watch', 'abx_week', 'fast'],
  },
  '汪叙白（化名）': {
    preop: ['ct', 'blood', 'mark'], incision: 'midline', bench: lapRun('blind_deep'), find: 'blind',
    defect: { sharp: 'no', blind_cut: 'minor', hemo: 'no', knife: 'minor', patient: 'cause', luck: 'cause' }, orders: ['abx_week', 'fast', 'drain'],
  },
  'AI 裸答': {
    preop: ['timeout', 'abx', 'consent'], incision: 'mcburney', bench: lapRun('ai_bare'), find: 'taenia',
    defect: { sharp: 'cause', blind_cut: 'cause', hemo: 'cause', knife: 'no', patient: 'cause', luck: 'no' }, orders: ['early', 'watch', 'abx_week'],
  },
  'AI + 专家技能': {
    preop: ['timeout', 'abx', 'consent'], incision: 'mcburney', bench: lapRun('ai_skill'), find: 'taenia',
    defect: { sharp: 'cause', blind_cut: 'cause', hemo: 'cause', knife: 'no', patient: 'minor', luck: 'no' }, orders: ['early', 'abx_stop', 'watch'],
  },
};

export const EXPERT_WHY_G: Record<string, string> = {
  preop: '体表标记切口你没勾，难道不该标吗？',
  bench: '肌层你为什么非要换钳子？电刀明明更快。',
  find: '渗液都出来了，你为什么不先扩大切口看清楚？',
  defect: '三台不同的并发症，你凭什么说都是动作问题？',
};

// ════════════════ H：液氧甲烷火箭 · 造一发、试一台 ════════════════
/** 两台工位：贮箱纵缝搅拌摩擦焊（手上功夫）+ 发动机试车点火时序（时序与应急）。
 *  参数为教学化的简化模型，不代表任何型号的真实工艺或试车程序。 */
export const SIM_H: Sim = {
  title: '总装厂房 · 从一条焊缝到一次点火',
  intro: '你是商业航天公司入职第三个月的工艺员。这两周你要经手一发火箭最要命的两处：贮箱的一条纵缝，和一台发动机的第一次点火。',
  art: {
    cover: '/lab/rocket_hall.jpg',
    scenes: { weld_prep: '/lab/rocket_hall.jpg', fsw: '/lab/rocket_fsw.jpg', ndt: '/lab/rocket_hall.jpg', test_prep: '/lab/rocket_teststand.jpg', engine: '/lab/rocket_teststand.jpg', abort: '/lab/rocket_teststand.jpg', final: '/lab/rocket_hall.jpg' },
    npcs: { '试验总师': '/lab/npc_rocket_lead.png' },
  },
  steps: [
    {
      id: 'weld_prep', type: 'multi', max: 3,
      scene: { who: '试验总师', time: '周一 08:30', text: '这块 2219 壁板今天合拢。搅拌摩擦焊机已经调好了，动枪之前你先确认什么？贮箱要装几十吨低温推进剂，漏一点都不行。' },
      prompt: '起焊前你一定要确认的三件事（最多 3 项）',
      options: [
        { id: 'gap', label: '两块壁板的对缝间隙与错边量（贴合不好焊不住）' },
        { id: 'clean', label: '焊缝两侧的氧化膜与油污清理干净' },
        { id: 'tool', label: '搅拌头轴肩与针长是否匹配板厚，有无磨损' },
        { id: 'clamp', label: '工装夹紧力是否足够（焊接反力会把板顶起来）' },
        { id: 'paint', label: '确认壁板外表面的喷漆方案' },
        { id: 'schedule', label: '核对后续总装排期' },
      ],
    },
    {
      id: 'fsw', type: 'bench', bench: BENCH_FSW,
      scene: { who: '试验总师', time: '09:00', text: '机器交给你。转速、下压量先配死，主轴转起来预热几秒再走——走太快未焊透，走太慢过热飞边，下压不够根部焊不上。整条缝我都会看记录。' },
      prompt: '在贮箱工位上焊完这条纵缝',
    },
    {
      id: 'ndt', type: 'classify',
      scene: { who: '试验总师', time: '周三 14:00', text: '上一批壁板的 X 光和相控阵结果出来了：一条缝根部有连续未焊合，一条表面大量飞边且晶粒粗大，还有一条终点留了个贯穿匙孔。他们的记录：下压 0.1 mm、转速 1150 r/min 走 0.9、收尾直接停机抬头。逐条判断。' },
      prompt: '把这三种缺陷分别对到具体操作上',
      labels: [{ id: 'cause', label: '主因', tone: 'hot' }, { id: 'minor', label: '次要' }, { id: 'no', label: '无关', tone: 'cold' }],
      options: [
        { id: 'plunge', label: '下压量只有 0.1 mm', detail: '根部未焊合' },
        { id: 'heat', label: '转速拉满又走得慢，热输入过高', detail: '飞边、晶粒粗大' },
        { id: 'keyhole', label: '收尾直接停机抬头，没有回抽或引出板', detail: '终点匙孔' },
        { id: 'alloy', label: '2219 铝合金本身可焊性差' },
        { id: 'weather', label: '当天车间湿度偏高' },
      ],
    },
    {
      id: 'test_prep', type: 'multi', max: 2,
      scene: { who: '试验总师', time: '周五 07:00', text: '今天试车。80 吨级液氧甲烷，第一次整机点火。进控制间之前，哪两件必须落实？' },
      prompt: '试车前的两件事（最多 2 项）',
      options: [
        { id: 'abortline', label: '明确中止判据与红线：室压、泵前温度、振动超限谁来喊停、怎么关' },
        { id: 'purge', label: '管路吹除与气密，确认无泄漏、无残余可燃气' },
        { id: 'camera', label: '把高速摄像机位调好' },
        { id: 'weather2', label: '确认当天风向适合排放' },
        { id: 'press', label: '通知媒体准备报道首次点火' },
      ],
    },
    {
      id: 'engine', type: 'bench', bench: BENCH_ENGINE,
      scene: { who: '试验总师', time: '09:30', text: '控制台归你。记住顺序：预冷到位才开阀，燃料必须先于氧化剂——富燃启动，宁可点不着也不能富氧烧穿；升推力分台阶；关机先切氧化剂。差半秒就是两种事故。' },
      prompt: '在试车台上完成这次点火与关机',
    },
    {
      id: 'abort', type: 'choose',
      scene: { who: '试验总师', time: '09:38', text: '假设稳态跑到第 12 秒，室压突然从 98 掉到 76，推力同步下降，泵前温度正常，振动没报警。你是指挥，喊什么？' },
      prompt: '你的处置是？',
      options: [
        { id: 'abort', label: '立即按正常关机程序中止：先切氧化剂、再切燃料——掉压原因不明，不赌' },
        { id: 'throttle_up', label: '加大节流阀把室压推回去，先保住这次试车数据' },
        { id: 'wait', label: '再观察 5 秒，看是不是测量波动' },
        { id: 'emergency', label: '直接切断所有阀门与电源紧急停机' },
      ],
    },
    { id: 'final', type: 'text', scene: { who: '试验总师', time: '17:00', text: '写这两周的工艺与试车小结，明天型号例会上讲。' }, prompt: '写下你的小结（不超过 400 字）', placeholder: '焊接参数与依据、焊缝质量、试车时序与关键时刻、异常处置、下一步……' },
  ],
};

const FSW_RUN = simulateScript(BENCH_FSW, FSW_EXPERT_SCRIPT, 140);
const ENG_RUN = simulateScript(BENCH_ENGINE, ENGINE_EXPERT_SCRIPT, 110);
const fswRunT = (k: keyof typeof FSW_SCRIPTS) => { const s = FSW_SCRIPTS[k]; return simulateScript(BENCH_FSW, s, Math.max(...s.map(a => a.t)) + 20); };
const engRunT = (k: keyof typeof ENGINE_SCRIPTS) => { const s = ENGINE_SCRIPTS[k]; return simulateScript(BENCH_ENGINE, s, Math.max(...s.map(a => a.t)) + 20); };

export const EXPERT_TRACE_H: SimTrace = {
  weld_prep: ['gap', 'clean', 'tool'],
  fsw: FSW_RUN,
  ndt: { plunge: 'cause', heat: 'cause', keyhole: 'cause', alloy: 'no', weather: 'no' },
  test_prep: ['abortline', 'purge'],
  engine: ENG_RUN,
  abort: 'abort',
  final: '贮箱纵缝：2219 板厚 8 mm，转速 750 r/min、下压量 0.25 mm、匀速走完 4 米，主轴先原地预热 3 秒再起步，收尾提刀停转。热输入指数全程守在 6–13，焊缝质量 85 分，无根部未焊合。\\n\\n上一批三条缺陷是三个操作：下压 0.1 mm → 根部未焊合；转速拉满又走得慢、热输入爆表 → 飞边与晶粒粗大；收尾直接抬头 → 终点匙孔。和合金可焊性、车间湿度都没关系。\\n\\n试车：氧路预冷到 −170℃ 以下才开主阀；燃料主阀先开、1.5 秒后开氧化剂，再点火——富燃启动，宁可点不着也不能富氧烧穿头部；节流 40 → 70 → 95 三个台阶升到室压 98 bar，混合比 3.4，稳定 20 秒以上；关机先切氧化剂、再切燃料、关点火器。全程零违规。\\n\\n稳态掉压那一下，按中止处理。原因不明的掉压不赌——加节流去追室压，是把一次试车变成一次事故。',
};

export const TRACES_H: Record<string, SimTrace> = {
  '闻澈（化名）': {
    weld_prep: ['gap', 'clean', 'clamp'], fsw: fswRunT('no_preheat'), ndt: { plunge: 'cause', heat: 'cause', keyhole: 'minor', alloy: 'minor', weather: 'no' },
    test_prep: ['purge', 'camera'], engine: engRunT('rush_precool'), abort: 'wait',
  },
  '祁斯年（化名）': {
    weld_prep: ['paint', 'schedule', 'clean'], fsw: fswRunT('overheat'), ndt: { plunge: 'minor', heat: 'minor', keyhole: 'no', alloy: 'cause', weather: 'cause' },
    test_prep: ['camera', 'press'], engine: engRunT('ox_first'), abort: 'throttle_up',
  },
  'AI 裸答': {
    weld_prep: ['gap', 'clean', 'tool'], fsw: fswRunT('ai_bare'), ndt: { plunge: 'cause', heat: 'cause', keyhole: 'cause', alloy: 'minor', weather: 'no' },
    test_prep: ['abortline', 'purge'], engine: engRunT('ai_bare'), abort: 'abort',
  },
  'AI + 专家技能': {
    weld_prep: ['gap', 'clean', 'tool'], fsw: fswRunT('ai_skill'), ndt: { plunge: 'cause', heat: 'cause', keyhole: 'cause', alloy: 'no', weather: 'no' },
    test_prep: ['abortline', 'purge'], engine: engRunT('ai_skill'), abort: 'abort',
  },
};

export const EXPERT_WHY_H: Record<string, string> = {
  weld_prep: '夹紧力你没勾，焊接反力把板顶起来怎么办？',
  fsw: '你为什么非要先空转三秒，不能直接走？',
  engine: '燃料先开一秒半，不怕点不着吗？',
  abort: '数据这么好看，就为了掉 20 个 bar 你就中止？',
};

export const SEED_SIMS = [
  { sim: SIM_A, expertTrace: EXPERT_TRACE_A, traces: TRACES_A, why: EXPERT_WHY_A },
  { sim: SIM_B, expertTrace: EXPERT_TRACE_B, traces: TRACES_B, why: EXPERT_WHY_B },
  { sim: SIM_C, expertTrace: EXPERT_TRACE_C, traces: TRACES_C, why: EXPERT_WHY_C },
  { sim: SIM_D, expertTrace: EXPERT_TRACE_D, traces: TRACES_D, why: EXPERT_WHY_D },
  { sim: SIM_E, expertTrace: EXPERT_TRACE_E, traces: TRACES_E, why: EXPERT_WHY_E },
  { sim: SIM_F, expertTrace: EXPERT_TRACE_F, traces: TRACES_F, why: EXPERT_WHY_F },
  { sim: SIM_G, expertTrace: EXPERT_TRACE_G, traces: TRACES_G, why: EXPERT_WHY_G },
  { sim: SIM_H, expertTrace: EXPERT_TRACE_H, traces: TRACES_H, why: EXPERT_WHY_H },
];
