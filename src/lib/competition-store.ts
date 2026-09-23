/**
 * 赛事入库（服务端）：按去重键 upsert，新行插入、已有行只填空；
 * 人工定论（通过 / 不通过 / 隐藏）的行不覆盖，人工锁定的字段不动；主办方自动关联企业库。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { resolveCompanyId } from '@/lib/company-match';
import { FROZEN_REVIEW_STATUSES } from '@/lib/review-status';
import { COMPETITION_EDITABLE_KEYS, competitionDedupeKey, computeCompetitionCompleteness, hasCompetitionValue, sanitizeCompetition } from '@/lib/competition-fields';

export interface UpsertResult { inserted: number; updated: number; skipped: number; ids: number[] }

/** 主办方 → 企业库 id：整串 → 去掉括号 / 斜杠后的主名 → 检索时指定的主办企业兜底 */
async function resolveOrganizer(organizer: string | null, fallback?: { id?: number | null; name?: string | null }): Promise<number | null> {
  if (organizer) {
    const variants = Array.from(new Set([organizer, organizer.split(/[（(\/、,，]/)[0].trim(), organizer.replace(/（.*?）|\(.*?\)/g, '').trim()].filter(Boolean)));
    for (const v of variants) { const id = await resolveCompanyId(v); if (id) return id; }
  }
  if (fallback?.id && (!organizer || !fallback.name || organizer.toLowerCase().includes(fallback.name.toLowerCase()) || fallback.name.toLowerCase().includes(organizer.split(/[（(\/、,，]/)[0].trim().toLowerCase()))) return fallback.id;
  return null;
}

export async function upsertCompetitions(rows: Record<string, any>[], opts: { searchId?: number | null; sources?: Record<string, Record<string, string>>; companyId?: number | null; companyName?: string | null } = {}): Promise<UpsertResult> {
  const clean = rows.map(r => sanitizeCompetition(r)).filter(r => r.name);
  if (!clean.length) return { inserted: 0, updated: 0, skipped: 0, ids: [] };
  const now = new Date().toISOString();
  const keyed: Record<string, any>[] = clean.map(r => ({ ...r, dedupe_key: competitionDedupeKey(r) }));
  const keys = Array.from(new Set(keyed.map(r => r.dedupe_key)));
  const { data: existing } = await supabaseAdmin.from('competitions').select('*').in('dedupe_key', keys);
  const byKey = new Map<string, any>((existing || []).map(r => [r.dedupe_key, r]));
  const result: UpsertResult = { inserted: 0, updated: 0, skipped: 0, ids: [] };
  const seen = new Set<string>();

  for (const r of keyed) {
    if (seen.has(r.dedupe_key)) { result.skipped++; continue; }
    seen.add(r.dedupe_key);
    const organizer_company_id = await resolveOrganizer(r.organizer, { id: opts.companyId, name: opts.companyName });
    const src = opts.sources?.[r.dedupe_key] || opts.sources?.[r.name] || {};
    const cur = byKey.get(r.dedupe_key);

    if (!cur) {
      const row: Record<string, any> = { dedupe_key: r.dedupe_key, organizer_company_id, ai_sources: src, search_id: opts.searchId || null, human_review_status: 'review', created_at: now, updated_at: now };
      for (const k of COMPETITION_EDITABLE_KEYS) if (r[k] !== undefined) row[k] = r[k];
      if (r.registration_deadline) row.registration_deadline = r.registration_deadline;
      row.completeness_score = computeCompetitionCompleteness(row);
      const { data, error } = await supabaseAdmin.from('competitions').insert(row).select('id').single();
      if (error) throw new Error(`赛事写入失败（${r.name}）: ${error.message}`);
      result.inserted++; result.ids.push(data.id);
      continue;
    }

    result.ids.push(cur.id);
    if (FROZEN_REVIEW_STATUSES.has(cur.human_review_status || '')) { result.skipped++; continue; }
    const locked = new Set<string>(cur.human_locked_fields || []);
    const updates: Record<string, any> = {};
    for (const k of COMPETITION_EDITABLE_KEYS) {
      if (locked.has(k) || !hasCompetitionValue(r[k])) continue;
      // 状态 / 截止日期这类会变的字段允许刷新；其余只填空
      const refreshable = ['status', 'registration_deadline_str', 'registration_start_str', 'event_start_str', 'event_end_str'].includes(k);
      if (!hasCompetitionValue(cur[k]) || (refreshable && cur[k] !== r[k])) updates[k] = r[k];
    }
    if (r.registration_deadline && (!cur.registration_deadline || updates.registration_deadline_str)) updates.registration_deadline = r.registration_deadline;
    if (!cur.organizer_company_id && organizer_company_id) updates.organizer_company_id = organizer_company_id;
    if (Object.keys(updates).length) {
      updates.ai_sources = { ...(cur.ai_sources || {}), ...src };
      updates.completeness_score = computeCompetitionCompleteness({ ...cur, ...updates });
      updates.updated_at = now;
      if (opts.searchId) updates.search_id = opts.searchId;
      await supabaseAdmin.from('competitions').update(updates).eq('id', cur.id);
      result.updated++;
    } else result.skipped++;
  }
  return result;
}
