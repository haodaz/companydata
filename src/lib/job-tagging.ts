/**
 * 岗位打标签：一批岗位一起跑，最后每个岗位写一次库。
 * 1. 相关专业 fos_ids / 相关职业 related_career_ids（数据部门 10-17、10-19 #16）：
 *    按「要求描述」匹配，各最多 4 个；只认清单里的英文 key（91 个 FOS = 项目库 fos.flora_external_id；职业 = 职业库 external_id），
 *    多个之间用「|」隔开存文本；页面显示中文名。挑不出就留空，不硬凑。
 * 2. 四个标签（数据部门 10-19 #13，提示词照对方给的）：要求_经验标签 exp_labels / 要求_技能标签 skill_labels /
 *    职责_经验标签 exp_labels_jd / 职责_技能标签 skill_labels_jd，中文分号「；」隔开；经验标签原文没直说也要按语义归纳 1–3 个。
 */
import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { generateCheap } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import { qianliLabels, type QianliLabels } from '@/lib/qianli-labels';

type Catalog = { fos: { key: string; name: string }[]; occ: { key: string; name: string }[]; fosSet: Set<string>; occSet: Set<string>; text: string };
let cache: Catalog | null = null;

let cachedAt = 0;
export async function tagCatalog(): Promise<Catalog> {
  // 十分钟刷新一次：职业库会增补（飞轮职业缺口），旧清单打不出新职业
  if (cache && Date.now() - cachedAt < 10 * 60_000) return cache;
  const fos = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/data/fos-91.json'), 'utf8')) as { key: string; name: string }[];
  const { data } = await selectAll(() => supabaseAdmin.from('occupations').select('external_id, name').not('if_delete', 'is', true).not('external_id', 'is', null).order('id'));
  const occ = (data as any[]).map(o => ({ key: String(o.external_id), name: String(o.name) }));
  // 清单放在提示词最前面、每次一样：命中上下文缓存，批量打标签时省 token
  const text = `【专业 FOS 清单（key：名称）】\n${fos.map(f => `${f.key}：${f.name}`).join('\n')}\n\n【职业清单（key：名称）】\n${occ.map(o => `${o.key}：${o.name}`).join('\n')}`;
  cache = { fos, occ, fosSet: new Set(fos.map(f => f.key)), occSet: new Set(occ.map(o => o.key)), text };
  cachedAt = Date.now();
  return cache;
}

export type TagInput = { id: number; name: string; job_function?: string | null; summary_cn?: string | null; responsibilities?: string | null; overview?: string | null; company?: string | null };
export type JobTags = { fos_ids: string; related_career_ids: string };
export type JobLabels = { exp_labels: string | null; skill_labels: string | null; exp_labels_jd: string | null; skill_labels_jd: string | null };

const MAX_TAGS = 4;
const squash = (v: any, n: number) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);

/** 一批岗位（建议 ≤ 20 个）关联专业和职业，返回 id → { fos_ids: 'a|b', related_career_ids: 'x|y' } */
export async function tagJobs(jobs: TagInput[], model: string): Promise<Map<number, JobTags>> {
  const cat = await tagCatalog();
  // 按「要求描述」匹配（10-19 #16）；没有要求描述的才看职责 / 简介
  const lines = jobs.map((j, i) => `${i + 1}. 【${j.name}】职能：${j.job_function || '—'}；要求描述：${squash(j.overview, 400) || '（无）'}${j.overview ? '' : `；职责：${squash(j.responsibilities || j.summary_cn, 220)}`}`).join('\n');
  const prompt = `${cat.text}

你是招聘数据标注员。根据每个岗位的「要求描述」挑：
- related_career_ids：最贴近的职业，最多 ${MAX_TAGS} 个，只能用【职业清单】里的 key；
- fos_ids：最适合来做这个岗位的本科专业方向，最多 ${MAX_TAGS} 个，只能用【专业 FOS 清单】里的 key。
按相关度从高到低排。实在对不上的留空数组，不要硬凑，不要编清单外的 key。
只返回 JSON：{"items":[{"n":序号,"related_career_ids":[],"fos_ids":[]}]}

岗位：
${lines}`;
  const r = await generateCheap(prompt, model, { jsonMode: true });
  await logTokenUsage({ tool_name: 'job-tagging', task_name: 'FOS + Career Tags', institution: jobs[0]?.company || '', model_id: r.model || model, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
  const items: any[] = parseJsonLoose(r.text)?.items || [];
  const out = new Map<number, JobTags>();
  for (const it of items) {
    const j = jobs[Number(it.n) - 1];
    if (!j) continue;
    const fos = [...new Set((it.fos_ids || []).map(String) as string[])].filter(k => cat.fosSet.has(k)).slice(0, MAX_TAGS);
    const occ = [...new Set((it.related_career_ids || []).map(String) as string[])].filter(k => cat.occSet.has(k)).slice(0, MAX_TAGS);
    out.set(j.id, { fos_ids: fos.join('|'), related_career_ids: occ.join('|') });
  }
  return out;
}

/** 四个标签：提示词照数据部门 10-19 给的（一次几个岗位，每个岗位要求 / 职责各截 4000 字）。
 *  没有单独「任职要求」的岗位（要求和职责写在一起），要求描述用职责代替，免得要求的两个标签全空（对方要求四个都有值） */
export async function labelJobs(jobs: TagInput[], model: string): Promise<Map<number, JobLabels>> {
  const blocks = jobs.map((j, i) => `### 岗位 ${i + 1}：${j.name}
【要求描述(overview)】
${String(j.overview || j.responsibilities || j.summary_cn || '').slice(0, 4000) || '（无）'}

【岗位职责描述(responsibilities)】
${String(j.responsibilities || j.summary_cn || '').slice(0, 4000) || '（无）'}`).join('\n\n');
  const prompt = `你是一名资深的招聘信息结构化专家。请从下面每个岗位的岗位要求与岗位职责文本中，提取结构化标签信息，并严格按 JSON 格式返回。

## 输入信息
${blocks}

## 提取要求
请提取以下字段，无法提取则留空数组。注意：四个标签字段必须尽力提取，尤其是经验标签，若原文没有直接出现"经验"字样，请根据语义总结归纳出合理的经验标签，不要全部留空。

1. 要求_经验标签：从"要求描述"中提取与"经验"相关的标签，如：实习经验、项目经验、行业经验、管理经验、临床经验、手术经验、研发经验、GMP经验、纯化经验、细胞培养经验、大模型经验、智能体经验、论文发表、竞赛获奖、开源经验、独立主导、文献调研 等。输出数组。若原文没有直接出现经验关键词，请根据语义总结归纳出 1-3 个经验标签。
2. 要求_技能标签：从"要求描述"中提取与"技能"相关的标签，如：Python、PyTorch、TensorFlow、C++、Java、MATLAB、NLP、CV、多模态、大模型、强化学习、Transformer、BERT、GPT、LangChain、AutoGen、RAG、Agent、知识图谱、SQL、Linux、Kubernetes、Docker、GMP、CHP、USP、色谱、理化检测、有机合成、细胞培养、纯化、发酵、英语读写 等。输出数组。
3. 职责_经验标签：从"岗位职责描述"中提取与"经验"相关的标签，参照字段 1 的枚举范围，输出数组。若原文没有直接出现经验关键词，请根据语义总结归纳出 1-3 个经验标签。
4. 职责_技能标签：从"岗位职责描述"中提取与"技能"相关的标签，参照字段 2 的枚举范围，输出数组。

补充（数据部门要求四个字段都必须有值）：技能标签如果原文没有具体的工具 / 技术，也请根据语义归纳 1-3 个能力标签（如 数据分析、沟通协调、项目管理），不要留空。

只返回 JSON：{"items":[{"n":岗位序号,"要求_经验标签":[],"要求_技能标签":[],"职责_经验标签":[],"职责_技能标签":[]}]}`;
  const r = await generateCheap(prompt, model, { jsonMode: true });
  await logTokenUsage({ tool_name: 'job-tagging', task_name: 'Exp + Skill Labels', institution: jobs[0]?.company || '', model_id: r.model || model, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
  const items: any[] = parseJsonLoose(r.text)?.items || [];
  const join = (v: any) => { const arr = [...new Set((Array.isArray(v) ? v : String(v || '').split(/[;；,，、]/)).map((x: any) => String(x).trim()).filter(Boolean))].slice(0, 15); return arr.length ? arr.join('；') : null; };
  const out = new Map<number, JobLabels>();
  for (const it of items) {
    const j = jobs[Number(it.n) - 1];
    if (!j) continue;
    out.set(j.id, { exp_labels: join(it['要求_经验标签']), skill_labels: join(it['要求_技能标签']), exp_labels_jd: join(it['职责_经验标签']), skill_labels_jd: join(it['职责_技能标签']) });
  }
  return out;
}

const LABEL_CN: Record<keyof JobLabels, string> = { exp_labels: '要求_经验标签', skill_labels: '要求_技能标签', exp_labels_jd: '职责_经验标签', skill_labels_jd: '职责_技能标签' };

/**
 * 补缺：四个标签里还空着的，单独再问一次（只问缺的那几个）。数据部门要求四个都有值；
 * 校招岗位的任职要求常常只写学历 / 专业 / 性格，一次抽四个时模型会把「要求_经验」留空（10-19 回刷后还有 2349 个）。
 */
export async function fillMissingLabels(jobs: (TagInput & { missing: (keyof JobLabels)[] })[], model: string): Promise<Map<number, Partial<JobLabels>>> {
  const todo = jobs.filter(j => j.missing.length && (j.overview || j.responsibilities || j.summary_cn));
  const out = new Map<number, Partial<JobLabels>>();
  if (!todo.length) return out;
  const blocks = todo.map((j, i) => `### 岗位 ${i + 1}：${j.name}
要补的字段：${j.missing.map(k => LABEL_CN[k]).join('、')}
【要求描述】${squash(j.overview || j.responsibilities || j.summary_cn, 1500)}
【岗位职责】${squash(j.responsibilities || j.summary_cn, 1500)}`).join('\n\n');
  const prompt = `你是一名资深的招聘信息结构化专家。下面每个岗位都有几个标签字段还是空的，请只补这些字段，每个字段给 1-3 个标签，不能留空。
- 经验标签：原文没写经验要求的，根据岗位名称、要求和职责归纳最相关的经验（如 实习经验、项目经验、行业经验、学生干部经验、竞赛获奖、科研经验、销售经验、教学经验）。
- 技能标签：原文没写具体工具 / 技术的，归纳最相关的能力（如 沟通协调、数据分析、项目管理、英语读写、学习能力）。
「要求_」开头的字段依据要求描述，「职责_」开头的字段依据岗位职责。

${blocks}

只返回 JSON：{"items":[{"n":岗位序号,"要求_经验标签":[],"要求_技能标签":[],"职责_经验标签":[],"职责_技能标签":[]}]}（只填要补的字段）`;
  const r = await generateCheap(prompt, model, { jsonMode: true });
  await logTokenUsage({ tool_name: 'job-tagging', task_name: 'Fill Missing Labels', institution: todo[0]?.company || '', model_id: r.model || model, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
  const keyOf: Record<string, keyof JobLabels> = { 要求_经验标签: 'exp_labels', 要求_技能标签: 'skill_labels', 职责_经验标签: 'exp_labels_jd', 职责_技能标签: 'skill_labels_jd' };
  for (const it of parseJsonLoose(r.text)?.items || []) {
    const j = todo[Number(it.n) - 1];
    if (!j) continue;
    const v: Partial<JobLabels> = {};
    for (const [cn, k] of Object.entries(keyOf)) {
      if (!j.missing.includes(k)) continue;
      const arr = [...new Set((Array.isArray(it[cn]) ? it[cn] : []).map((x: any) => String(x).trim()).filter(Boolean))].slice(0, 5);
      if (arr.length) v[k] = arr.join('；');
    }
    if (Object.keys(v).length) out.set(j.id, v);
  }
  return out;
}

/**
 * 给指定岗位打标签并写库（专业 / 职业 + 四个标签），每个岗位只写一次。入库后顺手调，或批量脚本用。
 * 人工锁定的字段不动。
 */
export async function tagAndSave(ids: number[], model: string, opts: { batch?: number; labels?: boolean; tags?: boolean; qianliModel?: string } = {}) {
  if (!ids.length) return 0;
  // qianliModel：给了才打潜历职能 / 特色标签（数据部门 10-20 #15 #17；特色标签要守原文证据，用调用方指定的模型，不先试便宜模型）
  const { batch = 20, labels = true, tags = true, qianliModel } = opts;
  const { data } = await supabaseAdmin.from('jobs').select('id, name, job_function, summary_cn, responsibilities, overview, institute_or_company_name, human_locked_fields').in('id', ids);
  const rows = (data || []).map((j: any) => ({ ...j, company: j.institute_or_company_name }));
  let n = 0;
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    const t = tags ? await tagJobs(chunk, model).catch(() => new Map<number, JobTags>()) : new Map<number, JobTags>();
    // 四个标签每次 5 个岗位（每个岗位要求 / 职责最多 8000 字）
    const l = new Map<number, JobLabels>();
    if (labels) for (let k = 0; k < chunk.length; k += 5) for (const [id, v] of await labelJobs(chunk.slice(k, k + 5), model).catch(() => new Map<number, JobLabels>())) l.set(id, v);
    // 补缺：四个标签还空的再问一次（只问缺的）
    if (labels) {
      const LK = Object.keys(LABEL_CN) as (keyof JobLabels)[];
      const need = chunk.map(j => ({ ...j, missing: LK.filter(k => !(l.get(j.id)?.[k])) })).filter(j => j.missing.length);
      for (let k = 0; k < need.length; k += 10) for (const [id, v] of await fillMissingLabels(need.slice(k, k + 10), model).catch(() => new Map<number, Partial<JobLabels>>())) l.set(id, { ...(l.get(id) || { exp_labels: null, skill_labels: null, exp_labels_jd: null, skill_labels_jd: null }), ...v });
    }
    const q = qianliModel ? await qianliLabels(chunk, qianliModel).catch(() => new Map<number, QianliLabels>()) : new Map<number, QianliLabels>();
    for (const j of chunk) {
      const locked = new Set<string>(j.human_locked_fields || []);
      const patch: Record<string, any> = { ...(t.get(j.id) || {}), ...(l.get(j.id) || {}), ...(q.get(j.id) || {}) };
      // 人工锁定的不动；这次没抽出来的（空值）不写，免得把库里已有的标签冲掉
      for (const k of Object.keys(patch)) if (locked.has(k) || patch[k] === null || patch[k] === '') delete patch[k];
      if (!Object.keys(patch).length) continue;
      const { error } = await supabaseAdmin.from('jobs').update(patch).eq('id', j.id);
      if (!error) n++;
    }
  }
  return n;
}
