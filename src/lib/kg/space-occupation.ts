/**
 * 百业空间 ↔ 职业库：和「和我聊」的 occupationOfSpace 同一套规则（空间的职业名 → JD 岗位名 → 职人角色，
 * 依次在职业库里找名称 / 中文名完全一致的，再找别名里有的；第一个对上的就是）。一次把所有空间算完，给职业详情页「百业空间」用。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { selectAll } from '@/lib/supabase-all';

export function spaceNameCandidates(space: any): string[] {
  return [space?.jd_snapshot?.career?.profession, space?.jd_snapshot?.title, space?.profile?.role].filter(Boolean).map((n: any) => String(n).trim());
}

/** 空间 id → 职业 id（对不上的不在表里） */
export async function spaceOccupationMap(): Promise<Map<string, number>> {
  const [{ data: occ }, { data: spaces }] = await Promise.all([
    selectAll(() => supabaseAdmin.from('occupations').select('id, name, name_lang_cn, aliases').eq('if_delete', false).order('id')),
    selectAll(() => supabaseAdmin.from('skill_tasks').select('id, jd_snapshot, profile').order('created_at')),
  ]);
  const byName = new Map<string, number>(), byAlias = new Map<string, number>();
  for (const o of occ as any[]) {
    for (const n of [o.name, o.name_lang_cn]) if (n && !byName.has(n)) byName.set(n, o.id);
    for (const a of o.aliases || []) if (a && !byAlias.has(a)) byAlias.set(a, o.id);
  }
  const out = new Map<string, number>();
  for (const s of spaces as any[]) {
    for (const n of spaceNameCandidates(s)) {
      const id = byName.get(n) ?? byAlias.get(n);
      if (id) { out.set(s.id, id); break; }
    }
  }
  return out;
}
