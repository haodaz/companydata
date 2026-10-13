/**
 * 跑一条标准检索（服务端，迁移 022）：检索候选 → 逐条抓官方页补题录与要点（并发 3）→ 入库 → 把 raw / 摘要 / 成本写回这条检索。
 * 后台「行业标准获取」页和打底脚本 scripts/standards-seed.mts 都调这里，不在前端编排。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { summarizeCost } from '@/lib/company-store';
import { searchStandards, enrichStandard } from '@/lib/agents/standard-radar';
import { upsertStandards } from '@/lib/standard-store';
import { standardDedupeKey } from '@/lib/standard-fields';

export const DEFAULT_STANDARD_MODEL = 'gemini-3.8-flash';

async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

export async function runStandardSearch(id: number, modelOverride?: string) {
  const { data: s, error } = await supabaseAdmin.from('standard_searches').select('*').eq('id', id).single();
  if (error || !s) throw new Error(error?.message || '检索不存在');
  const model = modelOverride || s.model_id || DEFAULT_STANDARD_MODEL;
  const batchId = Date.now();
  const log: string[] = [];
  await supabaseAdmin.from('standard_searches').update({ status: 'running', model_id: model, batch_id: batchId, error_message: null, updated_at: new Date().toISOString() }).eq('id', id);
  try {
    const found = await searchStandards({ query: s.query, profession: s.profession, industry: s.industry, kinds: s.kinds, docTypes: s.doc_types, count: s.count }, model, batchId);
    log.push(`检索：${found.candidates.length} 条候选`);
    const rows: Record<string, any>[] = [];
    const sources: Record<string, Record<string, string>> = {};
    const pages: any[] = [];
    if (s.enrich !== false) {
      const enriched = await pool(found.candidates, 3, async c => {
        try { return await enrichStandard(c, { profession: s.profession, industry: s.industry }, model, batchId); }
        catch (e: any) { log.push(`补全失败 ${c.code || c.title}：${e.message}`); return null; }
      });
      enriched.forEach((e, i) => {
        const c = found.candidates[i];
        if (!e) { rows.push({ ...c, operation_relevance: c.why }); return; }
        rows.push(e.fields); sources[standardDedupeKey(e.fields)] = e.sources || {};
        if (e.page.url) pages.push({ url: e.page.url, ok: e.page.ok, len: e.page.len, mismatch: e.mismatch, markdown: e.page.markdown.slice(0, 20000) });
        log.push(`${e.fields.code || e.fields.title} · ${e.mode === 'page' ? '官方页' : '联网'}${e.mismatch ? '（原链接不符）' : ''} · 要点 ${(e.fields.key_points || []).length} 条`);
      });
    } else for (const c of found.candidates) rows.push({ ...c, operation_relevance: c.why });

    const saved = await upsertStandards(rows, { searchId: id, sources, profession: s.profession });
    const cost = await summarizeCost(batchId);
    await supabaseAdmin.from('standard_searches').update({
      status: 'success', search_queries: found.searchQueries || [], raw_candidates: found.candidates, raw_pages: pages,
      structured_json: { standards: rows, ai_summary: found.summary, pipeline_log: log }, candidates_found: found.candidates.length,
      saved: saved.inserted + saved.updated, ...cost, updated_at: new Date().toISOString(),
    }).eq('id', id);
    return { ok: true, found: found.candidates.length, ...saved, cost };
  } catch (e: any) {
    const cost = await summarizeCost(batchId);
    await supabaseAdmin.from('standard_searches').update({ status: 'failed', error_message: String(e?.message || e).slice(0, 500), structured_json: { pipeline_log: log }, ...cost, updated_at: new Date().toISOString() }).eq('id', id);
    throw e;
  }
}
