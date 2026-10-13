/**
 * 给一个职业补某一块知识（职业问答日志「排任务」用；和 /api/agents/occupation 同一套，只填空 / 补没有的）。
 *   profile 职业画像 + 年限薪资 | career 发展图谱 | regions 分国家 / 地区薪资 | context 场所与工具 | tasks 典型任务与工位
 */
import { supabaseAdmin } from '@/lib/supabase';
import { researchCareerGraph, researchOccupation, researchOccupationContext, researchOccupationTasks, researchRegionSalaries } from '@/lib/agents/occupation-enrich';
import { saveCareerMap, upsertOccupation, upsertRegionSalaries, upsertSalaries } from '@/lib/occupation-store';
import { saveOccupationContext, saveTasksAndStations } from '@/lib/entity-store';

export const FILL_PARTS: Record<string, string> = { profile: '职业画像 + 年限薪资', career: '发展图谱', regions: '分地区薪资', context: '场所与工具', tasks: '典型任务与工位' };

export async function fillOccupationPart(occupationId: number, part: string, model = 'gemini-3.8-flash') {
  const { data: o } = await supabaseAdmin.from('occupations').select('*').eq('id', occupationId).single();
  if (!o) throw new Error('职业不存在');
  const b = Date.now();
  if (part === 'profile') {
    const r = await researchOccupation(o, model, b);
    const saved = await upsertOccupation({ ...r.fields, name: o.name, external_id: o.external_id }, { mode: 'fill', source: 'ai', sources: r.sources });
    return { changed: saved.changed.length, salaries: await upsertSalaries(o.id, r.salaries, 'fill') };
  }
  if (part === 'career') return { graph: await saveCareerMap(o.id, await researchCareerGraph(o, model, b), 'overwrite') };
  if (part === 'regions') return { regions: await upsertRegionSalaries(o.id, await researchRegionSalaries(o, model, b), 'overwrite') };
  if (part === 'context') return saveOccupationContext(o.id, await researchOccupationContext(o, model, b));
  if (part === 'tasks') {
    const { data: ex } = await supabaseAdmin.from('typical_tasks').select('name').eq('occupation_id', o.id).eq('if_delete', false);
    return saveTasksAndStations(o.id, await researchOccupationTasks(o, model, b, { existingTasks: (ex || []).map(t => t.name) }), 'ai');
  }
  throw new Error(`不认识的补全：${part}`);
}
