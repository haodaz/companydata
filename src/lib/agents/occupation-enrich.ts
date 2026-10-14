/**
 * 职业查询 / AI 补全：给一个职业名（或库里已有的职业），联网检索补齐职业画像 + 分年限薪资。
 * 口径对齐数据部门示例（计算机程序员等 10 条）：简介一两句定义；工作内容 / 职业要求分条；证书、达人顿号分隔；
 * 相关专业用英文 snake_case 的专业 key；大类 / 小类只能从对方枚举里选。
 * 只返回「找到的值」，写库交给 occupation-store（AI 模式只填空）。
 */
import { parseJsonLoose, searchJson } from '@/lib/agents/search-llm';
import { generateContent } from '@/lib/llm-client';

/**
 * 国内信息走国内联网检索（阿里云百炼 · 通义千问 enable_search，每次搜索约 ¥0.004，Gemini 搜索约 ¥0.25）：
 * 中国的薪酬、职业画像、发展通道、典型任务、场所设备都不用出外网。只有「各国家薪资」才用调用方给的模型（Gemini 等）。
 * 环境变量 DOMESTIC_SEARCH_MODEL 可改（如 qwen-max）；设成 same 则全部跟调用方的模型走。
 */
const cn = (modelId: string) => (process.env.DOMESTIC_SEARCH_MODEL === 'same' ? modelId : process.env.DOMESTIC_SEARCH_MODEL || 'qwen-plus');
import { CAREER_CATEGORY_LABELS, CAREER_MID_CATEGORIES, SALARY_YEAR_LABELS, SALARY_COUNTRIES, SALARY_CN_REGIONS, FX_TO_CNY, toCny, type CareerGraph, type CareerSkill, type CareerStage, type CareerNextRole } from '@/lib/occupation-fields';

/**
 * 答题人钩子（scripts/agent-research.mts 用）：设了之后，下面这些函数不再调大模型接口，而是把提示词交给钩子——
 * 由一个能自己联网检索的 agent（如云端 Claude 会话）作答，返回的 JSON 照常走这里的解析 / 规整，写库口径不变。
 */
export type ResearchHook = (prompt: string, task: string) => Promise<any>;
let researchHook: ResearchHook | null = null;
export const setResearchHook = (h: ResearchHook | null) => { researchHook = h; };
const ask = async (prompt: string, modelId: string, meta: { tool_name: any; task_name: string; institution?: string; batch_id?: number }) =>
  researchHook ? { parsed: await researchHook(prompt, meta.task_name), searchQueries: [] as string[] } : searchJson(prompt, modelId, meta);

export interface OccupationResearch { fields: Record<string, any>; salaries: { year: string; salary: number; source_url?: string | null }[]; sources: Record<string, string>; searchQueries: string[]; raw: any }

export async function researchOccupation(o: { name: string; name_lang_en?: string | null; aliases?: string[] | null }, modelId: string, batchId: number): Promise<OccupationResearch> {
  const cats = Object.entries(CAREER_CATEGORY_LABELS).map(([v, n]) => `${v}=${n}`).join('; ');
  const mids = Object.entries(CAREER_MID_CATEGORIES).map(([v, [n, c]]) => `${v}=${n}(${c})`).join('; ');
  const years = Object.entries(SALARY_YEAR_LABELS).map(([v, n]) => `${v}=${n}`).join('; ');
  const prompt = `
你是职业研究员，为中国大学生 / 求职者的「职业百科」整理一个职业的档案。用联网检索核实，面向中国就业市场。

职业：${o.name}${o.name_lang_en ? `（${o.name_lang_en}）` : ''}${o.aliases?.length ? `；也叫：${o.aliases.join('、')}` : ''}

返回 JSON（找不到的填 null，不要编造）：
{
  "name": 规范的中文职业名（如「计算机程序员」「牙医」，不要带公司 / 级别）,
  "name_lang_en": 英文职业名（参照 O*NET / ISCO 叫法，如 "Computer Programmers"）,
  "aliases": 招聘里常见的其他叫法 3-8 个（如「软件开发工程师」「后端开发」）,
  "career_category": 职业大类，只能取以下值之一：${cats},
  "career_mid_category": 职业小类，只能取以下值之一（括号里是所属大类，要和大类一致）：${mids},
  "intro": 简介，1-3 句话说清这个职业是什么、做什么（中文）,
  "responsibility": 工作内容，分条「1、…\\n2、…」4-6 条,
  "position_requirement": 职业要求，分条写学历、专业背景、知识技能、能力素质,
  "recent_year_monthly_salary": 全国平均月薪（元，整数；用近一年的招聘 / 统计数据，如职友集、看准、国家统计局、智联报告）,
  "salaries": 分工作年限的月薪（元，整数），year 取：${years}；格式 [{ "year": "year_0_2", "salary": 6000, "source_url": "..." }],
  "relevant_certificates": 相关职业资格 / 技能证书，顿号分隔（如「全国计算机等级二级、软件设计师」）,
  "relevant_celebrities": 这个领域的知名从业者 / 代表人物 2-5 位，顿号分隔（中国人物优先）,
  "relevant_fos_ids": 相关本科专业的英文 key 数组（snake_case，如 ["computer_science","software_engineering","data_science"]）,
  "sources": { 每个非空字段名: 出处链接 }
}
规则：只报告检索到或有把握的事实；薪资必须来自可查的数据源并在 sources 里给链接，查不到就 null；中文字段用中文。
`;
  const { parsed, searchQueries } = await ask(prompt, cn(modelId), { tool_name: 'occupation', task_name: 'Occupation Research', institution: o.name, batch_id: batchId });
  const p = parsed || {};
  const fields: Record<string, any> = {};
  for (const k of ['name', 'name_lang_en', 'aliases', 'career_category', 'career_mid_category', 'intro', 'responsibility', 'position_requirement', 'recent_year_monthly_salary', 'relevant_certificates', 'relevant_celebrities', 'relevant_fos_ids']) {
    if (p[k] != null && p[k] !== '') fields[k] = p[k];
  }
  // 小类和大类对不上：以小类为准
  if (fields.career_mid_category && CAREER_MID_CATEGORIES[fields.career_mid_category]) fields.career_category = CAREER_MID_CATEGORIES[fields.career_mid_category][1];
  if (fields.career_category && !(fields.career_category in CAREER_CATEGORY_LABELS)) delete fields.career_category;
  if (fields.career_mid_category && !(fields.career_mid_category in CAREER_MID_CATEGORIES)) delete fields.career_mid_category;
  if (Array.isArray(fields.relevant_fos_ids)) fields.relevant_fos_ids = fields.relevant_fos_ids.map((x: any) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')).filter(Boolean);
  const salaries = (Array.isArray(p.salaries) ? p.salaries : [])
    .map((s: any) => ({ year: String(s?.year || ''), salary: parseInt(String(s?.salary ?? '').replace(/[^\d]/g, ''), 10), source_url: s?.source_url || null }))
    .filter((s: any) => s.year in SALARY_YEAR_LABELS && s.salary > 0);
  const sources = p.sources && typeof p.sources === 'object' ? Object.fromEntries(Object.entries(p.sources).filter(([, v]) => typeof v === 'string' && /^https?:/.test(v as string))) as Record<string, string> : {};
  return { fields, salaries, sources, searchQueries, raw: p };
}

// ────────────────────────────────────────────
// 发展图谱：技能树（分层 + 前置）+ 成长阶梯 + 晋升 / 转型路径
// ────────────────────────────────────────────
export async function researchCareerGraph(o: { name: string; name_lang_en?: string | null; intro?: string | null; responsibility?: string | null }, modelId: string, batchId: number): Promise<CareerGraph> {
  const prompt = `
你是带过很多新人的资深从业者 + 职业规划顾问。为「${o.name}」${o.name_lang_en ? `（${o.name_lang_en}）` : ''}画一张面向中国大学生 / 求职者的「发展图谱」，用联网检索核实行业里真实的职级、晋升通道和薪资带。
${o.intro ? `职业简介：${o.intro}\n` : ''}${o.responsibility ? `工作内容：${String(o.responsibility).slice(0, 600)}\n` : ''}
返回 JSON：
{
  "summary": 一句话说清这个职业的发展主线,
  "skills": 技能树 10-16 个节点，[{ "id": 英文短 id（如 "sql"）, "name": 中文名, "kind": "hard"|"soft"|"tool"|"cert", "level": 1|2|3（1 入门基础 / 2 核心能力 / 3 进阶专家）, "why": 为什么要会（一句）, "how_to_build": 怎么练（一句，具体到资源 / 项目 / 证书）, "prereq": [前置技能的 id] }]，
     前置关系要合理（level 高的依赖 level 低的），每个 level 至少 3 个,
  "ladder": 成长阶梯 4-6 级，从入行到资深，[{ "stage": 阶段名（如「助理 / 初级」）, "title": 行业里真实的职位头衔, "years": 典型年限（如「0-2 年」）, "focus": 这一级主要干什么、靠什么升到下一级, "key_skills": [这一级要拿下的技能 id], "salary": 国内月薪带（如「8k-12k」，查不到写 null） }],
  "next_roles": 再往上 / 往外走的岗位 4-8 个，[{ "name": 规范的中文职业名（只写一个，不带英文、不用「/」并列）, "type": "promotion"（同一通道更资深，如主管 / 总监 / 专家）| "transition"（可转型的相邻职业）, "years": 通常几年后, "how": 怎么走过去（一句）, "key_skills": [需要补的技能 id 或技能名] }]，promotion 和 transition 各至少 2 个,
  "entry_paths": 入行路径 2-4 条，[{ "path": 路径, "detail": 说明 }],
  "sources": [参考链接]
}
中文作答；职位头衔、薪资带要符合中国行业实际，不要编造公司内部职级代号。
`;
  const { parsed } = await ask(prompt, cn(modelId), { tool_name: 'occupation', task_name: 'Occupation Career Graph', institution: o.name, batch_id: batchId });
  const p = parsed || {};
  const skills: CareerSkill[] = (Array.isArray(p.skills) ? p.skills : []).slice(0, 20).map((s: any, i: number) => ({
    id: String(s?.id || `s${i}`).toLowerCase().replace(/[^a-z0-9_]+/g, '_') || `s${i}`, name: String(s?.name || '').trim(),
    kind: ['hard', 'soft', 'tool', 'cert'].includes(s?.kind) ? s.kind : 'hard', level: ([1, 2, 3].includes(Number(s?.level)) ? Number(s.level) : 2) as 1 | 2 | 3,
    why: s?.why || undefined, how_to_build: s?.how_to_build || undefined, prereq: Array.isArray(s?.prereq) ? s.prereq.map((x: any) => String(x).toLowerCase().replace(/[^a-z0-9_]+/g, '_')) : [],
  })).filter((s: CareerSkill) => s.name);
  const ids = new Set(skills.map(s => s.id));
  for (const s of skills) s.prereq = (s.prereq || []).filter(x => ids.has(x) && x !== s.id);
  const ladder: CareerStage[] = (Array.isArray(p.ladder) ? p.ladder : []).slice(0, 7).map((l: any) => ({
    stage: String(l?.stage || ''), title: String(l?.title || ''), years: String(l?.years || ''), focus: String(l?.focus || ''),
    key_skills: Array.isArray(l?.key_skills) ? l.key_skills.map(String) : [], salary: l?.salary && l.salary !== 'null' ? String(l.salary) : undefined,
  })).filter((l: CareerStage) => l.title || l.stage);
  const next_roles: CareerNextRole[] = (Array.isArray(p.next_roles) ? p.next_roles : []).slice(0, 10).map((r: any) => ({
    // 「咖啡区域运营经理 (Area Coach / Operations Manager)」→ 只留中文规范名，才能对回职业库
    name: String(r?.name || '').replace(/\s*[（(][^（()）]*[)）]\s*$/, '').split(/\s*\/\s*/)[0].trim(), type: r?.type === 'transition' ? 'transition' : 'promotion', years: r?.years ? String(r.years) : undefined,
    how: String(r?.how || ''), key_skills: Array.isArray(r?.key_skills) ? r.key_skills.map(String) : [],
  })).filter((r: CareerNextRole) => r.name);
  if (!skills.length || !ladder.length) throw new Error('图谱生成为空');
  return {
    summary: p.summary || undefined, skills, ladder, next_roles,
    entry_paths: Array.isArray(p.entry_paths) ? p.entry_paths.filter((e: any) => e?.path).map((e: any) => ({ path: String(e.path), detail: String(e.detail || '') })) : [],
    sources: Array.isArray(p.sources) ? p.sources.filter((u: any) => typeof u === 'string' && /^https?:/.test(u)).slice(0, 10) : [],
  };
}

// ────────────────────────────────────────────
// 分国家 / 地区薪资：国家一轮、中国各地一轮（分开问，各自都能检索得更准）
// ────────────────────────────────────────────
export interface RegionSalary { scope: 'country' | 'cn_region'; code: string; name: string; currency: string; monthly_local: number; monthly_cny: number | null; data_year?: number | null; source_url?: string | null; note?: string | null }

export async function researchRegionSalaries(o: { name: string; name_lang_en?: string | null }, modelId: string, batchId: number): Promise<RegionSalary[]> {
  const out: RegionSalary[] = [];
  const countries = SALARY_COUNTRIES.map(c => `${c.code}=${c.name}（${c.currency}）`).join('; ');
  const p1 = `
查「${o.name}」${o.name_lang_en ? `（${o.name_lang_en}）` : ''}在以下国家 / 地区的税前月薪（全职、全体经验的中位数或平均数），用各国官方统计或主流薪资平台（如美国 BLS、英国 ONS、日本 厚生労働省 / doda、新加坡 MOM、Glassdoor、Indeed、PayScale、SEEK、StepStone、Jobbank、职友集 / 国家统计局）：
${countries}
年薪的除以 12 折成月薪；本币填写。查不到的国家不要编，直接省略。
返回 JSON：{ "items": [ { "code": "US", "currency": "USD", "monthly": 7800, "year": 2025, "source_url": "...", "note": "BLS 中位数年薪 93,600 / 12" } ] }
`;
  const regions = SALARY_CN_REGIONS.map(r => `${r.code}=${r.name}`).join('; ');
  const p2 = `
查「${o.name}」在中国以下省份 / 城市的税前月薪（全体经验的平均或中位数，人民币），优先用职友集、智联 / BOSS 直聘的城市薪酬报告、各省统计局分职业工资、看准网：
${regions}
查不到的地区不要编，直接省略。
返回 JSON：{ "items": [ { "code": "sichuan", "monthly": 9800, "year": 2025, "source_url": "...", "note": "职友集成都数据" } ] }
`;
  const [a, b] = await Promise.all([
    ask(p1, modelId, { tool_name: 'occupation', task_name: 'Occupation Salary · Countries', institution: o.name, batch_id: batchId }).catch(() => ({ parsed: null })),
    ask(p2, cn(modelId), { tool_name: 'occupation', task_name: 'Occupation Salary · CN Regions', institution: o.name, batch_id: batchId }).catch(() => ({ parsed: null })),
  ]);
  const num = (v: any) => parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  for (const it of (a.parsed as any)?.items || []) {
    const c = SALARY_COUNTRIES.find(x => x.code === String(it?.code || '').toUpperCase());
    const m = num(it?.monthly);
    if (!c || !(m > 0)) continue;
    const cur = FX_TO_CNY[it?.currency] ? it.currency : c.currency;
    out.push({ scope: 'country', code: c.code, name: c.name, currency: cur, monthly_local: m, monthly_cny: toCny(m, cur), data_year: num(it?.year) || null, source_url: it?.source_url || null, note: it?.note || null });
  }
  for (const it of (b.parsed as any)?.items || []) {
    const r = SALARY_CN_REGIONS.find(x => x.code === String(it?.code || '').toLowerCase());
    const m = num(it?.monthly);
    if (!r || !(m > 0)) continue;
    out.push({ scope: 'cn_region', code: r.code, name: r.name, currency: 'CNY', monthly_local: m, monthly_cny: m, data_year: num(it?.year) || null, source_url: it?.source_url || null, note: it?.note || null });
  }
  return out;
}

// ────────────────────────────────────────────
// 工作场所 + 工具设备（迁移 026）：数据工厂这边是全集，百业生成时来查；所以按职业全量列，不只列百业里画过的
// ────────────────────────────────────────────
export interface ContextPlace { name: string; category?: string; setting?: string; description?: string; environment?: string; safety?: string; frequency?: string; note?: string }
export interface ContextItem { name: string; kind: string; category?: string; description?: string; usage?: string; brands?: string; frequency?: string; proficiency?: string; skill_ids?: string[]; places?: string[]; note?: string }

export async function researchOccupationContext(o: { name: string; name_lang_en?: string | null; responsibility?: string | null; career_map?: any }, modelId: string, batchId: number): Promise<{ places: ContextPlace[]; items: ContextItem[]; sources: string[] }> {
  const skills = (o.career_map?.skills || []).map((s: any) => `${s.id}=${s.name}`).join('; ');
  const prompt = `
你是这个行业里干了十几年的老师傅。列出「${o.name}」${o.name_lang_en ? `（${o.name_lang_en}）` : ''}在中国真实工作中会待的地方和会用到的东西，要全、要具体，用联网检索核实（行业规范、设备手册、岗位 SOP、招聘要求）。
${o.responsibility ? `工作内容：${String(o.responsibility).slice(0, 500)}\n` : ''}${skills ? `已有技能节点（items 的 skill_ids 只能从这里取）：${skills}\n` : ''}
返回 JSON：
{
  "places": 工作场所 3-8 个，[{ "name": 规范场所名（如「医院急诊抢救室」「咖啡门店吧台」「转炉炉前操作平台」，不要具体门牌 / 公司）, "category": office|factory|lab|medical|kitchen|store|site|field|control|transport|education|home|public|other, "setting": indoor|outdoor|mixed, "description": 这里是什么样、有什么, "environment": 环境特点（噪声 / 高温 / 洁净 / 夜班 / 高空 / 久站…）, "safety": 安全要求, "frequency": daily|weekly|occasional, "note": 在这里主要干什么 }],
  "items": 工具设备 12-25 个，覆盖下面各类（有就列）：tool 手工具 / equipment 设备仪器 / material 耗材材料 / software 软件系统 / ppe 防护用品 / document 常用单据表单 / credential 上岗证照，
     [{ "name": 规范名称（通用叫法，不带品牌）, "kind": 上面之一, "category": 细分类别, "description": 是什么 / 干什么用（一句）, "usage": 操作要点（一句）, "brands": 常见品牌型号（顿号分隔，没有就 null）, "frequency": daily|weekly|occasional, "proficiency": 了解|会用|熟练|精通, "skill_ids": [对应技能节点 id], "places": [在哪个场所用，取上面 places 的 name] }],
  "sources": [参考链接]
}
中文作答；只列这个职业真会碰到的，不要泛泛的「电脑」「笔」，除非是核心工具（如设计师的数位板）。
`;
  const { parsed } = await ask(prompt, cn(modelId), { tool_name: 'occupation', task_name: 'Occupation Places & Items', institution: o.name, batch_id: batchId });
  const p = parsed || {};
  const str = (v: any) => (v == null || v === 'null' || v === '' ? undefined : String(v).trim());
  const places: ContextPlace[] = (Array.isArray(p.places) ? p.places : []).map((x: any) => ({
    name: String(x?.name || '').trim(), category: str(x?.category), setting: str(x?.setting), description: str(x?.description), environment: str(x?.environment),
    safety: str(x?.safety), frequency: str(x?.frequency), note: str(x?.note),
  })).filter((x: ContextPlace) => x.name);
  const items: ContextItem[] = (Array.isArray(p.items) ? p.items : []).map((x: any) => ({
    name: String(x?.name || '').trim(), kind: ['tool', 'equipment', 'material', 'software', 'ppe', 'document', 'credential'].includes(x?.kind) ? x.kind : 'tool',
    category: str(x?.category), description: str(x?.description), usage: str(x?.usage), brands: str(x?.brands), frequency: str(x?.frequency), proficiency: str(x?.proficiency),
    skill_ids: Array.isArray(x?.skill_ids) ? x.skill_ids.map(String) : [], places: Array.isArray(x?.places) ? x.places.map(String) : [], note: str(x?.note),
  })).filter((x: ContextItem) => x.name);
  return { places, items, sources: Array.isArray(p.sources) ? p.sources.filter((u: any) => typeof u === 'string' && /^https?:/.test(u)) : [] };
}

// ────────────────────────────────────────────
// 典型任务 + 工位（迁移 026）
//   lab 给了：只从百业章节 / 虚拟工位归纳（快速启动的种子，每条记下对应章节）
//   lab 没给：按职业列全集（避开已有任务名）
// ────────────────────────────────────────────
export interface LabChapterHint { ref: string; space: string; title: string; kind: string; brief: string; steps: string }
export interface LabBenchHint { ref: string; space: string; name: string; surface: string; controls: string; gauges: string }

export async function researchOccupationTasks(
  o: { name: string; responsibility?: string | null; career_map?: any },
  modelId: string, batchId: number,
  opts: { lab?: { chapters: LabChapterHint[]; benches: LabBenchHint[] }; existingTasks?: string[]; places?: string[]; items?: string[] } = {},
) {
  const skills = (o.career_map?.skills || []).map((s: any) => `${s.id}=${s.name}`).join('; ');
  const lab = opts.lab;
  const material = lab ? `
下面是职业体验产品「AI 百业」里已经做好的这个职业的章节（每章是一个工作片段）和虚拟工位（控件 = 操作对象，仪表 = 监测量）。
只根据这些材料归纳，不要另外编；同一件事在不同空间 / 章节里出现的合成一个典型任务，lab_refs 列出对应章节的 ref；工位的 bench_refs 列出对应虚拟工位的 ref。
章节：
${lab.chapters.map(c => `[${c.ref}] ${c.title}（${c.kind}）${c.brief ? `：${c.brief.slice(0, 160)}` : ''}${c.steps ? `｜步骤：${c.steps.slice(0, 240)}` : ''}`).join('\n')}
虚拟工位：
${lab.benches.map(b => `[${b.ref}] ${b.name}（${b.surface}）｜控件：${b.controls.slice(0, 200)}｜仪表：${b.gauges.slice(0, 160)}`).join('\n') || '（无）'}
` : `
列这个职业在中国真实工作里的典型任务 6-10 个（从入门到资深都要有，日常 / 突发都要有），以及完成这些任务的工位 / 操作台 2-5 个，用联网检索核实（岗位 SOP、操作规程、行业标准）。
${opts.existingTasks?.length ? `已有的任务（不要重复）：${opts.existingTasks.join('、')}` : ''}
${opts.places?.length ? `已知工作场所：${opts.places.join('、')}` : ''}${opts.items?.length ? `\n已知工具设备：${opts.items.slice(0, 40).join('、')}` : ''}
`;
  const prompt = `
你是「${o.name}」这一行带过很多新人的老师傅，在给职业知识图谱整理「典型任务」和「工位 / 操作台」。
工位 / 操作台 = 一组仪器、设备、操作对象、软件，放在某个场所里（如「转炉炉前操作台」「急诊抢救单元」「意式咖啡出品位」「温室环控中控台」）。
典型任务发生在工位上，有任务目标、验收标准、过程步骤、相关方。
${o.responsibility ? `工作内容：${String(o.responsibility).slice(0, 400)}\n` : ''}${skills ? `技能节点（skill_ids 只能从这里取）：${skills}\n` : ''}${material}
返回 JSON：
{
  "stations": [{ "name": 规范工位名, "description": 是什么、谁在这干什么, "environment": 环境与布局, "place": 所在的规范场所名,
     "controls": [{ "name": 操作对象, "unit": 单位, "range": 常用范围, "purpose": 调它干什么 }], "monitors": [{ "name": 监测量, "unit": 单位, "normal": 正常范围, "alarm": 报警条件 }],
     "items": [这个工位上的仪器 / 设备 / 工具 / 软件的规范名], "safety": 安全要求${lab ? ', "bench_refs": [虚拟工位 ref]' : ''} }],
  "tasks": [{ "name": 任务名（动宾短语，如「午高峰前把萃取参数拉回标准」）, "summary": 情境（什么时候、为什么要做）, "goal": 任务目标,
     "success_criteria": [{ "name": 指标, "target": 达标要求 }], "process": [{ "step": 步骤名, "action": 具体做法, "items": [用到的物品], "checkpoint": 关键检查点 }],
     "stakeholders": [{ "role": 相关方（如带教师傅 / 患者家属 / 客户 / 上游工序）, "relation": 关系, "interaction": 要怎么打交道 }],
     "common_mistakes": 新手常见失误, "difficulty": 1|2|3（入门 / 独立 / 资深）, "frequency": daily|weekly|occasional, "duration": 通常用时,
     "skill_ids": [技能节点 id], "station": 发生在哪个工位（stations 的 name）${lab ? ', "lab_refs": [章节 ref]' : ''} }]
}
中文作答，具体、可操作。
`;
  const { parsed } = lab
    ? { parsed: parseJsonLoose((await generateContent(prompt, modelId, { jsonMode: true })).text) }
    : await ask(prompt, cn(modelId), { tool_name: 'occupation', task_name: 'Occupation Tasks & Stations', institution: o.name, batch_id: batchId });
  const p = parsed || {};
  const arr = (v: any) => (Array.isArray(v) ? v : []);
  return {
    stations: arr(p.stations).filter((s: any) => s?.name).map((s: any) => ({ ...s, name: String(s.name).trim(), controls: arr(s.controls), monitors: arr(s.monitors), items: arr(s.items).map(String), bench_refs: arr(s.bench_refs).map(String) })),
    tasks: arr(p.tasks).filter((t: any) => t?.name).map((t: any) => ({ ...t, name: String(t.name).trim(), success_criteria: arr(t.success_criteria), process: arr(t.process), stakeholders: arr(t.stakeholders), skill_ids: arr(t.skill_ids).map(String), lab_refs: arr(t.lab_refs).map(String) })),
  };
}
