/** 百业工厂 · 工作室服务端：读空间的全部章节（含草稿、含空章）并带上校验结果 */
import { supabaseAdmin } from '@/lib/supabase';
import { sortByDay } from '@/lib/skill-lab-server';
import { checkAll, type StudioChapter } from '@/lib/lab-studio';
import { loadCast } from '@/lib/lab-cast-server';
import { loadBasis } from '@/lib/lab-standards';

export async function loadStudio(id: string) {
  const { data: task, error } = await supabaseAdmin.from('skill_tasks')
    .select('id, title, profile, jd_snapshot, bible, sim, skill:skills(id, name, expert_name, expert_trace, source)').eq('id', id).single();
  if (error) throw error;
  const { data, error: e2 } = await supabaseAdmin.from('lab_chapters').select('*').eq('task_id', id).order('seq');
  if (e2) throw e2;
  const chapters = sortByDay((data || []) as StudioChapter[]);
  const skill: any = Array.isArray((task as any).skill) ? (task as any).skill[0] : (task as any).skill;
  const { sim: _legacy, ...space } = task as any;
  const cast = await loadCast(id);
  // 工位规则的出处（迁移 022 / 023；没跑迁移时 loadBasis 返回空）：校验器 [S1] / [S2] 用
  const basis = await loadBasis(id);
  return { space: { ...space, skill: skill ? { ...skill, expert_trace: undefined, has_trace: !!skill.expert_trace } : null }, chapters, cast, basis, issues: checkAll(chapters, skill?.expert_trace || null, 1, basis), expertTrace: skill?.expert_trace || null };
}
