/** 技能实验室 · 服务端公共函数 */
import { supabaseAdmin } from '@/lib/supabase';
import type { SkillCard } from '@/lib/skill-lab';
import type { Sim, SimTrace } from '@/lib/skill-sim';

export const MIGRATION_HINT = '技能实验室的表还没建：请在 Supabase SQL Editor 执行 supabase/migrations/002_skill_lab.sql';

/** 表不存在时给出明确提示，而不是一串 PostgREST 报错 */
export function labError(e: any): { error: string; needMigration: boolean } {
  const msg = String(e?.message || e);
  const needMigration = /does not exist|schema cache|Could not find the table|PGRST205/i.test(msg);
  return { error: needMigration ? MIGRATION_HINT : msg, needMigration };
}

export async function loadSpace(id: string, opts: { includeDrafts?: boolean } = {}) {
  const { data: task, error } = await supabaseAdmin.from('skill_tasks').select('*, skill:skills(*)').eq('id', id).single();
  if (error) throw error;
  (task as any).chapters = await loadChapters(task, opts);
  return task as any;
}

/** 一章 = 一段故事线。体验端只看已发布的；工作室看全部 */
export interface LabChapter {
  id: string | null;          // null = 迁移 015 还没跑 / 这个空间还没有章节，用 skill_tasks.sim 顶上的「第 1 章」
  seq: number;
  slot?: string | null;
  title: string;
  kind: 'daily' | 'incident' | 'assessment';
  brief?: string | null;
  sim: Sim;
  expert_trace?: SimTrace | null;
  rubric?: any;
  status: 'draft' | 'published';
  locked?: boolean;
}

export async function loadChapters(space: any, opts: { includeDrafts?: boolean } = {}): Promise<LabChapter[]> {
  try {
    let q = supabaseAdmin.from('lab_chapters').select('*').eq('task_id', space.id).order('seq');
    if (!opts.includeDrafts) q = q.eq('status', 'published');
    const { data, error } = await q;
    if (!error && data?.length) return data.filter((c: any) => c.sim?.steps?.length) as LabChapter[];
  } catch { /* 表还没建 */ }
  // 没有章节：现有故事线就是唯一的第 1 章
  return space.sim?.steps?.length
    ? [{ id: null, seq: 1, title: space.sim.title || space.title || '第 1 章', kind: 'daily', sim: space.sim, expert_trace: null, status: 'published' }]
    : [];
}

/** 章节自己的示范轨迹优先；没有就用空间技能里的（第 1 章默认如此，老师傅重新校正后立刻生效） */
export const chapterExpertTrace = (ch: LabChapter | null | undefined, space: any): SimTrace | null =>
  (ch?.expert_trace && Object.keys(ch.expert_trace).length ? ch.expert_trace : null) || space?.skill?.expert_trace || null;

/** 按编号取章节；不给 / 找不到就取第一章 */
export const pickChapter = (space: any, chapterId?: string | null): LabChapter | null =>
  (space.chapters as LabChapter[] || []).find(c => c.id && c.id === chapterId) || (space.chapters as LabChapter[] || [])[0] || null;

export const skillRef = (skill: any | null) => (skill?.card ? { name: skill.name as string, card: skill.card as SkillCard } : null);

export async function recordInvocation(row: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from('skill_invocations').insert(row);
  if (error) console.error('[SkillLab] invocation insert failed:', error.message);
}
