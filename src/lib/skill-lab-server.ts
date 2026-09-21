/** 技能实验室 · 服务端公共函数 */
import { supabaseAdmin } from '@/lib/supabase';
import type { SkillCard } from '@/lib/skill-lab';

export const MIGRATION_HINT = '技能实验室的表还没建：请在 Supabase SQL Editor 执行 supabase/migrations/002_skill_lab.sql';

/** 表不存在时给出明确提示，而不是一串 PostgREST 报错 */
export function labError(e: any): { error: string; needMigration: boolean } {
  const msg = String(e?.message || e);
  const needMigration = /does not exist|schema cache|Could not find the table|PGRST205/i.test(msg);
  return { error: needMigration ? MIGRATION_HINT : msg, needMigration };
}

export async function loadSpace(id: string) {
  const { data: task, error } = await supabaseAdmin.from('skill_tasks').select('*, skill:skills(*)').eq('id', id).single();
  if (error) throw error;
  return task as any;
}

export const skillRef = (skill: any | null) => (skill?.card ? { name: skill.name as string, card: skill.card as SkillCard } : null);

export async function recordInvocation(row: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from('skill_invocations').insert(row);
  if (error) console.error('[SkillLab] invocation insert failed:', error.message);
}
