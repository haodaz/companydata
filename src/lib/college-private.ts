/**
 * 百业学院 · 私域课（迁移 061，2026-11-03）：实验室拿自己的材料来联合培养科研 AI，材料只归这一家（org_id = ws_orgs.id）。
 *   listMaterials / addMaterial   读写六类材料（研究方向 / 组内规格 / 实验要求 / 内部文献 / 组内设备 / 私域知识）
 *   privatePack                   拼成「私域知识包」装进学员的作答提示（考这家的题时用）；出题用的那份内部文献要排除，不然等于给答案
 */
import { supabaseAdmin as db } from '@/lib/supabase';

export const KINDS = [
  { key: 'direction', name: '研究方向' }, { key: 'spec', name: '组内规格' }, { key: 'requirement', name: '实验要求' },
  { key: 'literature', name: '内部文献' }, { key: 'equipment', name: '组内设备' }, { key: 'knowhow', name: '私域知识' },
] as const;
export type Kind = typeof KINDS[number]['key'];
export type Material = { id: string; org_id: string; kind: Kind; title: string; body: string; file_url: string | null; source: string; is_demo: boolean; created_by: string | null; created_at: string; updated_at: string };

export async function listMaterials(orgId: string) {
  const { data, error } = await db.from('college_private_materials').select('*').eq('org_id', orgId).eq('if_delete', false).order('kind').order('created_at');
  if (error) throw error;
  return (data || []) as Material[];
}

export async function addMaterial(m: { org_id: string; kind: Kind; title: string; body: string; file_url?: string | null; source?: string; is_demo?: boolean; created_by?: string | null }) {
  if (!KINDS.some(k => k.key === m.kind)) throw new Error('材料类型不对');
  if (!m.title?.trim() || !m.body?.trim()) throw new Error('标题和正文都要有');
  const { data, error } = await db.from('college_private_materials').insert({ ...m, title: m.title.trim().slice(0, 200), body: m.body.trim().slice(0, 60000), source: m.source || 'lab', is_demo: !!m.is_demo }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function updateMaterial(id: string, patch: { title?: string; body?: string; kind?: Kind }, by: string) {
  const { error } = await db.from('college_private_materials').update({ ...patch, source: 'lab', created_by: by, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

/** 私域知识包：按类型分段拼起来；exclude = 不放进来的材料（出题用的那份内部文献） */
export async function privatePack(orgId: string, opts: { exclude?: string[]; max?: number } = {}) {
  const ms = (await listMaterials(orgId)).filter(m => !(opts.exclude || []).includes(m.id) && !(opts.exclude || []).includes(m.title));
  const { data: org } = await db.from('ws_orgs').select('name').eq('id', orgId).maybeSingle();
  const parts = KINDS.map(k => { const xs = ms.filter(m => m.kind === k.key); return xs.length ? `### ${k.name}\n${xs.map(m => `【${m.title}】\n${m.body}`).join('\n\n')}` : ''; }).filter(Boolean);
  return parts.length ? `## ${org?.name || '本实验室'}的私域资料（只给本实验室用；和公开资料冲突时以这里为准）\n${parts.join('\n\n')}`.slice(0, opts.max || 24000) : '';
}
