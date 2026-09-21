/**
 * 两个演示空间的「模拟操作台」脚本，以及专家 / 新兵 / AI 在台上留下的操作轨迹。
 * 最后一步（final）的文字就是 skill-lab-seed.ts 里各人的 answer，灌入时自动并进轨迹。
 */
import type { Sim, SimTrace } from '@/lib/skill-sim';

// ════════════════ A：指标异动归因 · 数据分析操作台 ════════════════
export const SIM_A: Sim = {
  title: '数据分析操作台 · DAU 异动',
  intro: '你坐在数据分析师的工位上。接下来的每一步，都是这份工作里真实会遇到的决策——没有标准答案的提示，做完才知道专家会怎么做。',
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

export const SEED_SIMS = [
  { sim: SIM_A, expertTrace: EXPERT_TRACE_A, traces: TRACES_A, why: EXPERT_WHY_A },
  { sim: SIM_B, expertTrace: EXPERT_TRACE_B, traces: TRACES_B, why: EXPERT_WHY_B },
];
