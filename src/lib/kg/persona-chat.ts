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
import { orIlike } from '@/lib/pg-filter';
import { SALARY_YEAR_LABELS, SALARY_YEARS, SALARY_COUNTRIES, SALARY_CN_REGIONS, CAREER_CATEGORY_LABELS } from '@/lib/occupation-fields';

export interface Persona { name: string; role: string; avatar?: string | null; tagline?: string | null; years?: string; workplace?: string; personality?: string; voice?: string; story?: string }
export interface ChatSource { id: string; type: 'job' | 'standard' | 'task' | 'data' | 'company'; title: string; url?: string | null }
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
  const src = (type: ChatSource['type'], title: string, url?: string | null) => { const id = `${{ job: 'J', standard: 'S', task: 'T', data: 'D', company: 'C' }[type]}${sources.filter(s => s.type === type).length + 1}`; sources.push({ id, type, title, url }); return id; };
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
  const dOcc = src('data', `平方职业库 · ${occ.name}`);
  L.push(`【职业】${occ.name}${occ.name_lang_en ? `（${occ.name_lang_en}）` : ''}，${CAREER_CATEGORY_LABELS[occ.career_category] || ''}。也叫：${(occ.aliases || []).slice(0, 6).join('、')} [${dOcc}]`);
  if (occ.intro) L.push(`简介：${cut(occ.intro, 220)}`);
  if (occ.responsibility) L.push(`工作内容：${cut(occ.responsibility, 360)}`);
  if (occ.position_requirement) L.push(`职业要求：${cut(occ.position_requirement, 300)}`);
  if (occ.relevant_certificates) L.push(`相关证书：${cut(occ.relevant_certificates, 160)}`);
  if (occ.relevant_fos_ids?.length) L.push(`相关专业：${occ.relevant_fos_ids.join('、')}`);
  if (occ.relevant_celebrities) L.push(`行业代表人物：${occ.relevant_celebrities}`);

  const g = occ.career_map;
  if (g?.ladder?.length) {
    const dG = src('data', `平方职业库 · ${occ.name} 发展图谱`);
    L.push(`\n【发展】${g.summary || ''} [${dG}]`);
    L.push(`成长阶梯：${g.ladder.map((l: any) => `${l.title}（${l.years}${l.salary ? `，月薪 ${l.salary}` : ''}）：${cut(l.focus, 60)}`).join(' → ')}`);
    if (g.next_roles?.length) L.push(`再往上 / 往外：${g.next_roles.map((r: any) => `${r.type === 'promotion' ? '晋升' : '转型'}「${r.name}」${r.years ? `（${r.years}）` : ''}：${cut(r.how, 50)}`).join('；')}`);
    if (g.skills?.length) L.push(`技能树：入门 ${g.skills.filter((s: any) => s.level === 1).map((s: any) => s.name).join('、')}；核心 ${g.skills.filter((s: any) => s.level === 2).map((s: any) => s.name).join('、')}；进阶 ${g.skills.filter((s: any) => s.level === 3).map((s: any) => s.name).join('、')}`);
    if (g.entry_paths?.length) L.push(`入行路径：${g.entry_paths.map((e: any) => `${e.path}（${cut(e.detail, 50)}）`).join('；')}`);
  }

  const salRows = (sal.data || []).sort((a: any, b: any) => SALARY_YEARS.indexOf(a.year) - SALARY_YEARS.indexOf(b.year));
  if (salRows.length || occ.recent_year_monthly_salary || regions.data?.length) {
    const dS = src('data', `平方职业库 · ${occ.name} 薪资`);
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
      const id = src('task', `典型任务 · ${t.name}`);
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
    const dE = src('data', `平方知识图谱 · ${occ.name} 工作场所与工具设备`);
    L.push(`\n【在哪干、用什么】[${dE}]`);
    if (pl.length) L.push(`工作场所：${pl.join('、')}`);
    if (st.length) L.push(`工位 / 操作台：${st.join('、')}`);
    if (it.length) L.push(`常用工具设备：${it.slice(0, 24).map((l: any) => `${l.other.name}${l.frequency === 'daily' ? '（每天）' : ''}${l.proficiency ? `（要${l.proficiency}）` : ''}`).join('、')}`);
  }

  if (stds.data?.length) {
    L.push('\n【行业标准与操作规范】');
    for (const s of stds.data as any[]) {
      const id = src('standard', `${s.code || ''} ${s.title}`.trim(), s.official_url);
      L.push(`[${id}] ${s.code || ''}《${s.title}》${s.scope ? `：${cut(s.scope, 80)}` : ''}${(s.key_points || []).length ? ` 要点：${s.key_points.slice(0, 4).map((p: any) => cut(p.point, 40)).join('；')}` : ''}`);
    }
  }

  const jobs: any[] = openJobs.data || [];
  const dJ = src('data', `平方岗位库 · 在招「${occ.name}」岗位（实时）`);
  L.push(`\n【在招岗位】（实时）一共 ${openJobs.count || 0} 个在招 [${dJ}]`);
  if (jobs.length) {
    const byCo = new Map<string, number>(), byCity = new Map<string, number>();
    for (const j of jobs) { byCo.set(j.institute_or_company_name, (byCo.get(j.institute_or_company_name) || 0) + 1); const c = j.city || j.location; if (c) byCity.set(c, (byCity.get(c) || 0) + 1); }
    L.push(`招得多的公司：${Array.from(byCo).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, n]) => `${c}（${n}）`).join('、')}`);
    L.push(`主要城市：${Array.from(byCity).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, n]) => `${c}（${n}）`).join('、')}`);
    for (const j of jobs.slice(0, 8)) {
      const id = src('job', `${j.institute_or_company_name} · ${j.name}${j.city ? ` · ${j.city}` : ''}`, j.link || `/admin/db-job/${j.id}`);
      L.push(`[${id}] ${j.institute_or_company_name}「${j.name}」${j.city || j.location || ''}${j.internship_salary_min ? ` ${j.internship_salary_min}${j.internship_salary_max && j.internship_salary_max !== j.internship_salary_min ? `-${j.internship_salary_max}` : ''}` : ''}${j.official_publish_date ? `，${j.official_publish_date} 发布` : ''}`);
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
  const prompt = `你是「${persona.name}」，${persona.role}${persona.years ? `，${persona.years}` : ''}${persona.workplace ? `，在${persona.workplace}` : ''}。你是平台上「${occ.name}」这一行的数字职人，正在跟来了解这一行的人（多半是学生、想转行的人）面对面聊天。
${persona.personality ? `性格：${persona.personality}\n` : ''}${persona.voice ? `说话方式：${persona.voice}\n` : ''}${persona.story ? `你的入行故事：${persona.story}\n` : ''}${persona.tagline ? `你常说：${persona.tagline}\n` : ''}
怎么聊：
- 铁律：**绝对不编造**。你说的每一个事实——薪资、年限、时间点、流程步骤、操作参数、检查点、常见失误、公司、岗位、城市、标准、证书、人名——都必须来自下面「平方知识库」，并在那句话末尾标来源编号，如 [J2]、[S1]、[D3]、[T4]。
- 不许编个人经历和细节（「我第一次上手手抖」「我们店早上七点交班」「我在某某店干过」这类资料里没有的都不行）。角色感靠语气和视角，不靠编故事：用第一人称、口语，像带新人的老师傅那样讲资料里的内容（「我们这行新手最容易栽在……[T3]」「入门那一级主要就是……[D2]」）。
- 资料里没有的，直说「这个平方的资料里还没有，我不乱说」，可以建议对方去哪儿核实。宁可少说，不可错说。
- 不要像报告，不要说自己是 AI，不要用 markdown 标题。
- 问到在招岗位：说清有多少、哪些公司招得多、举一两个具体岗位（带编号）。问到规范 / 标准：讲清楚怎么做、为什么，有标准就引标准。问到一天怎么过：按时间讲，挑一两个真实的典型任务讲细节。
- 一次回答 80–220 字；对方要清单时可以分点。回答完别总问「还有什么问题」。
- 再给 3 个对方可能想接着问的问题（短，从对方视角，跟刚才的话题相关又往深一步；只问不答，问题里不要带任何具体数字、标准值或资料里没有的说法）。

——平方知识库（${occ.name}）——
${knowledge.text}
——资料完——

${history.slice(-10).map(m => `${m.role === 'user' ? '对方' : persona.name}：${m.content}`).join('\n')}
对方：${question}

返回 JSON：{ "reply": 你的回答（含来源编号）, "suggestions": [三个追问] }`;
  let r = await generateContent(prompt, model, { jsonMode: true });
  await logTokenUsage({ tool_name: 'occupation', task_name: 'Persona Chat', institution: occ.name, model_id: model, usageMetadata: r.usageMetadata, batch_id: Date.now() }).catch(() => {});
  let p = parseJsonLoose(r.text) || {};
  let reply = String(p.reply || r.text || '').trim().replace(/\[\s*([JSTDC]\d+)\s*\]/g, '[$1]');
  // 核查：逐句对照资料，没依据的打回重写一次；还有就删掉那几句（宁可少说，不可错说）
  let flagged = await unsupportedSentences(reply, knowledge.text, model, occ.name);
  if (flagged.length) {
    r = await generateContent(`${prompt}\n\n（你上一版回答里这些句子在资料里找不到依据，重写时去掉或改成资料里有的内容：${flagged.map(x => `「${x}」`).join('、')}）`, model, { jsonMode: true });
    p = parseJsonLoose(r.text) || p;
    reply = String(p.reply || reply).trim().replace(/\[\s*([JSTDC]\d+)\s*\]/g, '[$1]');
    flagged = await unsupportedSentences(reply, knowledge.text, model, occ.name);
    for (const f of flagged) reply = reply.replace(f, '');
    reply = reply.replace(/\s{2,}/g, ' ').trim() || '这个平方的资料里还没有，我不乱说。';
  }
  const cited = Array.from(new Set(reply.match(/\[([JSTDC]\d+)\]/g)?.map(x => x.slice(1, -1)) || []));
  return {
    reply,
    sources: knowledge.sources.filter(s => cited.includes(s.id)),
    suggestions: (Array.isArray(p.suggestions) ? p.suggestions : []).map(String).slice(0, 3),
  };
}

/** 开场白：职人主动打招呼 + 3 个起手问题（不调模型，秒开） */
export function opening(occ: any, persona: Persona, openJobs?: number) {
  const hello = `${persona.tagline ? `${persona.tagline.replace(/[。！!.]$/, '')}。` : ''}我是${persona.name}，${persona.role}${persona.years ? `，${persona.years}` : ''}。想了解${occ.name}这一行？薪资、怎么入行、每天干什么、现在哪儿在招${openJobs ? `（平方岗位库里眼下有 ${openJobs} 个在招）` : ''}，随便问。`;
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
  }
  if (!occ && by.occupationId) occ = (await supabaseAdmin.from('occupations').select('*').eq('id', by.occupationId).single()).data;
  if (!occ) throw new Error('这个空间还没对上职业库里的职业');
  const [persona, knowledge] = await Promise.all([resolvePersona(occ, space), buildKnowledge(occ, space?.id)]);
  return { space, occ, persona, knowledge };
}

export async function recordTurn(chatId: string | null, base: { space_id?: string | null; occupation_id: number; surface: string; visitor?: string | null }, turn: { question: string; reply: string; sources: ChatSource[] }) {
  const at = new Date().toISOString();
  const add = [{ role: 'user', content: turn.question, at }, { role: 'assistant', content: turn.reply, sources: turn.sources.map(s => s.id), at }];
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
