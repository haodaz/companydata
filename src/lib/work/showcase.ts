/**
 * 真活 · 任务库（明牌，2026-10-27）：挑一小部分好任务，去掉企业名（去头）给出任务的人浏览——只给题，不讲出题逻辑。
 * 选中一道后两种用法：
 *   · base 原题直出：结构、交付物、材料种类和坑、评分要点照搬，企业 / 背景 / 数字换成出任务的人自己的公司
 *   · ref  仅做参考：只借题型、推进方式和交付形态
 * 然后进填表或聊天，只问还不知道的（哪家企业；要找的人默认沿用）。
 * 展示用的去标识版本在 showcase.json（人工整理，低频）；生成时回读原任务全文（work_tasks.source_task_id）。
 * 和后台「样本库」不同：样本库是暗牌（后台训练出题能力，用户看不见），任务库是明牌。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import items from './showcase.json';

export type ShowcaseItem = {
  id: string; source_task_id: string; industry: string; direction: string; role: string; title: string; scenario: string;
  deliverables: { title: string; format?: string; module?: string }[]; materials: string[]; time_minutes?: number | null; env?: string;
};
export const SHOWCASE: ShowcaseItem[] = items as ShowcaseItem[];

/** 表里上架的（迁移 054；没跑迁移就当没有） */
async function liveRows(): Promise<ShowcaseItem[]> {
  const { data, error } = await db.from('work_showcase').select('id, source_task_id, industry, direction, role, title, scenario, deliverables, materials, time_minutes, env').eq('status', 'live').order('created_at');
  if (error) return [];
  return (data || []) as ShowcaseItem[];
}
/** 任务库 = 人工整理的 json + 表里上架的（2026-10-28 起任务库可以自己长） */
export async function listShowcase(): Promise<ShowcaseItem[]> { return [...SHOWCASE, ...(await liveRows())]; }
export async function showcaseById(id?: string | null): Promise<ShowcaseItem | null> {
  if (!id) return null;
  return SHOWCASE.find(x => x.id === id) || (await liveRows()).find(x => x.id === id) || null;
}

/** 对外列表：不带原任务 id */
export const publicShowcase = async () => (await listShowcase()).map(({ source_task_id: _s, ...x }) => x);

/** 回读原任务，拼成给生成器的原题全文（任务书 + 交付物 + 材料 + 评分要点）。原文里的企业名由生成器按规则替换掉 */
export async function baseTaskText(item: ShowcaseItem): Promise<string> {
  const { data: t } = await db.from('work_tasks').select('task, materials, rubric, problem').eq('id', item.source_task_id).maybeSingle();
  if (!t) return `任务：${item.title}\n${item.scenario}\n交付物：${item.deliverables.map(d => `${d.title}（${d.format || ''}，${d.module || ''}）`).join('；')}`;
  const T: any = t.task || {};
  const L: string[] = [];
  L.push(`### 任务书：${T.title || item.title}`, String(T.brief || ''));
  if (t.problem?.statement) L.push(`业务问题：${t.problem.statement}`);
  // 任务库里标的台子优先（11-05：IP 设计题原任务用的是参数草图台，按口径应该用白板）
  L.push('### 交付物', ...(T.deliverables || []).map((d: any, i: number) => { const m = item.deliverables?.[i]?.module || d.module; return `- ${item.deliverables?.[i]?.module && item.deliverables[i].module !== d.module ? item.deliverables[i].title : d.title}（format：${(item.deliverables?.[i]?.module !== d.module && item.deliverables?.[i]?.format) || d.format || '—'}；module：${m || '—'}）${d.desc ? `：${d.desc}` : ''}`; }));
  if (T.rules?.length) L.push('### 规则', ...T.rules.map((r: string) => `- ${r}`));
  L.push(`### 操作台：${item.env || T.env?.type || 'doc'}；限时 ${T.time_minutes || item.time_minutes || '—'} 分钟`);
  L.push('### 材料（原题的材料，看它们各自的作用和埋的坑）');
  for (const m of (t.materials || []) as any[]) L.push(`#### ${m.title}（${m.kind || ''}）\n${String(m.content || '').slice(0, 1800)}`);
  if (Array.isArray(t.rubric) && t.rubric.length) L.push('### 评分要点', ...t.rubric.map((r: any) => `- ${r.title}（${r.weight ?? ''}%）：${String(r.desc || '').slice(0, 200)}`));
  return L.join('\n').slice(0, 16000);
}

/** 原题企业的各种叫法（11-05 国内版验收：原题直出后「取材依据」里还留着「参照宁德时代原题」「宁德德布勒森」）——生成后从题目里清掉 */
export async function originNames(item: ShowcaseItem): Promise<string[]> {
  const { data: t } = await db.from('work_tasks').select('company_name, company_id').eq('id', item.source_task_id).maybeSingle();
  if (!t?.company_name) return [];
  const names = new Set<string>([t.company_name]);
  if (t.company_id) { const { data: c } = await db.from('companies').select('name, name_en, brief_name, aliases').eq('id', t.company_id).maybeSingle(); for (const n of [c?.name, c?.name_en, c?.brief_name, ...(c?.aliases || [])]) if (n) names.add(String(n)); }
  // 开头的地名不算简称（「上海武岳峰…」取「上海」会把题面里所有「上海」都换掉）
  const REGION = /^(北京|上海|天津|重庆|深圳|广州|杭州|苏州|南京|武汉|成都|西安|宁波|厦门|青岛|合肥|长沙|郑州|济南|无锡|东莞|佛山|珠海|香港|澳门|台湾|中国|浙江|江苏|广东|山东|福建|湖北|湖南|四川|河南|河北|安徽|辽宁)(市|省)?/;
  for (const n of [...names]) {
    const core = n.replace(/[（(][^）)]*[）)]/g, '').replace(/(股份)?有限(责任)?公司|集团|控股|股份|公司/g, '').replace(/[,，]?\s*\b(Inc|Ltd|Limited|Co|Corp|Corporation|Group|LLC|PLC)\b\.?/gi, '').replace(/\s+/g, ' ').trim();
    if (core.length >= 2 && !REGION.test(core.replace(REGION, '') ? '' : core)) names.add(core);
    const local = core.replace(REGION, '');
    if (/^[\u4e00-\u9fa5]{4,}$/.test(local)) names.add(local.slice(0, 2));   // 宁德时代 → 宁德
  }
  const BAD = /^(北京|上海|天津|重庆|深圳|广州|杭州|苏州|南京|武汉|成都|西安|香港|中国|国际|科技|资本|投资|管理|演示|平方|鲜橙)$/;   // 常见词当简称会误伤题面（「200 平方米」）
  return [...names].filter(n => n.length >= 2 && !BAD.test(n)).sort((a, b) => b.length - a.length);
}

/**
 * 候选：题目资产库里 AI 基线 ≥ 70、已发布、不是原题直发、还没进任务库的任务（2026-10-28）。
 * 区分度高（作答分数拉得开）、被人改过的排前面。
 */
export async function showcaseCandidates(limit = 40) {
  const [{ data: bank }, { data: rows }] = await Promise.all([
    db.from('work_question_bank').select('task_id, company_name, industry, role, title, signals, rating').order('updated_at', { ascending: false }).limit(400),
    db.from('work_showcase').select('*').order('updated_at', { ascending: false }).then(r => r, () => ({ data: [] as any[] })),
  ]);
  const taken = new Set([...SHOWCASE.map(x => x.source_task_id), ...((rows || []) as any[]).map((r: any) => r.source_task_id)]);
  const ids = (bank || []).filter((b: any) => b.task_id && !taken.has(b.task_id) && (b.signals?.baseline_total ?? 0) >= 70).map((b: any) => b.task_id);
  const { data: tasks } = ids.length ? await db.from('work_tasks').select('id, status, context').in('id', ids) : { data: [] as any[] };
  const ok = new Set((tasks || []).filter((t: any) => t.status === 'published' && !t.context?.verbatim).map((t: any) => t.id));
  const score = (b: any) => (b.rating || 0) * 10 + Math.min(30, b.signals?.score_spread || 0) + (b.signals?.sessions || 0) * 2 + (b.signals?.baseline_total || 0) / 10;
  return {
    candidates: (bank || []).filter((b: any) => ok.has(b.task_id)).sort((a: any, b: any) => score(b) - score(a)).slice(0, limit),
    drafts: ((rows || []) as any[]).filter((r: any) => r.status !== 'live'),
    live: ((rows || []) as any[]).filter((r: any) => r.status === 'live'),
  };
}

/** 去头：读原任务全文，让模型写成任务库的展示题面（企业 / 人名 / 地名 / 项目名一律换成泛称），存成 draft 等人看 */
export async function deidentifyToShowcase(taskId: string, email: string) {
  const { askJson } = await import('./generator');
  const { data: t } = await db.from('work_tasks').select('id, company_name, role, task, materials').eq('id', taskId).single();
  if (!t) throw new Error('没有这道任务');
  const text = await baseTaskText({ id: '', source_task_id: taskId, industry: '', direction: '', role: t.role, title: t.task?.title || '', scenario: '', deliverables: [], materials: [] });
  const prompt = `下面是一道已经出好的「真活」（企业真实业务任务）。把它写成「任务库」里给别的企业浏览的展示题面：**去头**——企业、基金、客户、人名、地名、工厂 / 项目 / 产品专名一律换成泛称（如「一家动力电池龙头」「一家头部美元基金」「欧洲新工厂」），业务逻辑、关键约束、交付对象的角色照原文保留，不编数字。
原企业：${t.company_name}（这个名字和它的简称、英文名都不能出现在输出里）
## 原任务
${text.slice(0, 9000)}
只返回 JSON：
{ "id": "ascii-kebab-slug（3–5 个英文词）", "industry": "行业（新能源制造 / 投资 / 生物医药 / 科研 / 互联网 / 消费零售 / 设计 / 法律 / 咨询 / 会计 / 其它）", "direction": "职能方向，短", "role": "要找的人，一句话，不带公司名", "title": "任务标题 8–18 字，去头", "scenario": "任务背景与要求 150–260 字，业务负责人口吻，去头", "deliverables": [ { "title": "", "format": "", "module": "doc|sheet|code|design|canvas|board" } ], "materials": ["材料名（去头），一句话说它是什么，≤30 字"] }`;
  const { parsed: p } = await askJson(prompt, 'qwen-plus', 'Showcase · 去头上架', t.company_name);
  const leak = (v: string) => [t.company_name, ...(String(t.company_name).match(/[\u4e00-\u9fa5]{2,4}/g) || []).slice(0, 1)].some(n => n && n.length >= 2 && v.includes(n));
  const row = {
    id: String(p.id || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || `task-${taskId.slice(0, 8)}`,
    source_task_id: taskId, industry: String(p.industry || '其它').slice(0, 20), direction: String(p.direction || '').slice(0, 30), role: String(p.role || '').slice(0, 80),
    title: String(p.title || t.task?.title || '').slice(0, 40), scenario: String(p.scenario || '').slice(0, 600),
    deliverables: (Array.isArray(p.deliverables) ? p.deliverables : []).slice(0, 5).map((d: any) => ({ title: String(d.title || '').slice(0, 80), format: String(d.format || '').slice(0, 40), module: String(d.module || 'doc') })),
    materials: (Array.isArray(p.materials) ? p.materials : []).slice(0, 8).map((m: any) => String(m).slice(0, 40)),
    time_minutes: t.task?.time_minutes || null, env: t.task?.env?.type || null, status: 'draft', created_by: email, updated_at: new Date().toISOString(),
  };
  if (SHOWCASE.some(x => x.id === row.id)) row.id = `${row.id}-${taskId.slice(0, 4)}`;
  const { error } = await db.from('work_showcase').upsert(row, { onConflict: 'source_task_id' });
  if (error) throw new Error(/work_showcase/.test(error.message) ? '任务库表还没建（迁移 054 待跑）' : error.message);
  return { ...row, leak: leak(JSON.stringify(row)) };
}
