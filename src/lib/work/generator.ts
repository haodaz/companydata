/**
 * 真活台 · 生成器（2026-10-18）：这条线的核心。
 * 不模拟职业——拿一家企业的真实业务问题出题：企业画像 / 岗位 / 职业典型任务 / 行业规范 是出题的 context，
 * 输出「问题 → 任务 → 材料包 → 带依赖关系的 rubric（每条带依据）→ AI 基线答卷」。考核空间（工作台 / 报告）只消费这里的产物。
 * 只用材料、不编造：材料里没有的数字一律标「示例数据」；能指回来源的都指回去。
 */
import { regionName } from '@/lib/region-codes';
import { supabaseAdmin as db } from '@/lib/supabase';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import { findOccupation } from '@/lib/occupation-store';
import { gradeResult } from '@/lib/work/grader';
import { normalizeStages, renderSkeleton, verifyCalcs, type SampleSkeleton, type SampleStage } from '@/lib/work/samples';
import { resolveModule } from '@/lib/work/modules';

export const WORK_MODEL = process.env.WORK_MODEL || 'claude-opus-5-5';

export interface WorkContext {
  company: Record<string, any> | null;   // companies 的画像字段（introduction / business_profile / growth_signals / industry_position / public_sentiment …）
  products: { name: string; category?: string; description?: string; is_flagship?: boolean }[];
  news: { description: string; publish_date_str?: string; kind?: string }[];
  executives: { name: string; title?: string }[];
  jobs: Record<string, any>[];   // jobs：name / title_cn / department / job_function / summary_cn / responsibilities / overview / skill_labels / education_description / major_requirement / preferred_qualifications / city
  occupation: { id?: number; name: string; intro?: string; responsibility?: string; position_requirement?: string } | null;
  typical_tasks: { name: string; summary?: string; goal?: string; success_criteria?: any; process?: any; common_mistakes?: any }[];
  standards: { code?: string; title: string; key_points?: any; operation_relevance?: string }[];
  notes: string[];   // 哪些材料没找到
  /** 企业深度画像专题（company_deep_research）：投资机构的基金 / 策略 / 被投 / 合伙人 / 招聘，药企的管线 / 交易…… */
  deep?: { topic: string; label: string; text: string }[];
  /** 关联主体（共同高管 ≥2 位，同一体系，如武岳峰资本 ↔ 鼎峰科创）：简介、近期动态、深度画像 */
  related?: { id: number; name: string; shared: string[]; text: string; news: string[]; deep: string[] }[];
}

/** 出题人是用自然语言说要什么样的人（「我要一个能看懂人工智能行业的人来做投资」），还是给了个职位名 */
export const isNeedText = (role: string) => role.trim().length > 14 || /[，,。、]|要一个|能看懂|能把|的人/.test(role);

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
export async function gatherContext(companyQuery: string, role: string, opts: { intro?: string } = {}): Promise<WorkContext> {
  const ctx: WorkContext = { company: null, products: [], news: [], executives: [], jobs: [], occupation: null, typical_tasks: [], standards: [], notes: [] };
  const q = companyQuery.trim();
  const intro = String(opts.intro || '').trim();
  let company: any = null;
  const C = 'id, name, name_en, brief_name, industry, sub_industry, one_sentence, introduction, business_profile, product_area, company_specialties, company_case, tech_advantage, research_area, growth_signals, industry_position, public_sentiment, candidate_reputation, campus_overview, tags, city, province, official_website, company_scale, company_employees, info_founding_year, operating_revenue, stock_code';
  if (/^\d+$/.test(q)) ({ data: company } = await db.from('companies').select(C).eq('id', Number(q)).eq('if_delete', false).maybeSingle());
  if (!company && q) {
    const { data } = await db.from('companies').select(C).eq('if_delete', false).or(`name.ilike.%${q}%,name_en.ilike.%${q}%,brief_name.ilike.%${q}%`).order('id').limit(5);
    // 贴了介绍 = 出题人说这家不在库里：只认名字完全对上的，不拿模糊匹配的别家顶替
    company = (data || []).find((c: any) => c.name === q || c.brief_name === q) || (intro ? null : data?.[0]) || null;
  }
  const J = 'name, title_cn, department, job_function, summary_cn, responsibilities, overview, skill_labels, education_description, major_requirement, preferred_qualifications, city';
  if (company) {
    ctx.company = company;
    const cid = company.id;
    const [{ data: products }, { data: news }, { data: execs }, { data: jobs }] = await Promise.all([
      db.from('company_products').select('name, category, description, is_flagship').eq('company_id', cid).eq('if_delete', false).order('is_flagship', { ascending: false }).limit(8),
      db.from('company_news').select('description, publish_date_str, kind').eq('company_id', cid).eq('if_delete', false).order('publish_date', { ascending: false, nullsFirst: false }).limit(8),
      db.from('company_executives').select('name, title').eq('company_id', cid).eq('if_delete', false).limit(5),
      db.from('jobs').select(J).eq('company_id', cid).eq('if_delete', false).or(`name.ilike.%${role}%,title_cn.ilike.%${role}%,job_function.ilike.%${role}%`).limit(3),
    ]);
    ctx.products = products || []; ctx.news = news || []; ctx.executives = execs || []; ctx.jobs = jobs || [];
    if (!ctx.jobs.length) {
      // 没有同名岗位：拉一批，按「要找的人」的字面相关度挑 3 条（投资岗别挑成 HRD / 架构师，2026-10-25 高瓴演示前发现）
      const { data } = await db.from('jobs').select(J).eq('company_id', cid).eq('if_delete', false).not('responsibilities', 'is', null).limit(80);
      const grams = new Set<string>(); const rr = role.replace(/[\s，。、“”「」（）()的人来做一个能]/g, ''); for (let i = 0; i + 2 <= rr.length; i++) grams.add(rr.slice(i, i + 2));
      const score = (j: any) => { const t = `${j.name || ''} ${j.title_cn || ''} ${j.department || ''} ${j.job_function || ''} ${String(j.responsibilities || '').slice(0, 600)}`; let n = 0; for (const g of grams) if (t.includes(g)) n++; if (/投资|投后|研究|分析|行业/.test(t) && /投资|研究|分析|行业/.test(rr)) n += 2; if (/Portfolio|被投企业/.test(t)) n -= 2; return n; };
      ctx.jobs = (data || []).map(j => ({ j, s: score(j) })).sort((a, b) => b.s - a.s).slice(0, 3).map(x => x.j);
      if (ctx.jobs.length) ctx.notes.push(`这家企业没有「${role}」的在招岗位，取了同企业最接近的岗位做参考`);
    }
    // 深度画像：每个专题压成一段（出题时最有用的材料：投资机构的被投企业、合伙人、招聘要求……）
    const { data: deep } = await db.from('company_deep_research').select('topic, data').eq('company_id', cid);
    const { DEEP_TOPICS, DEEP_TOPICS_VC } = await import('@/lib/company-deep-topics');
    const label = Object.fromEntries([...DEEP_TOPICS, ...DEEP_TOPICS_VC].map(t => [t.key, t.label]));
    const strip = (v: any): any => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !/^(source|sources|queries)$/.test(k)).map(([k, x]) => [k, strip(x)])) : v;
    ctx.deep = (deep || []).filter(d => d.data && JSON.stringify(d.data).length > 30).map(d => ({ topic: d.topic, label: label[d.topic] || d.topic, text: JSON.stringify(strip(d.data)).slice(0, 1500) }));
    ctx.related = await relatedEntities(cid, label, strip).catch(() => []);
  } else if (intro.length >= 20) {
    // 库里没有的企业（2026-10-22）：出题人贴一段介绍，先解析成画像再出题；之后再按单入库补全（make to order）
    const parsed = await parseCompanyIntro(q, intro).catch(e => { console.warn('[work] 介绍解析失败：', String(e?.message).slice(0, 120)); return null; });
    if (parsed) {
      ctx.company = { ...parsed.company, name: parsed.company?.name || q, __src: '出题人提供的企业介绍，AI 解析' };
      ctx.products = parsed.products; ctx.news = parsed.news; ctx.executives = parsed.executives;
    } else ctx.company = { name: q, introduction: intro.slice(0, 1500), __src: '出题人提供的企业介绍' };
    ctx.notes.push(`「${q}」还不在企业库里，企业事实来自出题人贴的介绍`);
  } else ctx.notes.push(`企业库里没找到「${q}」，只能按名字出题，企业事实会少`);
  // 职业层：名字 / 别名命中，命不中就模糊找。出题人用自然语言描述要什么样的人时，不硬套职业库
  let occ: any = isNeedText(role) ? null : await findOccupation({ name: role });
  if (!occ && !isNeedText(role)) { const { data } = await db.from('occupations').select('*').eq('if_delete', false).ilike('name', `%${role}%`).limit(1); occ = data?.[0] || null; }
  if (occ) {
    ctx.occupation = { id: occ.id, name: occ.name, intro: occ.intro, responsibility: occ.responsibility, position_requirement: occ.position_requirement };
    const { data: tt } = await db.from('typical_tasks').select('name, summary, goal, success_criteria, process, common_mistakes').eq('occupation_id', occ.id).eq('if_delete', false).limit(6);
    ctx.typical_tasks = tt || [];
  } else if (!isNeedText(role)) ctx.notes.push(`职业库里没有「${role}」，典型任务这一层缺`);
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

/** 关联主体：和本企业共同高管 ≥2 位的企业（同一体系的品牌 / 主体），最多 2 家（2026-10-22：武岳峰资本 ↔ 鼎峰科创） */
async function relatedEntities(cid: number, label: Record<string, string>, strip: (v: any) => any): Promise<NonNullable<WorkContext['related']>> {
  const { data: ex } = await db.from('company_executives').select('name').eq('company_id', cid).eq('if_delete', false);
  const names = [...new Set((ex || []).map(e => e.name).filter(Boolean))];
  if (!names.length) return [];
  const { data: other } = await db.from('company_executives').select('company_id, name').in('name', names).neq('company_id', cid).eq('if_delete', false);
  const cnt = new Map<number, Set<string>>();
  for (const o of other || []) { if (!cnt.has(o.company_id)) cnt.set(o.company_id, new Set()); cnt.get(o.company_id)!.add(o.name); }
  const out: NonNullable<WorkContext['related']> = [];
  for (const [rid, shared] of [...cnt.entries()].filter(([, x]) => x.size >= 2).sort((a, b) => b[1].size - a[1].size).slice(0, 2)) {
    const { data: r } = await db.from('companies').select('id, name, aliases, one_sentence, introduction, industry_position').eq('id', rid).eq('if_delete', false).maybeSingle();
    if (!r) continue;
    const [{ data: news }, { data: deep }] = await Promise.all([
      db.from('company_news').select('description, publish_date_str').eq('company_id', rid).eq('if_delete', false).order('publish_date', { ascending: false, nullsFirst: false }).limit(8),
      db.from('company_deep_research').select('topic, data').eq('company_id', rid),
    ]);
    out.push({ id: r.id, name: r.name, shared: [...shared],
      text: [r.aliases?.length ? `别名：${r.aliases.join('、')}` : '', r.one_sentence, r.introduction, r.industry_position].filter(Boolean).join('\n').slice(0, 1500),
      news: (news || []).map(n => `${n.publish_date_str || ''} ${s(n.description, 240)}`),
      deep: (deep || []).filter(d => d.data && JSON.stringify(d.data).length > 30).map(d => `${label[d.topic] || d.topic}：${JSON.stringify(strip(d.data)).slice(0, 900)}`) });
  }
  return out;
}

/** 出题人贴的企业介绍 → 和企业库同样字段的画像（只用介绍里有的，不编） */
export async function parseCompanyIntro(name: string, intro: string): Promise<{ company: Record<string, any>; products: WorkContext['products']; news: WorkContext['news']; executives: WorkContext['executives'] }> {
  const prompt = `下面是出题人贴的一段企业介绍（可能来自官网、BP、公众号或口述）。把它整理成企业画像 JSON，给出题用。
规则：只用介绍里写到的信息，没写的字段留空字符串 / 空数组，绝不编造数字、客户、人名；原话里的关键事实尽量保留。
企业名：${name}
## 介绍原文
${intro.slice(0, 6000)}
## 输出 JSON
{"company":{"name":"","industry":"行业","city":"","company_scale":"规模 / 人数 / 阶段（如 A 轮、初创 20 人）","one_sentence":"一句话说清它做什么","introduction":"简介","business_profile":"业务与客户","product_area":"产品领域","tech_advantage":"技术或能力优势","growth_signals":"正在推进的事：新业务、出海、融资、扩张、招人原因","industry_position":"在行业里的位置、竞争对手","public_sentiment":"介绍里提到的难点、风险或卡点"},
"products":[{"name":"","description":""}],"news":[{"publish_date_str":"","description":"近期动作"}],"executives":[{"name":"","title":""}]}`;
  const { parsed: p } = await askJson(prompt, 'qwen-plus', 'Generate · 解析企业介绍', name);
  const arr = (v: any) => Array.isArray(v) ? v : [];
  return {
    company: Object.fromEntries(Object.entries(p.company || {}).filter(([, v]) => typeof v === 'string' && v.trim())),
    products: arr(p.products).filter((x: any) => x?.name).slice(0, 8),
    news: arr(p.news).filter((x: any) => x?.description).slice(0, 8),
    executives: arr(p.executives).filter((x: any) => x?.name).slice(0, 6),
  };
}

/** 材料渲染成给模型看的文本（每段带来源标签） */
export function renderContext(ctx: WorkContext): string {
  const L: string[] = [];
  if (ctx.company) {
    const c = ctx.company;
    const f = (label: string, v: any, n = 500) => (v ? `${label}：${s(v, n)}\n` : '');
    L.push(`## 企业画像（来源：${c.__src || '企业实体库'}）\n名称：${c.name}${c.industry ? ` · 行业：${c.industry}${c.sub_industry ? ' / ' + c.sub_industry : ''}` : ''}${c.city ? ` · ${c.province || ''}${c.city}` : ''}${c.company_scale ? ` · 规模：${c.company_scale}` : ''}${c.info_founding_year ? ` · 成立：${c.info_founding_year}` : ''}${c.operating_revenue ? ` · 营收：${c.operating_revenue}` : ''}${c.stock_code ? ` · ${c.stock_code}` : ''}\n${f('一句话', c.one_sentence, 120)}${f('简介', c.introduction, 700)}${f('业务', c.business_profile, 500)}${f('产品领域', c.product_area, 200)}${f('专长', c.company_specialties, 300)}${f('技术优势', c.tech_advantage, 400)}${f('研发方向', c.research_area, 300)}${f('增长信号', c.growth_signals, 500)}${f('行业位置', c.industry_position, 500)}${f('合作案例', c.company_case, 400)}${f('舆情风险', c.public_sentiment, 500)}${f('求职者口碑', c.candidate_reputation, 300)}${f('校招概况', c.campus_overview, 300)}${c.tags?.length ? `标签：${c.tags.join('、')}\n` : ''}`);
  }
  if (ctx.products.length) L.push(`## 产品（来源：企业产品子实体）\n${ctx.products.map(p => `- ${p.name}${p.is_flagship ? '（主打）' : ''}${p.category ? ` [${p.category}]` : ''}：${s(p.description, 200)}`).join('\n')}`);
  if (ctx.news.length) L.push(`## 近期动态（来源：企业动态子实体）\n${ctx.news.map(n => `- ${n.publish_date_str || ''} ${s(n.description, 240)}`).join('\n')}`);
  if (ctx.executives.length) L.push(`## 管理团队（来源：企业高管子实体）\n${ctx.executives.map(e => `- ${e.name}${e.title ? ' · ' + e.title : ''}`).join('\n')}`);
  if (ctx.jobs.length) L.push(`## 在招岗位（来源：岗位库，校招 / 社招）\n${ctx.jobs.map(j => `- ${j.title_cn || j.name}${j.department ? ' · ' + j.department : ''}${j.job_function ? ' · ' + j.job_function : ''}${j.city ? ' · ' + regionName('city', j.city) : ''}\n  概述：${s(j.summary_cn || j.overview, 300)}\n  职责：${s(j.responsibilities, 600)}\n  要求：${s(j.education_description, 100)} ${s(j.major_requirement, 120)} ${s(j.preferred_qualifications, 200)} 技能：${s(j.skill_labels, 150)}`).join('\n')}`);
  if (ctx.occupation) L.push(`## 职业（来源：职业实体库）\n${ctx.occupation.name}：${s(ctx.occupation.intro, 400)}\n职责：${s(ctx.occupation.responsibility, 500)}\n要求：${s(ctx.occupation.position_requirement, 300)}`);
  if (ctx.typical_tasks.length) L.push(`## 这个职业的典型任务（来源：职业典型任务库）\n${ctx.typical_tasks.map(t => `- ${t.name}：${s(t.summary, 200)}\n  目标：${s(t.goal, 150)}；成功标准：${s(t.success_criteria, 200)}；常见错误：${s(t.common_mistakes, 200)}`).join('\n')}`);
  if (ctx.related?.length) for (const r of ctx.related) L.push(`## 关联主体：${r.name}（与本企业共同高管 ${r.shared.join('、')}，同一体系；来源：企业实体库）\n${r.text}${r.news.length ? `\n近期动态：\n${r.news.map(n => '- ' + n).join('\n')}` : ''}${r.deep.length ? `\n深度画像：\n${r.deep.map(d => '- ' + d).join('\n')}` : ''}`);
  if (ctx.deep?.length) L.push(`## 企业深度画像（来源：深度尽调专题，联网检索、逐条带出处）\n${ctx.deep.map(d => `### ${d.label}\n${d.text}`).join('\n')}`);
  if (ctx.standards.length) L.push(`## 行业标准 / 规程（来源：行业标准与规程库）\n${ctx.standards.map(x => `- ${x.code ? x.code + ' ' : ''}${x.title}：${s(x.key_points, 300)}${x.operation_relevance ? '；操作相关：' + s(x.operation_relevance, 150) : ''}`).join('\n')}`);
  if (ctx.notes.length) L.push(`## 材料缺口\n${ctx.notes.map(n => '- ' + n).join('\n')}`);
  return L.join('\n\n');
}

/** 操作台类型（比 NeoWork 多的一层：题按岗位选环境）：doc 文档 / 对账台 · code 代码台 · sheet 表格 / 数据台 · design 设计台（CAD 雏形） */
export type WorkEnvType = 'doc' | 'code' | 'sheet' | 'design' | 'open' | 'plugin';   // open：不用站内操作台，候选人用自己的软件做、录屏 + 上传交付；plugin：用自己的网页工具做，真活插件记过程
export interface WorkEnv {
  type: WorkEnvType;
  /** code：语言（js 的自测用例能在浏览器里跑）；starter 起始代码；tests 用例 [{ name, code }]，code 是拿到 `solution` 后返回 true/false 的 JS 表达式或函数体 */
  language?: string; starter?: string; tests?: { name: string; code: string }[];
  /** sheet：起始表（CSV 文本） */
  csv?: string;
  /** design：参数表 [{ name, unit, hint }] + 草图说明 */
  params?: { name: string; unit?: string; hint?: string }[]; sketch_hint?: string;
}
export const ENV_LABELS: Record<WorkEnvType, string> = { doc: '文档 / 对账台', code: '代码台', sheet: '表格 / 数据台', design: '设计台', open: '自己录制电脑操作', plugin: '真活插件 · 自己的网页工具' };

export interface Attachment { url: string; name: string; mime?: string; size?: number; text?: string; image?: boolean }
/** 把上传的附件挂成材料（kind=file）：有文字的带文字（评卷和 AI 做题能读），图片只有链接和说明 */
export function attachmentsToMaterials(atts: Attachment[], startAt: number): WorkTask['materials'] {
  return atts.map((a, i) => ({ id: `m${startAt + i}`, title: a.name, kind: 'file' as const, content: a.image ? (a.text ? `图片说明（AI 看图整理，以原图为准）：\n${a.text.slice(0, 4000)}` : `附图：${a.name}`) : a.text ? a.text.slice(0, 8000) : `附件：${a.name}`, source: 'upload' as const, basis: a.image ? '出题人上传的素材图 + AI 看图说明' : '出题人上传的素材', url: a.url, mime: a.mime, name: a.name }));
}

/**
 * 原题直发（2026-10-24，王刚：一道题本来很干净，什么都不改直接发出去）：不改写题面，只整理成平台的结构（标题 / 交付物 / 评分点）。
 * 评分点只从题目自己的要求里推，不加题里没有的。
 */
export async function verbatimTask(text: string, opts: { company?: string; role?: string; env?: WorkEnvType; model?: string; attachments?: Attachment[] } = {}): Promise<{ task: WorkTask; model: string }> {
  const model = opts.model || WORK_MODEL;
  const prompt = `出题人交来一道现成的题，要**原样**发给候选人做，不许改写、不许增删要求。你只做整理：
- title：题里有标题就用，没有就用 8–16 字概括。
- deliverables：题里要求交什么（2–4 个，id d1…）；没写就一条「按题目要求作答」。
- time_minutes：题里写了就用，没写 60。
- deliverables 的 module：doc 文档 / sheet 表格或测算 / code 脚本 / design 参数草图 / canvas 流程图、泳道图、思维导图、架构图；按题目要交的形态选，可混用。
- materials：题里如果有明显独立的材料段（数据表、背景资料、附录），拆成材料，**文字原样**（kind 按内容：table / doc / data），source 写 generated、basis 写「原题附带」；没有就 []。题里只是**提到**「附件 / 附表 / 附图」而正文没给内容的，不要造材料（附件由出题人另外上传）。
- rubric：从题目自己的要求里推出评分点，5–8 条，basis 写「题目要求：…」并引原句；levels 四档可观察；weight 加起来 100。不加题里没有的要求。
- env：按题的作答媒介选 doc / code / sheet / design。
${opts.attachments?.length ? `\n题目附件（会原样挂给候选人）：${opts.attachments.map(a => a.name).join('、')}` : ''}
## 原题
${text.slice(0, 12000)}
只返回 JSON：{ "env": { "type": "doc" }, "title": "", "deliverables": [ { "id": "d1", "title": "", "format": "", "module": "doc" } ], "time_minutes": 60, "materials": [ { "id": "m1", "title": "", "kind": "doc", "content": "" } ], "rubric": [ { "id": "r1", "title": "", "desc": "", "weight": 20, "depends_on": [], "basis": "", "levels": { "L1": "", "L2": "", "L3": "", "L4": "" } } ] }`;
  const { parsed: p, model: used } = await askJson(prompt, model, 'Generate · 原题直发', opts.company);
  const envType: WorkEnvType = opts.env || (['doc', 'code', 'sheet', 'design'].includes(p.env?.type) ? p.env.type : 'doc');
  const task: WorkTask = {
    env: { type: envType },
    problem: { statement: `出题人给的原题${opts.company ? `（${opts.company}）` : ''}`, why_now: '', evidence: [] },
    task: { title: s(p.title, 40) || '真活', role: opts.role || '候选人', brief: text.slice(0, 6000), deliverables: (Array.isArray(p.deliverables) ? p.deliverables : []).slice(0, 4).map((d: any, i: number) => ({ id: d.id || `d${i + 1}`, title: s(d.title, 60), format: s(d.format, 60), module: resolveModule(s(d.format, 60), d.module) })), time_minutes: Math.min(180, Math.max(20, Number(p.time_minutes) || 60)), rules: ['题目原样，不改一字', '可以随便用 AI，不算作弊；评的是你怎么用', '材料里没有的数据要标注假设'] },
    // 模型拆出的材料：内容空的、或和上传附件重名的都丢掉（附件另挂）
    materials: (Array.isArray(p.materials) ? p.materials : []).filter((m: any) => String(m.content || '').trim().length >= 20 && !(opts.attachments || []).some(a => a.name && String(m.title || '').includes(a.name.replace(/\.[^.]+$/, '')))).slice(0, 6).map((m: any, i: number) => ({ id: `m${i + 1}`, title: s(m.title, 60), kind: (['doc', 'table', 'note', 'email', 'data'].includes(m.kind) ? m.kind : 'doc'), content: s(m.content, 8000), source: 'generated' as const, basis: '原题附带' })),
    rubric: (Array.isArray(p.rubric) ? p.rubric : []).slice(0, 10).map((r: any, i: number) => ({ id: r.id || `r${i + 1}`, title: s(r.title, 60), desc: s(r.desc, 300), weight: Math.max(1, Number(r.weight) || 10), depends_on: Array.isArray(r.depends_on) ? r.depends_on.map(String) : [], basis: s(r.basis, 200), levels: { L1: s(r.levels?.L1, 160), L2: s(r.levels?.L2, 160), L3: s(r.levels?.L3, 160), L4: s(r.levels?.L4, 160) } })),
  };
  if (!task.task.deliverables.length) task.task.deliverables = [{ id: 'd1', title: '按题目要求作答', format: '文档' }];
  const ids = new Set(task.rubric.map(r => r.id)); const sum = task.rubric.reduce((a, r) => a + r.weight, 0) || 1;
  for (const r of task.rubric) { r.weight = Math.round(r.weight / sum * 100); r.depends_on = r.depends_on.filter(d => ids.has(d) && d !== r.id); }
  return { task, model: used };
}

export interface WorkTask {
  env: WorkEnv;
  problem: { statement: string; why_now: string; evidence: { text: string; source: string }[] };
  task: { title: string; role: string; brief: string; deliverables: { id: string; title: string; format: string; module?: 'doc' | 'sheet' | 'code' | 'design' | 'canvas' }[]; time_minutes: number; rules: string[]; stages?: SampleStage[] };   // stages：案例推进式（照深度样本出）：一步步给信息、每步有问、有参考答案和要算的数（2026-10-23）
  materials: { id: string; title: string; kind: 'doc' | 'table' | 'note' | 'email' | 'data' | 'file'; content: string; source: 'db' | 'generated' | 'mixed' | 'upload'; basis?: string; url?: string; mime?: string; name?: string }[];   // file = 出题人上传的附件（表格 / 图纸 / 截图 / PDF），候选人能看原件；content 是抽出的文字或说明
  rubric: { id: string; title: string; desc: string; weight: number; depends_on: string[]; basis: string; levels: { L1: string; L2: string; L3: string; L4: string } }[];
}

/** 第二步：问题 → 任务 → 材料包 → rubric（一次生成，JSON） */
/** 研究真活（2026-10-20）：科研院所招博士后 / 研究员 / 教授，考的是研究方向上的操作和研究技能 */
export const RESEARCH_TASK_KINDS = ['实验设计（给研究问题，设计方案、对照、变量与样本量）', '数据分析（给一份真实格式的实验 / 观测数据，找异常、选统计方法、下结论并说清局限）', '文献与选题（给一个方向，梳理进展、指出研究空白、提可做的课题）', '审稿（给一篇稿件或摘要，找方法和结论上的问题，写审稿意见）', '写基金本子（研究目标、技术路线、可行性与风险）', '复现（用代码复现论文里的一个结果并解释差异）'];

export async function generateTask(ctx: WorkContext, role: string, opts: { model?: string; focus?: string; env?: WorkEnvType; research?: boolean; sample?: SampleSkeleton | null; sampleMode?: 'reskin' | 'inspire'; attachments?: Attachment[] ; bankRefs?: string; base?: { text: string; mode: 'base' | 'ref'; title: string } } = {}): Promise<{ task: WorkTask; model: string }> {
  const model = opts.model || WORK_MODEL;
  const name = ctx.company?.name || (opts.research ? '这个科研团队' : '这家企业');
  const need = isNeedText(role);
  const needNote = need ? `
## 出题人要找的人（自然语言，原话）
「${role}」
出题人没有说职位名，也不要你替他套一个职位名（不要写成「xx 分析师 / xx 专员」）。直接围绕「这个人有没有这样的本事」出真活：这道题做得好的人，就是他要找的人。
task.role 写成 6–14 字的人话概括，说这个人能干什么（例：「能看懂人工智能行业、能做投资判断的人」），不要职位名。
` : '';
  const prompt = `${opts.research
    ? `你是「真活台」的出题人：拿一个科研团队**此刻真实的研究问题**给「${role}」出一道**研究真活**——考的是这个研究方向上的操作和研究技能，不是知识题、不是面试八股。
研究真活的类型：${RESEARCH_TASK_KINDS.join('；')}。按岗位和出题人的要求挑最合适的一种（或组合两种）。
参照的方法：先锚定「这个团队现在卡在哪个研究问题上、这个人来了要啃什么」，再展开成一个开放的研究任务，配上做这件事会拿到的材料（数据表、实验记录、审稿稿件、项目指南…，没有真实数据就按真实格式生成并标「示例数据」），最后把粗标准展开成能逐条核对、**条目之间有依赖关系**的细 rubric（例：先界定问题与假设 → 再设计对照与变量 → 再选统计方法 → 再解释结果与局限）。评分重点是科学严谨：对照、可重复、统计、局限、伦理与安全。`
    : `你是「真活台」的出题人：拿一家企业**此刻真实的业务问题**给「${role}」岗位出一道真活，不是模拟职业、不是知识题。
参照的方法：先锚定「这个岗位要替企业解决什么内部问题」，再把问题展开成一个开放的真实任务，配上做这件事会拿到的材料，最后把人写的粗标准展开成 agent 能逐条核对、**条目之间有依赖关系**的细 rubric（例：先设假设 → 再建模 → 再估值 → 再调整）。`}

${needNote}
## 材料（只许用这些；没有的数字写「示例数据」并说明；每条依据指回来源）
${renderContext(ctx)}
${ctx.notes.some(n => /取了同企业其他岗位做参考/.test(n)) ? `\n注意：材料里的在招岗位不是「${role}」本岗，只拿来理解这家企业的工作方式和用语；**题目主题由「${role}」决定**，不要被参考岗位的职能（如 ESG、合规、行政）带偏。\n` : ''}${opts.focus ? `\n## 出题人额外要求\n${opts.focus}\n` : ''}${opts.attachments?.length ? `\n## 出题人上传的题目附件（会原样发给候选人；文字是从文件里抽出来的，图片只有文件名）\n${opts.attachments.map((a, i) => `[附件 ${i + 1}] ${a.name}${a.text ? `：\n${a.text.slice(0, 4000)}` : '（图片 / 无文字）'}`).join('\n\n')}\n题目要围绕这些附件出：任务书里写明候选人要看哪份附件做什么；materials 里不要重复抄附件内容，平台会把附件原件挂进材料包。\n` : ''}${opts.sample ? `
${opts.bankRefs ? `## 这家企业 / 这个行业以前出过的题（题目资产库；只借推进结构、交付形态、评分依赖——**业务问题要换一个角度，不要和过往题撞题**）
${opts.bankRefs}
` : ''}## 深度样本（出题人给的参照：一道公认的好题）
${renderSkeleton(opts.sample)}
${opts.sampleMode === 'inspire'
  ? `照它出：**推进结构、题型顺序、步数、难度和数字密度跟样本一致**，内容全部换成 ${name} 此刻真实的问题和材料（行业、公司、数字都不能照抄样本）。`
  : `**改背景、换数字，再出一次**（老师从上一届作业里拿题的做法）：每一步的题型、问法、要算什么、答案的推导路径都**原样保留**；把故事背景换成 ${name} 此刻真实的处境（用材料里的事实），样本里的数据表换成同样结构、同样量级但不同的数字（每个数改 20%–60%，别只换单位），calc 的 expr 用新数字重写，value 平台会重算；expected 按新数字重写结论。样本里没有而材料里有的事实可以加进背景，不要加新的步骤。`}
每一步只给当步需要的信息；测算要有可复核的算式；最后一步综合前面所有步骤。
` : ''}
${opts.base ? `## 任务库里的原题（出题人从「任务库」选的：「${opts.base.title}」）
${opts.base.text}
${opts.base.mode === 'base'
  ? `**原题直出，换成 ${name}**（出题人要的就是这道题，只是要变成自己公司的）：任务结构、交付物（数量、名称的意思、format、module）、材料的种类和各自的作用、材料里埋的坑、评分要点**原样保留**；企业、背景故事、工厂 / 项目 / 产品 / 人名换成 ${name} 此刻的真实处境（用上面「材料」里的事实），数字换成同结构、同量级、符合 ${name} 的数（材料没有的标「示例数据」）。**原题里的企业名、地名、项目名一个都不能留**。题面要读起来就是 ${name} 自己的活。`
  : `**仅做参考**：只借这道题的题型、推进方式、交付形态和难度；业务问题、背景、材料、数字全部按 ${name} 此刻的真实情况重新出，不要和原题撞题。`}
` : ''}
## 操作台（环境）
${opts.env === 'plugin' ? '出题人指定：候选人用自己浏览器里的网页工具做（在线文档 / 表格 / 设计工具 / 各家 AI 都行），装「真活插件」记录过程，最后在插件侧边栏交「交付说明 + 交付物链接」；所以 env 按 doc 出，交付物写成「在线文档或文件链接 + 交付说明」，材料要能下载后独立使用。' : opts.env === 'open' ? '出题人指定：候选人用自己电脑上的软件做（Excel / CAD / IDE 都行），全程录屏、最后上传交付文件；所以 env 按 doc 出，交付物写成「文件 + 交付说明」，材料要能下载后独立使用。' : opts.env ? `出题人指定环境：${opts.env}（${ENV_LABELS[opts.env]}）。` : '按岗位选最贴近真实工作媒介的环境：'}doc 文档 / 对账台（方案、对账、邮件、scorecard）· code 代码台（写函数 / 脚本；**starter 里的主函数必须命名为 solution**，tests 也调用 solution；language 用 js 时给 2–5 个自测用例：code 是一段 JS，拿到变量 solution（候选人的导出函数）后返回 true/false，如 "return solution([3,1,2]).join()==='1,2,3'"；其他语言不给 tests）· sheet 表格 / 数据台（csv 给起始表，含要对账 / 清洗的数据，5–30 行）· design 设计台（params 给 4–8 个要定的参数：name/unit/hint；sketch_hint 说明要画什么简图：零件轮廓、流程、布局）。
env 字段：{ "type": "doc|code|sheet|design", "language": "", "starter": "", "tests": [ { "name": "", "code": "" } ], "csv": "", "params": [ { "name": "", "unit": "", "hint": "" } ], "sketch_hint": "" }（只填该环境用到的字段）。交付物要和环境匹配（code 的交付物是代码 + 说明，sheet 是表 + 口径说明，design 是参数表 + 草图 + 设计说明）。

## 要求
- 企业是出题的客户：**企业自身的负面舆情**（监管立案、减持套现、高管离职、募资遇冷、亏损传闻）**不进 problem / why_now / 任务书**；只有候选人做这件事确实要处理它时，才在材料里作中性、带来源的一句陈述，不渲染。
- problem.statement：一句话说清 ${name} 现在的哪个${opts.research ? '研究问题' : '业务问题'}需要「${role}」来解决，必须能从材料里推出来（${opts.research ? '研究方向 / 在研项目 / 平台 / 岗位要求' : '近期动态 / 产品 / 岗位职责 / 典型任务'}）；why_now 说为什么是现在；evidence 列 2–4 条材料原句 + 来源名。
- task：title（8–16 字）；brief（给做题人看的任务书，300–500 字，口吻像业务负责人交代活：背景、要你做什么、交给谁、什么时候要；「交给谁」写角色（如「交给投委会」），**不要给真实人物编邮箱、电话、微信**）；deliverables 2–3 个（id d1…，title，format 如「一页纸方案 / 估值表 / 筛选脚本 / 流程图」，**module** 从 doc / sheet / code / design / canvas 里选：文档类 doc，表格 / 模型 / 测算表 sheet，脚本 / SQL / 函数 code，参数表 + 草图 design，流程图 / 泳道图 / 思维导图 / 架构图 canvas——**一道题的交付物可以混用模组**，这个岗位真实工作里会交什么就交什么，别为了省事全写成文档）；time_minutes 45–90；rules 3–5 条（必须含「可以随便用 AI，不算作弊；评的是你怎么用」和「材料里没有的数据要标注假设」）。
- materials 3–5 份，做这件事真的会拿到的东西：kind ∈ doc/table/note/email/data；content 用 Markdown，每份 300–900 字，表格用 Markdown 表；source：db=全部来自材料、generated=为任务合理补写（必须贴近企业真实情况并在正文标「示例数据」）、mixed；basis 写它依据材料的哪一段。至少一份是「有坑」的（信息不全、口径不一致、过期），这是真活。
${opts.sample ? `- stages（必填，${opts.sample.stages.length} 步，和样本一一对应）：id q1…；type 同样本；question（这一步问候选人什么，一句话）；reveal（这一步才给的信息：背景、数据表、图表，Markdown，图表用 Markdown 表把数据给全，300–900 字；数据要和 materials 里的事实一致，材料没有的标「示例数据」）；expected（参考答案 / 关键结论，评卷用，候选人看不到，含关键数字）；calc（这一步要算的数：label、expr 只含数字和 + - * / ( )、value；没有测算填 []）。brief 里要告诉候选人「这道题分 ${opts.sample.stages.length} 步推进，每一步看完信息再答，答完再看下一步」，deliverables 按步骤对应。\n` : ''}- rubric 5–8 条：id r1…；title；desc（怎么算做到）；weight 加起来 100；${opts.sample ? '每一步至少对应一条（desc 里写明对应 q 几）；' : ''}depends_on 填前置条目 id（没有填 []）；basis 必须指向材料来源（「行业标准 xxx 第 n 点」「岗位职责：…」「典型任务：…」），实在没有写「出题人判断，待业务负责人确认」；levels L1–L4 各一句可观察的行为描述（BARS）。
只返回 JSON：
{ "env": { "type": "doc" },
  "problem": { "statement": "", "why_now": "", "evidence": [ { "text": "", "source": "" } ] },
  "task": { "title": "", "role": "${role}", "brief": "", "deliverables": [ { "id": "d1", "title": "", "format": "", "module": "doc" } ], "time_minutes": 60, "rules": [""] },
  "materials": [ { "id": "m1", "title": "", "kind": "doc", "content": "", "source": "db", "basis": "" } ],
  "rubric": [ { "id": "r1", "title": "", "desc": "", "weight": 20, "depends_on": [], "basis": "", "levels": { "L1": "", "L2": "", "L3": "", "L4": "" } } ]${opts.sample ? ',\n  "stages": [ { "id": "q1", "type": "structuring", "question": "", "reveal": "", "expected": "", "calc": [ { "label": "", "expr": "", "value": 0 } ] } ]' : ''} }`;
  const { parsed: p, model: used } = await askJson(prompt, model, 'Generate · 出题', name);
  const e = p.env || {};
  const envType: WorkEnvType = opts.env || (['doc', 'code', 'sheet', 'design'].includes(e.type) ? e.type : 'doc');   // open / plugin 原样保留，参与页据此只给开放模式
  const env: WorkEnv = { type: envType };
  if (envType === 'code') { env.language = s(e.language, 20) || 'js'; env.starter = s(e.starter, 4000); env.tests = (Array.isArray(e.tests) ? e.tests : []).slice(0, 6).map((t: any) => ({ name: s(t.name, 60), code: s(t.code, 600) })).filter((t: any) => t.code); }
  if (envType === 'sheet') env.csv = s(e.csv, 8000);
  if (envType === 'design') { env.params = (Array.isArray(e.params) ? e.params : []).slice(0, 10).map((x: any) => ({ name: s(x.name, 40), unit: s(x.unit, 12), hint: s(x.hint, 120) })).filter((x: any) => x.name); env.sketch_hint = s(e.sketch_hint, 300); }
  const task: WorkTask = {
    env,
    problem: { statement: s(p.problem?.statement, 400), why_now: s(p.problem?.why_now, 400), evidence: (Array.isArray(p.problem?.evidence) ? p.problem.evidence : []).slice(0, 6).map((e: any) => ({ text: s(e.text, 300), source: s(e.source, 80) })) },
    task: { title: s(p.task?.title, 40) || `${name} · 真活`, role: need ? (s(p.task?.role, 40) || s(role, 40)) : role, brief: s(p.task?.brief, 2000), deliverables: (Array.isArray(p.task?.deliverables) ? p.task.deliverables : []).slice(0, 4).map((d: any, i: number) => ({ id: d.id || `d${i + 1}`, title: s(d.title, 60), format: s(d.format, 60), module: resolveModule(s(d.format, 60), d.module) })), time_minutes: Math.min(120, Math.max(30, Number(p.task?.time_minutes) || 60)), rules: (Array.isArray(p.task?.rules) ? p.task.rules : []).slice(0, 6).map((r: any) => s(r, 120)) },
    materials: (Array.isArray(p.materials) ? p.materials : []).slice(0, 6).map((m: any, i: number) => ({ id: m.id || `m${i + 1}`, title: s(m.title, 60), kind: (['doc', 'table', 'note', 'email', 'data'].includes(m.kind) ? m.kind : 'doc'), content: s(m.content, 6000), source: (['db', 'generated', 'mixed'].includes(m.source) ? m.source : 'generated'), basis: s(m.basis, 200) })),
    rubric: (Array.isArray(p.rubric) ? p.rubric : []).slice(0, 10).map((r: any, i: number) => ({ id: r.id || `r${i + 1}`, title: s(r.title, 60), desc: s(r.desc, 300), weight: Math.max(1, Number(r.weight) || 10), depends_on: Array.isArray(r.depends_on) ? r.depends_on.map(String) : [], basis: s(r.basis, 200), levels: { L1: s(r.levels?.L1, 160), L2: s(r.levels?.L2, 160), L3: s(r.levels?.L3, 160), L4: s(r.levels?.L4, 160) } })),
  };
  // 权重归一到 100；依赖只认存在的条目
  const ids = new Set(task.rubric.map(r => r.id));
  const sum = task.rubric.reduce((a, r) => a + r.weight, 0) || 1;
  for (const r of task.rubric) { r.weight = Math.round(r.weight / sum * 100); r.depends_on = r.depends_on.filter(d => ids.has(d) && d !== r.id); }
  if (!task.task.rules.some(r => /AI/.test(r))) task.task.rules.unshift('可以随便用 AI，不算作弊；评的是你怎么用、什么是你自己判断的');
  // 案例推进式：步骤归一，测算在代码里真算一遍（模型给的「答案」和「数据」对不上是常事）
  if (opts.sample) {
    const { stages, fixed, failed } = verifyCalcs(normalizeStages(p.stages));
    if (stages.length) task.task.stages = stages;
    if (fixed || failed) console.warn(`[work] 测算核对：改了 ${fixed} 个值，${failed} 个算式算不出`);
  }
  return { task, model: used };
}


/** 取材清单：这道题用了库里的什么（给出题人看，证明题是从数据底座里长出来的） */
export function sourcesOf(ctx: WorkContext) {
  const c = ctx.company || {};
  const fields = ['introduction', 'business_profile', 'product_area', 'company_specialties', 'tech_advantage', 'research_area', 'growth_signals', 'industry_position', 'company_case', 'public_sentiment', 'candidate_reputation', 'campus_overview'].filter(k => c[k]);
  const label: Record<string, string> = { introduction: '简介', business_profile: '业务', product_area: '产品领域', company_specialties: '专长', tech_advantage: '技术优势', research_area: '研发方向', growth_signals: '增长信号', industry_position: '行业位置', company_case: '合作案例', public_sentiment: '舆情风险', candidate_reputation: '求职者口碑', campus_overview: '校招概况' };
  return {
    company: ctx.company ? { id: ctx.company.id, name: ctx.company.name, industry: ctx.company.industry, fields: fields.map(k => label[k]) } : null,
    products: ctx.products.map(p => p.name).slice(0, 8),
    news: ctx.news.length, executives: ctx.executives.length,
    jobs: ctx.jobs.map(j => j.title_cn || j.name).filter(Boolean),
    occupation: ctx.occupation ? ctx.occupation.name : null, typical_tasks: ctx.typical_tasks.map(t => t.name),
    standards: ctx.standards.map(x => (x.code ? x.code + ' ' : '') + x.title),
    notes: ctx.notes,
    // 深度画像用到了哪些专题（投资机构：基金 / 策略 / 被投 / 合伙人 / 招聘……）
    deep: (ctx.deep || []).map(d => d.label),
    sample: (ctx as any).sample ? { id: (ctx as any).sample.id, title: (ctx as any).sample.title } : null,
    related: (ctx.related || []).map(r => `${r.name}（共同高管 ${r.shared.length} 位 · 动态 ${r.news.length} 条 · 深度画像 ${r.deep.length} 个专题）`),
  };
}

/** 出题人提意见 → 按意见修订（保留没提到的部分；rubric 权重重新归一）。返回新题 + 一句改了什么 */
export async function reviseTask(task: WorkTask, ctx: WorkContext, feedback: string, opts: { model?: string } = {}): Promise<{ task: WorkTask; model: string; changelog: string }> {
  const model = opts.model || WORK_MODEL;
  const prompt = `你是「真活台」的出题人。业务负责人看了下面这道真活，提了意见。请**按意见修订**，没提到的部分原样保留（不要顺手改风格、不要重写材料正文），意见涉及的部分改到位；仍然只用材料，材料里没有的数字标「示例数据」。
## 业务负责人的意见
${feedback.slice(0, 1200)}
## 材料（出题依据）
${renderContext(ctx).slice(0, 12000)}
## 现在的题（完整 JSON）
${JSON.stringify({ env: task.env, problem: task.problem, task: task.task, materials: task.materials, rubric: task.rubric }).slice(0, 40000)}
## 要求
返回修订后的完整 JSON，结构和现在一模一样（env / problem / task / materials / rubric），外加 "changelog"：两三句话说明改了哪里、为什么（口语）。rubric 的 id 尽量不变，新增的用 r9、r10…；weight 加起来 100。`;
  const { parsed: p, model: used } = await askJson(prompt, model, 'Revise · 按意见修订', ctx.company?.name);
  const e = p.env || task.env; const envType: WorkEnvType = ['doc', 'code', 'sheet', 'design'].includes(e.type) ? e.type : task.env.type;
  const env: WorkEnv = { ...task.env, type: envType };
  if (envType === 'code') { env.language = s(e.language, 20) || task.env.language || 'js'; env.starter = s(e.starter, 4000) || task.env.starter; env.tests = (Array.isArray(e.tests) ? e.tests : task.env.tests || []).slice(0, 6).map((t: any) => ({ name: s(t.name, 60), code: s(t.code, 600) })).filter((t: any) => t.code); }
  if (envType === 'sheet') env.csv = s(e.csv, 8000) || task.env.csv;
  if (envType === 'design') { env.params = (Array.isArray(e.params) ? e.params : task.env.params || []).slice(0, 10).map((x: any) => ({ name: s(x.name, 40), unit: s(x.unit, 12), hint: s(x.hint, 120) })).filter((x: any) => x.name); env.sketch_hint = s(e.sketch_hint, 300) || task.env.sketch_hint; }
  const next: WorkTask = {
    env,
    problem: { statement: s(p.problem?.statement, 400) || task.problem.statement, why_now: s(p.problem?.why_now, 400) || task.problem.why_now, evidence: (Array.isArray(p.problem?.evidence) ? p.problem.evidence : task.problem.evidence).slice(0, 6).map((x: any) => ({ text: s(x.text, 300), source: s(x.source, 80) })) },
    task: { title: s(p.task?.title, 40) || task.task.title, role: task.task.role, brief: s(p.task?.brief, 2000) || task.task.brief, deliverables: (Array.isArray(p.task?.deliverables) ? p.task.deliverables : task.task.deliverables).slice(0, 4).map((d: any, i: number) => ({ id: d.id || `d${i + 1}`, title: s(d.title, 60), format: s(d.format, 60), module: resolveModule(s(d.format, 60), d.module) })), time_minutes: Math.min(120, Math.max(30, Number(p.task?.time_minutes) || task.task.time_minutes)), rules: (Array.isArray(p.task?.rules) ? p.task.rules : task.task.rules).slice(0, 6).map((r: any) => s(r, 120)) },
    materials: (Array.isArray(p.materials) && p.materials.length ? p.materials : task.materials).slice(0, 6).map((m: any, i: number) => ({ id: m.id || `m${i + 1}`, title: s(m.title, 60), kind: (['doc', 'table', 'note', 'email', 'data'].includes(m.kind) ? m.kind : 'doc'), content: s(m.content, 6000), source: (['db', 'generated', 'mixed'].includes(m.source) ? m.source : 'generated'), basis: s(m.basis, 200) })),
    rubric: (Array.isArray(p.rubric) && p.rubric.length ? p.rubric : task.rubric).slice(0, 10).map((r: any, i: number) => ({ id: r.id || `r${i + 1}`, title: s(r.title, 60), desc: s(r.desc, 300), weight: Math.max(1, Number(r.weight) || 10), depends_on: Array.isArray(r.depends_on) ? r.depends_on.map(String) : [], basis: s(r.basis, 200), levels: { L1: s(r.levels?.L1, 160), L2: s(r.levels?.L2, 160), L3: s(r.levels?.L3, 160), L4: s(r.levels?.L4, 160) } })),
  };
  const ids = new Set(next.rubric.map(r => r.id)); const sum = next.rubric.reduce((a, r) => a + r.weight, 0) || 1;
  for (const r of next.rubric) { r.weight = Math.round(r.weight / sum * 100); r.depends_on = r.depends_on.filter(d => ids.has(d) && d !== r.id); }
  return { task: next, model: used, changelog: s(p.changelog, 400) || '按意见做了修订' };
}

/** 企业 / 岗位选择用：库里搜企业（名字 / 简称 / 英文名），带行业、城市、画像完整度、在招岗位数 */
export async function searchCompanies(q: string, limit = 8) {
  const qq = q.trim(); if (!qq) return [];
  const { data } = await db.from('companies').select('id, name, brief_name, industry, city, completeness_score, introduction').eq('if_delete', false).or(`name.ilike.%${qq}%,brief_name.ilike.%${qq}%,name_en.ilike.%${qq}%`).order('completeness_score', { ascending: false, nullsFirst: false }).limit(limit);
  const rows = data || []; if (!rows.length) return [];
  const { data: js } = await db.from('jobs').select('company_id').in('company_id', rows.map(r => r.id)).eq('if_delete', false).limit(5000);
  const cnt = new Map<number, number>(); for (const j of js || []) cnt.set(j.company_id, (cnt.get(j.company_id) || 0) + 1);
  return rows.map(r => ({ id: r.id, name: r.name, brief_name: r.brief_name, industry: r.industry, city: r.city, completeness: r.completeness_score, has_profile: !!r.introduction, jobs: cnt.get(r.id) || 0 }));
}
/** 这家企业在招的岗位（去重的名字 + 职能），给岗位选择用 */
export async function companyJobs(companyId: number, limit = 40) {
  const { data } = await db.from('jobs').select('name, title_cn, job_function, city, kind').eq('company_id', companyId).eq('if_delete', false).limit(300);
  const seen = new Map<string, any>();
  for (const j of data || []) { const t = (j.title_cn || j.name || '').trim(); if (!t || seen.has(t)) continue; seen.set(t, { title: t, job_function: j.job_function, city: regionName('city', j.city), kind: j.kind }); }
  return [...seen.values()].slice(0, limit);
}

/** 岗位边输边搜：这家企业在招的（可选）+ 职业库里名字 / 别名命中的 */
export async function suggestRoles(q: string, companyId?: number | null) {
  const qq = q.trim(); if (!qq) return { jobs: [], occupations: [] };
  const [jobs, occ] = await Promise.all([
    companyId ? companyJobs(companyId, 200).then(list => list.filter(j => j.title.toLowerCase().includes(qq.toLowerCase())).slice(0, 8)) : Promise.resolve([]),
    db.from('occupations').select('id, name, career_category, intro').eq('if_delete', false).or(`name.ilike.%${qq}%,name_lang_cn.ilike.%${qq}%`).limit(6).then(r => (r.data || []).map(o => ({ id: o.id, name: o.name, category: o.career_category, intro: (o.intro || '').slice(0, 60) }))),
  ]);
  return { jobs, occupations: occ };
}

/** 第三步：最强模型先做一遍当基线（用和候选人一样的材料），再用同一套 rubric 评它 */
export async function runBaseline(task: WorkTask, opts: { model?: string; institution?: string } = {}): Promise<{ model: string; answer: string; result: any }> {
  // 做题走共用的 solve.ts（学院考学员也走它）；这里只多一层模型兜底
  const model = opts.model || WORK_MODEL;
  const { solveWorkTask } = await import('@/lib/work/solve');
  let answer = '', used = model;
  for (const m of [model, 'claude-sonnet-5-5', 'qwen-plus']) {
    try { const r = await solveWorkTask(task, m, { task_name: 'Baseline · AI 先做一遍', institution: opts.institution }); answer = r.answer; used = m; if (answer) break; }
    catch (e) { console.warn(`[work] 基线 ${m} 失败：${String((e as any)?.message).slice(0, 120)}`); }
  }
  if (!answer) throw new Error('AI 基线没有生成');
  const result = await gradeResult(task, answer, { institution: opts.institution, who: 'AI 基线' });
  return { model: used, answer, result };
}
