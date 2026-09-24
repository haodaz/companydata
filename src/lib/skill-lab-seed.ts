/**
 * 技能实验室 · 预写好的三个演示 case（一键灌入）。
 * 三个技能刻意拉开「夹角」：
 *   A 指标异动归因分析 —— 硬技能 / 定量 / 中国互联网企业 JD / 空间错位（深圳 → 伦敦深夜）
 *   B 新品上市一页纸提案 —— 软技能 / 商业判断 / 海外百强快消 JD / 时间错位（专家已离开行业，技能仍在工作）
 *   C 真空熔炼浇注窗口控制 —— 硬技能 / 设备操作 / 国企精铸 JD / 虚拟工位：中间一步是真的把设备开起来，逐拍采集操作过程
 * 起点是两份真实 JD（抓取自企业官方招聘站，见 jd.url）；灌入时会把它们写进岗位库，任务从岗位库的这条 JD 拆解而来。
 * 专家与学生均为化名；题目中的业务情境与数据为虚构的练习材料，与相关企业的实际经营无关。
 */
import type { SkillCard, InterviewTurn, RubricItem, Grading } from '@/lib/skill-lab';

export interface SeedSubmission {
  candidate_name: string; candidate_type: 'human' | 'ai'; candidate_note: string; candidate_location: string;
  with_skill: boolean; answer: string; score: number; grading: Grading; submitted_at: string;
}

export interface SeedInvocation {
  kind: 'grade' | 'answer' | 'batch' | 'coach' | 'solve'; actor: string; actor_location: string; tz_offset: number;
  context: string; output_summary: string; volume: number; occurred_at: string;
  /** 关联到哪份作答（按 candidate_name 匹配） */
  submission?: string;
  /** solve：丢给技能的问题与技能的产出 */
  input?: string; output?: string;
}

export interface SeedCase {
  skill: {
    slug: string; name: string; domain: string; kind: 'hard' | 'soft'; summary: string;
    expert_name: string; expert_title: string; expert_location: string; expert_note: string; tz_offset: number;
    assigned_agent: string; distilled_at: string; card: SkillCard; interview: InterviewTurn[];
  };
  /** 真实 JD：灌入时写入企业库 + 岗位库 */
  jd: {
    company: string; company_en: string; segment: 'china' | 'overseas_top'; industry: string;
    title: string; job_req_id: string; job_type: 'graduate' | 'program'; location: string; country: string;
    program_name: string; graduation_year: string; department: string; job_function: string;
    responsibilities: string; qualifications: string; recruit_process: string | null;
    url: string; source_url: string; fetched_at: string;
  };
  task: {
    /** 空间核心 AI 的档案 */
    profile: { codename: string; tagline: string; capabilities: string[]; can_solve: string[] };
    /** JD 拆解：职责原句 → 能力项 → 可检验的任务；chosen = 本题选中的那一条 */
    jd_breakdown: { duty: string; capability: string; task_idea: string; chosen?: boolean }[];
    title: string; brief: string; materials: string; deliverable: string; time_limit_min: number; rubric: RubricItem[];
  };
  submissions: SeedSubmission[];
  invocations: SeedInvocation[];
}

// ════════════════════════════════════════════════════════════════
// Case A：指标异动归因分析
// ════════════════════════════════════════════════════════════════
const CASE_A: SeedCase = {
  skill: {
    slug: 'demo-metric-anomaly-attribution',
    name: '指标异动归因分析',
    domain: '数据分析 · 互联网',
    kind: 'hard',
    summary: '核心指标突然涨跌时，怎么在半天内给出一个站得住、可被证伪的归因结论。',
    expert_name: '周砚（化名）',
    expert_title: '前头部互联网平台数据科学负责人 · 9 年经验',
    expert_location: '深圳',
    expert_note: '仍在职，工作日 10:00–19:00（北京时间）可答疑',
    tz_offset: 8,
    assigned_agent: 'qa',
    distilled_at: '2026-06-18T07:30:00Z',
    card: {
      scenarios: ['DAU / 转化率 / GMV 突然异动，业务方要当天给说法', '周报、月报里的指标复盘', '数据分析岗校招笔试与案例面试'],
      steps: [
        { title: '先验数，再归因', detail: '核对口径有没有变、埋点 / SDK 有没有升级、数据是否延迟、是否节假日或周期效应。数据本身有问题时，后面所有分析都作废。' },
        { title: '定量级', detail: '同比、环比各看一眼，判断是否超出正常波动（经验上超过近 8 周同星期波动的 2 倍标准差才算异动）。' },
        { title: '拆维度找贡献度', detail: '按 渠道 × 平台 × 版本 × 新老用户 拆开，算每个切片的贡献度 = 切片变化量 ÷ 总变化量，锁定贡献最大的 1–2 个切片。' },
        { title: '对时间线', detail: '把版本发布、运营活动、投放调整、外部事件排在同一条时间轴上，看哪个事件和异动切片在时间、范围上都对得上。' },
        { title: '给可证伪的结论', detail: '写成「主因是 X，证据是 Y，置信度 Z；如果我错了，应该能看到 W」。' },
        { title: '给下一步动作', detail: '今天能做的验证（回滚、灰度对比、查日志）和需要谁配合，写清楚负责人与时间。' },
      ],
      rules: [
        '没验数就开始归因，一律不及格——这是新人最常见、代价也最大的错误。',
        '只说「相关」不算贡献度，等于没有归因。',
        '原因超过 3 个等于没有原因：主因只能有一个，次因最多一个。',
        '结论必须能被证伪，「可能是多方面因素共同导致」不是结论。',
        '不要用「内容质量下降」「用户疲劳」这类无法当天验证的说法当主因。',
      ],
      good_example: '「周三 DAU 同比 -8%，其中 Android 应用商店渠道新用户贡献了总跌幅的 83%，其余切片持平。该切片的下跌始于周二 8.2.0 发版后。主因判断为 8.2.0 在 Android 新装场景的激活问题（置信度中高）；但周二同时升级过埋点 SDK，需先排除漏报：对比服务端登录日志，如果服务端新用户数没跌，则是埋点问题而非真实流失。」',
      bad_example: '「DAU 下降可能与近期内容质量下降、竞品活动、用户疲劳、季节因素以及版本更新等多方面原因有关，建议加强内容运营并持续观察。」',
      checklist: ['有没有先说数据是否可信', '有没有给出贡献度数字', '主因是否只有一个', '有没有写「如果我错了会看到什么」', '下一步是否有负责人和时间'],
    },
    interview: [
      { role: 'ai', content: '业务方早上跑来说「DAU 跌了 8%」，你的第一反应是什么？' },
      { role: 'expert', content: '先不看业务，先看数。口径变没变、埋点动没动、数据到齐没有。我见过太多次，团队花一天分析「用户为什么流失」，最后发现是 SDK 升级漏报。' },
      { role: 'ai', content: '确认数据没问题之后，你怎么决定先拆哪个维度？' },
      { role: 'expert', content: '不靠猜，全拆一遍算贡献度。渠道、平台、版本、新老用户，哪个切片吃掉了大部分跌幅就盯哪个。贡献度是硬指标——你说某个因素是主因，它得能解释 60% 以上的变化。' },
      { role: 'ai', content: '新人的分析报告里，你最不能接受的写法是什么？' },
      { role: 'expert', content: '罗列五六个「可能原因」然后说「综合因素」。这不是分析，是免责声明。我要的是一个主因、一份证据、一个置信度，再加一句「如果我错了，你会看到什么」。' },
      { role: 'ai', content: '怎么区分「相关」和「原因」？时间上对得上就够了吗？' },
      { role: 'expert', content: '时间对得上只是必要条件，还得范围对得上——事件影响的人群和下跌的切片得是同一批人。再往下就靠当天能做的验证：回滚、灰度对照、服务端日志交叉核对。' },
      { role: 'ai', content: '最后交付时，你会检查哪几件事？' },
      { role: 'expert', content: '五件：说没说数据可信度、有没有贡献度数字、主因是不是只有一个、结论能不能被证伪、下一步有没有人和时间。少一件我就退回去。' },
    ],
  },
  jd: {
    company: '字节跳动', company_en: 'ByteDance', segment: 'china', industry: '互联网',
    title: '数据分析师 - 番茄小说', job_req_id: 'A38238A', job_type: 'graduate', location: '北京', country: '中国',
    program_name: '2027届校园招聘', graduation_year: '2027 届', department: '产品 - 数据分析', job_function: '算法与数据',
    responsibilities: '1、负责番茄小说相关业务的数据分析工作；\n2、分析各项影响产品提升与增长的因素，结合业务方向，给出可落地的整体产品优化方案；\n3、与产品/运营/研发等配合，推进优化方案落地执行，带来业务的实际提升增长；\n4、负责业务上各类A/B实验设计与分析，产品优化效果、市场活动分析评估等工作；\n5、建设业务分析模型，并不断评估和优化。',
    qualifications: '1、2027届获得本科及以上学历，数学、统计学、计算机相关专业优先；\n2、有数据分析经验、一线产品或运营业务优化经验者优先；\n3、逻辑清晰，对数据敏感，能发掘业务细节和数据之间的联系，并通过数据指标推动优化；\n4、精通SQL，熟练使用R/Python进行数据分析、挖掘，掌握Tableau等BI工具尤佳；\n5、具有良好的团队配合能力，沟通能力；\n6、热爱阅读，对小说、漫画、有声书等内容品类产品有深入思考、分析经验者尤佳。',
    recruit_process: null,
    url: 'https://jobs.bytedance.com/campus/position/7669707798918007045/detail',
    source_url: 'https://jobs.bytedance.com/campus/position?keywords=%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90',
    fetched_at: '2026-09-21',
  },
  task: {
    profile: {
      codename: 'DA-FANQIE', tagline: '指标一动，我先验数。',
      capabilities: ['指标异动归因', '贡献度拆解', 'A/B 实验评估', '业务指标口径', '把结论变成当天动作'],
      can_solve: ['「DAU / 转化率突然跌了，老板下午要说法」', '「这次活动到底有没有用，怎么评估」', '「一堆可能原因，怎么判断哪个是主因」', '「我的分析报告为什么总被打回」'],
    },
    jd_breakdown: [
      { duty: '负责番茄小说相关业务的数据分析工作', capability: '业务理解 · 指标口径', task_idea: '给一份指标定义混乱的周报，请重写口径说明' },
      { duty: '分析各项影响产品提升与增长的因素，结合业务方向，给出可落地的整体产品优化方案', capability: '指标异动归因 · 结论可落地', task_idea: 'DAU 突然下跌，半天内给出站得住的归因结论和当天动作', chosen: true },
      { duty: '与产品/运营/研发等配合，推进优化方案落地执行', capability: '跨团队沟通 · 推动', task_idea: '把一份分析结论改写成给研发的排查需求' },
      { duty: '负责业务上各类A/B实验设计与分析，产品优化效果、市场活动分析评估', capability: '实验设计 · 效果评估', task_idea: '为「新用户首日推荐策略」设计一个 A/B 实验并写清判定标准' },
      { duty: '建设业务分析模型，并不断评估和优化', capability: '建模 · 迭代', task_idea: '为「付费会员流失」搭一个可解释的预警指标' },
    ],
    title: '免费阅读 App 周三 DAU 下跌 8%：请给出归因结论',
    brief: '以字节跳动「数据分析师 - 番茄小说」（2027 届校招）的岗位职责为起点。假设你是一款免费阅读 App 的数据分析实习生。周四早上，产品负责人发来消息：「昨天（周三）DAU 比上周三跌了 8%，上午 11 点的周会我要一个说法。」\n\n请根据下面的材料，写出你会在周会上给出的归因结论。（情境与数据均为虚构的练习材料）',
    materials: [
      '【周三 DAU，对比上周三】',
      '整体：1,000 万 → 920 万（-8.0%）',
      '',
      '| 切片 | 上周三 | 本周三 | 变化 |',
      '| --- | --- | --- | --- |',
      '| iOS · 老用户 | 310 万 | 309 万 | -0.3% |',
      '| iOS · 新用户 | 40 万 | 40 万 | 0% |',
      '| Android · 老用户 | 490 万 | 485 万 | -1.0% |',
      '| Android · 新用户 · 应用商店渠道 | 120 万 | 54 万 | -55% |',
      '| Android · 新用户 · 其他渠道 | 40 万 | 32 万 | -20% |',
      '',
      '【本周时间线】',
      '- 周一：上线「夏日书单挑战」运营活动（全量用户）',
      '- 周二 14:00：Android 8.2.0 版本全量发布（iOS 未发版）',
      '- 周二 16:00：数据团队升级了 Android 端埋点 SDK',
      '- 周三：某竞品阅读 App 上线新功能，社交媒体有讨论',
    ].join('\n'),
    deliverable: '一段不超过 500 字的归因结论：包含你对数据可信度的判断、主因与证据、置信度，以及今天要做的下一步。',
    time_limit_min: 40,
    rubric: [
      { key: 'validate', name: '验数意识', weight: 20, description: '是否先判断数据本身可信（注意到埋点 SDK 升级），并给出核验办法。' },
      { key: 'decompose', name: '拆解与贡献度', weight: 30, description: '是否按切片拆解并用贡献度锁定主要下跌来源，而不是泛泛描述。' },
      { key: 'causal', name: '时间线与因果', weight: 20, description: '是否把事件与异动切片在时间和范围上对应起来，并排除对不上的事件。' },
      { key: 'falsifiable', name: '结论可证伪与置信度', weight: 15, description: '主因是否唯一，是否给出置信度与「如果错了会看到什么」。' },
      { key: 'action', name: '行动建议与表达', weight: 15, description: '下一步是否具体可执行，表达是否简洁、可直接在周会上讲。' },
    ],
  },
  submissions: [
    {
      candidate_name: '林知夏（化名）', candidate_type: 'human', candidate_note: 'UCL 统计学硕士在读 · 2027 届', candidate_location: '伦敦', with_skill: false,
      submitted_at: '2026-09-02T22:40:00Z',
      answer: '结论先行：跌幅几乎全部来自 Android 新用户，主因大概率是周二的 8.2.0 发版，但要先排除埋点问题。\n\n1）数据可信度：周二 16:00 升级过 Android 埋点 SDK，和异动切片（Android）重合，不能直接当成真实流失。建议上午先拿服务端登录日志对一下 Android 新用户数，如果服务端没跌，就是漏报。\n\n2）拆解：总跌幅 80 万。Android 应用商店新用户 -66 万，占 82.5%；Android 其他渠道新用户 -8 万，占 10%；iOS 和老用户基本持平。也就是说 92% 的下跌发生在「Android 新装用户」。\n\n3）因果：iOS 没发版也没跌；夏日书单挑战和竞品功能是全量影响，解释不了只跌 Android 新用户。时间和范围都对得上的只有 8.2.0 发版和 SDK 升级。\n\n4）判断：主因是 8.2.0 在新装激活链路上的问题（置信度 60%），次要可能是埋点漏报（30%）。如果我错了，应该能看到服务端新用户数同样下跌且与版本无关。\n\n5）今天：上午对服务端日志；同时请测试同学用新机走一遍 8.2.0 应用商店安装→注册流程；下午 3 点前同步结论，必要时建议回滚。',
      score: 88,
      grading: {
        dimensions: [
          { key: 'validate', score: 19, evidence: '「周二 16:00 升级过 Android 埋点 SDK，和异动切片重合，不能直接当成真实流失」', comment: '第一段就处理数据可信度，并给了用服务端日志交叉核对的具体办法。' },
          { key: 'decompose', score: 28, evidence: '「Android 应用商店新用户 -66 万，占 82.5%……92% 的下跌发生在 Android 新装用户」', comment: '贡献度算得准确，直接锁定了切片。' },
          { key: 'causal', score: 17, evidence: '「夏日书单挑战和竞品功能是全量影响，解释不了只跌 Android 新用户」', comment: '用「范围对不上」排除了两个事件，推理干净。可以再补一句应用商店渠道为何跌得比其他渠道更多。' },
          { key: 'falsifiable', score: 12, evidence: '「置信度 60%……如果我错了，应该能看到服务端新用户数同样下跌且与版本无关」', comment: '有置信度、有证伪条件。' },
          { key: 'action', score: 12, evidence: '「下午 3 点前同步结论，必要时建议回滚」', comment: '动作具体、有时间点；负责人可以再明确到人。' },
        ],
        summary: '一份可以直接在周会上讲的归因：先验数、算贡献度、用范围排除干扰事件、结论可证伪。已经是能独立上手的水平。',
        gaps: ['没有解释应用商店渠道（-55%）与其他渠道（-20%）的差异', '下一步没有明确到具体负责人'],
        suggestions: ['补一条假设：应用商店包与其他渠道包的差异（如商店审核版本、首启权限弹窗）', '养成在行动项里写「谁、几点前」的习惯'],
      },
    },
    {
      candidate_name: '陈一鸣（化名）', candidate_type: 'human', candidate_note: '某 985 高校信息管理专业 · 大三', candidate_location: '成都', with_skill: false,
      submitted_at: '2026-09-04T12:15:00Z',
      answer: '我认为 DAU 下降主要有以下几个原因：\n\n第一，竞品在周三上线了新功能，社交媒体上讨论很多，可能分流了我们的用户，尤其是对新鲜事物敏感的新用户。\n\n第二，夏日书单挑战活动可能效果不及预期，用户参与度不高，没有起到拉活的作用。\n\n第三，Android 8.2.0 版本可能存在一些 bug，影响了用户体验。\n\n第四，近期内容质量可能有所下降，用户产生了审美疲劳。\n\n从数据上看，Android 新用户下降最明显，说明我们在拉新方面遇到了问题。建议：加大应用商店的投放力度，优化新用户引导流程，同时密切关注竞品动态，提升内容质量，持续观察后续数据变化。',
      score: 40,
      grading: {
        dimensions: [
          { key: 'validate', score: 0, evidence: '（全文未提及埋点 SDK 升级或数据可信度）', comment: '材料里明确给了「周二 16:00 升级埋点 SDK」，完全没有处理。按专家规则，没验数就归因，这一项不得分。' },
          { key: 'decompose', score: 16, evidence: '「从数据上看，Android 新用户下降最明显」', comment: '注意到了异动切片，但没有算贡献度，也没有用它来约束前面列的四个原因。' },
          { key: 'causal', score: 10, evidence: '「竞品在周三上线了新功能……可能分流了我们的用户」', comment: '竞品和活动是全量影响，无法解释 iOS 与老用户持平——范围对不上，却被排在第一、第二位。' },
          { key: 'falsifiable', score: 4, evidence: '「主要有以下几个原因……第四，近期内容质量可能有所下降」', comment: '列了四个并列原因，没有主因、没有置信度，「内容质量下降」当天无法验证。' },
          { key: 'action', score: 10, evidence: '「加大应用商店的投放力度……持续观察后续数据变化」', comment: '如果是版本激活问题，加大投放只会放大损失；建议均不可当天执行。' },
        ],
        summary: '典型的「罗列可能原因」式回答：看到了异动切片，但没有让数据约束结论，也没有验数。距离岗位要求还有明显差距，但问题很集中，可以通过训练改掉。',
        gaps: ['没有验数意识', '不会用贡献度锁定主因', '用全量事件解释局部下跌', '结论不可证伪'],
        suggestions: ['先练一个动作：每次看到异动，第一句话写「数据是否可信」', '把每个候选原因过一遍「它影响的人群和下跌的人群是同一批吗」', '强制自己只写一个主因，并写出「如果错了会看到什么」'],
      },
    },
    {
      candidate_name: 'AI 裸答', candidate_type: 'ai', candidate_note: '通用大模型 · 未装配技能', candidate_location: '云端', with_skill: false,
      submitted_at: '2026-09-15T03:00:00Z',
      answer: '归因结论：\n\n本次 DAU 下跌 8%（减少 80 万）主要集中在 Android 新用户。其中应用商店渠道新用户从 120 万降至 54 万（-55%），其他渠道新用户从 40 万降至 32 万（-20%），而 iOS 用户与 Android 老用户基本稳定。\n\n可能原因分析：\n1. Android 8.2.0 版本发布（周二）：时间上与下跌吻合，且 iOS 未发版未下跌，新版本可能存在安装或注册环节的问题。\n2. 应用商店渠道问题：可能存在商店排名下降、评分降低或推荐位变化。\n3. 竞品新功能上线：可能对新用户获取造成一定分流。\n4. 运营活动影响：夏日书单挑战可能改变了用户行为。\n\n综合判断，Android 8.2.0 版本问题是最主要的原因，其他因素可能共同作用。\n\n建议：排查 8.2.0 版本新用户注册流程；检查应用商店渠道的排名与评分；持续监控后续数据。',
      score: 64,
      grading: {
        dimensions: [
          { key: 'validate', score: 2, evidence: '（未提及埋点 SDK 升级）', comment: '和多数新人一样跳过了验数。材料中的 SDK 升级是关键干扰项。' },
          { key: 'decompose', score: 25, evidence: '「应用商店渠道新用户从 120 万降至 54 万（-55%）……iOS 用户与 Android 老用户基本稳定」', comment: '切片描述准确，但没有换算成贡献度。' },
          { key: 'causal', score: 16, evidence: '「时间上与下跌吻合，且 iOS 未发版未下跌」', comment: '对 8.2.0 的推理成立；但没有用「范围对不上」排除竞品与活动，仍把它们列为原因。' },
          { key: 'falsifiable', score: 9, evidence: '「8.2.0 版本问题是最主要的原因，其他因素可能共同作用」', comment: '有主因，但用「共同作用」留了后路，没有置信度和证伪条件。' },
          { key: 'action', score: 12, evidence: '「排查 8.2.0 版本新用户注册流程……持续监控后续数据」', comment: '方向对，但没有今天能出结果的验证动作和时间点。' },
        ],
        summary: '通用模型的典型表现：读数准确、结构完整，但缺少从业者的「判断纪律」——不验数、不排除、不给证伪条件。看起来像分析，开会时顶不住追问。',
        gaps: ['跳过验数', '没有贡献度', '原因列了四个', '结论不可证伪'],
        suggestions: ['装配专家技能后重答，对比差异'],
      },
    },
    {
      candidate_name: 'AI + 专家技能', candidate_type: 'ai', candidate_note: '同一模型 · 装配「指标异动归因分析」', candidate_location: '云端', with_skill: true,
      submitted_at: '2026-09-15T03:05:00Z',
      answer: '【数据可信度】暂不能确认为真实流失。周二 16:00 Android 埋点 SDK 升级，与异动切片（Android）重合。今天上午先用服务端登录日志核对 Android 新用户数：服务端没跌 → 埋点漏报；服务端同样下跌 → 真实流失，继续往下看。\n\n【拆解】总跌幅 80 万。Android·新用户·应用商店 -66 万，贡献度 82.5%；Android·新用户·其他渠道 -8 万，贡献度 10%；其余切片合计 -6 万。主要问题在「Android 新装用户」，且应用商店包最严重。\n\n【时间线】夏日书单挑战（周一）和竞品功能（周三）都是全量影响，解释不了 iOS 与老用户持平，排除。时间和范围都对得上的只有周二 14:00 的 8.2.0 全量发布，以及 16:00 的 SDK 升级。\n\n【结论】主因：8.2.0 在 Android 新装→激活链路上的问题，应用商店包更严重（置信度 65%）。备选：SDK 升级导致新用户事件漏报（30%）。如果我错了，会看到：服务端新用户数正常，或 8.1.x 老版本的新装用户同样下跌。\n\n【今天】10:30 前数据组核对服务端日志；测试组用新机走一遍应用商店 8.2.0 安装→注册；15:00 同步结论，若确认为版本问题，建议当天回滚应用商店包。',
      score: 91,
      grading: {
        dimensions: [
          { key: 'validate', score: 20, evidence: '「暂不能确认为真实流失……服务端没跌 → 埋点漏报；服务端同样下跌 → 真实流失」', comment: '把验数放在第一位，并给了二分的判定办法——正是专家强调的第一步。' },
          { key: 'decompose', score: 29, evidence: '「Android·新用户·应用商店 -66 万，贡献度 82.5%」', comment: '贡献度完整。' },
          { key: 'causal', score: 18, evidence: '「都是全量影响，解释不了 iOS 与老用户持平，排除」', comment: '按「时间 + 范围」两个条件排除干扰事件。' },
          { key: 'falsifiable', score: 14, evidence: '「如果我错了，会看到：服务端新用户数正常，或 8.1.x 老版本的新装用户同样下跌」', comment: '唯一主因 + 置信度 + 两条证伪条件。' },
          { key: 'action', score: 10, evidence: '「10:30 前数据组核对服务端日志……15:00 同步结论」', comment: '有时间点和责任组；篇幅略超，可再精简。' },
        ],
        summary: '装配专家技能后，同一个模型从 64 分提升到 91 分。提升不在「知识」，而在专家的判断纪律：先验数、算贡献度、只留一个主因、写证伪条件。',
        gaps: ['篇幅略超 500 字'],
        suggestions: ['可作为该任务的参考答案，用于给学生讲评'],
      },
    },
  ],
  invocations: [
    { kind: 'grade', actor: '林知夏（化名）· 留学生自测', actor_location: '伦敦', tz_offset: 1, occurred_at: '2026-09-02T22:41:00Z', volume: 1, submission: '林知夏（化名）',
      context: '伦敦时间 23:41，秋招笔试前夜。此时深圳是早上 6:41，专家还没起床。', output_summary: '88 分，5 个维度逐条引用原文给出证据，并指出「没有解释应用商店渠道与其他渠道的差异」。' },
    { kind: 'grade', actor: '陈一鸣（化名）· 在校生自测', actor_location: '成都', tz_offset: 8, occurred_at: '2026-09-04T12:16:00Z', volume: 1, submission: '陈一鸣（化名）',
      context: '课后晚上 20:16 作答。', output_summary: '40 分，定位到「没有验数意识」「用全量事件解释局部下跌」，给出三条可执行的训练建议。' },
    { kind: 'batch', actor: '某高校就业指导中心 · 数据分析求职工作坊', actor_location: '成都', tz_offset: 8, occurred_at: '2026-09-10T13:30:00Z', volume: 126,
      context: '工作坊当晚 126 名学生同时提交。专家本人一晚最多看 10 份。', output_summary: '一晚批改 126 份，平均 58 分；71% 的学生在「验数意识」上不得分——第二天讲评直接围绕这一点展开。' },
    { kind: 'answer', actor: 'AI 员工 · Nova', actor_location: '云端', tz_offset: 0, occurred_at: '2026-09-15T03:05:00Z', volume: 1, submission: 'AI + 专家技能',
      context: '同一模型、同一道题，装配技能前后对比。', output_summary: '得分 64 → 91。提升来自专家的判断纪律，而不是更多知识。' },
    { kind: 'solve', actor: '成都某阅读类小程序 · 运营负责人', actor_location: '成都', tz_offset: 8, occurred_at: '2026-09-13T02:10:00Z', volume: 1,
      context: '周日上午 10:10，团队里没有数据分析师，专家本人周末不答疑。', output_summary: '20 分钟内拿到排查顺序：先核对支付回调埋点，再按「渠道 × 机型 × 版本」算贡献度，当天定位到某安卓机型的支付页白屏。',
      input: '我们的阅读小程序昨天支付转化率从 3.1% 掉到 2.2%，老板让我下午给说法。周五发过一个版本，也调过会员价，周六还有个拉新活动。我该怎么查？',
      output: '按这个顺序来，前一步没过不要做下一步：\n\n1. 先验数（30 分钟）：周五发版有没有动过支付成功的埋点或回调？拿支付渠道后台的成功订单数对一下你们自己的数。对不上 → 是漏报，不是真跌，到此为止。\n\n2. 定量级：3.1% → 2.2% 是 -29%，先看近 8 周的周六波动，确认超出正常范围。\n\n3. 拆维度算贡献度：渠道（拉新活动来的 vs 自然）× 机型 / 系统 × 版本 × 新老用户。重点看两个切片：\n   - 拉新活动带来的新用户——如果他们本来转化就低，分母变大也会把整体转化率拉下来，这是结构变化，不是体验问题；\n   - 周五新版本用户 vs 旧版本用户。\n\n4. 对时间线：发版、调价、活动，谁影响的人群和下跌的切片是同一批。调价影响所有人，活动只影响新用户，发版只影响已更新的用户——范围不同，很好区分。\n\n5. 下午的说法只给一个主因，写成：「主因是 X（贡献度 Y%，置信度 Z），如果我错了会看到 W；今天 N 点前由谁验证。」\n\n别用「多种因素叠加」交差。' },
    { kind: 'coach', actor: '新加坡某高校中国学生会 · 秋招互助小组', actor_location: '新加坡', tz_offset: 8, occurred_at: '2026-09-19T14:00:00Z', volume: 23,
      context: '周六晚的线上互助，没有任何业内前辈在场。', output_summary: '23 名同学用技能卡的「交付前检查」互评，当场重写结论。' },
  ],
};

// ════════════════════════════════════════════════════════════════
// Case B：新品上市一页纸提案
// ════════════════════════════════════════════════════════════════
const CASE_B: SeedCase = {
  skill: {
    slug: 'demo-one-page-launch-proposal',
    name: '新品上市一页纸提案',
    domain: '品牌管理 · 快消',
    kind: 'soft',
    summary: '用一页纸把一个新品上市计划讲到能被批预算：洞察、目标、取舍、钱花在哪、什么时候止损。',
    expert_name: '沈嘉禾（化名）',
    expert_title: '前外资快消品牌总监 · 12 年经验',
    expert_location: '上海',
    expert_note: '已于 2026 年 5 月离开快消行业，转做独立咨询，不再带新人',
    tz_offset: 8,
    assigned_agent: 'qa',
    distilled_at: '2026-03-09T06:00:00Z',
    card: {
      scenarios: ['新品 / 新口味 / 新渠道的上市计划', '管培生轮岗期的第一份提案', '快消、消费品牌市场岗的校招案例面试'],
      steps: [
        { title: '一句消费者的心里话', detail: '洞察不是数据，是目标人群在某个具体场景下的一句真实想法，比如「下午第三节课犯困，但喝奶茶会有负罪感」。写不出这句话，后面都是空的。' },
        { title: '一个带数字和期限的目标', detail: '试用率、复购率、铺货率选一个做北极星，写清楚数字和截止日期。' },
        { title: '只选一个主战场', detail: '预算有限时只打一个渠道或一个场景，其余全部写进「这次不做」。' },
        { title: '预算倒推到漏斗', detail: '每一笔钱对应「知道→尝试→复购」的哪一环，算出单个试用成本，和毛利对一下。' },
        { title: '写止损线', detail: '第几周、哪个指标低于多少就停或者改，提前写好。' },
        { title: '一页纸结构', detail: '背景一句话 → 洞察 → 目标 → 策略（做什么 / 不做什么）→ 执行节奏 → 预算 → 衡量与止损。' },
      ],
      rules: [
        '洞察是消费者的一句心里话，不是「Z 世代追求健康」这种谁都能说的趋势。',
        '目标没有数字和期限，就不是目标。',
        '什么都做等于没有策略——我看提案先看「这次不做什么」。',
        '没有止损线的预算我不批。',
        '50 万以内的预算，不要分到 3 个以上的渠道。',
      ],
      good_example: '「洞察：下午 3 点的自习室，想喝点有味道的提神，但不想为一杯奶茶的糖愧疚。目标：12 周内在华东 20 所高校拿到 8% 的试用率、30% 的 4 周复购。策略：只打校内便利店冰柜 + 自习场景，不做抖音投放。止损：第 4 周试用率低于 3% 则停掉地推，预算转向买赠。」',
      bad_example: '「Z 世代消费者越来越注重健康。我们将通过抖音、小红书、B 站、微博全平台种草，结合 KOL 合作、校园大使、快闪店和联名活动，全方位提升品牌知名度和美誉度。」',
      checklist: ['洞察能不能念出来像一句人话', '目标有没有数字和日期', '有没有写「这次不做什么」', '每笔预算能不能对到漏斗的一环', '有没有止损线'],
    },
    interview: [
      { role: 'ai', content: '新人交上来的上市提案，你一般先看哪里？' },
      { role: 'expert', content: '先找「这次不做什么」。找不到我就知道这份提案没有策略。预算永远不够，取舍才是提案的核心。' },
      { role: 'ai', content: '你说的「洞察」和市场调研数据有什么区别？' },
      { role: 'expert', content: '数据告诉你「多少人」，洞察告诉你「为什么」。好的洞察是一句消费者的心里话，有场景、有矛盾。「年轻人注重健康」不是洞察，「想提神但不想为一杯奶茶的糖愧疚」才是。' },
      { role: 'ai', content: '预算部分，你怎么判断一份提案靠不靠谱？' },
      { role: 'expert', content: '让他把每一笔钱对到漏斗上：这 10 万是让人知道，还是让人尝第一口，还是让人买第二次。然后算单个试用成本，跟毛利比。算不出来就是拍脑袋。' },
      { role: 'ai', content: '什么样的提案你会直接退回？' },
      { role: 'expert', content: '三种：目标没数字的、渠道铺了四五个的、没有止损线的。尤其是止损线——你得提前告诉我什么情况下你会认错，我才敢把钱给你。' },
      { role: 'ai', content: '为什么坚持「一页纸」？' },
      { role: 'expert', content: '因为一页纸逼你取舍。写不进一页，说明你自己还没想清楚。' },
    ],
  },
  jd: {
    company: '联合利华', company_en: 'Unilever', segment: 'overseas_top', industry: '快消',
    title: 'Unilever Future Leaders Programme - Marketing (Singapore)', job_req_id: 'R-1187703', job_type: 'program', location: 'Singapore', country: '新加坡',
    program_name: 'Unilever Future Leaders Programme (UFLP)', graduation_year: '毕业后正式工作经验不超过 24 个月；2027 年 7 月入职', department: 'Marketing', job_function: '市场',
    responsibilities: 'Marketing within our Brand teams, is about engaging empathetically with consumers, making sense of data and designing and driving campaigns to build demand, brand equity and business.\n- Brand building and brand development\n- Be a part of creating compelling visions for our brands and developing future-fit plans across the full marketing mix\n- Manage multiple challenging projects that may involve working with external creative agencies.\n- Overseeing networks for new product launches with supply chain team and alignment with Category team on launches',
    qualifications: '- A minimum of a Bachelor’s Degree\n- Graduates with no formal work experience beyond 24 months upon graduation\n- Driven and Energetic\n- Willing to travel - geographic mobility.',
    recruit_process: 'Online Application → Blended Assessments → Digital Interview → Phone Interview → Discovery Centre（2026 年 10 月线下）',
    url: 'https://careers.unilever.com/en/job/singapore/unilever-future-leaders-programme-marketing-singapore/34155/100009858560',
    source_url: 'https://careers.unilever.com/search-jobs/Future%20Leaders%20Programme%20Marketing',
    fetched_at: '2026-09-21',
  },
  task: {
    profile: {
      codename: 'UFLP-MKT', tagline: '预算有限，先说不做什么。',
      capabilities: ['消费者洞察', '营销组合取舍', '新品上市计划', '预算对漏斗', '止损线设计'],
      can_solve: ['「新品要上市，预算不多，渠道怎么选」', '「老板想全渠道都做，我该怎么劝」', '「我的提案被说没有洞察，怎么改」', '「这笔市场预算花得值不值，怎么算」'],
    },
    jd_breakdown: [
      { duty: 'engaging empathetically with consumers, making sense of data', capability: '消费者洞察', task_idea: '读 5 段消费者访谈摘录，写出一句洞察' },
      { duty: 'creating compelling visions for our brands and developing future-fit plans across the full marketing mix', capability: '策略取舍 · 营销组合', task_idea: '预算有限时，为一个新品写清「做什么、不做什么」', chosen: true },
      { duty: 'Overseeing networks for new product launches with supply chain team and alignment with Category team on launches', capability: '新品上市 · 预算与节奏', task_idea: '用一页纸拿到新品上市预算：目标、预算分配、止损线', chosen: true },
      { duty: 'Manage multiple challenging projects that may involve working with external creative agencies', capability: '项目管理 · 代理商协作', task_idea: '给创意代理商写一份一页的 brief' },
      { duty: 'Brand building and brand development', capability: '品牌资产', task_idea: '评估一次联名是否损害品牌定位' },
    ],
    title: '无糖气泡茶进高校：用一页纸拿到 50 万上市预算',
    brief: '以联合利华 Future Leaders Programme - Marketing 的岗位职责为起点（新品上市、全营销组合的取舍）。以下是一道虚构的练习题，产品与数据均与联合利华实际业务无关。\n\n假设你是某快消公司的品牌管培生。公司准备把一款新品「无糖气泡茶」（330ml，建议零售价 6 元，毛利约 2.4 元 / 瓶）首先投放到华东地区高校市场。\n\n你的品牌经理说：「给你 50 万、3 个月。周五给我一页纸，我拿去跟总监要预算。」',
    materials: [
      '【已知信息】',
      '- 目标区域：华东约 20 所高校，在校生合计约 50 万人',
      '- 竞品：校内便利店已有 2 款无糖茶（5–6 元）和多款含糖气泡饮（4–5 元）',
      '- 公司在这些高校的校内便利店已有铺货渠道，冰柜陈列需额外付费',
      '- 内部小样测试：大学生对口味评价较高，最常提到的饮用场景是「下午上课 / 自习犯困时」',
      '- 常见投入参考：校内便利店冰柜陈列约 3,000 元 / 店 / 月；校园地推试饮约 2 元 / 人次；抖音 / 小红书校园类达人单条 0.5–3 万元',
    ].join('\n'),
    deliverable: '一页纸提案，不超过 600 字：洞察、目标、策略（含不做什么）、预算分配、衡量与止损。',
    time_limit_min: 60,
    rubric: [
      { key: 'insight', name: '消费者洞察', weight: 25, description: '是否有具体场景和矛盾的消费者洞察，而不是泛泛的人群趋势。' },
      { key: 'goal', name: '目标量化', weight: 15, description: '目标是否有数字、有期限，且与 50 万预算量级匹配。' },
      { key: 'focus', name: '策略聚焦与取舍', weight: 25, description: '是否只选一个主战场，是否明确写出「不做什么」。' },
      { key: 'budget', name: '预算与衡量', weight: 20, description: '预算是否对应到漏斗环节，是否估算了单个试用成本并与毛利对照。' },
      { key: 'stoploss', name: '风险与止损', weight: 15, description: '是否提前写明止损线和调整方案。' },
    ],
  },
  submissions: [
    {
      candidate_name: '赵可心（化名）', candidate_type: 'human', candidate_note: '墨尔本大学市场营销硕士在读 · 2027 届', candidate_location: '墨尔本', with_skill: false,
      submitted_at: '2026-09-05T11:20:00Z',
      answer: '【洞察】下午两三点的课和自习最难熬，想喝点有味道、有气的东西醒一醒，但奶茶太甜、咖啡太苦，矿泉水又没意思。\n\n【目标】3 个月内，在 20 所高校做到 10% 学生尝过一次（5 万人），其中 25% 在 4 周内再买一次。\n\n【策略】只打一个场景：「下午犯困」。只打一个渠道：校内便利店冰柜。让它出现在学生下午必经的冰柜黄金层，配一句话海报「下午第三节课，来点气」。\n不做：抖音 / 小红书投放、校外渠道、联名。预算太小，线上声量换不来校内的第一口。\n\n【预算 50 万】\n- 冰柜陈列：20 校 × 平均 3 店 × 3,000 × 3 月 = 54 万，超了，所以改为前 2 个月重点 12 校全陈列，约 21.6 万\n- 地推试饮：教学楼下午 2–4 点，8 万人次 × 2 元 = 16 万\n- 第二瓶半价券（促复购）：8 万\n- 机动：4.4 万\n按 8 万人次试饮算，单个试用成本约 4.7 元，高于单瓶毛利 2.4 元，3 个月内回不了本——这笔钱买的是「下午犯困」这个场景成不成立的答案。\n\n【衡量】每两周看试用率和复购率。',
      score: 82,
      grading: {
        dimensions: [
          { key: 'insight', score: 22, evidence: '「想喝点有味道、有气的东西醒一醒，但奶茶太甜、咖啡太苦，矿泉水又没意思」', comment: '有场景、有矛盾，是一句能念出来的人话，并且用上了小样测试里的线索。' },
          { key: 'goal', score: 13, evidence: '「3 个月内……10% 学生尝过一次（5 万人），其中 25% 在 4 周内再买一次」', comment: '有数字有期限，和预算量级匹配。' },
          { key: 'focus', score: 23, evidence: '「不做：抖音 / 小红书投放、校外渠道、联名。预算太小，线上声量换不来校内的第一口」', comment: '一个场景、一个渠道，并且写清了不做什么和理由——这是专家最先看的地方。' },
          { key: 'budget', score: 18, evidence: '「单个试用成本约 4.7 元，高于单瓶毛利 2.4 元，3 个月内回不了本」', comment: '发现陈列预算超支后主动收缩到 12 校，并把试用成本和毛利对上了，很难得。' },
          { key: 'stoploss', score: 6, evidence: '「每两周看试用率和复购率」', comment: '有衡量节奏，但没有写止损线：指标低于多少、在第几周、怎么调整。按专家规则，这份预算暂时批不下来。' },
        ],
        summary: '洞察、取舍、预算逻辑都达到了可以直接用的水平，唯一的硬伤是没有止损线。补上之后就是一份能拿去要预算的提案。',
        gaps: ['没有止损线与调整方案'],
        suggestions: ['加一句：「第 4 周试用率低于 3% 则停地推，预算转买赠」这类提前写好的认错条件'],
      },
    },
    {
      candidate_name: '王梓航（化名）', candidate_type: 'human', candidate_note: '某 211 高校工商管理专业 · 大四', candidate_location: '武汉', with_skill: false,
      submitted_at: '2026-09-18T14:45:00Z',
      answer: '一、市场背景\n随着健康意识的提升，Z 世代消费者越来越青睐无糖饮品，无糖茶市场近年来高速增长，大学生是重要的目标人群。\n\n二、目标\n提升品牌在高校人群中的知名度和美誉度，打造校园爆款。\n\n三、策略\n1. 线上：在抖音、小红书、B 站、微博进行全平台种草，邀请校园 KOL 发布测评内容。\n2. 线下：在各高校举办快闪店活动，招募校园大使进行推广，与热门社团联名举办活动。\n3. 渠道：在校内便利店进行铺货和陈列。\n\n四、预算\n线上投放 25 万，线下活动 15 万，渠道陈列 10 万。\n\n五、预期效果\n通过线上线下整合营销，全方位触达目标人群，实现品牌声量和销量的双增长。',
      score: 31,
      grading: {
        dimensions: [
          { key: 'insight', score: 8, evidence: '「随着健康意识的提升，Z 世代消费者越来越青睐无糖饮品」', comment: '这是人群趋势，不是洞察——没有场景，没有矛盾，也没用上材料里「下午犯困」的线索。' },
          { key: 'goal', score: 4, evidence: '「提升品牌在高校人群中的知名度和美誉度，打造校园爆款」', comment: '没有数字，没有期限，无法衡量。' },
          { key: 'focus', score: 9, evidence: '「在抖音、小红书、B 站、微博进行全平台种草……快闪店……校园大使……社团联名」', comment: '50 万分到了 4 个线上平台和 3 类线下活动，没有任何「不做」。按专家规则：什么都做等于没有策略。' },
          { key: 'budget', score: 10, evidence: '「线上投放 25 万，线下活动 15 万，渠道陈列 10 万」', comment: '只有三个总数，没有对应到漏斗，也没有试用成本。一半预算放在线上，但购买发生在校内便利店。' },
          { key: 'stoploss', score: 0, evidence: '（未提及）', comment: '没有衡量节奏，也没有止损线。' },
        ],
        summary: '结构完整、用词专业，但内容是一份可以套在任何新品上的模板。最大的问题是没有取舍。这类提案在真实业务里会被直接退回。',
        gaps: ['把趋势当洞察', '目标不可衡量', '没有取舍', '预算没有对应漏斗', '没有止损线'],
        suggestions: ['先只改一件事：写出「这次不做什么」，你会发现策略自己就清楚了', '把洞察改写成一句消费者的原话，从材料里的「下午犯困」出发', '目标改成「几周内、多少人、尝过 / 复购」'],
      },
    },
    {
      candidate_name: 'AI 裸答', candidate_type: 'ai', candidate_note: '通用大模型 · 未装配技能', candidate_location: '云端', with_skill: false,
      submitted_at: '2026-09-15T03:20:00Z',
      answer: '【背景】无糖茶饮增长迅速，大学生注重健康与口感，是理想的首发人群。\n\n【洞察】大学生在学习场景中需要提神，同时希望饮品健康无负担。\n\n【目标】3 个月内覆盖 20 所高校，实现 10 万瓶销量，品牌认知度达到 30%。\n\n【策略】\n1. 渠道：校内便利店冰柜陈列，确保可见度。\n2. 试饮：在教学楼和图书馆开展地推试饮。\n3. 社媒：与 10 位校园类小红书、抖音达人合作种草。\n4. 校园大使：每校招募 2 名大使，组织社团活动。\n\n【预算】陈列 18 万；试饮 12 万；达人合作 12 万；校园大使与活动 6 万；机动 2 万。\n\n【衡量】每月复盘销量、试饮转化率和社媒互动数据，并根据结果优化投放。',
      score: 61,
      grading: {
        dimensions: [
          { key: 'insight', score: 13, evidence: '「大学生在学习场景中需要提神，同时希望饮品健康无负担」', comment: '方向对，用上了学习场景，但还是概括性的描述，不是一句具体的心里话。' },
          { key: 'goal', score: 12, evidence: '「3 个月内覆盖 20 所高校，实现 10 万瓶销量，品牌认知度达到 30%」', comment: '有数字和期限；但认知度 30% 与 50 万预算不匹配，也没说明如何测量。' },
          { key: 'focus', score: 12, evidence: '「1. 渠道……2. 试饮……3. 社媒……4. 校园大使」', comment: '四条线并行，没有主战场，也没有「不做什么」。比全平台种草克制，但仍然是在分散预算。' },
          { key: 'budget', score: 13, evidence: '「陈列 18 万；试饮 12 万；达人合作 12 万」', comment: '分配合理，但没有对应漏斗环节，没有算单个试用成本，也没和 2.4 元毛利对照。' },
          { key: 'stoploss', score: 11, evidence: '「每月复盘……并根据结果优化投放」', comment: '有复盘节奏，没有具体的止损线。' },
        ],
        summary: '通用模型给出的是一份「不会出错」的提案：每样都沾一点，没有明显漏洞，也没有判断。缺的正是专家最看重的两件事——取舍和止损。',
        gaps: ['洞察不够具体', '没有取舍', '没有算试用成本', '没有止损线'],
        suggestions: ['装配专家技能后重答，对比差异'],
      },
    },
    {
      candidate_name: 'AI + 专家技能', candidate_type: 'ai', candidate_note: '同一模型 · 装配「新品上市一页纸提案」', candidate_location: '云端', with_skill: true,
      submitted_at: '2026-09-15T03:26:00Z',
      answer: '【洞察】「下午第三节课眼皮打架，想喝口带气的醒醒神，可一想到奶茶那半杯糖就算了。」\n\n【目标】12 周内，在重点 12 所高校拿到 8% 试用率（约 2.4 万人尝过第一口），4 周复购率 30%。\n\n【策略】只打一个场景、一个渠道：下午犯困 × 校内便利店冰柜。\n- 做：教学楼 / 图书馆动线上的便利店冰柜黄金层陈列；下午 2–4 点在店门口做冰镇试饮；试饮即送「第二瓶半价」。\n- 不做：抖音 / 小红书达人、校园大使、快闪与联名、其余 8 所高校。50 万撑不起线上声量，第一口必须发生在离冰柜 5 米以内。\n\n【预算 50 万 → 漏斗】\n- 看见：12 校 × 3 店 × 3,000 × 3 月 = 32.4 万\n- 第一口：试饮 4 万人次 × 2 元 = 8 万\n- 第二瓶：半价券核销补贴约 6 万\n- 机动 3.6 万\n单个试用成本 ≈ (32.4+8) ÷ 2.4 万 ≈ 16.8 元，远高于单瓶毛利 2.4 元——这 50 万买的不是利润，是「这个场景成不成立」的验证，供全国铺开前决策。\n\n【衡量与止损】每两周看试用率、复购率。第 4 周试用率 < 3%：停地推，预算转买赠；第 8 周复购率 < 15%：判定场景不成立，停止陈列续费，保留约 12 万预算并出复盘。',
      score: 89,
      grading: {
        dimensions: [
          { key: 'insight', score: 24, evidence: '「下午第三节课眼皮打架，想喝口带气的醒醒神，可一想到奶茶那半杯糖就算了」', comment: '一句有场景、有矛盾的心里话，可以直接变成海报文案。' },
          { key: 'goal', score: 14, evidence: '「12 周内，在重点 12 所高校拿到 8% 试用率……4 周复购率 30%」', comment: '有数字、有期限，并主动把范围收缩到 12 校以匹配预算。' },
          { key: 'focus', score: 24, evidence: '「不做：抖音 / 小红书达人、校园大使、快闪与联名、其余 8 所高校」', comment: '一个场景、一个渠道，「不做」写得比「做」还清楚。' },
          { key: 'budget', score: 17, evidence: '「单个试用成本 ≈ 16.8 元，远高于单瓶毛利 2.4 元——这 50 万买的不是利润，是『这个场景成不成立』的验证」', comment: '预算对到了漏斗三环，并且诚实地指出试用成本远高于毛利，把这笔钱重新定义为验证成本——这是成熟的商业判断。' },
          { key: 'stoploss', score: 10, evidence: '「第 4 周试用率 < 3%：停地推……第 8 周复购率 < 15%：判定场景不成立」', comment: '两道止损线，有指标、有时间、有动作。' },
        ],
        summary: '装配专家技能后，同一个模型从 61 分提升到 89 分。变化集中在专家最看重的三件事：洞察变成了一句人话，出现了「不做什么」，出现了止损线。',
        gaps: ['试用率 8% 的依据可以再交代一句'],
        suggestions: ['可作为该任务的参考答案，用于给学生讲评'],
      },
    },
  ],
  invocations: [
    { kind: 'grade', actor: '赵可心（化名）· 留学生自测', actor_location: '墨尔本', tz_offset: 10, occurred_at: '2026-09-05T11:21:00Z', volume: 1, submission: '赵可心（化名）',
      context: '快消管培网申开放第一周。专家已于 4 个月前离开行业。', output_summary: '82 分，指出唯一硬伤是「没有止损线」——和专家当年退回提案的理由一模一样。' },
    { kind: 'answer', actor: 'AI 员工 · Nova', actor_location: '云端', tz_offset: 0, occurred_at: '2026-09-15T03:26:00Z', volume: 1, submission: 'AI + 专家技能',
      context: '同一模型、同一道题，装配技能前后对比。', output_summary: '得分 61 → 89。多出来的是「不做什么」和两道止损线。' },
    { kind: 'grade', actor: '王梓航（化名）· 在校生自测', actor_location: '武汉', tz_offset: 8, occurred_at: '2026-09-18T14:46:00Z', volume: 1, submission: '王梓航（化名）',
      context: '校园宣讲会当晚，宣讲企业的品牌经理已经离场。', output_summary: '31 分，定位「把趋势当洞察」「没有取舍」，建议先只改一件事：写出这次不做什么。' },
    { kind: 'batch', actor: '某高校商学院 · 品牌管理课程作业', actor_location: '武汉', tz_offset: 8, occurred_at: '2026-09-20T02:00:00Z', volume: 84,
      context: '任课老师没有快消从业经历，班里 84 份提案。', output_summary: '批改 84 份，平均 54 分；只有 9 份写了「不做什么」，只有 4 份写了止损线。老师拿这两个数字开了下一堂课。' },
    { kind: 'solve', actor: '杭州某冻干咖啡新品牌 · 创始人助理', actor_location: '杭州', tz_offset: 8, occurred_at: '2026-09-16T12:40:00Z', volume: 1,
      context: '晚上 20:40，第二天一早要向创始人汇报。团队没人做过快消上市，专家已离开行业 4 个月。', output_summary: '把「抖音 + 小红书 + 线下全做」的 30 万方案，改成只打「写字楼下午 3 点」一个场景，并补上两道止损线。',
      input: '我们要在杭州、上海、南京上一款冻干咖啡，预算 30 万，3 个月。老板想抖音、小红书、线下快闪都做。明早要交方案，我该怎么写？',
      output: '先说结论：30 万分到三个渠道、三个城市，每一处都打不透。按下面的顺序重写成一页纸。\n\n1. 先写一句消费者的心里话。不是「年轻白领追求品质咖啡」，而是类似：「下午 3 点想喝杯像样的咖啡，但下楼排队 15 分钟、30 块一杯，算了。」写不出来就先去问 10 个目标用户。\n\n2. 目标要有数字和期限：例如「12 周内，杭州 30 栋写字楼，5,000 人买过第一盒，30% 在 4 周内复购」。\n\n3. 只选一个主战场，并写出「这次不做什么」：建议只做杭州 + 写字楼场景；上海、南京、线下快闪、抖音投放，这次都不做。理由写清楚——30 万撑不起三城声量。\n\n4. 预算对到漏斗：看见（电梯 / 前台陈列）、第一口（写字楼试饮）、第二盒（复购券）。算一下单个试用成本，和你们的单盒毛利放在一起给老板看。\n\n5. 写止损线：第 4 周试用人数低于多少就停掉哪一项；第 8 周复购低于多少就判定场景不成立。\n\n老板想全做很正常，你的方案要让他看到：全做的结果是三个月后什么也证明不了。' },
  ],
};

// ════════════════════════════════════════════════════════════════
// Case C：真空熔炼浇注窗口控制（虚拟工位：设备操作被逐拍采集）
// ════════════════════════════════════════════════════════════════
const CASE_C: SeedCase = {
  skill: {
    slug: 'demo-vacuum-casting-pour-window',
    name: '真空熔炼浇注窗口控制',
    domain: '精密铸造 · 材料成型',
    kind: 'hard',
    summary: '把一炉高温合金在真空里化好、在窗口里浇出去：真空先于升温、模壳先于金属、温度窗口先于速度——每一步都有先后，评的是过程不是结论。',
    expert_name: '周作栋（化名）',
    expert_title: '某航空精铸厂前熔炼工段长 · 20 年经验',
    expert_location: '涿州',
    expert_note: '已于 2026 年 3 月退休，工段的新人由 AI 核心带着在虚拟工位上练',
    tz_offset: 8,
    assigned_agent: 'qa',
    distilled_at: '2026-04-02T02:30:00Z',
    card: {
      scenarios: ['真空感应炉熔炼高温合金、钛合金母合金', '熔模精密铸造叶片、机匣类件的首炉试制', '铸造 / 材料成型方向校招的工艺岗实操考核'],
      steps: [
        { title: '开炉前三张单', detail: '模壳焙烧记录（出炉温度、保温时间）、炉料配料单（牌号、批次、重量）、上一炉的真空压升率。三张单有一张对不上，今天不开炉。' },
        { title: '真空先于升温', detail: '关好炉门、抽到 10 Pa 以下再给功率。真空不到就化料，熔体氧化、夹杂，这一炉就废了。' },
        { title: '模壳先于金属', detail: '模壳预热炉要比熔炼早开，900℃ 以上才算热。模壳出炉到浇注控制在 60 秒内。' },
        { title: '功率分三级', detail: '30% → 60% → 100%。冷坩埚一上来满功率，坩埚热冲击开裂，寿命减半。' },
        { title: '窗口内保温再浇', detail: '接近目标温度就把功率降下来让炉温稳在 1 520–1 580℃，保温 60 秒脱气均温，看着表在窗口里浇。低了冷隔，高了晶粒粗大。' },
        { title: '浇完先停功率', detail: '浇注后功率归零、停泵、断电。浇完还在加热是在烧空坩埚。' },
      ],
      rules: [
        '真空不到 10 Pa 不给功率。',
        '模壳不到 900℃ 不出炉，出炉到浇注不超过 60 秒。',
        '冷坩埚不许满功率起步，功率分三级升。',
        '浇注只认温度窗口，不认「差不多了」。',
        '高温状态下炉门一次都不许开。',
        '冷隔和缩松是两个问题：一个看温度窗口，一个看补缩设计，不要混着改。',
      ],
      good_example: '「真空 6 Pa、模壳 980℃，功率 30 → 60 → 100 分三级，1 500℃ 时降到 64% 稳住，保温 60 秒后 1 540℃ 浇注，随后功率归零、停泵、断电。全程零违规。」',
      bad_example: '「先开炉化料，等化了再抽真空；中途开门看一眼料化没化；模壳还没烤热，看炉温到 1 470 差不多就浇了。」',
      checklist: ['三张单核对了没有', '真空到 10 Pa 以下才给功率', '模壳 900℃ 以上、出炉 60 秒内浇', '功率是不是分级升的', '浇注温度是不是在窗口里', '浇完有没有先停功率'],
    },
    interview: [
      { role: 'ai', content: '新人上工位，你最先看他哪个动作？' },
      { role: 'expert', content: '看他是先开泵还是先给功率。先给功率的，后面不用看了，脑子里没有「真空先于升温」这根弦。' },
      { role: 'ai', content: '你在 1 500℃ 就把功率从 100 降到 64，为什么不冲到 1 560 再降？' },
      { role: 'expert', content: '炉温有惯性，100% 功率冲上去刹不住，一过 1 600 晶粒就粗了。提前降功率是让它自己滑进窗口，然后稳住保温，这样浇注温度是我定的，不是炉子定的。' },
      { role: 'ai', content: '冷隔和缩松出在同一炉，为什么坚持是两个原因？' },
      { role: 'expert', content: '冷隔在薄的叶身，是金属跑不动——温度窗口的事；缩松在厚的榫头，是最后凝固的地方没人补——冒口 / 冷铁的事。把熔炼温度提 100℃ 去治缩松，冷隔是没了，晶粒粗了，等于换一种废。' },
      { role: 'ai', content: '为什么开炉前一定要看上一炉的压升率？' },
      { role: 'expert', content: '炉子漏不漏，抽真空的时候看不出来，得看关泵以后压力涨多快。漏的炉子抽到 10 Pa 也是假的，一给功率就往上跑。' },
      { role: 'ai', content: '评一个新人的操作，你看结果还是看过程？' },
      { role: 'expert', content: '看过程。铸件合不合格有运气成分，顺序对不对没有。顺序对的人，十炉里九炉是好的；顺序错的人，这炉好了是碰上的。' },
    ],
  },
  jd: {
    company: '河北钢研德凯科技有限公司', company_en: 'Hebei Gangyan Dekai Technology', segment: 'china', industry: '新材料 · 精密铸造',
    title: '工艺工程师', job_req_id: 'job-008-079-311', job_type: 'graduate', location: '北京海淀 / 天津武清 / 山东平度 / 河北涿州', country: '中国',
    program_name: '2027 届校园招聘', graduation_year: '硕士研究生及以上', department: '工艺技术', job_function: '工艺 / 研发',
    responsibilities: '1、新产品与技术开发\n（1）组织新产品工艺设计评审，主导铸造工艺方案制定。\n（2）具备编制工艺技术文件，工艺策划 / 总结报告的能力。\n（3）牵头新产品项目开展，对接客户技术 / 结构问题，解决产品工艺问题。\n2、工艺优化与技术提升\n（1）应具备根据产品冶金和尺寸质量表现，独立开展工艺优化和技术攻关的能力。\n（2）掌握 UG / AutoCAD 等制图软件，熟悉 Pro-CAST 仿真软件、尺寸对比软件。\n3、完成领导交办的其他工作。',
    qualifications: '硕士研究生及以上学历，金属材料工程、材料成型及控制工程（铸造或凝固方向）、材料科学与工程、机械设计等相关专业。\n熟练掌握金属材料基础理论知识、铸造凝固理论知识，通过 CET-6 或同等英语水平者优先。\n诚实、敬业、工作积极主动，有较强的责任心和团队合作意识。',
    recruit_process: null,
    url: 'https://m.yingjiesheng.com/job-008-079-311.html',
    source_url: 'https://m.yingjiesheng.com/job-008-079-311.html',
    fetched_at: '2026-09-24',
  },
  task: {
    profile: {
      codename: 'CAST-PROC', tagline: '真空先于升温，模壳先于金属。',
      capabilities: ['真空熔炼操作顺序', '浇注温度窗口控制', '模壳预热与转运节拍', '铸造缺陷归因（冷隔 / 缩松 / 夹杂）', '工艺总结报告'],
      can_solve: ['「首炉试制，开炉前该核对什么」', '「叶片出了冷隔，是提温还是改模壳」', '「同一炉又冷隔又缩松，先改哪个」', '「新人上真空炉，先教他什么顺序」'],
    },
    jd_breakdown: [
      { duty: '组织新产品工艺设计评审，主导铸造工艺方案制定', capability: '工艺方案 · 评审', task_idea: '为一款新叶片写熔炼浇注工艺卡并主持评审' },
      { duty: '根据产品冶金和尺寸质量表现，独立开展工艺优化和技术攻关', capability: '缺陷归因 · 工艺优化', task_idea: '看一批 X 光 / 荧光结果，判断冷隔与缩松各自的原因并给出下一炉调整', chosen: true },
      { duty: '具备编制工艺技术文件，工艺策划 / 总结报告的能力', capability: '工艺总结', task_idea: '把一炉操作写成评审会上能讲的工艺总结', chosen: true },
      { duty: '熟悉 Pro-CAST 仿真软件', capability: '充型 / 凝固仿真', task_idea: '用仿真结果说明冒口该加在哪' },
      { duty: '牵头新产品项目开展，对接客户技术 / 结构问题', capability: '客户技术对接', task_idea: '把一个结构不可铸的问题讲给客户听' },
    ],
    title: '涡轮叶片首炉试制：在虚拟工位上把这一炉浇出去',
    brief: '以河北钢研德凯「工艺工程师」的岗位职责为起点（主导铸造工艺方案、根据冶金质量表现做工艺优化、编制工艺总结）。以下是一道虚构的练习题，设备参数与数据为教学化的简化模型，与相关企业的实际工艺无关。\n\n假设你是精密铸造厂的工艺工程师。一款新涡轮叶片首批试制，今天由你在真空感应熔炼浇注工位上浇第一炉——这一步不是选选项，是真的把设备开起来：抽真空、烤模壳、化料、保温、浇注、停机。系统会记录你每一次拨动、每一次越线、每一个目标达成，并每隔几秒对面板拍一张快照。\n\n第二天检验结果出来，你要判断隔壁班组那批叶片的缺陷原因，定下一炉的调整，并写成工艺总结。',
    materials: [
      '【工位参数（教学化简化模型）】',
      '- 合金：镍基高温合金母合金，目标浇注温度 1 520–1 580℃；低于 1 480℃ 冷隔 / 浇不足，高于 1 580℃ 晶粒粗大，超过 1 600℃ 视为过热',
      '- 真空：熔炼要求 ≤ 100 Pa，目标 ≤ 10 Pa；炉门打开真空立即失效',
      '- 模壳：预热炉可加热到约 980℃，浇注要求 ≥ 850℃，目标 ≥ 900℃',
      '- 感应加热功率 0–100%，冷坩埚不宜一上来满功率；真空不足时感应效率明显下降',
      '- 时间尺度：1 秒真实时间 = 10 秒模拟时间，专家一炉约 13 分钟模拟时间',
      '【隔壁班组首批记录】浇注温度 1 475℃，模壳出炉到浇注约 4 分钟，真空 8 Pa；结果 4 片叶身冷隔、2 片榫头缩松',
    ].join('\n'),
    deliverable: '一段完整的工位操作记录（系统自动采集）+ 不超过 500 字的工艺总结：本炉参数与先后顺序、缺陷原因、下一炉调整、风险。',
    time_limit_min: 45,
    rubric: [
      { key: 'sequence', name: '工序先后', weight: 25, description: '真空先于升温、模壳先于金属、功率分级、浇完先停功率——看操作记录里的实际顺序。' },
      { key: 'window', name: '浇注窗口控制', weight: 25, description: '是否在 1 520–1 580℃ 稳住并保温后浇注；浇注时真空、模壳温度是否达标。' },
      { key: 'safety', name: '安全与违规', weight: 15, description: '操作记录里的违规次数：高温开门、真空不足化料、过热、浇完继续加热。' },
      { key: 'diagnosis', name: '缺陷归因', weight: 20, description: '能否把冷隔和缩松分开归因，并给出对应而非笼统的调整。' },
      { key: 'report', name: '工艺总结', weight: 15, description: '总结是否写清关键参数、先后顺序、下一炉调整与风险，能在评审会上讲。' },
    ],
  },
  submissions: [
    {
      candidate_name: '孟昭宇（化名）', candidate_type: 'human', candidate_note: '某 985 高校材料加工工程硕士在读 · 2027 届', candidate_location: '沈阳', with_skill: false,
      submitted_at: '2026-09-19T08:40:00Z',
      answer: '本炉顺序：电源 → 真空泵 → 功率 40% 起步 → 60 秒后才想起开模壳预热炉 → 功率 80%。炉温到 1 479℃ 时看着差不多就浇了，随后功率归零、断电。真空 5 Pa、模壳 980℃，浇注温度偏低。\n\n隔壁班组的冷隔主因是浇注温度 1 475℃ 加上模壳等了 4 分钟；榫头缩松可能也和温度低有关，充型不好。\n\n下一炉：浇注温度提到 1 540–1 560℃，模壳出炉 60 秒内浇；浇注速度放慢一点减少卷气。\n\n风险：我这炉也浇低了，说明「看着差不多」不可靠，应该以表为准。',
      score: 58,
      grading: {
        dimensions: [
          { key: 'sequence', score: 15, evidence: '操作顺序：炉体电源 → 真空泵 → 感应加热功率 → 模壳预热炉 → 浇注', comment: '真空先于升温做对了；但模壳预热炉晚了 60 秒才开，功率 40% 起步偏高。' },
          { key: 'window', score: 8, evidence: '11:30 按下「浇注」（炉温 1 470℃）', comment: '没有等炉温进窗口、没有保温，1 470℃ 就浇了——这一炉大概率和隔壁班组一样冷隔。' },
          { key: 'safety', score: 12, evidence: '违规 1（浇注温度低于 1 480℃），提醒 1（热冲击）', comment: '没有开门、没有过热，只有冷浇一条违规。' },
          { key: 'diagnosis', score: 12, evidence: '「榫头缩松可能也和温度低有关」', comment: '冷隔归因准确；但把缩松也归到温度上，两种缺陷没有分开，所以下一炉没有针对榫头的补缩措施。' },
          { key: 'report', score: 11, evidence: '「我这炉也浇低了，说明『看着差不多』不可靠，应该以表为准」', comment: '总结诚实，参数和顺序写清了，风险点抓得准。' },
        ],
        summary: '顺序意识是有的，缺的是「窗口」意识：接近目标温度没有降功率保温，凭感觉浇。缺陷归因把两种缺陷混在一起。',
        gaps: ['浇注温度低于窗口', '没有保温', '缩松没有单独归因'],
        suggestions: ['接近 1 500℃ 时把功率降到 60% 左右让炉温稳住，保温 60 秒后看着表浇', '榫头缩松要看冒口 / 冷铁，不是温度'],
      },
    },
    {
      candidate_name: '李承泽（化名）', candidate_type: 'human', candidate_note: '某 211 高校机械设计制造及其自动化 · 大四', candidate_location: '济南', with_skill: false,
      submitted_at: '2026-09-22T12:15:00Z',
      answer: '本炉操作：开电源后直接满功率化料，化到一半开泵抽真空，中途开炉门看了一眼料化没化，后来开了模壳预热炉，炉温 1 468℃ 时浇注。\n\n隔壁班组的问题我认为主要是母合金成分不稳定和操作工不够细心。\n\n下一炉建议：把熔炼温度整体提高 100℃ 保证充型；对操作工加强培训。',
      score: 22,
      grading: {
        dimensions: [
          { key: 'sequence', score: 4, evidence: '操作顺序：炉体电源 → 感应加热功率 → 真空泵 → 模壳预热炉 → 炉门 → 浇注', comment: '先化料后抽真空，模壳最后才烤，顺序全反。' },
          { key: 'window', score: 3, evidence: '11:40 按下「浇注」（炉温 1 468℃，模壳 970℃）', comment: '没有进过窗口，冷浇。' },
          { key: 'safety', score: 2, evidence: '违规 4：真空不足时熔炼 ×2、高温开炉门、浇注温度低于 1 480℃；提醒 2', comment: '1 273℃ 时打开炉门，在真实车间是安全事故。' },
          { key: 'diagnosis', score: 5, evidence: '「主要是母合金成分不稳定和操作工不够细心」', comment: '记录里明明写着 1 475℃ 浇注、模壳等了 4 分钟，却归到成分和责任心上；「整体提高 100℃」会把冷隔换成粗晶。' },
          { key: 'report', score: 8, evidence: '「开电源后直接满功率化料，化到一半开泵抽真空」', comment: '把自己的操作如实写了，这是可取的；但没有参数、没有风险。' },
        ],
        summary: '这份记录的价值在于它把「没有顺序意识」完整地采下来了：先化料后抽真空、高温开门、冷浇。归因也绕开了记录里的直接证据。',
        gaps: ['真空先于升温', '模壳先于金属', '高温开门', '缺陷归因绕开证据'],
        suggestions: ['先只记一条：真空到 10 Pa 以下再给功率', '看一遍专家的操作回放，对照自己的事件流'],
      },
    },
    {
      candidate_name: 'AI 裸答', candidate_type: 'ai', candidate_note: '通用大模型 · 未装配技能', candidate_location: '云端', with_skill: false,
      submitted_at: '2026-09-23T02:05:00Z',
      answer: '操作：开电源、开真空泵、开模壳预热炉，随后加热功率设为 100% 快速升温；炉温超过 1 600℃ 后降到 40%，在 1 589℃ 浇注；浇注后功率归零、停泵、断电。\n\n缺陷分析：冷隔由浇注温度和模壳温度偏低引起；榫头缩松由补缩不足引起；真空度和母合金成分为次要因素。\n\n下一炉：整体提高熔炼温度 100℃ 以保证充型；榫头处增加冒口并用 ProCAST 复算。',
      score: 54,
      grading: {
        dimensions: [
          { key: 'sequence', score: 16, evidence: '操作顺序：炉体电源 → 真空泵 → 模壳预热炉 → 感应加热功率 → 浇注；浇后功率归零、停泵、断电', comment: '大顺序是对的，收尾也对；但功率 100% 起步，真空还没到就在化料。' },
          { key: 'window', score: 7, evidence: '07:51 过热 1 601℃ → 08:20 按下「浇注」（1 589℃）', comment: '冲过上限再降功率，浇注仍高于窗口。知道窗口在哪，但不会「提前降功率让它滑进去」。' },
          { key: 'safety', score: 6, evidence: '违规 3：真空不足时熔炼、过热、浇注温度高于 1 580℃', comment: '没有开门，但过热和热浇都发生了。' },
          { key: 'diagnosis', score: 14, evidence: '「冷隔由浇注温度和模壳温度偏低引起；榫头缩松由补缩不足引起」', comment: '两种缺陷分开归因，准确；但下一炉又选了「整体提高 100℃」，和自己的归因矛盾。' },
          { key: 'report', score: 11, evidence: '「炉温超过 1 600℃ 后降到 40%」', comment: '参数写清了，但对过热和热浇没有任何反思，也没有风险。' },
        ],
        summary: '通用模型「知道」该做什么（顺序、归因都对），但在设备上不会控制：满功率冲、冲过头再降、偏热浇。知道和会做之间的差距，正是这个工位要采的东西。',
        gaps: ['功率不分级', '不会提前降功率保温', '调整措施与归因矛盾'],
        suggestions: ['装配专家技能后重跑，对比事件流'],
      },
    },
    {
      candidate_name: 'AI + 专家技能', candidate_type: 'ai', candidate_note: '同一模型 · 装配「真空熔炼浇注窗口控制」', candidate_location: '云端', with_skill: true,
      submitted_at: '2026-09-23T02:12:00Z',
      answer: '本炉顺序：电源 → 模壳预热炉 → 真空泵；真空 10 Pa 以下才给功率，30% → 60% → 100% 三级升；1 500℃ 附近降到 65% 让炉温稳在 1 520–1 580℃，保温 60 秒后在 1 543℃ 浇注，模壳 980℃、真空 5 Pa；随后功率归零、停泵、断电。全程无违规、无提醒。\n\n隔壁班组：冷隔是温度窗口没守住（1 475℃ + 模壳等了 4 分钟）；榫头缩松是补缩问题，与浇注温度无关。两个问题分开改。\n\n下一炉：浇注目标 1 540–1 560℃，模壳出炉到浇注 60 秒内；榫头加冒口 / 冷铁并用 ProCAST 复算。风险：新人容易满功率起步，建议把三级升温写进作业指导书。',
      score: 91,
      grading: {
        dimensions: [
          { key: 'sequence', score: 24, evidence: '操作顺序：炉体电源 → 模壳预热炉 → 真空泵 → 感应加热功率 → 浇注；功率 30 → 60 → 100 → 65 → 0', comment: '和专家的先后顺序完全一致，功率分级、浇完先停功率。' },
          { key: 'window', score: 24, evidence: '12:13 达成「炉温进入 1 520–1 580℃ 并保温 60 秒」→ 12:32 按下「浇注」（1 543℃）', comment: '提前降功率让炉温滑进窗口并稳住，保温后浇，浇注温度是自己定的。' },
          { key: 'safety', score: 15, evidence: '违规 0，提醒 0', comment: '零违规。' },
          { key: 'diagnosis', score: 17, evidence: '「冷隔是温度窗口没守住……榫头缩松是补缩问题，与浇注温度无关。两个问题分开改」', comment: '归因和调整一一对应。' },
          { key: 'report', score: 11, evidence: '「建议把三级升温写进作业指导书」', comment: '参数、顺序、调整、风险齐全；篇幅可以再压一点。' },
        ],
        summary: '装配专家技能后，同一个模型从 54 分到 91 分。变化不在「知道什么」——两次归因都对——而在设备上的手法：功率分级、提前降功率保温、在窗口里浇。这正是事件流能采到、文字答案采不到的部分。',
        gaps: ['总结篇幅可以更紧'],
        suggestions: ['可作为该工位的参考回放，给新人对照自己的事件流'],
      },
    },
  ],
  invocations: [
    { kind: 'grade', actor: '孟昭宇（化名）· 研究生自测', actor_location: '沈阳', tz_offset: 8, occurred_at: '2026-09-19T08:41:00Z', volume: 1, submission: '孟昭宇（化名）',
      context: '校招网申开放第一周。专家半年前退休，工段里已经没人带新人上炉。', output_summary: '58 分。事件流指出 1 470℃ 就浇、没有保温，和他自己总结里「看着差不多」对上了。' },
    { kind: 'grade', actor: '李承泽（化名）· 在校生自测', actor_location: '济南', tz_offset: 8, occurred_at: '2026-09-22T12:16:00Z', volume: 1, submission: '李承泽（化名）',
      context: '宣讲会当晚试了一次虚拟工位。', output_summary: '22 分。先化料后抽真空、1 273℃ 开炉门——如果是真炉子这是事故。建议先只记一条规则。' },
    { kind: 'answer', actor: 'AI 员工 · Nova', actor_location: '云端', tz_offset: 0, occurred_at: '2026-09-23T02:12:00Z', volume: 1, submission: 'AI + 专家技能',
      context: '同一模型、同一台设备，装配技能前后对比。', output_summary: '54 → 91。归因两次都对，差的是设备上的手法：功率分级、提前降功率、窗口里浇。' },
    { kind: 'batch', actor: '某高校材料学院 · 铸造工艺课实验', actor_location: '沈阳', tz_offset: 8, occurred_at: '2026-09-23T06:00:00Z', volume: 46,
      context: '课程没有真空炉可用，46 名学生在虚拟工位上各浇一炉。', output_summary: '46 条事件流：31 人先给功率后抽真空，17 人高温开过炉门，只有 6 人在窗口内浇注。老师把这三个数字放进了下一堂课。' },
    { kind: 'solve', actor: '山东某精铸厂 · 工艺员', actor_location: '平度', tz_offset: 8, occurred_at: '2026-09-21T09:30:00Z', volume: 1,
      context: '早班第一炉叶片出了冷隔，厂里的老师傅休假，中午前要定下一炉怎么改。', output_summary: '把「整体提温 100℃」的提议改成「浇注目标 1 540–1 560℃ + 模壳出炉 60 秒内浇」，并提醒榫头缩松要单独看冒口。',
      input: '早上那炉叶片 X 光出来叶身有冷隔，两片榫头还有缩松。我们浇注温度记录是 1 478，模壳出炉后等了大概三四分钟才浇。班长说下一炉直接把温度提 100 度，行不行？',
      output: '不建议整体提 100 度。你这两种缺陷是两个原因，得分开改。\n\n1. 冷隔：1 478℃ 本来就贴着下限，模壳又等了三四分钟，等于金属和模壳都凉了。下一炉把浇注目标定在 1 540–1 560℃，模壳出炉到浇注控制在 60 秒内，冷隔基本就没了。提到 1 580 以上晶粒会粗，是换一种废。\n\n2. 榫头缩松：厚大部位最后凝固没人补，跟浇注温度关系不大。看榫头上方有没有冒口、够不够大，或者加冷铁让它先凝；有条件用 ProCAST 复算一下。\n\n另外确认一下：真空是不是 10 Pa 以下才给的功率，接近目标温度有没有降功率保温 60 秒。这两条不做，温度提上去也不稳。' },
  ],
};

export const SEED_CASES: SeedCase[] = [CASE_A, CASE_B, CASE_C];
