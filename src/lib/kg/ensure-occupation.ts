/**
 * 新建百业空间自动建档、对上职业（用户 10-13：「新建空间时自动建档对上职业」）：
 *   先用空间的岗位名 / 职人角色 / 职业地图里的职业名去职业库找（名称 / 别名）；找不到就联网建一个职业档案（只填空，待审核），
 *   空间里的叫法都记进别名；然后后台把发展图谱、场所工具、典型任务、地区薪资补上——这样新职人一建好就有知识库。
 * 只读 /lab 的表。
 */
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { findOccupation, upsertOccupation, upsertSalaries } from '@/lib/occupation-store';
import { researchOccupation } from '@/lib/agents/occupation-enrich';
import { fillOccupationPart } from '@/lib/kg/fill-occupation';

const namesOf = (space: any) => Array.from(new Set([space?.jd_snapshot?.career?.profession, space?.jd_snapshot?.title, space?.profile?.role]
  .filter(Boolean).map((x: string) => String(x).trim()))) as string[];

export async function ensureOccupationForSpace(spaceOrId: any, opts: { deep?: boolean } = {}) {
  const space = typeof spaceOrId === 'string'
    ? (await supabaseAdmin.from('skill_tasks').select('id, title, jd_snapshot, profile').eq('id', spaceOrId).single()).data
    : spaceOrId;
  if (!space) return null;
  const names = namesOf(space);
  for (const n of names) { const o = await findOccupation({ name: n }); if (o) return o; }
  if (!names.length) return null;
  // 建档：模型给规范职业名，空间里的叫法进别名
  const r = await researchOccupation({ name: names[0], aliases: names.slice(1) }, 'gemini-3.8-flash', Date.now());
  const canonical = String(r.fields.name || names[0]).trim();
  const aliases = Array.from(new Set([...(r.fields.aliases || []), ...names].filter(a => a && a !== canonical)));
  const saved = await upsertOccupation({ ...r.fields, name: canonical, aliases }, { mode: 'fill', source: 'ai', sources: r.sources });
  await upsertSalaries(saved.id, r.salaries, 'fill');
  if (opts.deep) for (const part of ['career', 'context', 'tasks', 'regions']) await fillOccupationPart(saved.id, part).catch(e => console.warn('[ensure-occupation]', part, e?.message));
  return (await supabaseAdmin.from('occupations').select('*').eq('id', saved.id).single()).data;
}

/** 建空间的接口里调：响应先回去，建档和补全在后台跑 */
export function ensureOccupationLater(spaceId: string) {
  try { after(() => ensureOccupationForSpace(spaceId, { deep: true }).then(() => {}, e => console.warn('[ensure-occupation]', e?.message))); } catch { /* 不在请求上下文 */ }
}
