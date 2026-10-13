/**
 * 数字职人对话（迁移 027）：职人用第一人称跟人聊这一行——背景、发展、薪资、在招岗位、操作规范、行业标准、每天怎么过。
 * 知识来自平方的知识图谱（职业库 / 发展图谱 / 典型任务 / 工位设备 / 行业标准 / 岗位库 / 企业库），不是模型自己的印象：
 *   buildKnowledge   把一个职业的图谱打成一份带来源编号的资料（[D1] 数据、[J1] 岗位、[S1] 标准、[T1] 任务），岗位是实时的
 *   resolvePersona   百业空间里的职人（名字、形象、性格）优先；没有空间的职业用 occupations.persona（生成一次就固定）
 *   chatReply        角色化回答：经历可以讲得有画面感，但数字、岗位、标准号只能用资料里的，句末标来源；资料没有就说拿不准
 * 只读 /lab 的表。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import { findOccupation } from '@/lib/occupation-store';
import { linksOf } from '@/lib/entity-store';
import { ensureOccupationForSpace, ensureOccupationLater } from '@/lib/kg/ensure-occupation';
import { orIlike } from '@/lib/pg-filter';
import { matchCompanies } from '@/lib/lab-ecosystem';
import { SALARY_YEAR_LABELS, SALARY_YEARS, SALARY_COUNTRIES, SALARY_CN_REGIONS, CAREER_CATEGORY_LABELS } from '@/lib/occupation-fields';

export interface Persona { nickname?: string | null; name: string; role: string; avatar?: string | null; tagline?: string | null; years?: string; workplace?: string; personality?: string; voice?: string; story?: string }
/** ref：点来源时右侧资料面板要展示的实体（职业的某一节 / 岗位 / 企业 / 标准 / 典型任务） */
export interface SourceRef { kind: 'occupation' | 'job' | 'company' | 'standard' | 'task'; id: number; section?: 'intro' | 'graph' | 'salary' | 'context' | 'jobs' }
export interface ChatSource { id: string; type: 'job' | 'standard' | 'task' | 'data' | 'company' | 'web' | 'faq'; title: string; url?: string | null; ref?: SourceRef }
export interface ChatMessage { role: 'user' | 'assistant'; content: string }

const CHAT_MODEL = () => process.env.PERSONA_CHAT_MODEL || 'qwen-plus';
const cut = (s: any, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

/** 空间 → 职业（职业库名称 / 别名对上空间的岗位名或职人角色） */
export async function occupationOfSpace(space: any): Promise<any | null> {
  for (const n of [space?.jd_snapshot?.career?.profession, space?.jd_snapshot?.title, space?.profile?.role].filter(Boolean)) {
    const o = await findOccupation({ name: String(n).trim() });
    if (o) return o;
  }
  return null;
}

// ── 资料（按职业缓存 10 分钟；岗位是实时的，缓存短一点也够用） ──
const cache = new Map<string, { at: number; text: string; sources: ChatSource[] }>();

export async function buildKnowledge(occ: any, spaceId?: string | null): Promise<{ text: string; sources: ChatSource[] }> {
  const key = `${occ.id}:${spaceId || ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit;
  const sources: ChatSource[] = [];
  const src = (type: ChatSource['type'], title: string, url?: string | null, ref?: SourceRef) => { const id = `${({ job: 'J', standard: 'S', task: 'T', data: 'D', company: 'C', web: 'W', faq: 'F' } as Record<string, string>)[type]}${sources.filter(s => s.type === type).length + 1}`; sources.push({ id, type, title, url, ref }); return id; };
  const occRef = (section: SourceRef['section']): SourceRef => ({ kind: 'occupation', id: occ.id, section });
  const names = Array.from(new Set([occ.name, occ.name_lang_cn, ...(occ.aliases || [])].filter((n: any) => n && String(n).length >= 2))).slice(0, 10) as string[];
  const match = names.map(n => orIlike(['name'], n)).join(',');

  const [sal, regions, tasks, links, stds, openJobs, chapters] = await Promise.all([
    supabaseAdmin.from('occupation_salaries').select('year, salary').eq('occupation_id', occ.id).eq('if_delete', false),
    supabaseAdmin.from('occupation_region_salaries').select('scope, code, currency, monthly_local, monthly_cny').eq('occupation_id', occ.id).eq('if_delete', false),
    supabaseAdmin.from('typical_tasks').select('id, name, goal, summary, success_criteria, process, stakeholders, common_mistakes, difficulty, frequency, duration').eq('occupation_id', occ.id).eq('if_delete', false).order('difficulty').limit(10),
    linksOf('occupation', occ.id).catch(() => [] as any[]),
    supabaseAdmin.from('industry_standards').select('id, code, title, scope, key_points, official_url').overlaps('professions', names).limit(8),
    names.length ? supabaseAdmin.from('jobs').select('id, name, institute_or_company_name, company_id, city, location, link, official_publish_date, internship_salary_min, internship_salary_max, salary_unit', { count: 'exact' })
      .not('if_delete', 'is', true).eq('status', 'open').or(match).order('updated_at', { ascending: false }).limit(200) : Promise.resolve({ data: [], count: 0 } as any),
    spaceId ? supabaseAdmin.from('lab_chapters').select('seq, slot, title, kind').eq('task_id', spaceId).order('seq') : Promise.resolve({ data: [] } as any),
  ]);

  const L: string[] = [];
  const dOcc = src('data', `平方职业库 · ${occ.name}`, null, occRef('intro'));
  L.push(`【职业】${occ.name}${occ.name_lang_en ? `（${occ.name_lang_en}）` : ''}，${CAREER_CATEGORY_LABELS[occ.career_category] || ''}。也叫：${(occ.aliases || []).slice(0, 6).join('、')} [${dOcc}]`);
  if (occ.intro) L.push(`简介：${cut(occ.intro, 220)}`);
  if (occ.responsibility) L.push(`工作内容：${cut(occ.responsibility, 360)}`);
  if (occ.position_requirement) L.push(`职业要求：${cut(occ.position_requirement, 300)}`);
  if (occ.relevant_certificates) L.push(`相关证书：${cut(occ.relevant_certificates, 160)}`);
  if (occ.relevant_fos_ids?.length) L.push(`相关专业：${occ.relevant_fos_ids.join('、')}`);
  if (occ.relevant_celebrities) L.push(`行业代表人物：${occ.relevant_celebrities}`);

  const g = occ.career_map;
  if (g?.ladder?.length) {
    const dG = src('data', `平方职业库 · ${occ.name} 发展图谱`, null, occRef('graph'));
    L.push(`\n【发展】${g.summary || ''} [${dG}]`);
    L.push(`成长阶梯：${g.ladder.map((l: any) => `${l.title}（${l.years}${l.salary ? `，月薪 ${l.salary}` : ''}）：${cut(l.focus, 60)}`).join(' → ')}`);
    if (g.next_roles?.length) L.push(`再往上 / 往外：${g.next_roles.map((r: any) => `${r.type === 'promotion' ? '晋升' : '转型'}「${r.name}」${r.years ? `（${r.years}）` : ''}：${cut(r.how, 50)}`).join('；')}`);
    if (g.skills?.length) L.push(`技能树：入门 ${g.skills.filter((s: any) => s.level === 1).map((s: any) => s.name).join('、')}；核心 ${g.skills.filter((s: any) => s.level === 2).map((s: any) => s.name).join('、')}；进阶 ${g.skills.filter((s: any) => s.level === 3).map((s: any) => s.name).join('、')}`);
    if (g.entry_paths?.length) L.push(`入行路径：${g.entry_paths.map((e: any) => `${e.path}（${cut(e.detail, 50)}）`).join('；')}`);
  }

  const salRows = (sal.data || []).sort((a: any, b: any) => SALARY_YEARS.indexOf(a.year) - SALARY_YEARS.indexOf(b.year));
  if (salRows.length || occ.recent_year_monthly_salary || regions.data?.length) {
    const dS = src('data', `平方职业库 · ${occ.name} 薪资`, null, occRef('salary'));
    L.push(`\n【薪资】（税前月薪）[${dS}]`);
    if (occ.recent_year_monthly_salary) L.push(`全国平均 ¥${occ.recent_year_monthly_salary}`);
    if (salRows.length) L.push(`按年限：${salRows.map((s: any) => `${SALARY_YEAR_LABELS[s.year]} ¥${s.salary}`).join('，')}`);
    const cn = (regions.data || []).filter((r: any) => r.scope === 'cn_region').sort((a: any, b: any) => b.monthly_cny - a.monthly_cny);
    if (cn.length) L.push(`中国各地：${cn.map((r: any) => `${SALARY_CN_REGIONS.find(x => x.code === r.code)?.name || r.code} ¥${r.monthly_cny}`).join('，')}`);
    const ct = (regions.data || []).filter((r: any) => r.scope === 'country').sort((a: any, b: any) => b.monthly_cny - a.monthly_cny);
    if (ct.length) L.push(`各国（折人民币）：${ct.map((r: any) => `${SALARY_COUNTRIES.find(x => x.code === r.code)?.name || r.code} ¥${r.monthly_cny}${r.currency !== 'CNY' ? `（${r.currency} ${r.monthly_local}）` : ''}`).join('，')}`);
  }

  if (tasks.data?.length) {
    L.push('\n【典型任务】');
    for (const t of tasks.data as any[]) {
      const id = src('task', `典型任务 · ${t.name}`, null, { kind: 'task', id: t.id });
      L.push(`[${id}] ${t.name}（${['', '入门', '独立', '资深'][t.difficulty] || ''}${t.frequency ? `，${({ daily: '每天', weekly: '每周', occasional: '偶尔' } as any)[t.frequency]}` : ''}${t.duration ? `，约 ${t.duration}` : ''}）：目标 ${cut(t.goal, 60)}。`
        + `过程：${(t.process || []).slice(0, 6).map((p: any) => `${p.step}${p.checkpoint ? `（检查：${cut(p.checkpoint, 30)}）` : ''}`).join(' → ')}。`
        + `${(t.success_criteria || []).length ? `验收：${t.success_criteria.slice(0, 3).map((c: any) => `${c.name}${c.target ? ` ${c.target}` : ''}`).join('；')}。` : ''}`
        + `${(t.stakeholders || []).length ? `打交道的人：${t.stakeholders.map((s: any) => s.role).join('、')}。` : ''}${t.common_mistakes ? `新手常错：${cut(t.common_mistakes, 80)}` : ''}`);
    }
  }

  const st = links.filter((l: any) => l.dir === 'out' && l.other_type === 'station').map((l: any) => l.other.name);
  const pl = links.filter((l: any) => l.dir === 'out' && l.other_type === 'place').map((l: any) => l.other.name);
  const it = links.filter((l: any) => l.dir === 'out' && l.other_type === 'item');
  if (st.length || pl.length || it.length) {
    const dE = src('data', `平方知识图谱 · ${occ.name} 工作场所与工具设备`, null, occRef('context'));
    L.push(`\n【在哪干、用什么】[${dE}]`);
    if (pl.length) L.push(`工作场所：${pl.join('、')}`);
    if (st.length) L.push(`工位 / 操作台：${st.join('、')}`);
    if (it.length) L.push(`常用工具设备：${it.slice(0, 24).map((l: any) => `${l.other.name}${l.frequency === 'daily' ? '（每天）' : ''}${l.proficiency ? `（要${l.proficiency}）` : ''}`).join('、')}`);
  }

  if (stds.data?.length) {
    L.push('\n【行业标准与操作规范】');
    for (const s of stds.data as any[]) {
      const id = src('standard', `${s.code || ''} ${s.title}`.trim(), s.official_url, { kind: 'standard', id: s.id });
      L.push(`[${id}] ${s.code || ''}《${s.title}》${s.scope ? `：${cut(s.scope, 80)}` : ''}${(s.key_points || []).length ? ` 要点：${s.key_points.slice(0, 4).map((p: any) => cut(p.point, 40)).join('；')}` : ''}`);
    }
  }

  const jobs: any[] = openJobs.data || [];
  const dJ = src('data', `平方岗位库 · 在招「${occ.name}」岗位（实时）`, null, occRef('jobs'));
  L.push(`\n【在招岗位】（实时）一共 ${openJobs.count || 0} 个在招 [${dJ}]`);
  if (jobs.length) {
    const byCo = new Map<string, { n: number; id: number | null }>(), byCity = new Map<string, number>();
    for (const j of jobs) { const e = byCo.get(j.institute_or_company_name) || { n: 0, id: j.company_id || null }; e.n++; byCo.set(j.institute_or_company_name, e); const c = j.city || j.location; if (c) byCity.set(c, (byCity.get(c) || 0) + 1); }
    // 招得多的公司各给一个 [C] 编号：聊天里点公司名能看企业资料
    L.push(`招得多的公司：${Array.from(byCo).sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([c, e]) => `${c}（${e.n}）${e.id ? `[${src('company', c, null, { kind: 'company', id: e.id })}]` : ''}`).join('、')}`);
    L.push(`主要城市：${Array.from(byCity).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, n]) => `${c}（${n}）`).join('、')}`);
    for (const j of jobs.slice(0, 8)) {
      const id = src('job', `${j.institute_or_company_name} · ${j.name}${j.city ? ` · ${j.city}` : ''}`, j.link || null, { kind: 'job', id: j.id });
      L.push(`[${id}] ${j.institute_or_company_name}「${j.name}」${j.city || j.location || ''}${j.internship_salary_min ? ` ${j.internship_salary_min}${j.internship_salary_max && j.internship_salary_max !== j.internship_salary_min ? `-${j.internship_salary_max}` : ''}` : ''}${j.official_publish_date ? `，${j.official_publish_date} 发布` : ''}`);
    }
  }

  // 平方问答库：问答日志里质检合格、人工改过的（迁移 029）
  const { data: faqs } = await supabaseAdmin.from('occupation_faqs').select('id, question, answer').eq('occupation_id', occ.id).eq('status', 'ok').eq('if_delete', false).limit(30);
  if (faqs?.length) {
    L.push('\n【平方问答库（已审核）】');
    for (const f of faqs) { const id = src('faq', `平方问答库 · ${f.question}`); L.push(`[${id}] 问：${f.question} 答：${cut(f.answer, 260)}`); }
  }

  // 行当的上下游：只用「我的行当」算好缓存的环节（不在聊天里现调大模型），环节下面挂的公司全部来自平方企业库
  if (spaceId) {
    const { data: sp } = await supabaseAdmin.from('skill_tasks').select('profile').eq('id', spaceId).maybeSingle();
    const chain = sp?.profile?.ecosystem?.chain;
    if (chain?.upstream?.length || chain?.downstream?.length) {
      const rows: string[] = [];
      for (const [side, nodes] of [['上游', chain.upstream || []], ['下游', chain.downstream || []]] as const) {
        for (const n of (nodes as any[]).slice(0, 4)) {
          const firms = await matchCompanies(n.keywords || [], 3).catch(() => [] as any[]);
          rows.push(`${side} · ${n.stage}（${cut(n.what, 40)}）${firms.length ? `：${firms.map((c: any) => `${c.name}[${src('company', c.name, null, { kind: 'company', id: c.id })}]`).join('、')}` : '：平方企业库里暂未匹配到公司'}`);
        }
      }
      L.push(`\n【我的行当 · 上下游】（环节划分是平方的产业链分析，公司来自平方企业库）\n${rows.join('\n')}`);
    }
  }
  if (chapters.data?.length) L.push(`\n【我的一天】${(chapters.data as any[]).map(c => `${c.slot || ''} ${c.title}${c.kind === 'incident' ? '（突发）' : ''}`.trim()).join(' → ')}`);

  const out = { text: L.join('\n'), sources, at: Date.now() };
  cache.set(key, out);
  return out;
}

/** 人设：百业空间的职人优先；没有空间的职业生成一次存进 occupations.persona */
export async function resolvePersona(occ: any, space?: any): Promise<Persona> {
  if (space?.profile) {
    const p = space.profile;
    const { data: self } = await supabaseAdmin.from('lab_cast').select('note, look').eq('task_id', space.id).eq('is_self', true).maybeSingle();
    return { name: p.name || p.codename || '我', role: p.role || space.jd_snapshot?.title || occ?.name || '', avatar: p.avatar || null, tagline: p.tagline || null, personality: self?.note || undefined, workplace: space.jd_snapshot?.company || undefined };
  }
  if (occ?.persona?.name) return occ.persona;
  const prompt = `为职业知识产品里的「${occ.name}」设计一个数字职人（虚构的资深从业者，用第一人称陪人聊这一行）。要像真人：中国人名、年资、在哪类单位干、性格、说话方式（口头禅、爱用的行话）、一段让人记住的入行故事（2 句）。
返回 JSON：{ "name": 名字, "role": 头衔（如「三甲医院急诊科主管护师」）, "years": 年资（如「干了 9 年」）, "workplace": 在哪类单位, "personality": 性格（一句）, "voice": 说话方式（一句，含口头禅）, "story": 入行故事, "tagline": 一句自我介绍 }`;
  const r = await generateContent(prompt, CHAT_MODEL(), { jsonMode: true });
  const p = parseJsonLoose(r.text) || {};
  const persona: Persona = { name: String(p.name || '老周'), role: String(p.role || occ.name), years: p.years, workplace: p.workplace, personality: p.personality, voice: p.voice, story: p.story, tagline: p.tagline };
  await supabaseAdmin.from('occupations').update({ persona }).eq('id', occ.id);
  return persona;
}

/** 回答一轮：返回角色化的回复、引用到的来源、2-3 个追问建议 */
export async function chatReply(args: { occ: any; persona: Persona; knowledge: { text: string; sources: ChatSource[] }; history: ChatMessage[]; question: string; model?: string }) {
  const { occ, persona, knowledge, history, question } = args;
  const model = args.model || CHAT_MODEL();
  const build = (kb: string) => `${persona.nickname ? `对方给你起了个名字叫「${persona.nickname}」（你原来的代号是 ${persona.name}），聊天里就用「${persona.nickname}」自称，带着被起名字的亲近感。\n` : ''}你是「${persona.nickname || persona.name}」，${persona.role}${persona.years ? `，${persona.years}` : ''}${persona.workplace ? `，在${persona.workplace}` : ''}。你是平台上「${occ.name}」这一行的数字职人，正在跟来了解这一行的人（多半是学生、想转行的人）面对面聊天。
${persona.personality ? `性格：${persona.personality}\n` : ''}${persona.voice ? `说话方式：${persona.voice}\n` : ''}${persona.story ? `你的入行故事：${persona.story}\n` : ''}${persona.tagline ? `你常说：${persona.tagline}\n` : ''}
怎么聊：
- 铁律：**绝对不编造**。你说的每一个事实——薪资、年限、时间点、流程步骤、操作参数、检查点、常见失误、公司、岗位、城市、标准、证书、人名——都必须来自下面「平方知识库」，并在那句话末尾标来源编号，如 [J2]、[S1]、[D3]、[T4]。
- 不许编个人经历和细节（「我第一次上手手抖」「我们店早上七点交班」「我在某某店干过」这类资料里没有的都不行）。角色感靠语气和视角，不靠编故事：用第一人称、口语，像带新人的老师傅那样讲资料里的内容（「我们这行新手最容易栽在……[T3]」「入门那一级主要就是……[D2]」）。
- 资料里没有的：如果资料末尾有【互联网检索】，可以用它补充，但必须说清是网上查的（「网上的说法是……」「据网上资料……」），句末标 [W1] 这样的编号，并提醒对方注意甄别；绝不能把网上的内容说成平方的数据。
  行业前景、趋势、会不会被 AI / 机器取代、政策、行情、和别的职业比较这类**判断性问题**，资料里没有直接依据时也一样：不许自己推一个结论出来，必须去查。
  如果资料里没有、也没有【互联网检索】，就在 JSON 的 "search" 字段写出需要上网查的那个问题（简短，面向中国的信息源），先在 reply 里说「这个平方的资料里还没有，我去网上查查」；资料够用时 search 填 null。宁可少说，不可错说。
- 不要像报告，不要说自己是 AI，不要用 markdown 标题。
- 问到在招岗位：说清有多少、哪些公司招得多、举一两个具体岗位（带编号）。问到规范 / 标准：讲清楚怎么做、为什么，有标准就引标准。问到一天怎么过：按时间讲，挑一两个真实的典型任务讲细节。
- 一次回答 80–220 字；对方要清单时可以分点。回答完别总问「还有什么问题」。
- 再给 3 个对方可能想接着问的问题（短，从对方视角，跟刚才的话题相关又往深一步；只问不答，问题里不要带任何具体数字、标准值或资料里没有的说法）。

——平方知识库（${occ.name}）——
${kb}
——资料完——

${history.slice(-10).map(m => `${m.role === 'user' ? '对方' : persona.nickname || persona.name}：${m.content}`).join('\n')}
对方：${question}

返回 JSON：{ "reply": 你的回答（含来源编号）, "suggestions": [三个追问], "search": 需要上网查的问题或 null }`;
  let web: { text: string; sources: ChatSource[] } | null = null;
  let kb = knowledge.text;
  const prompt = build(kb);
  let r = await generateContent(prompt, model, { jsonMode: true });
  await logTokenUsage({ tool_name: 'occupation', task_name: 'Persona Chat', institution: occ.name, model_id: model, usageMetadata: r.usageMetadata, batch_id: Date.now() }).catch(() => {});
  let p = parseJsonLoose(r.text) || {};
  // 平方资料里没有：上网查一次（国内检索，便宜），带 [W] 编号重答；网上的内容要说明出处、提醒甄别
  // 判断性问题（前景 / 趋势 / 会不会被取代 / 政策 / 行情 / 值不值……）平方资料里没有直接依据，不靠模型自觉：一律去网上查
  const JUDGE = /前景|趋势|取代|替代|未来|会不会|政策|行情|值不值|值得|饱和|裁员|内卷|哪个更|好不好|转行|稳定吗|发展空间|过时|淘汰|AI.*(冲击|影响)/;
  const need = typeof p.search === 'string' && p.search.trim() && p.search !== 'null' ? p.search.trim() : JUDGE.test(question) ? question : '';
  if (need) {
    web = await webLookup(need, occ.name).catch(() => null);
    if (web?.sources.length) {
      kb = `${knowledge.text}\n\n【互联网检索】（未经平方核实，用的时候要说明来自网上、提醒对方甄别）\n${web.text}`;
      r = await generateContent(build(kb), model, { jsonMode: true });
      p = parseJsonLoose(r.text) || p;
    }
  }
  const tidy = (x: string) => x.trim().replace(/\[\s*([JSTDCWF]\d+)\s*\]/g, '[$1]').replace(/[（(]\s*([JSTDCWF]\d+)\s*[)）]\s*(\[\1\])/g, '$2');
  let reply = tidy(String(p.reply || r.text || ''));
  // 核查：逐句对照资料，没依据的打回重写一次；还有就删掉那几句（宁可少说，不可错说）
  // 职人自己的身份（名字、对方起的昵称、代号、头衔、口头禅）也算有依据，不然「我叫小拿铁」会被当成编造删掉
  const identity = `【我是谁】${persona.nickname ? `对方给我起的名字：${persona.nickname}；` : ''}代号 / 名字：${persona.name}；头衔：${persona.role}${persona.tagline ? `；口头禅：${persona.tagline}` : ''}${persona.years ? `；${persona.years}` : ''}${persona.workplace ? `；在${persona.workplace}` : ''}`;
  const checkBase = `${identity}\n${kb}`;
  let flagged = await unsupportedSentences(reply, checkBase, model, occ.name);
  if (flagged.length) {
    r = await generateContent(`${build(kb)}\n\n（你上一版回答里这些句子在资料里找不到依据，重写时去掉或改成资料里有的内容：${flagged.map(x => `「${x}」`).join('、')}）`, model, { jsonMode: true });
    p = parseJsonLoose(r.text) || p;
    reply = tidy(String(p.reply || reply));
    flagged = await unsupportedSentences(reply, checkBase, model, occ.name);
    for (const f of flagged) reply = reply.replace(f, '');
    reply = reply.replace(/\s{2,}/g, ' ').replace(/^[，。；、,.;\s]+/, '').replace(/([。！？])[，；、]+/g, '$1').trim() || '这个平方的资料里还没有，我不乱说。';
  }
  const cited = Array.from(new Set(reply.match(/\[([JSTDCWF]\d+)\]/g)?.map(x => x.slice(1, -1)) || []));
  // 用了网上的内容却没交代出处：开头补一句（网上的不能说成平方的）
  if (cited.some(c => c.startsWith('W')) && !/网上|网络|互联网|据报道|有报道|媒体/.test(reply)) reply = `这个平方的资料里没有，我在网上查了查——${reply}`;
  return {
    reply,
    sources: [...knowledge.sources, ...(web?.sources || [])].filter(s => cited.includes(s.id)),
    webSearched: !!web?.sources.length,
    gap: need || null,                       // 平方资料答不上、去网上查的问题：进飞轮当知识缺口
    webPoints: web?.text || null,
    suggestions: (Array.isArray(p.suggestions) ? p.suggestions : []).map(String).slice(0, 3),
  };
}

/** 开场白：职人主动打招呼 + 3 个起手问题（不调模型，秒开） */
export function opening(occ: any, persona: Persona, openJobs?: number) {
  const hello = `${persona.tagline ? `${persona.tagline.replace(/[。！!.]$/, '')}。` : ''}我是${persona.nickname ? `${persona.nickname}（${persona.name}）` : persona.name}，${persona.role}${persona.years ? `，${persona.years}` : ''}。想了解${occ.name}这一行？薪资、怎么入行、每天干什么、现在哪儿在招${openJobs ? `（平方岗位库里眼下有 ${openJobs} 个在招）` : ''}，随便问。`;
  return { hello, suggestions: [`${occ.name}一天都在忙什么？`, '刚入行能拿多少钱，几年能涨上去？', '现在哪些公司在招，要什么条件？'] };
}

/** 接口共用：按空间或职业找到职人和资料；GET 给开场白，POST 回答一轮并记进 persona_chats */
export async function loadChatContext(by: { spaceId?: string | null; occupationId?: number | null }) {
  let space: any = null, occ: any = null;
  if (by.spaceId) {
    const { data } = await supabaseAdmin.from('skill_tasks').select('id, title, jd_snapshot, profile, sim').eq('id', by.spaceId).single();
    space = data;
    if (!space) throw new Error('空间不存在');
    occ = await occupationOfSpace(space);
    // 兜底：还没对上职业库（老空间 / 建档没跑完）——当场建档，图谱 / 场所 / 任务后台补
    if (!occ) { occ = await ensureOccupationForSpace(space); if (occ) ensureOccupationLater(space.id); }
  }
  if (!occ && by.occupationId) occ = (await supabaseAdmin.from('occupations').select('*').eq('id', by.occupationId).single()).data;
  if (!occ) throw new Error('这个空间还没对上职业库里的职业');
  const [persona, knowledge] = await Promise.all([resolvePersona(occ, space), buildKnowledge(occ, space?.id)]);
  return { space, occ, persona, knowledge };
}

export async function recordTurn(chatId: string | null, base: { space_id?: string | null; occupation_id: number; surface: string; visitor?: string | null }, turn: { question: string; reply: string; sources: ChatSource[]; gap?: string | null; webPoints?: string | null }) {
  const at = new Date().toISOString();
  const add = [{ role: 'user', content: turn.question, at, gap: turn.gap || undefined }, { role: 'assistant', content: turn.reply, sources: turn.sources.map(s => s.id), web: turn.sources.filter(s => s.type === 'web').map(s => ({ title: s.title, url: s.url })), webPoints: turn.webPoints || undefined, at }];
  if (chatId) {
    const { data } = await supabaseAdmin.from('persona_chats').select('messages, turns').eq('id', chatId).maybeSingle();
    if (data) {
      await supabaseAdmin.from('persona_chats').update({ messages: [...(data.messages || []), ...add], turns: (data.turns || 0) + 1, updated_at: at }).eq('id', chatId);
      return chatId;
    }
  }
  const { data } = await supabaseAdmin.from('persona_chats').insert({ ...base, messages: add, turns: 1 }).select('id').single();
  return data?.id || null;
}

/** 问答日志（迁移 029）：每一问一行，给「职业问答日志」工作台质检、排任务、转译入库 */
export async function logQuestion(chatId: string | null, base: { space_id?: string | null; occupation_id: number; surface: string; visitor?: string | null }, turn: { question: string; reply: string; sources: ChatSource[]; gap?: string | null; webPoints?: string | null }) {
  await supabaseAdmin.from('kg_questions').insert({
    chat_id: chatId, ...base, question: turn.question, reply: turn.reply,
    sources: turn.sources.map(s => ({ id: s.id, type: s.type, title: s.title, url: s.url || null })),
    gap: turn.gap || null, web: turn.sources.filter(s => s.type === 'web').map(s => ({ id: s.id, title: s.title, url: s.url })), web_points: turn.webPoints || null,
  }).then(() => {}, () => {});
}

/** 核查：回答里哪些句子在资料里找不到依据（语气、建议、观点不算；具体事实必须有依据） */
async function unsupportedSentences(reply: string, knowledge: string, model: string, occName: string): Promise<string[]> {
  const prompt = `你是事实核查员。下面是一份资料和一段基于它的回答。逐句检查回答：凡是陈述具体事实的句子（时间、金额、年限、数量、流程步骤、操作参数、地点、公司、岗位、人名、经历细节），资料里必须能找到依据；
寒暄、语气、泛泛的建议和观点（如「多练」「别怕问」）不算。把找不到依据的句子原样摘出来（必须是回答里的原文片段）。
返回 JSON：{ "unsupported": [原文片段] }，都有依据就返回空数组。

——资料——
${knowledge}
——回答——
${reply}`;
  try {
    const r = await generateContent(prompt, model, { jsonMode: true });
    await logTokenUsage({ tool_name: 'occupation', task_name: 'Persona Chat · Fact Check', institution: occName, model_id: model, usageMetadata: r.usageMetadata, batch_id: Date.now() }).catch(() => {});
    return ((parseJsonLoose(r.text)?.unsupported || []) as any[]).map(String).filter(x => x.length >= 4 && reply.includes(x));
  } catch { return []; }
}

/**
 * 资料面板：点来源后右侧展示的实体内容。只给这次对话资料里引用过的实体（防止游客拿它翻整个库）。
 */
export async function entityDetail(occ: any, knowledge: { sources: ChatSource[] }, ref: SourceRef) {
  const allowed = knowledge.sources.some(s => s.ref && s.ref.kind === ref.kind && s.ref.id === ref.id && (ref.kind !== 'occupation' || s.ref.section === ref.section));
  if (!allowed) throw new Error('这条资料不在这段对话里');
  if (ref.kind === 'occupation') {
    const { data: o } = await supabaseAdmin.from('occupations').select('id, name, name_lang_en, aliases, career_category, career_mid_category, intro, responsibility, position_requirement, relevant_certificates, relevant_fos_ids, relevant_celebrities, recent_year_monthly_salary, career_map').eq('id', occ.id).single();
    if (ref.section === 'intro') return { kind: 'occupation', section: 'intro', occupation: { ...o, career_map: undefined } };
    if (ref.section === 'graph') return { kind: 'occupation', section: 'graph', occupation: { id: o!.id, name: o!.name }, career_map: o!.career_map };
    if (ref.section === 'salary') {
      const [sal, reg] = await Promise.all([
        supabaseAdmin.from('occupation_salaries').select('year, salary').eq('occupation_id', occ.id).eq('if_delete', false),
        supabaseAdmin.from('occupation_region_salaries').select('scope, code, currency, monthly_local, monthly_cny').eq('occupation_id', occ.id).eq('if_delete', false),
      ]);
      return { kind: 'occupation', section: 'salary', occupation: { id: o!.id, name: o!.name, recent_year_monthly_salary: o!.recent_year_monthly_salary }, salaries: sal.data || [], regions: reg.data || [] };
    }
    if (ref.section === 'context') {
      const links = (await linksOf('occupation', occ.id).catch(() => [])).filter((l: any) => l.dir === 'out' && ['place', 'station', 'item'].includes(l.other_type));
      return { kind: 'occupation', section: 'context', occupation: { id: o!.id, name: o!.name }, links: links.map((l: any) => ({ type: l.other_type, name: l.other.name, kind: l.other.kind, category: l.other.category, image_url: l.other.image_url, frequency: l.frequency, proficiency: l.proficiency, note: l.note })) };
    }
    const names = Array.from(new Set([o!.name, ...(o!.aliases || [])].filter((n: any) => n && String(n).length >= 2))).slice(0, 10) as string[];
    const { data: jobs, count } = await supabaseAdmin.from('jobs').select('id, name, institute_or_company_name, company_id, city, location, job_type, official_publish_date, internship_salary_min, internship_salary_max, salary_unit, salary_currency, link', { count: 'exact' })
      .not('if_delete', 'is', true).eq('status', 'open').or(names.map(n => orIlike(['name'], n)).join(',')).order('updated_at', { ascending: false }).limit(40);
    return { kind: 'occupation', section: 'jobs', occupation: { id: o!.id, name: o!.name }, total: count || 0, jobs: jobs || [] };
  }
  if (ref.kind === 'job') {
    const { data } = await supabaseAdmin.from('jobs').select('id, name, institute_or_company_name, company_id, city, location, job_type, status, department, responsibilities, overview, welfare, official_publish_date, application_end_date_str, internship_salary_min, internship_salary_max, salary_unit, salary_currency, link, company_ref:companies(id, name, logo_url, industry)').eq('id', ref.id).single();
    return { kind: 'job', job: data };
  }
  if (ref.kind === 'company') {
    const { data } = await supabaseAdmin.from('companies').select('id, name, name_en, registered_name, logo_url, industry, sub_industry, city, country, company_scale, info_founding_year, one_sentence, introduction, official_website, campus_url').eq('id', ref.id).single();
    const names = Array.from(new Set([occ.name, ...(occ.aliases || [])].filter((n: any) => n && String(n).length >= 2))).slice(0, 10) as string[];
    const { data: jobs, count } = await supabaseAdmin.from('jobs').select('id, name, city, location, job_type, link', { count: 'exact' }).eq('company_id', ref.id).not('if_delete', 'is', true).eq('status', 'open').or(names.map(n => orIlike(['name'], n)).join(',')).limit(20);
    return { kind: 'company', company: data, jobs: jobs || [], total: count || 0, occupation: { name: occ.name } };
  }
  if (ref.kind === 'standard') {
    const { data } = await supabaseAdmin.from('industry_standards').select('id, code, title, kind, status, issuer, scope, key_points, official_url').eq('id', ref.id).single();
    return { kind: 'standard', standard: data };
  }
  const { data: t } = await supabaseAdmin.from('typical_tasks').select('*').eq('id', ref.id).single();
  return { kind: 'task', task: t };
}

/**
 * 平方资料里没有的问题：千问联网查一次。出处只认搜索引擎真实返回的结果（按编号对回真实链接），
 * 模型自己写的链接一律不用（实测会编出 c_123456789.htm 这种假地址）；对不上真实结果的要点丢掉。
 */
async function webLookup(question: string, occName: string): Promise<{ text: string; sources: ChatSource[] }> {
  const prompt = `关于「${occName}」这一行，用联网检索回答这个问题：${question}
只用检索到的信息，3-5 条要点，每条一两句；每条注明它来自第几条搜索结果（搜索结果的编号）。优先中国的权威来源（政府 / 行业协会 / 主流招聘平台 / 正规媒体），自媒体、论坛的说法要注明。不要写链接。
只返回 JSON：{ "points": [ { "text": 要点, "ref": 搜索结果编号 } ] }`;
  const r = await generateContent(prompt, CHAT_MODEL(), { webSearch: true });
  await logTokenUsage({ tool_name: 'occupation', task_name: 'Persona Chat · Web Lookup', institution: occName, model_id: CHAT_MODEL(), usageMetadata: r.usageMetadata, batch_id: Date.now() }).catch(() => {});
  // 真实搜索结果：llm-client 把 search_info.search_results 附在「## 搜索来源」后面：[编号] 标题 链接
  const results = new Map<number, { title: string; url: string }>();
  for (const line of (r.text.split('## 搜索来源')[1] || '').split('\n')) {
    const m = line.match(/^\[(\d+)\]\s*(.*?)\s*(https?:\/\/\S+)\s*$/);
    if (m) results.set(Number(m[1]), { title: m[2] || '', url: m[3] });
  }
  const parsed = parseJsonLoose(r.text.split('## 搜索来源')[0]) || {};
  const pts = ((parsed.points || []) as any[]).map(x => ({ text: String(x?.text || '').trim(), hit: results.get(Number(x?.ref)) })).filter(x => x.text && x.hit).slice(0, 5);
  const sources: ChatSource[] = pts.map((x, i) => {
    let host = ''; try { host = new URL(x.hit!.url).hostname.replace(/^www\./, ''); } catch { /* */ }
    return { id: `W${i + 1}`, type: 'web', title: `${x.hit!.title || host}${host ? `（${host}）` : ''}`, url: x.hit!.url };
  });
  return { text: pts.map((x, i) => `[W${i + 1}] ${x.text}（来源：${x.hit!.title || ''}）`).join('\n'), sources };
}
