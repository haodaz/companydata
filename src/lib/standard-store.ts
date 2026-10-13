/**
 * 标准入库（服务端，迁移 022）：按去重键（规范化标准号）upsert；新行插入、已有行只填空；
 * 人工定论（通过 / 不通过 / 隐藏）的行不覆盖，人工锁定的字段不动。状态 / 被代替这类会变的字段允许刷新。
 * 适用职业取并集：同一条标准被不同职业搜到，就挂到每个职业上。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { FROZEN_REVIEW_STATUSES } from '@/lib/review-status';
import { STANDARD_EDITABLE_KEYS, computeStandardCompleteness, hasStandardValue, sanitizeStandard, standardDedupeKey } from '@/lib/standard-fields';

export interface UpsertResult { inserted: number; updated: number; skipped: number; ids: number[] }

export async function upsertStandards(rows: Record<string, any>[], opts: { searchId?: number | null; sources?: Record<string, Record<string, string>>; profession?: string | null } = {}): Promise<UpsertResult> {
  const clean = rows.map(r => sanitizeStandard(r)).filter(r => r.title);
  if (!clean.length) return { inserted: 0, updated: 0, skipped: 0, ids: [] };
  const now = new Date().toISOString();
  const keyed: Record<string, any>[] = clean.map(r => {
    const professions = Array.from(new Set([...(r.professions || []), ...(opts.profession ? [opts.profession] : [])]));
    return { ...r, professions, dedupe_key: standardDedupeKey(r) };
  });
  const keys = Array.from(new Set(keyed.map(r => r.dedupe_key)));
  const { data: existing } = await supabaseAdmin.from('industry_standards').select('*').in('dedupe_key', keys);
  const byKey = new Map<string, any>((existing || []).map(r => [r.dedupe_key, r]));
  const result: UpsertResult = { inserted: 0, updated: 0, skipped: 0, ids: [] };
  const seen = new Set<string>();

  for (const r of keyed) {
    if (seen.has(r.dedupe_key)) { result.skipped++; continue; }
    seen.add(r.dedupe_key);
    const src = opts.sources?.[r.dedupe_key] || opts.sources?.[r.code || ''] || opts.sources?.[r.title] || {};
    const cur = byKey.get(r.dedupe_key);
    if (!cur) {
      const row: Record<string, any> = { dedupe_key: r.dedupe_key, ai_sources: src, search_id: opts.searchId || null, human_review_status: 'review', created_at: now, updated_at: now };
      for (const k of STANDARD_EDITABLE_KEYS) if (r[k] !== undefined) row[k] = r[k];
      row.completeness_score = computeStandardCompleteness(row);
      const { data, error } = await supabaseAdmin.from('industry_standards').insert(row).select('id').single();
      if (error) throw new Error(`标准写入失败（${r.code || r.title}）: ${error.message}`);
      result.inserted++; result.ids.push(data.id);
      continue;
    }
    result.ids.push(cur.id);
    if (FROZEN_REVIEW_STATUSES.has(cur.human_review_status || '')) { result.skipped++; continue; }
    const locked = new Set<string>(cur.human_locked_fields || []);
    const updates: Record<string, any> = {};
    for (const k of STANDARD_EDITABLE_KEYS) {
      if (locked.has(k) || !hasStandardValue(r[k])) continue;
      if (k === 'professions') { const merged = Array.from(new Set([...(cur.professions || []), ...r.professions])); if (merged.length !== (cur.professions || []).length) updates.professions = merged; continue; }
      const refreshable = ['status', 'replaced_by', 'implement_date_str'].includes(k);
      if (!hasStandardValue(cur[k]) || (refreshable && cur[k] !== r[k])) updates[k] = r[k];
    }
    if (Object.keys(updates).length) {
      updates.ai_sources = { ...(cur.ai_sources || {}), ...src };
      updates.completeness_score = computeStandardCompleteness({ ...cur, ...updates });
      updates.updated_at = now;
      if (opts.searchId) updates.search_id = opts.searchId;
      await supabaseAdmin.from('industry_standards').update(updates).eq('id', cur.id);
      result.updated++;
    } else result.skipped++;
  }
  return result;
}
