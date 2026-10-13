/**
 * 职业查询 / AI 补全：给一个职业名（或库里已有的职业），联网检索补齐职业画像 + 分年限薪资。
 * 口径对齐数据部门示例（计算机程序员等 10 条）：简介一两句定义；工作内容 / 职业要求分条；证书、达人顿号分隔；
 * 相关专业用英文 snake_case 的专业 key；大类 / 小类只能从对方枚举里选。
 * 只返回「找到的值」，写库交给 occupation-store（AI 模式只填空）。
 */
import { searchJson } from '@/lib/agents/search-llm';
import { CAREER_CATEGORY_LABELS, CAREER_MID_CATEGORIES, SALARY_YEAR_LABELS, SALARY_COUNTRIES, SALARY_CN_REGIONS, FX_TO_CNY, toCny, type CareerGraph, type CareerSkill, type CareerStage, type CareerNextRole } from '@/lib/occupation-fields';

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
  const { parsed, searchQueries } = await searchJson(prompt, modelId, { tool_name: 'occupation', task_name: 'Occupation Research', institution: o.name, batch_id: batchId });
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
  const { parsed } = await searchJson(prompt, modelId, { tool_name: 'occupation', task_name: 'Occupation Career Graph', institution: o.name, batch_id: batchId });
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
    searchJson(p1, modelId, { tool_name: 'occupation', task_name: 'Occupation Salary · Countries', institution: o.name, batch_id: batchId }).catch(() => ({ parsed: null })),
    searchJson(p2, modelId, { tool_name: 'occupation', task_name: 'Occupation Salary · CN Regions', institution: o.name, batch_id: batchId }).catch(() => ({ parsed: null })),
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
