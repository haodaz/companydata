/**
 * 四个演示空间的「模拟操作台」脚本，以及专家 / 新兵 / AI 在台上留下的操作轨迹。
 * 最后一步（final）的文字就是 skill-lab-seed.ts 里各人的 answer，灌入时自动并进轨迹。
 */
import type { Sim, SimTrace } from '@/lib/skill-sim';
import { simulateScript } from '@/lib/bench';
import { BENCH_CASTING, CASTING_EXPERT_SCRIPT, CASTING_SCRIPTS, BENCH_WELD, WELD_EXPERT_SCRIPT, WELD_SCRIPTS } from '@/lib/skill-lab-seed-bench';

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

export const SEED_SIMS = [
  { sim: SIM_A, expertTrace: EXPERT_TRACE_A, traces: TRACES_A, why: EXPERT_WHY_A },
  { sim: SIM_B, expertTrace: EXPERT_TRACE_B, traces: TRACES_B, why: EXPERT_WHY_B },
  { sim: SIM_C, expertTrace: EXPERT_TRACE_C, traces: TRACES_C, why: EXPERT_WHY_C },
  { sim: SIM_D, expertTrace: EXPERT_TRACE_D, traces: TRACES_D, why: EXPERT_WHY_D },
];
