/**
 * 模型批量归一：规则对不上的信号、企业库里五花八门的行业写法，一批交给模型归到标准口径。
 * 企业行业的写法归一结果写进 taxonomy_aliases，下次直接查表（同一个说法只花一次 token）。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';
import { generateCheap } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import { resolveCompanyLoose } from '@/lib/company-match';
import { sourceLabel } from '@/lib/flywheel/sources';
import { FAMILIES, INDUSTRIES, JOB_FUNCTIONS, aliasKey, cleanProfession, industryByRule, isEmployer } from '@/lib/flywheel/taxonomy';
import { aliasMap, invalidateAliases } from '@/lib/flywheel/signals';

const pick = <T extends string>(list: readonly T[], v: unknown): T | null => (list as readonly string[]).includes(String(v)) ? (v as T) : null;

/** 企业库里的行业写法 → 标准行业（只处理词典里没有、规则也对不上的） */
export async function normalizeCompanyIndustries(model: string): Promise<number> {
  // 别的进程（回填脚本、另一次检测）可能刚写过词典：先丢掉缓存再读，免得同一批写法又让模型归一一遍
  invalidateAliases();
  const aliases = await aliasMap();
  const { data } = await selectAll(() => supabaseAdmin.from('companies').select('industry, sub_industry').order('id'));
  const raws = new Set<string>();
  for (const c of data as any[]) for (const v of [c.industry, c.sub_industry]) {
    if (!v || !String(v).trim()) continue;
    const k = aliasKey(String(v));
    if (!aliases.has(`industry:${k}`)) raws.add(String(v).trim());
  }
  const list = [...raws];
  let added = 0;
  for (let i = 0; i < list.length; i += 80) {
    const batch = list.slice(i, i + 80);
    const prompt = `把下面每个「行业写法」归到一个标准行业。标准行业只能取：${INDUSTRIES.join(' / ')}。
${batch.map((s, k) => `${k + 1}. ${s}`).join('\n')}
返回 JSON：{ "items": [{ "n": 编号, "industry": "标准行业" }] }`;
    const r = await generateCheap(prompt, model, { jsonMode: true, fast: true });
    await logTokenUsage({ tool_name: 'flywheel', task_name: 'Normalize · 企业行业', institution: '', model_id: r.model || model, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
    const items = parseJsonLoose(r.text)?.items || [];
    const rows = (Array.isArray(items) ? items : []).map((x: any) => {
      const raw = batch[Number(x?.n) - 1];
      const canonical = pick(INDUSTRIES, x?.industry) || (raw ? industryByRule(raw) : null);
      return raw && canonical ? { dim: 'industry', raw: aliasKey(raw), canonical, by: 'llm' } : null;
    }).filter(Boolean) as any[];
    if (rows.length) {
      // 人工改过的（by=human）不覆盖：先查出来剔掉
      const { data: human } = await supabaseAdmin.from('taxonomy_aliases').select('raw').eq('dim', 'industry').eq('by', 'human').in('raw', rows.map(r => r.raw));
      const keep = new Set((human || []).map(h => h.raw));
      const fresh = rows.filter(r => !keep.has(r.raw));
      if (fresh.length) await supabaseAdmin.from('taxonomy_aliases').upsert(fresh, { onConflict: 'dim,raw' });
      added += fresh.length;
    }
  }
  if (added) invalidateAliases();
  return added;
}

/** 还没归一完的信号：一批 40 条，只补空着的口径 */
export async function normalizePending(model: string, limit = 400): Promise<{ done: number; batches: number }> {
  const { data } = await supabaseAdmin.from('demand_signals')
    .select('id, source, query, company_name, industry, job_function, career_family, profession, company_id')
    .is('normalized_at', null).order('created_at', { ascending: false }).limit(limit);
  const rows = data || [];
  let done = 0, batches = 0;
  const chunks: typeof rows[] = [];
  for (let i = 0; i < rows.length; i += 40) chunks.push(rows.slice(i, i + 40));
  // 四批并行：一千条信号从十几分钟降到几分钟
  const runChunk = async (batch: typeof rows) => {
    batches++;
    const prompt = `下面是一批「有人在意什么」的需求信号（来源｜原话）。把每条归到四个口径，归不出的填 null，不要硬猜：
- industry 行业，只能取：${INDUSTRIES.join(' / ')}
- job_function 职能，只能取：${JOB_FUNCTIONS.join(' / ')}
- career_family 职业领域，只能取：${FAMILIES.join(' / ')}
- profession 原话里明确提到的具体职业 / 岗位名（如「焊接工程师」「咖啡师」「AI 产品经理」），没有就 null
- company 原话里明确提到的一家企业 / 机构的名称（原文），没有就 null

${batch.map((r, k) => `${k + 1}. ${sourceLabel(r.source)}｜${String(r.query || r.company_name || '').slice(0, 300)}`).join('\n')}

返回 JSON：{ "items": [{ "n": 编号, "industry": null, "job_function": null, "career_family": null, "profession": null, "company": null }] }`;
    let items: any[] = [];
    try {
      const r = await generateCheap(prompt, model, { jsonMode: true, fast: true });
      await logTokenUsage({ tool_name: 'flywheel', task_name: 'Normalize · 需求信号', institution: '', model_id: r.model || model, usageMetadata: r.usageMetadata, success: true }).catch(() => {});
      items = parseJsonLoose(r.text)?.items || [];
    } catch (e: any) {
      if (/402|Payment Required|credits are depleted|insufficient_quota|exceeded your current quota/i.test(e?.message || '')) throw e;
      console.warn('[flywheel] normalize batch failed', e?.message);
      return;
    }
    const byN = new Map<number, any>((Array.isArray(items) ? items : []).map((x: any) => [Number(x?.n), x]));
    const now = new Date().toISOString();
    for (let k = 0; k < batch.length; k++) {
      const r = batch[k], x = byN.get(k + 1) || {};
      const patch: Record<string, any> = { normalized_at: now, normalized_by: 'llm' };
      if (!r.industry) patch.industry = pick(INDUSTRIES, x.industry);
      if (!r.job_function) patch.job_function = pick(JOB_FUNCTIONS, x.job_function);
      if (!r.career_family) { const f = pick(FAMILIES, x.career_family); patch.career_family = f === '其他' ? null : f; }
      if (!r.profession && cleanProfession(x.profession)) patch.profession = cleanProfession(x.profession);
      if (!r.company_id && typeof x.company === 'string' && isEmployer(x.company)) {
        const name = x.company.trim().slice(0, 100);
        patch.company_name = r.company_name || name;
        patch.company_id = await resolveCompanyLoose(name).catch(() => null);
      }
      const hasAny = r.industry || r.job_function || r.career_family || r.company_id || Object.keys(patch).some(k2 => !['normalized_at', 'normalized_by'].includes(k2) && patch[k2]);
      if (!hasAny) patch.normalized_by = 'none';
      await supabaseAdmin.from('demand_signals').update(patch).eq('id', r.id);
      done++;
    }
  };
  for (let i = 0; i < chunks.length; i += 4) await Promise.all(chunks.slice(i, i + 4).map(runChunk));
  return { done, batches };
}
