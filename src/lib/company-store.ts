/**
 * 企业画像入库（服务端）
 *   applyProfileBundle — 画像字段只填空（人工锁定字段不动；审核已定论的企业只写子实体）；三个子实体按去重键 upsert
 *   refreshCompleteness — 重算完整度
 *   summarizeCost — 按 batch_id 汇总这次流水线的调用次数 / token / 费用
 */
import { supabaseAdmin } from '@/lib/supabase';
import { PIPELINE_FIELDS, computeCompanyCompleteness, hasValue, type SubEntityKey } from '@/lib/company-fields';
import { FROZEN_REVIEW_STATUSES } from '@/lib/review-status';
import { financingKey, newsKey, executiveKey, normalizeFinancing, normalizeNews, normalizeExecutive, normalizeProfileValue, type ProfileBundle } from '@/lib/company-merge';

export async function subEntityCounts(companyId: number): Promise<Record<SubEntityKey, number>> {
  const [f, n, e] = await Promise.all([
    supabaseAdmin.from('company_financings').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('if_delete', false),
    supabaseAdmin.from('company_news').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('if_delete', false),
    supabaseAdmin.from('company_executives').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('if_delete', false),
  ]);
  return { financings: f.count || 0, news: n.count || 0, executives: e.count || 0 };
}

export async function refreshCompleteness(companyId: number): Promise<number> {
  const { data: company } = await supabaseAdmin.from('companies').select('*').eq('id', companyId).single();
  if (!company) return 0;
  const score = computeCompanyCompleteness(company, await subEntityCounts(companyId));
  await supabaseAdmin.from('companies').update({ completeness_score: score }).eq('id', companyId);
  return score;
}

export async function summarizeCost(batchId: number | null | undefined) {
  if (!batchId) return { llm_calls: 0, token_total: 0, cost_usd: 0 };
  const { data } = await supabaseAdmin.from('token_usage_logs').select('total_tokens, total_cost_usd').eq('batch_id', batchId).limit(1000);
  const rows = data || [];
  return {
    llm_calls: rows.length,
    token_total: rows.reduce((a, r) => a + (r.total_tokens || 0), 0),
    cost_usd: Math.round(rows.reduce((a, r) => a + (parseFloat(r.total_cost_usd) || 0), 0) * 1e6) / 1e6,
  };
}

/** 子实体 upsert：新行插入；已有行只填空；人工定论（通过 / 不通过 / 隐藏）或人工锁定的字段不动 */
async function upsertRows(table: string, companyId: number, logId: number, rows: Record<string, any>[], keyOf: (r: any) => string): Promise<number> {
  if (!rows.length) return 0;
  const keyed = rows.map(r => ({ ...r, company_id: companyId, dedupe_key: keyOf(r), log_id: logId }));
  const keys = keyed.map(r => r.dedupe_key);
  const { data: existing } = await supabaseAdmin.from(table).select('*').in('dedupe_key', keys);
  const byKey = new Map<string, any>((existing || []).map(r => [r.dedupe_key, r]));
  const now = new Date().toISOString();
  let saved = 0;

  const inserts = keyed.filter(r => !byKey.has(r.dedupe_key)).map(r => ({ ...r, human_review_status: 'review', created_at: now, updated_at: now }));
  if (inserts.length) {
    const { error } = await supabaseAdmin.from(table).insert(inserts);
    if (error) throw new Error(`${table} 写入失败: ${error.message}`);
    saved += inserts.length;
  }

  for (const r of keyed) {
    const cur = byKey.get(r.dedupe_key);
    if (!cur || FROZEN_REVIEW_STATUSES.has(cur.human_review_status || '')) continue;
    const locked = new Set<string>(cur.human_locked_fields || []);
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(r)) {
      if (['company_id', 'dedupe_key', 'log_id'].includes(k) || locked.has(k)) continue;
      if (hasValue(v) && !hasValue(cur[k])) updates[k] = v;
    }
    if (cur.if_delete) continue;   // 人工删除过的不复活
    if (Object.keys(updates).length) {
      updates.updated_at = now; updates.log_id = logId;
      await supabaseAdmin.from(table).update(updates).eq('id', cur.id);
      saved++;
    }
  }
  return saved;
}

export interface ApplyResult { filled: string[]; financings_saved: number; news_saved: number; executives_saved: number; completeness_before: number; completeness_after: number; frozen: boolean }

export async function applyProfileBundle(logId: number, companyId: number, bundle: ProfileBundle): Promise<ApplyResult> {
  const { data: company, error } = await supabaseAdmin.from('companies').select('*').eq('id', companyId).single();
  if (error || !company) throw new Error('企业不存在');
  const before = computeCompanyCompleteness(company, await subEntityCounts(companyId));
  const frozen = FROZEN_REVIEW_STATUSES.has(company.human_review_status || '');
  const locked = new Set<string>(company.human_locked_fields || []);
  const now = new Date().toISOString();

  // 1. 画像字段：只填空
  const filled: string[] = [];
  const updates: Record<string, any> = {};
  if (!frozen) {
    for (const k of PIPELINE_FIELDS) {
      if (locked.has(k)) continue;
      const v = normalizeProfileValue(k, bundle.profile?.[k]);
      if (!hasValue(v) || hasValue(company[k])) continue;
      updates[k] = v; filled.push(k);
    }
    if (filled.length) {
      updates.profile_source = { ...(company.profile_source || {}), ...Object.fromEntries(filled.filter(k => bundle.sources?.[k]).map(k => [k, bundle.sources[k]])) };
      updates.profile_updated_at = now;
      if (!company.human_review_status) updates.human_review_status = 'review';
    }
  }

  // 2. 子实体
  const financings = (bundle.financings || []).map(normalizeFinancing).filter(Boolean) as any[];
  const news = (bundle.news || []).map(normalizeNews).filter(Boolean) as any[];
  const executives = (bundle.executives || []).map(normalizeExecutive).filter(Boolean) as any[];
  const [fs, ns, es] = await Promise.all([
    upsertRows('company_financings', companyId, logId, financings, r => financingKey(companyId, r)),
    upsertRows('company_news', companyId, logId, news, r => newsKey(companyId, r)),
    upsertRows('company_executives', companyId, logId, executives, r => executiveKey(companyId, r)),
  ]);

  // 3. 完整度 + 画像时间
  const merged = { ...company, ...updates };
  const after = computeCompanyCompleteness(merged, await subEntityCounts(companyId));
  updates.completeness_score = after;
  updates.profile_crawled_at = now;
  updates.profile_log_id = logId;
  updates.updated_at = now;
  const { error: upErr } = await supabaseAdmin.from('companies').update(updates).eq('id', companyId);
  if (upErr) throw new Error(`companies 更新失败: ${upErr.message}`);

  return { filled, financings_saved: fs, news_saved: ns, executives_saved: es, completeness_before: before, completeness_after: after, frozen };
}
