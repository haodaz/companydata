/**
 * 岗位关联专业和职业（数据部门 10-17：fos_ids、related_career_ids 都是空的，可以关联多个）。
 * - fos_ids：项目库那 91 个 FOS 的 key（src/data/fos-91.json，来自项目库 fos.flora_external_id）
 * - related_career_ids：职业库职业的 external_id
 * 模型从这两张清单里挑（各最多 3 个），清单外的 key 一律丢掉；挑不出就留空，不硬凑。
 */
import fs from 'node:fs';
import path from 'node:path';
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { generateCheap } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';

type Catalog = { fos: { key: string; name: string }[]; occ: { key: string; name: string }[]; fosSet: Set<string>; occSet: Set<string>; text: string };
let cache: Catalog | null = null;

export async function tagCatalog(): Promise<Catalog> {
  if (cache) return cache;
  const fos = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/data/fos-91.json'), 'utf8')) as { key: string; name: string }[];
  const { data } = await selectAll(() => supabaseAdmin.from('occupations').select('external_id, name').not('if_delete', 'is', true).not('external_id', 'is', null).order('id'));
  const occ = (data as any[]).map(o => ({ key: String(o.external_id), name: String(o.name) }));
  // 清单放在提示词最前面、每次一样：命中上下文缓存，批量打标签时省 token
  const text = `【专业 FOS 清单（key：名称）】\n${fos.map(f => `${f.key}：${f.name}`).join('\n')}\n\n【职业清单（key：名称）】\n${occ.map(o => `${o.key}：${o.name}`).join('\n')}`;
  cache = { fos, occ, fosSet: new Set(fos.map(f => f.key)), occSet: new Set(occ.map(o => o.key)), text };
  return cache;
}

export type TagInput = { id: number; name: string; job_function?: string | null; summary_cn?: string | null; responsibilities?: string | null; overview?: string | null; company?: string | null };

/** 一批岗位（建议 ≤ 20 个）打标签，返回 id → { fos_ids, related_career_ids } */
export async function tagJobs(jobs: TagInput[], model: string): Promise<Map<number, { fos_ids: string[]; related_career_ids: string[] }>> {
  const cat = await tagCatalog();
  const lines = jobs.map((j, i) => `${i + 1}. 【${j.name}】职能：${j.job_function || '—'}；${String(j.summary_cn || j.responsibilities || '').replace(/\s+/g, ' ').slice(0, 220)}${j.overview ? `；要求：${String(j.overview).replace(/\s+/g, ' ').slice(0, 120)}` : ''}`).join('\n');
  const prompt = `${cat.text}

你是招聘数据标注员。给下面每个岗位挑：
- related_career_ids：最贴近的职业，最多 3 个，只能用【职业清单】里的 key；
- fos_ids：最适合来做这个岗位的本科专业方向，最多 3 个，只能用【专业 FOS 清单】里的 key。
按相关度从高到低排。实在对不上的留空数组，不要硬凑，不要编清单外的 key。
只返回 JSON：{"items":[{"n":序号,"related_career_ids":[],"fos_ids":[]}]}

岗位：
${lines}`;
  const r = await generateCheap(prompt, model, { jsonMode: true });
  await logTokenUsage({ tool_name: 'job-tagging', task_name: 'FOS + Career Tags', institution: jobs[0]?.company || '', model_id: r.model || model, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
  const items: any[] = parseJsonLoose(r.text)?.items || [];
  const out = new Map<number, { fos_ids: string[]; related_career_ids: string[] }>();
  for (const it of items) {
    const j = jobs[Number(it.n) - 1];
    if (!j) continue;
    const fos = [...new Set((it.fos_ids || []).map(String) as string[])].filter(k => cat.fosSet.has(k)).slice(0, 3);
    const occ = [...new Set((it.related_career_ids || []).map(String) as string[])].filter(k => cat.occSet.has(k)).slice(0, 3);
    out.set(j.id, { fos_ids: fos, related_career_ids: occ });
  }
  return out;
}

/** 给指定岗位（还没标过的）打标签并写库；入库后顺手调，或批量脚本用 */
export async function tagAndSave(ids: number[], model: string, batch = 20) {
  if (!ids.length) return 0;
  const { data } = await supabaseAdmin.from('jobs').select('id, name, job_function, summary_cn, responsibilities, overview, institute_or_company_name').in('id', ids);
  const rows = (data || []).map((j: any) => ({ ...j, company: j.institute_or_company_name }));
  let n = 0;
  for (let i = 0; i < rows.length; i += batch) {
    const m = await tagJobs(rows.slice(i, i + batch), model);
    for (const [id, v] of m) { const { error } = await supabaseAdmin.from('jobs').update(v).eq('id', id); if (!error) n++; }
  }
  return n;
}
