/**
 * 职业实体库写库：
 *   upsertOccupation   按 external_id → 名称 认旧记录。mode=overwrite（数据部门导入，以对方为准）/ fill（AI，只填空）。
 *                      人工锁定的字段、审核已定论的记录（AI 模式）都不动。
 *   upsertSalaries     职业薪资子实体，按 (occupation_id, year) 一档一条。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { FROZEN_REVIEW_STATUSES } from '@/lib/review-status';
import { SALARY_YEARS, computeOccupationCompleteness, hasOccupationValue, occupationKey, sanitizeOccupation, type CareerGraph } from '@/lib/occupation-fields';
import type { RegionSalary } from '@/lib/agents/occupation-enrich';

export interface SalaryRow { year: string; salary: number | null; source_url?: string | null }

export async function findOccupation(by: { external_id?: string | null; name?: string | null }) {
  if (by.external_id) {
    const { data } = await supabaseAdmin.from('occupations').select('*').eq('external_id', by.external_id).eq('if_delete', false).maybeSingle();
    if (data) return data;
  }
  if (by.name) {
    const { data } = await supabaseAdmin.from('occupations').select('*').eq('if_delete', false).or(`name.eq.${JSON.stringify(by.name)},name_lang_cn.eq.${JSON.stringify(by.name)}`).limit(1);
    if (data?.[0]) return data[0];
    const { data: alias } = await supabaseAdmin.from('occupations').select('*').eq('if_delete', false).contains('aliases', [by.name]).limit(1);
    if (alias?.[0]) return alias[0];
  }
  return null;
}

export async function upsertOccupation(
  raw: Record<string, any>,
  opts: { mode: 'overwrite' | 'fill'; source: string; sources?: Record<string, string> },
): Promise<{ id: number; created: boolean; changed: string[]; skipped?: string }> {
  const clean = sanitizeOccupation(raw);
  if (!clean.name) throw new Error('缺职业名称');
  const external_id = String(raw.external_id || '').trim() || null;
  const existing = await findOccupation({ external_id, name: clean.name });

  if (!existing) {
    const key = clean.key || occupationKey(clean.name_lang_en);
    // 外部标识撞了（不同职业英文名转出同一个 key）：加 -2、-3
    let ext = external_id || key;
    if (ext && !external_id) for (let n = 2; ; n++) {
      const { data: hit } = await supabaseAdmin.from('occupations').select('id').eq('external_id', ext).maybeSingle();
      if (!hit) break;
      ext = `${key}-${n}`;
    }
    const row = {
      ...clean, key, external_id: ext, name_lang_cn: clean.name_lang_cn || clean.name,
      if_delete: raw.if_delete === true || raw.if_delete === '是', source: opts.source, ai_sources: opts.sources || {},
      human_review_status: 'review', completeness_score: computeOccupationCompleteness(clean),
    };
    const { data, error } = await supabaseAdmin.from('occupations').insert(row).select('id').single();
    if (error) throw error;
    return { id: data.id, created: true, changed: Object.keys(clean).filter(k => hasOccupationValue(clean[k])) };
  }

  if (opts.mode === 'fill' && FROZEN_REVIEW_STATUSES.has(existing.human_review_status || '')) return { id: existing.id, created: false, changed: [], skipped: '已审核定论' };
  const locked = new Set<string>(existing.human_locked_fields || []);
  const patch: Record<string, any> = {};
  for (const [k, v] of Object.entries(clean)) {
    if (locked.has(k) || !hasOccupationValue(v)) continue;
    if (opts.mode === 'fill' && hasOccupationValue(existing[k])) continue;
    if (k === 'aliases') { const merged = Array.from(new Set([...(existing.aliases || []), ...v])); if (merged.length !== (existing.aliases || []).length) patch.aliases = merged; continue; }
    if (JSON.stringify(existing[k]) !== JSON.stringify(v)) patch[k] = v;
  }
  if (external_id && !existing.external_id) patch.external_id = external_id;
  if (!existing.key && !locked.has('key')) { const k = occupationKey(patch.name_lang_en || existing.name_lang_en); if (k) patch.key = k; }
  if (opts.sources) {
    const kept = Object.fromEntries(Object.entries(opts.sources).filter(([k]) => k in patch));
    if (Object.keys(kept).length) patch.ai_sources = { ...(existing.ai_sources || {}), ...kept };
  }
  const changed = Object.keys(patch).filter(k => k !== 'ai_sources');
  if (changed.length) {
    patch.completeness_score = computeOccupationCompleteness({ ...existing, ...patch });
    patch.updated_at = new Date().toISOString();
    const { error } = await supabaseAdmin.from('occupations').update(patch).eq('id', existing.id);
    if (error) throw error;
  }
  return { id: existing.id, created: false, changed };
}

/** 薪资：overwrite 覆盖同档，fill 只补没有的档 */
export async function upsertSalaries(occupationId: number, rows: SalaryRow[], mode: 'overwrite' | 'fill'): Promise<number> {
  const valid = rows.filter(r => SALARY_YEARS.includes(r.year) && Number.isFinite(Number(r.salary)) && Number(r.salary) > 0);
  if (!valid.length) return 0;
  const { data: have } = await supabaseAdmin.from('occupation_salaries').select('year, salary').eq('occupation_id', occupationId).eq('if_delete', false);
  const haveYears = new Set((have || []).filter(h => h.salary).map(h => h.year));
  const write = valid.filter(r => mode === 'overwrite' || !haveYears.has(r.year))
    .map(r => ({ occupation_id: occupationId, year: r.year, salary: Math.round(Number(r.salary)), source_url: r.source_url || null, if_delete: false, updated_at: new Date().toISOString() }));
  if (!write.length) return 0;
  const { error } = await supabaseAdmin.from('occupation_salaries').upsert(write, { onConflict: 'occupation_id,year' });
  if (error) throw error;
  await refreshCompleteness(occupationId);
  return write.length;
}

export async function refreshCompleteness(occupationId: number) {
  const [{ data: o }, { count }] = await Promise.all([
    supabaseAdmin.from('occupations').select('*').eq('id', occupationId).single(),
    supabaseAdmin.from('occupation_salaries').select('id', { count: 'exact', head: true }).eq('occupation_id', occupationId).eq('if_delete', false),
  ]);
  if (o) await supabaseAdmin.from('occupations').update({ completeness_score: computeOccupationCompleteness(o, count || 0) }).eq('id', occupationId);
}

/** 发展图谱：整张图一起存；人工锁定了 career_map 的不覆盖；fill 模式下已有图谱也不覆盖 */
export async function saveCareerMap(occupationId: number, graph: CareerGraph, mode: 'overwrite' | 'fill'): Promise<boolean> {
  const { data: o } = await supabaseAdmin.from('occupations').select('career_map, human_locked_fields').eq('id', occupationId).single();
  if (!o || (o.human_locked_fields || []).includes('career_map')) return false;
  if (mode === 'fill' && o.career_map?.skills?.length) return false;
  const { error } = await supabaseAdmin.from('occupations').update({ career_map: graph, career_map_at: new Date().toISOString() }).eq('id', occupationId);
  if (error) throw error;
  return true;
}

/** 分国家 / 地区薪资：overwrite 覆盖同地区，fill 只补没有的地区 */
export async function upsertRegionSalaries(occupationId: number, rows: RegionSalary[], mode: 'overwrite' | 'fill'): Promise<number> {
  if (!rows.length) return 0;
  const { data: have } = await supabaseAdmin.from('occupation_region_salaries').select('scope, code').eq('occupation_id', occupationId).eq('if_delete', false);
  const haveKeys = new Set((have || []).map(h => `${h.scope}:${h.code}`));
  const write = rows.filter(r => mode === 'overwrite' || !haveKeys.has(`${r.scope}:${r.code}`))
    .map(r => ({ occupation_id: occupationId, ...r, if_delete: false, updated_at: new Date().toISOString() }));
  if (!write.length) return 0;
  const { error } = await supabaseAdmin.from('occupation_region_salaries').upsert(write, { onConflict: 'occupation_id,scope,code' });
  if (error) throw error;
  return write.length;
}

/** 合并重复职业：drop 的名称 / 别名并进 keep 的别名，keep 没有的薪资档 / 地区薪资挪过去，drop 软删 */
export async function mergeOccupations(keepId: number, dropId: number) {
  const { data: rows } = await supabaseAdmin.from('occupations').select('*').in('id', [keepId, dropId]);
  const keep = rows?.find(r => r.id === keepId), drop = rows?.find(r => r.id === dropId);
  if (!keep || !drop) throw new Error('职业不存在');
  const aliases = Array.from(new Set([...(keep.aliases || []), drop.name, ...(drop.aliases || [])])).filter(a => a && a !== keep.name);
  const patch: Record<string, any> = { aliases, updated_at: new Date().toISOString() };
  for (const k of ['intro', 'responsibility', 'position_requirement', 'recent_year_monthly_salary', 'relevant_certificates', 'relevant_celebrities', 'name_lang_en', 'career_category', 'career_mid_category', 'career_map']) {
    if (!hasOccupationValue(keep[k]) && hasOccupationValue(drop[k])) patch[k] = drop[k];
  }
  await supabaseAdmin.from('occupations').update(patch).eq('id', keepId);
  const { data: ds } = await supabaseAdmin.from('occupation_salaries').select('year, salary, source_url').eq('occupation_id', dropId).eq('if_delete', false);
  await upsertSalaries(keepId, (ds || []) as SalaryRow[], 'fill');
  const { data: dr } = await supabaseAdmin.from('occupation_region_salaries').select('scope, code, name, currency, monthly_local, monthly_cny, data_year, source_url, note').eq('occupation_id', dropId).eq('if_delete', false);
  if (dr?.length) await upsertRegionSalaries(keepId, dr as RegionSalary[], 'fill');
  await supabaseAdmin.from('occupations').update({ if_delete: true, human_review_note: `合并进 #${keepId} ${keep.name}`, updated_at: new Date().toISOString() }).eq('id', dropId);
  await refreshCompleteness(keepId);
}
