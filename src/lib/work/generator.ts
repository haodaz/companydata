/**
 * 真活台 · 生成器（2026-10-18）：这条线的核心。
 * 不模拟职业——拿一家企业的真实业务问题出题：企业画像 / 岗位 / 职业典型任务 / 行业规范 是出题的 context，
 * 输出「问题 → 任务 → 材料包 → 带依赖关系的 rubric（每条带依据）→ AI 基线答卷」。考核空间（工作台 / 报告）只消费这里的产物。
 * 只用材料、不编造：材料里没有的数字一律标「示例数据」；能指回来源的都指回去。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import { findOccupation } from '@/lib/occupation-store';
import { gradeResult } from '@/lib/work/grader';

export const WORK_MODEL = process.env.WORK_MODEL || 'claude-opus-5-5';

export interface WorkContext {
  company: { id?: number; name: string; industry?: string; sub_industry?: string; description?: string; campus_overview?: string; tags?: string[]; hq_city?: string; website?: string; employee_count?: string; founded_year?: number | string } | null;
  products: { name: string; category?: string; description?: string; is_flagship?: boolean }[];
  news: { description: string; publish_date_str?: string; kind?: string }[];
  executives: { name: string; title?: string }[];
  jobs: { title: string; department?: string; job_function?: string; responsibilities?: string; skills?: any; education_requirement?: string; experience_requirement?: string; city?: string }[];
  occupation: { id?: number; name: string; intro?: string; responsibility?: string; position_requirement?: string } | null;
  typical_tasks: { name: string; summary?: string; goal?: string; success_criteria?: any; process?: any; common_mistakes?: any }[];
  standards: { code?: string; title: string; key_points?: any; operation_relevance?: string }[];
  notes: string[];   // 哪些材料没找到
}

/** 带兜底链的 JSON 调用：Opus → Sonnet → 千问；记账 tool=work */
export async function askJson(prompt: string, model: string, task_name: string, institution?: string, extra?: Record<string, any>): Promise<any> {
  const chain = [model, ...['claude-sonnet-5-5', 'qwen-plus'].filter(m => m !== model)];
  let lastErr: any = null;
  for (const m of chain) {
    try {
      const res = await generateContent(prompt, m, { jsonMode: true });
      await logTokenUsage({ tool_name: 'work', task_name, institution: institution || '', model_id: m, usageMetadata: res.usageMetadata, ...(extra || {}) } as any).catch(() => {});
      const p = parseJsonLoose(res.text);
      if (!p || typeof p !== 'object') throw new Error('返回不是 JSON 对象');
      return { parsed: p, model: m };
    } catch (e) { lastErr = e; console.warn(`[work] ${m} 失败，换下一个：${String((e as any)?.message).slice(0, 120)}`); }
  }
  throw lastErr || new Error('生成失败');
}

const s = (v: any, n = 600) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)).slice(0, n);

/** 第一步：把企业 / 岗位 / 职业 / 标准四层材料拼起来（都是库里的，带来源） */
export async function gatherContext(companyQuery: string, role: string): Promise<WorkContext> {
  const ctx: WorkContext = { company: null, products: [], news: [], executives: [], jobs: [], occupation: null, typical_tasks: [], standards: [], notes: [] };
  const q = companyQuery.trim();
  let company: any = null;
  if (/^\d+$/.test(q)) ({ data: company } = await db.from('companies').select('id, name, name_en, industry, sub_industry, description, campus_overview, tags, hq_city, website, employee_count, founded_year').eq('id', Number(q)).maybeSingle());
  if (!company && q) {
    const { data } = await db.from('companies').select('id, name, name_en, industry, sub_industry, description, campus_overview, tags, hq_city, website, employee_count, founded_year').or(`name.ilike.%${q}%,name_en.ilike.%${q}%`).order('id').limit(5);
    company = (data || []).find((c: any) => c.name === q) || data?.[0] || null;
  }
  if (company) {
    ctx.company = company;
    const cid = company.id;
    const [{ data: products }, { data: news }, { data: execs }, { data: jobs }] = await Promise.all([
      db.from('company_products').select('name, category, description, is_flagship').eq('company_id', cid).eq('if_delete', false).order('is_flagship', { ascending: false }).limit(8),
      db.from('company_news').select('description, publish_date_str, kind').eq('company_id', cid).eq('if_delete', false).order('publish_date', { ascending: false, nullsFirst: false }).limit(8),
      db.from('company_executives').select('name, title').eq('company_id', cid).eq('if_delete', false).limit(5),
      db.from('jobs').select('title, department, job_function, responsibilities, skills, education_requirement, experience_requirement, city').eq('company_id', cid).or(`title.ilike.%${role}%,job_function.ilike.%${role}%`).limit(3),
    ]);
    ctx.products = products || []; ctx.news = news || []; ctx.executives = execs || []; ctx.jobs = jobs || [];
    if (!ctx.jobs.length) {
      const { data } = await db.from('jobs').select('title, department, job_function, responsibilities, skills, education_requirement, experience_requirement, city').eq('company_id', cid).limit(3);
      ctx.jobs = data || []; if (ctx.jobs.length) ctx.notes.push(`这家企业没有「${role}」的在招岗位，取了同企业其他岗位做参考`);
    }
  } else ctx.notes.push(`企业库里没找到「${q}」，只能按名字出题，企业事实会少`);
  // 职业层：名字 / 别名命中，命不中就模糊找
  let occ: any = await findOccupation({ name: role });
  if (!occ) { const { data } = await db.from('occupations').select('*').eq('if_delete', false).ilike('name', `%${role}%`).limit(1); occ = data?.[0] || null; }
  if (occ) {
    ctx.occupation = { id: occ.id, name: occ.name, intro: occ.intro, responsibility: occ.responsibility, position_requirement: occ.position_requirement };
    const { data: tt } = await db.from('typical_tasks').select('name, summary, goal, success_criteria, process, common_mistakes').eq('occupation_id', occ.id).eq('if_delete', false).limit(6);
    ctx.typical_tasks = tt || [];
  } else ctx.notes.push(`职业库里没有「${role}」，典型任务这一层缺`);
  const profs = [role, occ?.name].filter(Boolean) as string[];
  const { data: std } = await db.from('industry_standards').select('code, title, key_points, operation_relevance, professions').overlaps('professions', profs).limit(6);
  ctx.standards = std || [];
  if (!ctx.standards.length && ctx.company?.industry) {
    const { data } = await db.from('industry_standards').select('code, title, key_points, operation_relevance').ilike('industry', `%${ctx.company.industry}%`).limit(4);
    ctx.standards = data || [];
  }
  if (!ctx.standards.length) ctx.notes.push('没有挂到这个职业 / 行业的标准，rubric 的依据只能来自企业材料和职业常识');
  return ctx;
}

/** 材料渲染成给模型看的文本（每段带来源标签） */
export function renderContext(ctx: WorkContext): string {
  const L: string[] = [];
  if (ctx.company) {
    const c = ctx.company;
    L.push(`## 企业（来源：企业实体库）\n名称：${c.name}${c.industry ? ` · 行业：${c.industry}${c.sub_industry ? ' / ' + c.sub_industry : ''}` : ''}${c.hq_city ? ` · 总部：${c.hq_city}` : ''}${c.employee_count ? ` · 规模：${c.employee_count}` : ''}${c.founded_year ? ` · 成立：${c.founded_year}` : ''}\n简介：${s(c.description, 800)}\n${c.campus_overview ? `校招概况：${s(c.campus_overview, 400)}\n` : ''}${c.tags?.length ? `标签：${c.tags.join('、')}\n` : ''}`);
  }
  if (ctx.products.length) L.push(`## 产品（来源：企业产品子实体）\n${ctx.products.map(p => `- ${p.name}${p.is_flagship ? '（主打）' : ''}${p.category ? ` [${p.category}]` : ''}：${s(p.description, 200)}`).join('\n')}`);
  if (ctx.news.length) L.push(`## 近期动态（来源：企业动态子实体）\n${ctx.news.map(n => `- ${n.publish_date_str || ''} ${s(n.description, 240)}`).join('\n')}`);
  if (ctx.executives.length) L.push(`## 管理团队（来源：企业高管子实体）\n${ctx.executives.map(e => `- ${e.name}${e.title ? ' · ' + e.title : ''}`).join('\n')}`);
  if (ctx.jobs.length) L.push(`## 在招岗位（来源：校招岗位库）\n${ctx.jobs.map(j => `- ${j.title}${j.department ? ' · ' + j.department : ''}${j.city ? ' · ' + j.city : ''}\n  职责：${s(j.responsibilities, 500)}\n  要求：${s(j.education_requirement, 120)} ${s(j.experience_requirement, 120)} 技能：${s(j.skills, 200)}`).join('\n')}`);
  if (ctx.occupation) L.push(`## 职业（来源：职业实体库）\n${ctx.occupation.name}：${s(ctx.occupation.intro, 400)}\n职责：${s(ctx.occupation.responsibility, 500)}\n要求：${s(ctx.occupation.position_requirement, 300)}`);
  if (ctx.typical_tasks.length) L.push(`## 这个职业的典型任务（来源：职业典型任务库）\n${ctx.typical_tasks.map(t => `- ${t.name}：${s(t.summary, 200)}\n  目标：${s(t.goal, 150)}；成功标准：${s(t.success_criteria, 200)}；常见错误：${s(t.common_mistakes, 200)}`).join('\n')}`);
  if (ctx.standards.length) L.push(`## 行业标准 / 规程（来源：行业标准与规程库）\n${ctx.standards.map(x => `- ${x.code ? x.code + ' ' : ''}${x.title}：${s(x.key_points, 300)}${x.operation_relevance ? '；操作相关：' + s(x.operation_relevance, 150) : ''}`).join('\n')}`);
  if (ctx.notes.length) L.push(`## 材料缺口\n${ctx.notes.map(n => '- ' + n).join('\n')}`);
  return L.join('\n\n');
}

/** 操作台类型（比 NeoWork 多的一层：题按岗位选环境）：doc 文档 / 对账台 · code 代码台 · sheet 表格 / 数据台 · design 设计台（CAD 雏形） */
export type WorkEnvType = 'doc' | 'code' | 'sheet' | 'design';
export interface WorkEnv {
  type: WorkEnvType;
  /** code：语言（js 的自测用例能在浏览器里跑）；starter 起始代码；tests 用例 [{ name, code }]，code 是拿到 `solution` 后返回 true/false 的 JS 表达式或函数体 */
  language?: string; starter?: string; tests?: { name: string; code: string }[];
  /** sheet：起始表（CSV 文本） */
  csv?: string;
  /** design：参数表 [{ name, unit, hint }] + 草图说明 */
  params?: { name: string; unit?: string; hint?: string }[]; sketch_hint?: string;
}
export const ENV_LABELS: Record<WorkEnvType, string> = { doc: '文档 / 对账台', code: '代码台', sheet: '表格 / 数据台', design: '设计台' };

export interface WorkTask {
  env: WorkEnv;
  problem: { statement: string; why_now: string; evidence: { text: string; source: string }[] };
  task: { title: string; role: string; brief: string; deliverables: { id: string; title: string; format: string }[]; time_minutes: number; rules: string[] };
  materials: { id: string; title: string; kind: 'doc' | 'table' | 'note' | 'email' | 'data'; content: string; source: 'db' | 'generated' | 'mixed'; basis?: string }[];
  rubric: { id: string; title: string; desc: string; weight: number; depends_on: string[]; basis: string; levels: { L1: string; L2: string; L3: string; L4: string } }[];
}

/** 第二步：问题 → 任务 → 材料包 → rubric（一次生成，JSON） */
export async function generateTask(ctx: WorkContext, role: string, opts: { model?: string; focus?: string; env?: WorkEnvType } = {}): Promise<{ task: WorkTask; model: string }> {
  const model = opts.model || WORK_MODEL;
  const name = ctx.company?.name || '这家企业';
  const prompt = `你是「真活台」的出题人：拿一家企业**此刻真实的业务问题**给「${role}」岗位出一道真活，不是模拟职业、不是知识题。
参照的方法：先锚定「这个岗位要替企业解决什么内部问题」，再把问题展开成一个开放的真实任务，配上做这件事会拿到的材料，最后把人写的粗标准展开成 agent 能逐条核对、**条目之间有依赖关系**的细 rubric（例：先设假设 → 再建模 → 再估值 → 再调整）。

## 材料（只许用这些；没有的数字写「示例数据」并说明；每条依据指回来源）
${renderContext(ctx)}
${opts.focus ? `\n## 出题人额外要求\n${opts.focus}\n` : ''}
## 操作台（环境）
${opts.env ? `出题人指定环境：${opts.env}（${ENV_LABELS[opts.env]}）。` : '按岗位选最贴近真实工作媒介的环境：'}doc 文档 / 对账台（方案、对账、邮件、scorecard）· code 代码台（写函数 / 脚本，language 用 js 时给 2–5 个自测用例：code 是一段 JS，拿到变量 solution（候选人的导出函数）后返回 true/false，如 "return solution([3,1,2]).join()==='1,2,3'"；其他语言不给 tests）· sheet 表格 / 数据台（csv 给起始表，含要对账 / 清洗的数据，5–30 行）· design 设计台（params 给 4–8 个要定的参数：name/unit/hint；sketch_hint 说明要画什么简图：零件轮廓、流程、布局）。
env 字段：{ "type": "doc|code|sheet|design", "language": "", "starter": "", "tests": [ { "name": "", "code": "" } ], "csv": "", "params": [ { "name": "", "unit": "", "hint": "" } ], "sketch_hint": "" }（只填该环境用到的字段）。交付物要和环境匹配（code 的交付物是代码 + 说明，sheet 是表 + 口径说明，design 是参数表 + 草图 + 设计说明）。

## 要求
- problem.statement：一句话说清 ${name} 现在的哪个业务问题需要「${role}」来解决，必须能从材料里推出来（近期动态 / 产品 / 岗位职责 / 典型任务）；why_now 说为什么是现在；evidence 列 2–4 条材料原句 + 来源名。
- task：title（8–16 字）；brief（给做题人看的任务书，300–500 字，口吻像业务负责人交代活：背景、要你做什么、交给谁、什么时候要）；deliverables 2–3 个（id d1…，title，format 如「一页纸方案 / 表格 / 邮件」）；time_minutes 45–90；rules 3–5 条（必须含「可以随便用 AI，不算作弊；评的是你怎么用」和「材料里没有的数据要标注假设」）。
- materials 3–5 份，做这件事真的会拿到的东西：kind ∈ doc/table/note/email/data；content 用 Markdown，每份 300–900 字，表格用 Markdown 表；source：db=全部来自材料、generated=为任务合理补写（必须贴近企业真实情况并在正文标「示例数据」）、mixed；basis 写它依据材料的哪一段。至少一份是「有坑」的（信息不全、口径不一致、过期），这是真活。
- rubric 5–8 条：id r1…；title；desc（怎么算做到）；weight 加起来 100；depends_on 填前置条目 id（没有填 []）；basis 必须指向材料来源（「行业标准 xxx 第 n 点」「岗位职责：…」「典型任务：…」），实在没有写「出题人判断，待业务负责人确认」；levels L1–L4 各一句可观察的行为描述（BARS）。
只返回 JSON：
{ "env": { "type": "doc" },
  "problem": { "statement": "", "why_now": "", "evidence": [ { "text": "", "source": "" } ] },
  "task": { "title": "", "role": "${role}", "brief": "", "deliverables": [ { "id": "d1", "title": "", "format": "" } ], "time_minutes": 60, "rules": [""] },
  "materials": [ { "id": "m1", "title": "", "kind": "doc", "content": "", "source": "db", "basis": "" } ],
  "rubric": [ { "id": "r1", "title": "", "desc": "", "weight": 20, "depends_on": [], "basis": "", "levels": { "L1": "", "L2": "", "L3": "", "L4": "" } } ] }`;
  const { parsed: p, model: used } = await askJson(prompt, model, 'Generate · 出题', name);
  const e = p.env || {};
  const envType: WorkEnvType = opts.env || (['doc', 'code', 'sheet', 'design'].includes(e.type) ? e.type : 'doc');
  const env: WorkEnv = { type: envType };
  if (envType === 'code') { env.language = s(e.language, 20) || 'js'; env.starter = s(e.starter, 4000); env.tests = (Array.isArray(e.tests) ? e.tests : []).slice(0, 6).map((t: any) => ({ name: s(t.name, 60), code: s(t.code, 600) })).filter((t: any) => t.code); }
  if (envType === 'sheet') env.csv = s(e.csv, 8000);
  if (envType === 'design') { env.params = (Array.isArray(e.params) ? e.params : []).slice(0, 10).map((x: any) => ({ name: s(x.name, 40), unit: s(x.unit, 12), hint: s(x.hint, 120) })).filter((x: any) => x.name); env.sketch_hint = s(e.sketch_hint, 300); }
  const task: WorkTask = {
    env,
    problem: { statement: s(p.problem?.statement, 400), why_now: s(p.problem?.why_now, 400), evidence: (Array.isArray(p.problem?.evidence) ? p.problem.evidence : []).slice(0, 6).map((e: any) => ({ text: s(e.text, 300), source: s(e.source, 80) })) },
    task: { title: s(p.task?.title, 40) || `${name} · ${role} 真活`, role, brief: s(p.task?.brief, 2000), deliverables: (Array.isArray(p.task?.deliverables) ? p.task.deliverables : []).slice(0, 4).map((d: any, i: number) => ({ id: d.id || `d${i + 1}`, title: s(d.title, 60), format: s(d.format, 60) })), time_minutes: Math.min(120, Math.max(30, Number(p.task?.time_minutes) || 60)), rules: (Array.isArray(p.task?.rules) ? p.task.rules : []).slice(0, 6).map((r: any) => s(r, 120)) },
    materials: (Array.isArray(p.materials) ? p.materials : []).slice(0, 6).map((m: any, i: number) => ({ id: m.id || `m${i + 1}`, title: s(m.title, 60), kind: (['doc', 'table', 'note', 'email', 'data'].includes(m.kind) ? m.kind : 'doc'), content: s(m.content, 6000), source: (['db', 'generated', 'mixed'].includes(m.source) ? m.source : 'generated'), basis: s(m.basis, 200) })),
    rubric: (Array.isArray(p.rubric) ? p.rubric : []).slice(0, 10).map((r: any, i: number) => ({ id: r.id || `r${i + 1}`, title: s(r.title, 60), desc: s(r.desc, 300), weight: Math.max(1, Number(r.weight) || 10), depends_on: Array.isArray(r.depends_on) ? r.depends_on.map(String) : [], basis: s(r.basis, 200), levels: { L1: s(r.levels?.L1, 160), L2: s(r.levels?.L2, 160), L3: s(r.levels?.L3, 160), L4: s(r.levels?.L4, 160) } })),
  };
  // 权重归一到 100；依赖只认存在的条目
  const ids = new Set(task.rubric.map(r => r.id));
  const sum = task.rubric.reduce((a, r) => a + r.weight, 0) || 1;
  for (const r of task.rubric) { r.weight = Math.round(r.weight / sum * 100); r.depends_on = r.depends_on.filter(d => ids.has(d) && d !== r.id); }
  if (!task.task.rules.some(r => /AI/.test(r))) task.task.rules.unshift('可以随便用 AI，不算作弊；评的是你怎么用、什么是你自己判断的');
  return { task, model: used };
}

/** 第三步：最强模型先做一遍当基线（用和候选人一样的材料），再用同一套 rubric 评它 */
export async function runBaseline(task: WorkTask, opts: { model?: string; institution?: string } = {}): Promise<{ model: string; answer: string; result: any }> {
  const model = opts.model || WORK_MODEL;
  const envNote = task.env?.type === 'code' ? `这是代码台（${task.env.language || 'js'}）：先给完整代码（用 \`\`\` 包起来，导出名为 solution 的函数），再写说明。${task.env.starter ? `起始代码：\n${task.env.starter}` : ''}${task.env.tests?.length ? `\n自测用例：${task.env.tests.map(t => t.name).join('、')}` : ''}`
    : task.env?.type === 'sheet' ? `这是表格 / 数据台：交付物里先给处理后的表（CSV 或 Markdown 表），再写口径说明。起始表：\n${task.env.csv || ''}`
    : task.env?.type === 'design' ? `这是设计台：先给参数表（${(task.env.params || []).map(p => p.name + (p.unit ? '/' + p.unit : '')).join('、')}），每个参数给值和依据；再用文字描述草图（${task.env.sketch_hint || ''}）；最后设计说明。`
    : '这是文档 / 对账台：按交付物逐个写，Markdown。';
  const prompt = `你是应聘「${task.task.role}」的候选人，现在做这道真活。只能用下面的材料；材料里没有的数据要明确标注假设。总共 1200–2500 字。
${envNote}
## 任务书
${task.task.brief}
## 交付物
${task.task.deliverables.map(d => `- ${d.id} ${d.title}（${d.format}）`).join('\n')}
## 材料
${task.materials.map(m => `### ${m.id} ${m.title}\n${m.content}`).join('\n\n')}`;
  let answer = '', used = model;
  for (const m of [model, 'claude-sonnet-5-5', 'qwen-plus']) {
    try {
      const res = await generateContent(prompt, m);
      await logTokenUsage({ tool_name: 'work', task_name: 'Baseline · AI 先做一遍', institution: opts.institution || '', model_id: m, usageMetadata: res.usageMetadata } as any).catch(() => {});
      answer = res.text.trim(); used = m; if (answer) break;
    } catch (e) { console.warn(`[work] 基线 ${m} 失败：${String((e as any)?.message).slice(0, 120)}`); }
  }
  if (!answer) throw new Error('AI 基线没有生成');
  const result = await gradeResult(task, answer, { institution: opts.institution, who: 'AI 基线' });
  return { model: used, answer, result };
}
