/**
 * 百业工厂 · 生成要求（2026-11-06，用户：借鉴真活，出空间分两层——先定位到一个东西，再定细节）。
 *
 * 第一层「定位」Anchor：这个空间到底是哪一个——职业库里的一个职业 / 岗位库里的一条 JD / 粘贴的 JD / 一个学科研究领域。
 *   中间对上职业实体、企业实体；粒度跟着受众走（高中生落到「程序员」「前端 / 后端」这一级，不落到「高级 SRE」）。
 * 第二层「生成要求」GenSpec：都是自然语言——给谁看、要多深、考核多难（操作要不要精准）、参考资料、必须放进去的、不要的。
 *
 * 两样都存在 skill_tasks.jd_snapshot（anchor / spec 两个键，不用加列），从出故事线、设计工位、美术、排一天、每一章、评分到评审都读它
 * （以前只有职业探索写死的一句，而且只进了第一步）。用户的要求排在固定口径之后、明确写「冲突时以用户要求为准」。
 */

export type AnchorKind = 'occupation' | 'job' | 'pasted' | 'career' | 'discipline';
export type Anchor = {
  kind: AnchorKind;
  label: string;                 // 定位到的名字：职业名 / 岗位名 / 学科名
  occupation_id?: number | null; // 职业库
  job_id?: number | null;        // 岗位库
  company?: string | null;       // 企业名（JD / 粘贴的 JD）
  company_id?: number | null;
  from?: string;                 // 用户最开始输入的原话（比如「高级 SRE」），定位后落到 label
};

export type SpecRef = { name: string; text: string };
/**
 * 形态（11-06，用户：试试真正适合高中生的体验，和大学生虚拟实训、行业资格考核有什么不同）——不只是难度高低，是目的不同，结构跟着变：
 *   career  生涯体验：看清这一行、看清自己。体验者是来跟岗的学生；误解 → 真相、跟着做、尝一口、见不同的人、收尾「我和这一行」（兴趣 / 能力 / 选科 / 专业 / 入行的路）；很多题没有标准答案，看理由。
 *   training 虚拟实训：练会一项手艺 / 一套流程。体验者是这个专业的学生；按实训模块（准备与安全 → 关键工序 → 质检 → 故障排除），对规程、参数、原理。
 *   certify  资格考核：按国家职业技能标准对应等级考。体验者是考生；检录 → 理论 → 技能操作（限时、按评分细则、有否决项）→ 评定。
 * 不填 = 以前的「新人上班的一天」。
 */
export type SpaceForm = 'career' | 'training' | 'certify';
export const FORMS: Record<SpaceForm, { label: string; who: string; essence: string; day: string; chapter: string; bench: string; score: string }> = {
  career: {
    label: '生涯体验',
    who: '来这一行跟岗体验一天的学生（不是已经入职的员工）：有带他的师傅，他看、问、在师傅允许时上手一小段',
    essence: '让还没选专业的人看清这一行每天在干什么、需要什么样的人，再看清自己适不适合——不是培训，也不是考证',
    day: `排 5–6 格，大致这样走（时段照这一行真实的一天）：
  ① 到岗 · 「你以为 vs 真的」：一开场就用一个很多人对这一行的印象（偏美化或偏贬低的都行），被一天里第一件真事打破；
  ②③ 跟着做 2 格：这一行最有代表性的活，师傅先做给你看、讲为什么，你在安全的范围里上手一小段（其中一格放动手的虚拟工位）；
  ④ 见不同的人：和同事 / 客户 / 上下游打交道，看这一行除了手艺还要什么（沟通、责任、合作、情绪）；
  ⑤ 一个小插曲：看这一行真实的压力和责任（加急单、出错、投诉），重在看师傅怎么处理，不罚体验者；
  ⑥ 收尾 · 「我和这一行」（kind 用 assessment）：回看这一天，最喜欢 / 最不想做的时刻，这一行用到的兴趣和能力，怎么进这一行（高中选科、对口的高职 / 本科专业、常见证书、入行起点和往上走的路、收入按公开常识说范围）。`,
    chapter: `每章 3–5 步。题目以「判断 + 说理由」为主，少考记忆；每章至少一题没有标准答案（问他更想怎么做、这一刻什么感受、更喜欢哪一种做法），用 text 题，示范答案写一个真实学生可能的想法，评分只看理由说没说清；
术语一出现就用一句大白话解释；台词里师傅会讲「为什么这样做」。收尾那章不考知识：回看、自我认识、进这一行的路（选科和专业说常见情况，注明「以各校招生章程为准」）。`,
    bench: '工位是「尝一口」：只做这一行最核心的一个动作，操作宽松（大致在合理范围就过），重在手感、节奏和成就感；红线只留真会伤人的安全规矩；做完师傅点评一句。',
    score: '评分看理解了没有、理由说没说清、对自己有没有新认识；不看操作精度和速度，没有标准答案的题只要言之有理就给分。',
  },
  training: {
    label: '虚拟实训',
    who: '这个专业的学生，在实训室按实训任务书操作，有实训老师指导',
    essence: '让专业学生练会一项手艺或一套标准流程，替代贵、危险或难得一见的真实实训——对应专业课和实训大纲',
    day: `不按一天排，按实训模块排 4–6 格，时段写「模块1」「模块2」…：
  ① 实训准备与安全：任务书、工具材料、安全和卫生要求；
  ②③④ 关键工序：每个模块一道工序，讲原理 → 规范操作 → 关键参数 → 常见缺陷（其中至少一格放动手的虚拟工位）；
  ⑤ 质量检验 / 故障排除：给一个有缺陷的结果，找原因、提整改；
  ⑥ 实训小结（kind 用 assessment）：写实训报告的关键几项（数据、问题、改进）。`,
    chapter: '每章 4–6 步，题目对照操作规程：操作顺序、参数范围、原理（为什么是这个温度 / 时间）、缺陷诊断；示范答案按规范做法写，说明依据；术语按专业说法用，不必大白话。',
    bench: '工位做一道完整工序：参数要在规范范围内（允许小偏差），顺序要对，过程数据要能复盘；违反操作规程要扣分。',
    score: '评分看关键操作是否到位、参数是否在规范范围、能否说清原理和缺陷原因。',
  },
  certify: {
    label: '资格考核',
    who: '参加这一职业技能等级认定 / 资格考核的考生',
    essence: '按这一职业的国家职业技能标准（或行业资格）对应等级考核：理论知识 + 技能操作，按评分细则打分，有否决项',
    day: `按考核流程排 4–5 格，时段写「考核1」「考核2」…：
  ① 检录与考前准备：核对工具材料、着装和卫生、读懂考题要求；
  ② 理论知识：覆盖标准里这个等级要求的知识点（单选 / 多选 / 判断）；
  ③④ 技能操作 1–2 项：限时，按评分细则（其中至少一格放动手的虚拟工位）；
  ⑤ 成品评定与职业素养（kind 用 assessment）：按标准评成品 / 结果，安全、卫生、文明操作。`,
    chapter: '每章 4–8 步，题目像正式考题：表述规范、唯一正确答案、数值精确，不讲故事不用大白话；每题依据标准里的哪个知识点 / 技能要求，写进示范答案的说明里。',
    bench: '工位按考核细则：参数容差按标准，限时，违反安全卫生或关键工艺的直接判不合格（否决项）。',
    score: '按评分细则逐项打分，60 分合格；否决项一票否决；理论与技能分开计。',
  },
};
export const isForm = (v: any): v is SpaceForm => v === 'career' || v === 'training' || v === 'certify';
export type GenSpec = {
  preset?: string;               // 用了哪个预设（只做记录）
  form?: SpaceForm;              // 形态：生涯体验 / 虚拟实训 / 资格考核（不填 = 新人上班的一天）
  audience?: string;             // 给谁看
  depth?: string;                // 要多深：职业讲到哪一级、日常任务要多有代表性
  difficulty?: string;           // 考核多难：操作精准度、评分严不严
  must?: string;                 // 必须放进去的（场景、设备、流程、某段文案）
  avoid?: string;                // 不要的
  refs?: SpecRef[];              // 参考资料（上传 / 粘贴，已抽成文字）
  updated_at?: string;
};

/** 常用组合：点一下填好四项，人再改。说法都是给模型看的自然语言 */
export const PRESETS: { key: string; label: string; spec: Omit<GenSpec, 'preset' | 'refs' | 'updated_at'> }[] = [
  {
    key: 'highschool', label: '高中生涯体验',
    spec: {
      form: 'career',
      audience: '高中生，还没选专业，对这个职业只有模糊印象；要让他们看懂这一行每天在干什么、适不适合自己。',
      depth: '职业讲到大家都认得的那一级（如「程序员」，最多分前端 / 后端），不下钻到资深或细分岗位；一天里的任务挑这一行最普遍、最有代表性的，不挑冷门的专项。术语一出现就用一句大白话解释。',
      difficulty: '难度低：看懂、做对方向、说出理由就算过。工位操作只要大致在合理范围内就给分，不要求每一步精细准确；红线只留这一行真会出安全事故的。评分重理解和判断，不重操作精度和速度。',
    },
  },
  {
    key: 'college', label: '大学生职业探索',
    spec: {
      form: 'career',
      audience: '本科生，在想毕业去哪一行、或者在找第一份实习。',
      depth: '落到具体岗位（如「后端开发工程师」），任务贴近入职第一年真实会做的事；术语适当解释。',
      difficulty: '中等：比校招笔试低一档。工位要做对关键操作，允许小的偏差；评分看判断和关键操作是否到位。',
    },
  },
  {
    key: 'newhire', label: '校招 / 新人上岗',
    spec: {
      audience: '刚入职或即将入职的新人，要尽快上手这个岗位。',
      depth: '按真实岗位的日常来，覆盖新人最常做、最容易出错的事。',
      difficulty: '接近岗位真实要求：关键操作要准，违规就扣分；评分看结果和过程是否规范。',
    },
  },
  {
    key: 'training', label: '大学生虚拟实训',
    spec: {
      form: 'training',
      audience: '这个方向的高职 / 本科在读学生，已经学过专业基础课，要在实训里把一项手艺或一套流程练会。',
      depth: '落到这一行的核心工序，按真实操作规程和参数来；覆盖常见缺陷和故障。',
      difficulty: '中等偏上：顺序和关键参数要对，允许小偏差；违反操作规程扣分。',
    },
  },
  {
    key: 'certify', label: '职业资格考核',
    spec: {
      form: 'certify',
      audience: '准备参加这一职业技能等级认定（初级工 / 五级）的考生。',
      depth: '按这一职业国家职业技能标准里初级工的知识要求和技能要求来，题型和评分像正式考核。',
      difficulty: '按考核标准：限时、按评分细则打分、60 分合格，安全卫生和关键工艺是否决项。',
    },
  },
  {
    key: 'pro', label: '在职提升',
    spec: {
      audience: '已经在这一行工作几年的人，想补短板或往上走一级。',
      depth: '挑这一行有难度、有取舍的场景，可以细分到专项。',
      difficulty: '高：操作要精准、要处理突发；评分严格。',
    },
  },
];

/** 局部改的常用说法（工作室里做成可点的小标签） */
export const REVISE_CHIPS = {
  step: ['难度降一档', '难度升一档', '换个更常见的场景', '术语加一句大白话解释', '说法更口语', '选项更有迷惑性', '缩短一点'],
  opening: ['开场更有画面感', '说清楚这一章要干什么', '更口语', '缩短一点'],
  bench: ['操作不用那么精准，大致合理就给分', '红线只留真会出事故的', '换一台这一行更常见的设备', '加一个中途突发'],
} as const;

/** 一份生成要求有没有填东西 */
export const hasSpec = (s?: GenSpec | null) => !!s && !!(s.form || s.audience || s.depth || s.difficulty || s.must || s.avoid || s.refs?.length);

/** 参考资料进提示词时的总长度上限（太长会挤掉正事） */
const REF_BUDGET = 5000;

/** 生成要求 → 一段给模型看的话。每一个生成环节都拼在自己的提示词里 */
export function renderSpec(spec?: GenSpec | null, anchor?: Anchor | null): string {
  if (!hasSpec(spec) && !anchor?.from) return '';
  const s = spec || {};
  const lines: string[] = ['【用户的生成要求（每一步都要遵守；和上面的固定口径冲突时，以这里为准）】'];
  if (anchor?.from && anchor.from !== anchor.label) lines.push(`· 用户最初说的是「${anchor.from}」，已经定位到「${anchor.label}」这一级：就按「${anchor.label}」来做，不要回到更细、更资深的岗位上。`);
  if (s.form && FORMS[s.form]) { const f = FORMS[s.form]; lines.push(`· 形态：${f.label}——${f.essence}。体验者是${f.who}。工位：${f.bench}评分：${f.score}`); }
  if (s.audience) lines.push(`· 给谁看：${s.audience}`);
  if (s.depth) lines.push(`· 深度：${s.depth}`);
  if (s.difficulty) lines.push(`· 考核难度：${s.difficulty}`);
  if (s.must) lines.push(`· 必须放进去：${s.must}`);
  if (s.avoid) lines.push(`· 不要：${s.avoid}`);
  if (s.refs?.length) {
    let left = REF_BUDGET;
    const parts: string[] = [];
    for (const r of s.refs) { if (left <= 200) break; const t = r.text.slice(0, Math.min(left, 2500)); left -= t.length; parts.push(`《${r.name}》\n${t}`); }
    lines.push(`· 参考资料（照着它的场景、流程、说法来，不要照抄成题目原文）：\n${parts.join('\n---\n')}`);
  }
  return lines.join('\n');
}

/** 从空间的 jd_snapshot 读出要求文字（没有就空串） */
export function specTextOf(jdSnapshot: any): string {
  return renderSpec(jdSnapshot?.spec || null, jdSnapshot?.anchor || null);
}

/** 用户 / 前端传来的要求做清洗：只留认识的键、截长度 */
export function cleanSpec(raw: any): GenSpec {
  const t = (v: any, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const refs = Array.isArray(raw?.refs) ? raw.refs.slice(0, 6).map((r: any) => ({ name: t(r?.name, 80) || '参考资料', text: t(r?.text, 12000) })).filter((r: SpecRef) => r.text.length > 20) : [];
  const out: GenSpec = { preset: t(raw?.preset, 40) || undefined, form: isForm(raw?.form) ? raw.form : undefined, audience: t(raw?.audience, 600), depth: t(raw?.depth, 800), difficulty: t(raw?.difficulty, 800), must: t(raw?.must, 1500), avoid: t(raw?.avoid, 800), refs, updated_at: new Date().toISOString() };
  for (const k of Object.keys(out) as (keyof GenSpec)[]) if (out[k] === undefined || out[k] === '' || (Array.isArray(out[k]) && !(out[k] as any[]).length)) delete out[k];
  return out;
}

export function cleanAnchor(raw: any): Anchor | null {
  const kinds: AnchorKind[] = ['occupation', 'job', 'pasted', 'career', 'discipline'];
  if (!raw || !kinds.includes(raw.kind)) return null;
  const label = String(raw.label || '').trim().slice(0, 60);
  if (!label) return null;
  const n = (v: any) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  return { kind: raw.kind, label, occupation_id: n(raw.occupation_id), job_id: n(raw.job_id), company: raw.company ? String(raw.company).slice(0, 60) : null, company_id: n(raw.company_id), from: raw.from ? String(raw.from).trim().slice(0, 60) : undefined };
}

/** 这个空间的形态（排一天、写章节按它换结构；没有就 null） */
export const formOf = (jdSnapshot: any): SpaceForm | null => (isForm(jdSnapshot?.spec?.form) ? jdSnapshot.spec.form : null);
