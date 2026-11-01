/**
 * 百业 · 「AI 会怎么改变我的工作」（2026-11-01，C 端最小版本；参考 NeoHuman 的思路，不照搬画面和流程）。
 *   输入职位名 / JD / 简历 → 对上职业库里的职业 → 把这一行的任务分成 AI 接手 / 人机协作 / 人来做，再列 AI 时代新增的任务
 *   → AI 暴露分（程序按三类占比算这一行的基准；贴了简历的再按经历加减，每条必须引用简历原文，引不上就丢）
 *   → 强项 / 风险各两条，带下一步 → 接「亲手试一天」（百业空间）和「做一道真活」（任务库）。
 * 数据全来自我们自己的库：职业（631）、典型任务（953）、职责、年限月薪（职友集来源）。不编薪资涨幅；「相关名人」没核实过，不展示。
 * 模型：Claude 优先、千问兜底（askJson 的链）。职业这一层缓存在 lab_ai_change_cache（迁移 056），个人那一层（按简历）不缓存。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { askJson } from '@/lib/work/generator';
import { listShowcase } from '@/lib/work/showcase';
import { CAREER_CATEGORY_LABELS, CAREER_MID_CATEGORIES } from '@/lib/occupation-fields';

/** 职业库的大类 / 中类存的是英文键，展示换成中文 */
const catLabel = (o: any) => [CAREER_CATEGORY_LABELS[o.career_category] || '', CAREER_MID_CATEGORIES[o.career_mid_category]?.[0] || ''].filter(Boolean).join(' · ');

const MODEL = 'claude-sonnet-5-5';
const S = (v: any, n = 200) => String(v ?? '').slice(0, n);
const clean = (s: string) => s.replace(/[,()（）*%]/g, ' ').trim();

export type OccHit = { id: number; name: string; category: string; intro: string };

async function searchOcc(name: string, limit = 4): Promise<OccHit[]> {
  const n = clean(name).slice(0, 20); if (n.length < 2) return [];
  const { data } = await db.from('occupations').select('id, name, career_category, career_mid_category, intro').eq('if_delete', false).or(`name.ilike.%${n}%,name_lang_cn.ilike.%${n}%`).limit(limit);
  return (data || []).map((o: any) => ({ id: o.id, name: o.name, category: catLabel(o), intro: S(o.intro, 90) }));
}

/** 对上职业：短的当职位名直接搜；长的（JD / 简历）先让模型读出 3 个最可能的职业名再搜；搜不够也让模型补 */
export async function matchOccupations(text: string): Promise<{ hits: OccHit[]; guessed: string[] }> {
  const t = text.trim().slice(0, 4000);
  const out = new Map<number, OccHit>();
  if (t.length <= 24) for (const h of await searchOcc(t)) out.set(h.id, h);
  let guessed: string[] = [];
  if (out.size < 3) {
    const { parsed: p } = await askJson(`下面是一个人描述自己工作的文字（可能是职位名、岗位 JD 或简历）。说出他最可能对应的 3 个标准职业名（中文、通用叫法，比如「数据分析师」「产品经理」「护士」），从最像的排起。只返回 JSON：{ "names": ["", "", ""] }
${t}`, MODEL, 'Lab · AI 改变 · 对职业');
    guessed = (Array.isArray(p?.names) ? p.names : []).map((x: any) => S(x, 20)).filter(Boolean).slice(0, 3);
    for (const g of guessed) { for (const h of await searchOcc(g, 3)) if (out.size < 5) out.set(h.id, h); }
  }
  return { hits: [...out.values()].slice(0, 4), guessed };
}

/** 近乎重复的任务合并：名字的二字片段重合超过一半就算同一项（典型任务库里有「…日报交接」「…日报沉淀交接」这类成对的） */
function dedupe<T extends { name: string }>(list: T[]): T[] {
  const grams = (s: string) => { const t = s.replace(/\s+/g, ''); const g = new Set<string>(); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
  const out: { x: T; g: Set<string> }[] = [];
  for (const x of list) { const g = grams(x.name); if (!out.some(o => { let n = 0; for (const k of g) if (o.g.has(k)) n++; return n / Math.min(g.size, o.g.size || 1) > 0.5; })) out.push({ x, g }); }
  return out.map(o => o.x);
}

/** 这一行的任务：先用典型任务（去重后有 4 项以上），没有就把职责拆成任务；标明来源 */
async function tasksOf(occ: any): Promise<{ tasks: { name: string; detail: string }[]; from: string }> {
  const { data: tt } = await db.from('typical_tasks').select('name, summary, goal').eq('occupation_id', occ.id).eq('if_delete', false).limit(18);
  const typical = dedupe((tt || []).map((x: any) => ({ name: S(x.name, 40), detail: S(x.summary || x.goal, 120) }))).slice(0, 12);
  if (typical.length >= 4) return { tasks: typical, from: '职业库 · 典型任务' };
  let lines: string[] = [];
  const r = occ.responsibility;
  try { const arr = typeof r === 'string' && r.trim().startsWith('[') ? JSON.parse(r) : null; if (Array.isArray(arr)) lines = arr.map(String); } catch { /* 不是 JSON 就按行拆 */ }
  if (!lines.length) lines = String(r || '').split(/\n|；|;/);
  const tasks = dedupe(lines.map(x => x.replace(/^\s*\d+[、.．)]\s*/, '').replace(/[；;。]\s*$/, '').trim()).filter(x => x.length >= 4).map(x => ({ name: S(x, 40), detail: x.length > 40 ? S(x, 120) : '' }))).slice(0, 12);
  return { tasks, from: '职业库 · 岗位职责' };
}

export type ChangeResult = {
  occupation: { id: number; name: string; category: string; intro: string };
  tasks: { name: string; kind: 'ai' | 'hybrid' | 'human'; how: string }[];
  task_source: string;
  new_tasks: { name: string; why: string }[];
  baseline: number; score: number;
  adjustments: { quote: string; delta: number; why: string }[];
  strengths: { title: string; why: string; next: string }[];
  risks: { title: string; why: string; next: string }[];
  salary: { monthly: number | null; bands: { label: string; salary: number }[]; source: string | null };
  next: { spaces: { id: string; title: string; role: string; avatar: string }[]; work: { id: string; title: string; industry: string }[] };
  verdict: string;
};

const BAND: Record<string, string> = { year_0_2: '1 年以内', year_2_4: '1–3 年', year_4_6: '3–5 年', year_6_8: '5–10 年', year_8_10: '10 年以上' };

type Item3 = { title: string; why: string; next: string };
type OccLayer = { tasks: ChangeResult['tasks']; task_source: string; new_tasks: ChangeResult['new_tasks']; strengths: Item3[]; risks: Item3[]; verdict: string; baseline: number; cached: boolean };
const CACHE_VERSION = 1;
const three = (arr: any): Item3[] => (Array.isArray(arr) ? arr : []).slice(0, 2).map((x: any) => ({ title: S(x?.title, 30), why: S(x?.why, 120), next: S(x?.next, 120) })).filter((x: Item3) => x.title);
/** 任务清单的指纹：库里的任务变了就重算缓存 */
const hashOf = (tasks: { name: string }[]) => { let h = 0; const t = tasks.map(x => x.name).join('|'); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return `${tasks.length}:${(h >>> 0).toString(36)}`; };

/**
 * 职业这一层（缓存在 lab_ai_change_cache，迁移 056）：任务三分、新增任务、基准分、通用强项风险。
 * 同一职业第一次分析时调模型并存下来，之后直接读——基准分固定、不再花钱。表还没建时照常现算，只是不缓存。
 */
async function occLayer(occ: any): Promise<OccLayer> {
  const { tasks, from } = await tasksOf(occ);
  if (tasks.length < 3) throw new Error('这个职业在库里的任务太少，换一个相近的职业试试');
  const hash = hashOf(tasks);
  const { data: hit, error: cacheErr } = await db.from('lab_ai_change_cache').select('*').eq('occupation_id', occ.id).maybeSingle();
  if (hit && hit.version === CACHE_VERSION && hit.task_hash === hash) {
    db.from('lab_ai_change_cache').update({ hits: (hit.hits || 0) + 1 }).eq('occupation_id', occ.id).then(() => {}, () => {});
    return { tasks: hit.tasks, task_source: hit.task_source, new_tasks: hit.new_tasks, strengths: hit.strengths, risks: hit.risks, verdict: hit.verdict || '', baseline: hit.baseline, cached: true };
  }
  const { parsed: p, model } = await askJson(`你在帮人看清：AI 会怎么改变「${occ.name}」这一行。只根据下面给的职业资料说话，不编数字、不编公司和人名。全部中文，说人话。
## 职业：${occ.name}
${S(occ.intro, 300)}
## 这一行的任务（${from}，编号从 1 开始）
${tasks.map((t, i) => `${i + 1}. ${t.name}${t.detail ? `：${t.detail}` : ''}`).join('\n')}
要做的：
1. 每项任务分一类：ai（AI 基本能接手，人只需抽查）/ hybrid（人机协作：AI 做一部分，人把关或定方向）/ human（主要靠人：现场、关系、担责、手上功夫）。how 写一句：AI 做什么、人做什么。按今天能用的 AI 能力判断，别夸大也别保守。
2. new_tasks：AI 时代这一行会新增的 2 项任务（比如审核 AI 产出、设计人机流程），各一句为什么。
3. strengths / risks：各 2 条。strengths 是这一行里 AI 拿不走、值得加强的本事；risks 是最容易被 AI 替代、要提前转型的部分。各写 title（短）、why（一句）、next（一个这周就能做的具体动作）。
4. verdict：一句话总结（30–50 字），给做这一行的人，不吓人也不空泛。
只返回 JSON：
{ "tasks": [ { "i": 1, "kind": "ai|hybrid|human", "how": "" } ], "new_tasks": [ { "name": "", "why": "" } ], "strengths": [ { "title": "", "why": "", "next": "" } ], "risks": [ { "title": "", "why": "", "next": "" } ], "verdict": "" }`, MODEL, 'Lab · AI 改变 · 拆任务（职业）');
  const kinds = ['ai', 'hybrid', 'human'];
  const cls = tasks.map((t, i) => { const x = (Array.isArray(p?.tasks) ? p.tasks : []).find((y: any) => Number(y?.i) === i + 1) || {}; return { name: t.name, kind: (kinds.includes(x.kind) ? x.kind : 'hybrid') as 'ai' | 'hybrid' | 'human', how: S(x.how, 120) }; });
  // 基准分由程序算：AI 接手算 1、人机协作算 0.5、人来做算 0
  const baseline = Math.round((cls.reduce((n, t) => n + (t.kind === 'ai' ? 1 : t.kind === 'hybrid' ? 0.5 : 0), 0) / cls.length) * 100);
  const layer: OccLayer = {
    tasks: cls, task_source: from, baseline, cached: false,
    new_tasks: (Array.isArray(p?.new_tasks) ? p.new_tasks : []).slice(0, 2).map((x: any) => ({ name: S(x?.name, 40), why: S(x?.why, 120) })).filter((x: any) => x.name),
    strengths: three(p?.strengths), risks: three(p?.risks), verdict: S(p?.verdict, 120),
  };
  if (!cacheErr) await db.from('lab_ai_change_cache').upsert({ occupation_id: occ.id, version: CACHE_VERSION, task_hash: hash, task_source: from, tasks: layer.tasks, new_tasks: layer.new_tasks, strengths: layer.strengths, risks: layer.risks, verdict: layer.verdict, baseline, model, hits: 0, built_at: new Date().toISOString(), updated_at: new Date().toISOString() }).then(() => {}, () => {});
  return layer;
}

/** 个人这一层（不缓存，只在贴了简历时调）：按经历加减分 + 个性化的强项风险和总结 */
async function personalLayer(occ: any, layer: OccLayer, resume: string) {
  const { parsed: p } = await askJson(`你在帮一个人看清：AI 会怎么改变他的工作。他是「${occ.name}」，下面是这一行的任务怎么被 AI 改变（已经定好，不用重分），以及他自己写的经历。只根据这些说话，不编数字、不编公司和人名。全部中文。
## 这一行的任务
${layer.tasks.map(t => `- [${t.kind === 'ai' ? 'AI 接手' : t.kind === 'hybrid' ? '人机协作' : '人来做'}] ${t.name}`).join('\n')}
## 他自己写的
${resume}
要做的：
1. adjustments：他的经历里哪些会让他比同行更不容易 / 更容易被 AI 替代。quote 必须一字不差地摘自他写的文字（≤30 字）；delta 是 -6 到 +6 的整数，负数 = 更不容易被替代；最多 4 条。
2. strengths / risks：各 2 条，贴着他的经历写。title（短）、why（一句，说到他的经历）、next（一个这周就能做的具体动作）。
3. verdict：一句话给他的总结（30–50 字），不吓人也不空泛。
只返回 JSON：{ "adjustments": [ { "quote": "", "delta": 0, "why": "" } ], "strengths": [ { "title": "", "why": "", "next": "" } ], "risks": [ { "title": "", "why": "", "next": "" } ], "verdict": "" }`, MODEL, 'Lab · AI 改变 · 按简历调整');
  // quote 必须真在他写的文字里，引不上就丢；总共最多 ±15
  const norm = (s: string) => s.replace(/\s+/g, '');
  const adjustments = (Array.isArray(p?.adjustments) ? p.adjustments : []).map((a: any) => ({ quote: S(a?.quote, 40), delta: Math.max(-6, Math.min(6, Math.round(Number(a?.delta) || 0))), why: S(a?.why, 80) }))
    .filter((a: any) => a.quote.length >= 4 && a.delta !== 0 && norm(resume).includes(norm(a.quote))).slice(0, 4);
  const st = three(p?.strengths), rk = three(p?.risks);
  return { adjustments, strengths: st.length ? st : layer.strengths, risks: rk.length ? rk : layer.risks, verdict: S(p?.verdict, 120) || layer.verdict };
}

export async function analyzeChange(occupationId: number, text: string): Promise<ChangeResult & { cached: boolean }> {
  const { data: occ } = await db.from('occupations').select('*').eq('id', occupationId).eq('if_delete', false).single();
  if (!occ) throw new Error('职业库里没有这个职业');
  const resume = text.trim().length > 24 ? text.trim().slice(0, 4000) : '';
  const layer = await occLayer(occ);
  const me = resume ? await personalLayer(occ, layer, resume) : { adjustments: [] as ChangeResult['adjustments'], strengths: layer.strengths, risks: layer.risks, verdict: layer.verdict };
  const baseline = layer.baseline;
  const shift = Math.max(-15, Math.min(15, me.adjustments.reduce((n: number, a: any) => n + a.delta, 0)));
  const score = Math.max(0, Math.min(100, baseline + shift));
  // 薪资：只用库里的真实数据
  const { data: sal } = await db.from('occupation_salaries').select('year, salary, source_url').eq('occupation_id', occ.id).eq('if_delete', false);
  const bands = Object.keys(BAND).map(k => (sal || []).find((r: any) => r.year === k)).filter((r: any) => r?.salary).map((r: any) => ({ label: BAND[r.year], salary: r.salary }));
  const srcUrl = (sal || []).find((r: any) => r.source_url)?.source_url || null;
  // 接下来：百业里同职业的空间（亲手试一天）+ 任务库里相关的真活
  const { data: sps } = await db.from('skill_tasks').select('id, title, profile, jd_snapshot').limit(600);
  const names = [occ.name, ...(Array.isArray(occ.aliases) ? occ.aliases : [])].filter(Boolean).map(String);
  const hit = (s: string) => !!s && names.some(n => s.includes(n) || (s.length >= 2 && n.includes(s)));
  const spaces = (sps || []).filter((s: any) => hit(String(s.profile?.role || '')) || hit(String(s.jd_snapshot?.career?.profession || '')) || hit(String(s.jd_snapshot?.title || '')))
    .slice(0, 2).map((s: any) => ({ id: s.id, title: s.title, role: s.profile?.role || s.jd_snapshot?.title || '', avatar: s.profile?.avatar || '' }));
  const lib = await listShowcase().catch(() => []);
  const work = lib.filter(x => names.some(n => x.role.includes(n) || x.title.includes(n) || x.direction.includes(n))).slice(0, 2).map(x => ({ id: x.id, title: x.title, industry: x.industry }));
  return {
    occupation: { id: occ.id, name: occ.name, category: catLabel(occ), intro: S(occ.intro, 160) },
    tasks: layer.tasks, task_source: layer.task_source, new_tasks: layer.new_tasks,
    baseline, score, adjustments: me.adjustments, strengths: me.strengths, risks: me.risks,
    salary: { monthly: occ.recent_year_monthly_salary || null, bands, source: srcUrl },
    next: { spaces, work }, verdict: me.verdict, cached: layer.cached,
  };
}
