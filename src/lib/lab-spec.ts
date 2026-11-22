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
 *   assess   职业虚拟考核：新人上岗的真实一天，按岗位要求考（像入职考核 / 校招工作样本），不对标国家证书。
 *   certify  资格考核：按国家职业技能标准对应等级考。体验者是考生；检录 → 理论 → 技能操作（限时、按评分细则、有否决项）→ 评定。
 * 不填 = 以前的「新人上班的一天」（老空间）。
 * 11-06 晚用户：难度订几个级，人工填表和聊着出都让人点选——就是这四档（按 LEVEL_ORDER 由浅到深），每档写清证书是什么（生涯体验只有体验证书）。
 */
export type SpaceForm = 'career' | 'training' | 'assess' | 'certify';
export const LEVEL_ORDER: SpaceForm[] = ['career', 'training', 'assess', 'certify'];
export const FORMS: Record<SpaceForm, { label: string; pick: string; cert: string; who: string; essence: string; day: string; chapter: string; bench: string; score: string }> = {
  career: {
    label: '生涯体验',
    pick: '看看这一行每天干什么、自己适不适合；操作最简单，不计时',
    cert: '只发体验证书，不是考核证书',
    who: '来这一行跟岗体验一天的学生（不是已经入职的员工）：有带他的师傅，他看、问；工位默认是看师傅做（11-12 起），工厂里关了「只观摩」才自己上手一小段',
    essence: '让还没选专业的人看清这一行每天在干什么、需要什么样的人，再看清自己适不适合——不是培训，也不是考证',
    day: `排 5–6 格，大致这样走（时段照这一行真实的一天）：
  ① 到岗 · 「你以为 vs 真的」：开场先由师傅用一两句话说清今天来干什么（来看看这一行、也看看自己，不是考试，做错了没关系），再用一个很多人对这一行的印象（偏美化或偏贬低的都行），被一天里第一件真事打破；
  ②③ 看师傅做 2 格：这一行最有代表性的活，师傅一边做一边讲为什么，学生看着、回答「看到了什么、为什么这么做」（其中一格放虚拟工位，默认由师傅操作、学生观摩）；
  ④ 见不同的人：和同事 / 客户 / 上下游打交道，看这一行除了手艺还要什么（沟通、责任、合作、情绪）；
  ⑤ 一个小插曲：看这一行真实的压力和责任（加急单、出错、投诉），重在看师傅怎么处理，不罚体验者；
  ⑥ 收尾 · 「我和这一行」（kind 用 assessment）：回看这一天，最喜欢 / 最不想做的时刻，这一行用到的兴趣和能力，怎么进这一行（高中选科、对口的高职 / 本科专业、常见证书、入行起点和往上走的路、收入按公开常识说范围）。`,
    chapter: `操作要简单：题干短、一题只问一件事，选择题 3 个选项、一眼能看懂；题目以「判断 + 说理由」为主，少考记忆，不考数值和规范条文；术语一出现就用一句大白话解释；台词里师傅会讲「为什么这样做」。工位默认是学生看师傅做：台词和题干别写「你来试试」「换你上手」「你操作一下」，写成「看我怎么做」「注意看这一下」，工位后面接一道「刚才师傅为什么先……」的判断题。
只有第 1 段（时段最早的那一章）的开场先说清这次体验的目的：来看看这一行每天在干什么、需要什么样的人，也看看自己喜不喜欢；不是考试，也不是职业考核。后面各段不要再重复这句（体验页顶上已经有说明卡），开场直接接着这一天往下走。
问兴趣、偏好、感受、「接下来想了解哪个方向」的题只能用 text，不要做成 choose / multi（出了示范答案就会把别人的兴趣判错）。
题量、题型、反思题放在哪，见下面「生涯体验的写法」（11-20 起：每段 3 道决策题，全天只在最后一段写一次反思）。
收尾「我和这一行」那章：收拾工位最多 1 步；进这一行的路（高中选科、对口专业、证书、入行起点、往上走的路、收入范围）写进开场和师傅的台词里讲给他听（选科和专业说常见情况，注明「以各校招生章程为准」），
题目问自己：一天里最喜欢 / 最不想做的时刻、这一行用到的哪种能力自己有或没有、接下来想多了解哪个方向（专业 / 职业），不考知识。`,
    bench: '工位是「看师傅做一遍」（默认只观摩；工厂里关掉只观摩时学生自己上手，所以操作仍要简单）：只做这一行最核心的一个动作，控件 2–3 个、目标 2–3 个、一步一提示，第一次上手的人 2 分钟内能做完；操作宽松（大致在合理范围就过），不考精确数值和速度——规则里不要写「超过 N 秒没做」这种计时；红线只留真会伤人的安全规矩（擅自给药、带电操作这类）；做完师傅点评一句。',
    score: '评分看理解了没有、理由说没说清、对自己有没有新认识；不看操作精度和速度，没有标准答案的题只要言之有理就给分。',
  },
  training: {
    label: '模拟实践',
    pick: '按操作规程把一道工序、一套流程练会；参数要对，允许小偏差',
    cert: '发模拟实践证书',
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
  assess: {
    label: '职业虚拟考核',
    pick: '按岗位真实的一天考：新人最常做的活做没做对、规不规范',
    cert: '发职业能力考核证书',
    who: '刚入职或准备入职这个岗位的新人（求职者、实习生），独立接活，有带教 / 主管',
    essence: '按这个岗位真实的一天考：看他能不能把新人第一年最常做、最容易出错的活做对、做规范——像入职考核或校招工作样本，不对标国家证书',
    day: `按岗位真实的一天排 5–6 格，时段写 HH:MM：
  ① 到岗接活：交代今天的任务和要求；
  ②③④ 最常做、最容易出错的核心活 2–3 段（其中至少一格放动手的虚拟工位）；中间一段要和同事 / 客户 / 上下游沟通协作；
  ⑤ 一次突发（加急、出错、投诉），要自己判断先做什么；
  ⑥ 下班前交接与复盘（kind 用 assessment）。`,
    chapter: '每章 4–6 步，题目贴着岗位真实工作：判断、操作、沟通都考；有标准答案的在示范答案里写清依据，判断题看理由；术语按岗位里的说法用，第一次出现可以简短解释一句。',
    bench: '工位做岗位上的一道真实操作：关键参数和顺序要对，允许小偏差；违反操作规范扣分（violation），不用 veto。',
    score: '按岗位要求评：结果对不对、过程规不规范、理由说不说得清；60 分合格。',
  },
  certify: {
    label: '资质考核',
    pick: '对照国家职业技能标准：限时、按评分细则打分、有一票否决',
    cert: '发模拟考核成绩证明，不代替官方资格证书',
    who: '参加这一职业技能等级认定 / 资格考核的考生',
    essence: '按这一职业的国家职业技能标准（或行业资格）对应等级考核：理论知识 + 技能操作，按评分细则打分，有否决项',
    day: `按考核流程排 4–5 格，时段写「考核1」「考核2」…：
  ① 检录与考前准备：核对工具材料、着装和卫生、读懂考题要求；
  ② 理论知识：覆盖标准里这个等级要求的知识点（单选 / 多选 / 判断）；
  ③④ 技能操作 1–2 项：限时，按评分细则（其中至少一格放动手的虚拟工位）；
  ⑤ 结果评定与职业素养（kind 用 assessment）：按标准评操作结果（做东西的行业叫成品评定，服务 / 护理 / 维修类评操作结果和记录），安全、卫生、文明操作。`,
    chapter: '每章 4–8 步，题目像正式考题：表述规范、唯一正确答案、数值精确，不讲故事不用大白话；每题依据标准里的哪个知识点 / 技能要求，写进示范答案的说明里。',
    bench: '工位按考核细则：参数容差按标准，限时，违反安全卫生或关键工艺的直接判不合格——考核细则里写明一票否决的项，规则 severity 用 veto（碰了这一段直接不合格），其余扣分项用 violation。',
    score: '按评分细则逐项打分，60 分合格；否决项一票否决；理论与技能分开计。',
  },
};
/**
 * 一天怎么排（11-19 百业同事：生涯体验想一天只配 3 段、每段有起承转合、时间点自己定；用户：3 也是一种写死，格数和深度都让人定）。
 * 存在 jd_snapshot：slots = 这一天几格（含已有章节，2–9；不填按形态默认），depth = 每段多深（不填按形态默认）。
 * 人工（排一天骨架弹窗）和百业工厂助理（build_day 前先问）用同一套。四个形态都能用。
 */
export type Depth = 'light' | 'standard' | 'deep';
export const DEPTHS: Record<Depth, { label: string; pick: string; steps: string; rule: string }> = {
  light: { label: '短', steps: '3–4 步', pick: '每段 5–8 分钟、3–4 步，一段只做一件事', rule: '这一章是「短段」：5–8 分钟、3–4 步，一段只做一件事，台词简短，开场一两句就进题。' },
  standard: { label: '标准', steps: '4–6 步', pick: '每段 10 分钟左右、4–6 步', rule: '这一章是「标准段」：10 分钟左右、4–6 步，有开场、有推进、有一个需要判断的点。' },
  deep: { label: '长 · 起承转合', steps: '6–9 步（按起承转合推进，见第 8 条）', pick: '每段 15–20 分钟、6–9 步，有起承转合，适合一天只排 3 段左右', rule: `这一章是「长段」：15–20 分钟、6–9 步，要有起承转合——
  起：到场，交代这一段的处境、在场的人和要做成什么；
  承：按这一行真实的做法往下推 2–3 步（看、问、判断、动手）；
  转：出现一个这一行真会遇到的意外 / 分歧 / 新信息（不是刁难），逼你调整原来的判断；
  合：事情怎么收场、师傅点评为什么这样做，最后一步让你回看这一段。
同一批人物贯穿整段，剧情连着走，不要拆成互不相干的小题。` },
};
export const isDepth = (v: any): v is Depth => v === 'light' || v === 'standard' || v === 'deep';
/**
 * 每段多深：人选了就用人选的；没选就按这一天几格自己判断（11-19 用户：要会判断长任务还是短任务）——
 * 段少每段就该长：≤ 3 格写长段（起承转合），4–5 格写标准段，6 格以上按形态默认。count = 这一天的格数（排骨架时是要排的格数，写章节时是已有章节数）
 */
export const depthOf = (jdSnapshot: any, count = 0): Depth | null => {
  if (isDepth(jdSnapshot?.depth)) return jdSnapshot.depth;
  const n = slotsOf(jdSnapshot) || count;
  return n >= 2 && n <= 3 ? 'deep' : n >= 4 && n <= 5 ? 'standard' : null;
};
/**
 * 生涯体验的「一天」（11-20 百业同事军花试过 11-19 的长段版：「有点像职前培训题，不太像职业体验」，自己设计了律师 / 外科医生 / 前端工程师三份样板）：
 * 深在剧情、不在题量——每段 3 道决策题（单选为主），选项有像样的干扰项、答完有「为什么」；题和题因果串联、全天埋一个前后呼应的扣子；
 * 全天只写一次反思（最后一段），最后一道决策题是工作归类的收口题。生涯体验不论深浅都按这个写。
 */
export const CAREER_STORY = `生涯体验的写法（参照百业同事的样板，和上面冲突时以这条为准）：
- 这是职业体验，不是职前培训：每道题对应这一行日常的一个真实工作模块（如「复现问题」「术前谈话」「证据整理」），考的是「这一行为什么这样做」——高中生凭常识和这一章交代的情境就能想明白；不考操作细节、参数、规范条文和行话。
- 每段只有 3 道决策题：choose 为主，最多 1 道 multi（max 写死）；不出 classify / allocate / slider（这一章本来就有的虚拟工位照放）。每题 3–4 个选项：1 个对的，其余是像样的干扰项——新手最常见的坑、「看起来负责其实越界」、「图省事」、「把责任推出去」，不出一眼就能排除的傻选项。
- 每道题前的 scene 推进剧情：答案会成为下一幕的前提（「你顺着查下去，发现……」）；开场 intro 2–4 句，交代此刻在哪、发生了什么、带教师傅说了什么。
- 前后串起来：接住前面段落埋下的事，并且按「要前后一致的事实」里的主线和扣子写——上午的判断在下午 / 晚上被验证，或上午的教训成了晚上做决定的理由。
- explain：每道决策题写 2–3 句「为什么」——对的为什么对（落到一句这一行的道理，可以加粗），每个错的选项错在哪（用选项原话点名）；答完给学生看，口气是师傅在讲，不训人。
- 除了全天最后一段，各段都不要 text 题，也不要「写交接记录 / 写感想」。`;
export const CAREER_LAST = (role: string) => `这是全天最后一段：3 道决策题里最后一道是「收口题」——把今天做过的活归类（如「哪一组活全属于${role}的『对协作』工作？」，选项是 4 组活，分别对应对客户 / 对协作 / 对内等；问哪一类从这几类里挑最贴这一行的，不必都问『对协作』），explain 里说清每组属于哪类。**选项里的每一件活都必须是今天前面几段真做过、见过的事**（看「这一章已经发生的」），不要在这一段台词里临时补没发生过的事来凑选项。
然后最后一步是全天唯一的反思 text 题，prompt 固定写：「走完${role}的一天：哪件事你干得最有劲？哪件事你撑不住？这样的每一天，你还愿意吗？（80 字以内，不用讨好任何人，实话就行）」；它前面的 scene 是师傅收工时的一句话（如「今天最后一步不是答题。跑完这一天，写一句你的反思。」）；示范答案写一个真实高中生可能的想法，评分只看说没说清理由。`;
/** 每章的写法规则：人定了深度就用它（步数优先于形态里写的）。生涯体验另有 CAREER_STORY（深在剧情不在题量），这里的长段只管剧情起承转合、不加步数 */
export const depthRule = (jdSnapshot: any, count = 0) => {
  const d = depthOf(jdSnapshot, count); if (!d) return '';
  if (formOf(jdSnapshot) === 'career') return d === 'deep' ? '这一段要有起承转合：开场交代处境 → 两道题顺着真实做法推进 → 一个这一行真会遇到的意外或分歧让判断转弯 → 收场时师傅一句点评，并留一个引出下一段的钩子。题量仍按生涯体验的写法：3 道决策题。' : '';
  return `${DEPTHS[d].rule}步数和上面形态里写的不一样时，以这条为准。`;
};
export const slotsOf = (jdSnapshot: any): number | null => { const n = Math.round(Number(jdSnapshot?.slots)); return n >= 2 && n <= 9 ? n : null; };
/** 形态默认几格（不填时） */
export const defaultSlots = (form: SpaceForm | null) => (form === 'career' ? '5–6' : form === 'training' ? '4–6' : form === 'certify' ? '4–5' : '6–8');

/** 人自己排的一天：每行「09:00｜需求沟通｜接到客户的网站需求……」，开头是时间的行才算一格（「前端开发工程师｜一天」这类标题行跳过） */
export function parseDayPlan(text: string): { slot: string; text: string }[] {
  return String(text || '').split(/\r?\n/).map(l => /^\s*(\d{1,2}[:：]\d{2})\s*[｜|丨]?\s*(.+?)\s*$/.exec(l)).filter(Boolean)
    .map(m => ({ slot: m![1].replace('：', ':').padStart(5, '0'), text: m![2].replace(/\s*[｜|丨]\s*/g, '｜').slice(0, 300) })).slice(0, 9);
}

/** 百业生成默认模型（11-19 用户：挂 Claude，效果好；OpenAI 余额用完后 luna 全线 429）。环境变量可覆盖，国内 simulator 有自己的模型总控 */
export const LAB_GEN_MODEL = process.env.NEXT_PUBLIC_LAB_GEN_MODEL || 'claude-sonnet-5-5';

/**
 * 难度标记（11-19 用户：同一个职业有很精密的外科医生，也有生涯体验的，列表里分不清；「要落在 frame 里，不是创建时一套标准、使用时另一套」）。
 * 只用建空间时让人点选的那四档（FORMS / LEVEL_ORDER）。11-06 以前没选形态的老空间按当时的生成口径归进这四档（只用于标记和筛选，不改它的生成 / 评分规则）：
 *   从职业名生成的职业探索（jd.kind = career）、学科体验（discipline）→ 生涯体验；从 JD 生成的「新人上班的一天」（校招工作样本）、研究岗带教 → 职业虚拟考核。
 * version = 几段 · 多深 · 生成日期。体验馆、百业工厂、空间页同一套。
 */
// level_tag：老空间按内容难度打分后归的档（scripts/lab-level-tag.mts，1–3 生涯体验 / 4–5 模拟实践 / 6–8 职业虚拟考核 / 9–10 资质考核）
export const tagFormOf = (jdSnapshot: any): SpaceForm => formOf(jdSnapshot) || (isForm(jdSnapshot?.level_tag) ? jdSnapshot.level_tag : null) || (jdSnapshot?.kind === 'career' || jdSnapshot?.kind === 'discipline' ? 'career' : 'assess');
export function spaceTag(jdSnapshot: any, createdAt?: string | null, chapterCount = 0): { level: string; form: SpaceForm; inferred: boolean; version: string } {
  const f = tagFormOf(jdSnapshot);
  const n = slotsOf(jdSnapshot) || chapterCount;
  // 深度只标真按深度生成的（人选了，或定了格数按格数推）；11-19 以前的老空间没有这条规则，不往上推
  const d = isDepth(jdSnapshot?.depth) || slotsOf(jdSnapshot) ? depthOf(jdSnapshot, n) : null;
  const date = createdAt ? String(createdAt).slice(5, 10) : '';
  return { level: FORMS[f].label, form: f, inferred: !formOf(jdSnapshot), version: [n ? `${n} 段` : '', d ? `${DEPTHS[d].label.replace(' · 起承转合', '')}段` : '', date].filter(Boolean).join(' · ') };
}

export const isForm = (v: any): v is SpaceForm => v === 'career' || v === 'training' || v === 'assess' || v === 'certify';
/** 选级别时显示的一行：名字（证书说明） */
export const levelText = (f: SpaceForm) => `${FORMS[f].label}（${FORMS[f].cert}）`;
export type GenSpec = {
  preset?: string;               // 用了哪个预设（只做记录）
  form?: SpaceForm;              // 级别：生涯体验 / 模拟实践 / 职业虚拟考核 / 资质考核（不填 = 老空间的新人上班的一天）
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
      form: 'assess',
      audience: '刚入职或即将入职的新人，要尽快上手这个岗位。',
      depth: '按真实岗位的日常来，覆盖新人最常做、最容易出错的事。',
      difficulty: '接近岗位真实要求：关键操作要准，违规就扣分；评分看结果和过程是否规范。',
    },
  },
  {
    key: 'training', label: '大学生模拟实践',
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
      form: 'assess',
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
/** 百业工厂批量配置（11-10）：空间开放哪些模块。jd_snapshot.open_modules 没写 = 全开 */
export const OPEN_MODULES: { key: string; label: string }[] = [{ key: 'chat', label: '和我聊' }, { key: 'teach', label: '我教你' }, { key: 'test', label: '考考你' }, { key: 'learn', label: '你教我' }, { key: 'solve', label: '问问我' }];
export const moduleClosed = (jdSnapshot: any, key: string) => Array.isArray(jdSnapshot?.open_modules) && OPEN_MODULES.some(m => m.key === key) && !jdSnapshot.open_modules.includes(key);
/** 工位只观摩（11-10 同事反馈：高中生上手困难）：师傅做、学生看。生涯体验默认开，其他默认关；工厂里可以按空间改 */
export const watchBenchOf = (jdSnapshot: any): boolean => (typeof jdSnapshot?.watch_bench === 'boolean' ? jdSnapshot.watch_bench : formOf(jdSnapshot) === 'career');
