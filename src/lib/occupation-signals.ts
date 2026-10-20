/**
 * 市场新兴职业的信号（2026-10-20 用户口径，见记忆 emergent-occupations）：
 *   个体信号：岗位打相关职业时，职业库里找不到真正对得上的 → occupation_signals 记一条（模型认为该有的职业名）
 *   统计信号：同义叫法归并后看 岗位数 / 企业数 / 城市数 / 首次出现 / 近 30 天新增
 *     过门槛（默认 ≥20 个岗位、≥5 家企业）的进飞轮看板「职业缺口」，人点了才建（origin = market，照常生成画像）；
 *     能并进已有职业的给出「并进 X」（叫法记别名）；特别长尾、又归并不了的先不管——岗位不挂职业，信号照记。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose, searchJson } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import { regionName } from '@/lib/region-codes';

export const SIGNAL_MIN_JOBS = 20;
export const SIGNAL_MIN_COMPANIES = 5;

/** 粗归一：去空格 / 括号 / 届别级别词，同一叫法的不同写法先并到一起（同义归并在 aggregate 里再让模型做） */
export const signalKey = (name: string) => String(name || '').replace(/[（(【\[].*?[）)】\]]/g, '').replace(/\s+/g, '')
  .replace(/^(资深|高级|中级|初级|助理|实习)/, '').replace(/(实习生|管培生)$/, '').toLowerCase().slice(0, 40);

/** 不是具体职业的叫法：培养项目 / 身份 / 太泛 / 招聘公告式（10-20 第一轮归并时冒出「研发工程师」「管理培训生 → 市场营销专员」） */
const GENERIC = /^(研发工程师|工程师|研发|技术|技术岗|职能|职能岗|综合岗|综合管理岗?|通用岗|运营|销售|专员|助理|其他|实习生|管培生|管理培训生|培训生|储备干部|储备人才)$/;
const PROGRAM = /管培|培训生|储备干部|无具体|不明确|通用岗|实习生（通用|（通用）$|（多学科）$|实习生$/;
export const NOT_OCCUPATION = { test: (name: string) => { const n = String(name || '').replace(/\s+/g, ''); const core = n.replace(/[（(].*?[）)]/g, ''); return GENERIC.test(core) || PROGRAM.test(n); } };

export type SignalInput = { job_id: number; job_name?: string | null; company_id?: number | null; wanted_name: string; reason?: string | null; source?: 'tagging' | 'audit' };

/** 记个体信号（同一岗位同一叫法只记一次） */
export async function recordSignals(rows: SignalInput[]) {
  const clean = rows.filter(r => r.job_id && r.wanted_name && signalKey(r.wanted_name) && !NOT_OCCUPATION.test(r.wanted_name.replace(/\s+/g, ''))).map(r => ({
    job_id: r.job_id, job_name: r.job_name || null, company_id: r.company_id || null, wanted_name: r.wanted_name.trim().slice(0, 60),
    norm_key: signalKey(r.wanted_name), reason: r.reason ? String(r.reason).slice(0, 200) : null, source: r.source || 'tagging',
  }));
  if (!clean.length) return 0;
  const { error } = await supabaseAdmin.from('occupation_signals').upsert(clean, { onConflict: 'job_id,norm_key', ignoreDuplicates: true });
  if (error) { console.warn('[signals] 记信号失败', error.message); return 0; }
  return clean.length;
}

export type EmergentCandidate = {
  name: string;                    // 建议的职业名
  keys: string[];                  // 归进来的 norm_key
  names: string[];                 // 归进来的各种叫法
  jobs: number; companies: number; cities: number; first_seen: string; last_30d: number;
  titles: string[];                // 代表岗位
  merge_into?: { id: number; name: string } | null;   // 能并进的已有职业
  why?: string;
};

/**
 * 统计信号 → 新兴职业候选。先按 norm_key 聚合，再把岗位数够看的叫法交给模型做同义归并，
 * 最后逐个核对职业库：已有同一个职业的给「并进」，没有的过门槛才算候选。
 */
export async function aggregateSignals(opts: { model: string; minJobs?: number; minCompanies?: number; log?: (s: string) => void }) {
  const log = opts.log || (() => {});
  const minJobs = opts.minJobs ?? SIGNAL_MIN_JOBS, minCompanies = opts.minCompanies ?? SIGNAL_MIN_COMPANIES;
  const { data } = await selectAll(() => supabaseAdmin.from('occupation_signals').select('job_id, job_name, company_id, wanted_name, norm_key, created_at').eq('status', 'open').order('id'));
  const sig = (data as any[]).filter(s => !NOT_OCCUPATION.test(String(s.wanted_name).replace(/\s+/g, '')));
  if (!sig.length) return { candidates: [] as EmergentCandidate[], merges: [] as EmergentCandidate[], longTail: 0, signals: 0 };
  // 1. 按 norm_key 聚合
  const byKey = new Map<string, { names: Map<string, number>; jobs: Set<number>; companies: Set<number>; titles: Map<string, number>; first: string }>();
  for (const s of sig) {
    const g = byKey.get(s.norm_key) || { names: new Map(), jobs: new Set(), companies: new Set(), titles: new Map(), first: s.created_at };
    g.names.set(s.wanted_name, (g.names.get(s.wanted_name) || 0) + 1); g.jobs.add(s.job_id); if (s.company_id) g.companies.add(s.company_id);
    if (s.job_name) g.titles.set(s.job_name, (g.titles.get(s.job_name) || 0) + 1);
    if (s.created_at < g.first) g.first = s.created_at;
    byKey.set(s.norm_key, g);
  }
  // 2. 同义归并：只拿有一定量的叫法（≥3 个岗位）给模型，长尾的不送
  const big = [...byKey].filter(([, g]) => g.jobs.size >= 3).sort((a, b) => b[1].jobs.size - a[1].jobs.size).slice(0, 400);
  const { data: occ } = await selectAll(() => supabaseAdmin.from('occupations').select('id, name, aliases').not('if_delete', 'is', true).order('id'));
  const occByName = new Map((occ as any[]).map(o => [String(o.name).replace(/\s+/g, ''), o]));
  const occText = (occ as any[]).map(o => o.name + ((o.aliases || []).length ? `（${o.aliases.slice(0, 3).join('/')}）` : '')).join('、');
  const groups: { name: string; keys: string[]; same_as: string | null; why: string }[] = [];
  for (let i = 0; i < big.length; i += 120) {
    const chunk = big.slice(i, i + 120);
    const r = await generateContent(`职业库现有职业（括号里是别名）：
${occText}

下面是招聘岗位里反复出现、但被判定为「职业库里没有对得上的职业」的叫法（后面是岗位数）。请：
1. 把同一个职业的不同叫法归成一组（如「出海运营」「海外运营」「跨境运营」是一组），组名用行业通行的规范叫法；
2. 每组判断职业库里有没有「同一个职业」（只是换个叫法、工作内容基本一样）：有就在 same_as 填那个职业名（必须从上面清单原样照抄），没有填 null。只是同一大类的不算。
3. 不是具体职业的不要成组：太泛的（「工程师」「研发工程师」「职能岗」「运营」「其他」）；培养项目和身份（「管理培训生」「管培生」「实习生」「校招」「储备干部」「培训生」）；招聘公告式的叫法（「2027 届校园招聘」「通用岗」「无具体职能」）。
4. same_as 只填「同一个职业」：上一级的大类不算（「自动驾驶算法工程师」≠「人工智能工程技术人员」），沾边的别的职业更不算（「管理培训生」≠「市场营销专员」）。
只返回 JSON：{"groups":[{"name":"规范职业名","keys":["归进来的叫法，原样照抄"],"same_as":null,"why":"一句话"}]}

叫法：
${chunk.map(([k, g]) => `${[...g.names.keys()][0]}｜key=${k}（${g.jobs.size}）`).join('\n')}`, opts.model, { jsonMode: true, temperature: 0 });
    await logTokenUsage({ tool_name: 'occupation', task_name: 'Emergent Signals · Group', institution: '', model_id: r.model || opts.model, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
    for (const g of parseJsonLoose(r.text)?.groups || []) {
      const keys = (g.keys || []).map((x: any) => String(x)).map((x: string) => byKey.has(x) ? x : signalKey(x)).filter((k: string) => byKey.has(k));
      if (g.name && keys.length) groups.push({ name: String(g.name).trim(), keys: [...new Set(keys)] as string[], same_as: g.same_as ? String(g.same_as) : null, why: String(g.why || '') });
    }
  }
  // 3. 统计 + 核对职业库
  const grouped = new Set(groups.flatMap(g => g.keys));
  const jobIds = [...new Set(groups.flatMap(g => g.keys.flatMap(k => [...byKey.get(k)!.jobs])))];
  const jobInfo = new Map<number, { city: string | null; created_at: string }>();
  for (let i = 0; i < jobIds.length; i += 300) {
    const { data: js } = await supabaseAdmin.from('jobs').select('id, city, location, created_at').in('id', jobIds.slice(i, i + 300));
    for (const j of js || []) jobInfo.set(j.id, { city: regionName('city', j.city) || j.location || null, created_at: j.created_at });
  }
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const all: EmergentCandidate[] = groups.map(g => {
    const jobs = new Set<number>(), companies = new Set<number>(), titles = new Map<string, number>(), names = new Set<string>();
    let first = '';
    for (const k of g.keys) { const s = byKey.get(k)!; s.jobs.forEach(j => jobs.add(j)); s.companies.forEach(c => companies.add(c)); s.titles.forEach((n, t) => titles.set(t, (titles.get(t) || 0) + n)); s.names.forEach((_, n) => names.add(n)); if (!first || s.first < first) first = s.first; }
    const cities = new Set([...jobs].map(j => jobInfo.get(j)?.city).filter(Boolean));
    const last30 = [...jobs].filter(j => (jobInfo.get(j)?.created_at || '') >= since30).length;
    const same = g.same_as ? occByName.get(g.same_as.replace(/（.*$/, '').replace(/\s+/g, '')) : null;   // 只认职业库里真有的名字
    return { name: g.name, keys: g.keys, names: [...names].slice(0, 8), jobs: jobs.size, companies: companies.size, cities: cities.size, first_seen: first.slice(0, 10), last_30d: last30,
      titles: [...titles].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t), merge_into: same ? { id: same.id, name: same.name } : null, why: g.why };
  }).sort((a, b) => b.jobs - a.jobs);
  const merges = all.filter(c => c.merge_into && c.jobs >= 3);
  const candidates = all.filter(c => !c.merge_into && c.jobs >= minJobs && c.companies >= minCompanies);
  const longTail = [...byKey.keys()].filter(k => !grouped.has(k)).length + all.filter(c => !c.merge_into && (c.jobs < minJobs || c.companies < minCompanies)).length;
  log(`职业信号：${sig.length} 条（${byKey.size} 种叫法）→ 新兴职业候选 ${candidates.length} 个，可并进已有职业 ${merges.length} 组，长尾先不管 ${longTail} 种`);
  return { candidates, merges, longTail, signals: sig.length };
}

/**
 * 把一组信号落到某个职业上：岗位挂上这个职业（related_career_ids 追加），信号标 created / merged，叫法记进职业别名。
 * 建职业（origin = market）和「并进已有职业」都走这里。
 */
export async function settleSignals(keys: string[], occupation: { id: number; external_id: string; name: string; aliases?: string[] | null }, status: 'created' | 'merged') {
  const { data } = await selectAll(() => supabaseAdmin.from('occupation_signals').select('id, job_id, wanted_name').in('norm_key', keys).eq('status', 'open').order('id'));
  const sig = data as any[];
  const jobIds = [...new Set(sig.map(s => s.job_id))];
  let linked = 0;
  for (let i = 0; i < jobIds.length; i += 200) {
    const { data: js } = await supabaseAdmin.from('jobs').select('id, related_career_ids, human_locked_fields').in('id', jobIds.slice(i, i + 200));
    for (const j of js || []) {
      if ((j.human_locked_fields || []).includes('related_career_ids')) continue;
      const cur = String(j.related_career_ids || '').split('|').filter(Boolean);
      if (cur.includes(occupation.external_id)) continue;
      const { error } = await supabaseAdmin.from('jobs').update({ related_career_ids: [occupation.external_id, ...cur].slice(0, 4).join('|') }).eq('id', j.id);
      if (!error) linked++;
    }
  }
  const names = [...new Set(sig.map(s => s.wanted_name))].filter(n => n !== occupation.name);
  const aliases = [...new Set([...(occupation.aliases || []), ...names])].slice(0, 30);
  await supabaseAdmin.from('occupations').update({ aliases }).eq('id', occupation.id);
  for (let i = 0; i < sig.length; i += 300) await supabaseAdmin.from('occupation_signals').update({ status, occupation_id: occupation.id }).in('id', sig.slice(i, i + 300).map(s => s.id));
  return { signals: sig.length, linked };
}

/** 市场新兴职业的涌现数据：现在挂了多少岗位、多少家企业、几个城市、近 30 天新增（飞轮每次检测刷新） */
export async function refreshEmergence(log: (s: string) => void = () => {}) {
  const { data: occ } = await supabaseAdmin.from('occupations').select('id, external_id, name, emergence').eq('origin', 'market').not('if_delete', 'is', true);
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  let n = 0;
  for (const o of occ || []) {
    if (!o.external_id) continue;
    const { data: js } = await selectAll(() => supabaseAdmin.from('jobs').select('id, name, company_id, city, location, created_at, related_career_ids').not('if_delete', 'is', true).ilike('related_career_ids', `%${o.external_id}%`).order('id'));
    // ilike 是子串匹配：再按「|」拆开精确核对，免得 a_b 命中 a_b_c
    const jobs = (js as any[]).filter(j => String(j.related_career_ids || '').split('|').includes(o.external_id));
    const titles = new Map<string, number>(); for (const j of jobs) titles.set(j.name, (titles.get(j.name) || 0) + 1);
    const em = { ...(o.emergence || {}), jobs: jobs.length, companies: new Set(jobs.map(j => j.company_id).filter(Boolean)).size,
      cities: new Set(jobs.map(j => regionName('city', j.city) || j.location).filter(Boolean)).size, last_30d: jobs.filter(j => j.created_at >= since30).length,
      titles: [...titles].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t), updated_at: new Date().toISOString() };
    await supabaseAdmin.from('occupations').update({ emergence: em }).eq('id', o.id);
    n++;
  }
  if (n) log(`刷新市场新兴职业涌现数据 ${n} 个`);
}

export type OfficialCheck = { official: boolean; verified: boolean; framework: 'cn_dadian' | 'cn_new' | 'onet' | null; official_name: string | null; code: string | null; url: string | null; note: string };

/**
 * 建职业前先查官方身份（2026-10-20 用户定）：是不是《职业分类大典》、人社部发布的新职业或 O*NET 里已有的。
 * 只是建议、由人确认（看板上弹窗：按官方建 / 按市场新兴建）——10-20 复查 40 个时模型把上一级大类、技术员当成同一职业。
 * verified = 模型写的出处和这次真实搜索来源完全一致（千问写进 JSON 的网址常是编的）。
 */
export async function checkOfficial(name: string, aliases: string[], model: string, titles: string[] = []): Promise<OfficialCheck> {
  // 联网搜索每次结果不一样：第一种问法没查到，换「做这些事的岗位对应哪个官方职业」再问一次
  const first = await checkOfficialOnce(name, aliases, model, 'name');
  if (first.official) return first;
  const second = await checkOfficialOnce(name, aliases, model, 'duty', titles);
  return second.official ? second : first;
}

async function checkOfficialOnce(name: string, aliases: string[], model: string, mode: 'name' | 'duty', titles: string[] = []): Promise<OfficialCheck> {
  const ask = `联网查一下「${name}」${aliases.length ? `（也叫：${aliases.slice(0, 5).join('、')}）` : ''}这个职业是否已经被官方职业体系收录：
1. 《中华人民共和国职业分类大典》（2022 年版）；
2. 人力资源和社会保障部历年发布的新职业（含 2019 年以来各批次）；
3. 美国劳工部 O*NET / SOC 职业分类。
同一个职业换了叫法也算（如「药店店长」可能对应大典里的某个零售 / 连锁经营类职业）。但必须是做同样工作的那个职业：上一级的大类不算（如「集成电路工程技术人员」之于「数字后端工程师」），技术员和工程师不能互换（如「具身智能机器人应用技术员」不等于「具身智能算法工程师」）。
只返回 JSON：{"official": true/false, "framework": "cn_dadian|cn_new|onet|null", "official_name": "官方名称（原样）", "code": "职业编码（大典如 4-01-02-01，O*NET 如 41-1011.00）", "url": "你看到它的那条搜索结果网址", "note": "一句话依据"}
查不到确切出处的填 official=false，不要猜。`;
  const prompt = mode === 'name' ? ask : `招聘市场上有一类岗位叫「${name}」${aliases.length ? `（也叫${aliases.slice(0, 5).join('、')}）` : ''}${titles.length ? `，代表岗位如：${titles.slice(0, 5).join('、')}` : ''}。
联网查：做这类工作的人，在《中华人民共和国职业分类大典》（2022 年版）、人社部历年发布的新职业或 O*NET / SOC 里对应哪个职业？要工作内容基本一样的那个：上一级的大类不算，技术员和工程师不能互换。
${ask.slice(ask.indexOf('只返回 JSON'))}`;
  const r = await searchJson(prompt, model, { tool_name: 'occupation', task_name: 'Official Occupation Check', institution: name }, { lenient: true });
  const p = r.parsed || {};
  const name0 = String(p.official_name || '').trim();
  const code = typeof p.code === 'string' && /^(\d-\d{2}-\d{2}-\d{2}|\d{2}-\d{4}(\.\d{2})?)/.test(p.code.trim()) ? p.code.trim() : null;   // 大典 4-01-02-03 / O*NET 41-1011.00
  const fw = ['cn_dadian', 'cn_new', 'onet'].includes(p.framework) ? p.framework : null;
  // 出处：模型写的网址和这次真实搜索来源完全一致才算「已核实」；来源标题里出现官方名称的只当参考链接（标题对上名字不等于官方收录）
  const url0 = typeof p.url === 'string' && /^https?:/.test(p.url) ? p.url : null;
  const hit = url0 ? r.sources.find(s => s.url === url0) : undefined;
  const ref = hit || (name0 ? r.sources.find(s => s.title.includes(name0)) : undefined);
  // 判定：有官方名称 + 编码或真实出处才算官方；只有编码、没对上真实出处的标「待核实」（2026-10-20：千问常查得到但网址是编的）
  const official = (p.official === true || /收录|列入|属于|对应/.test(String(p.note || '')) && !!code) && !!name0 && !!fw && (!!ref || !!code);
  return { official, verified: official && !!hit, framework: official ? fw : null, official_name: official ? name0 : null, code: official ? code : null, url: official && ref ? ref.url : null, note: String(p.note || '').slice(0, 200) };
}
