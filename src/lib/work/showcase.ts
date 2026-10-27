/**
 * 真活 · 任务库（明牌，2026-10-27）：挑一小部分好任务，去掉企业名（去头）给出任务的人浏览——只给题，不讲出题逻辑。
 * 选中一道后两种用法：
 *   · base 原题直出：结构、交付物、材料种类和坑、评分要点照搬，企业 / 背景 / 数字换成出任务的人自己的公司
 *   · ref  仅做参考：只借题型、推进方式和交付形态
 * 然后进填表或聊天，只问还不知道的（哪家企业；要找的人默认沿用）。
 * 展示用的去标识版本在 showcase.json（人工整理，低频）；生成时回读原任务全文（work_tasks.source_task_id）。
 * 和后台「样本库」不同：样本库是暗牌（后台训练出题能力，用户看不见），任务库是明牌。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import items from './showcase.json';

export type ShowcaseItem = {
  id: string; source_task_id: string; industry: string; direction: string; role: string; title: string; scenario: string;
  deliverables: { title: string; format?: string; module?: string }[]; materials: string[]; time_minutes?: number | null; env?: string;
};
export const SHOWCASE: ShowcaseItem[] = items as ShowcaseItem[];
export const showcaseById = (id?: string | null) => (id ? SHOWCASE.find(x => x.id === id) || null : null);

/** 对外列表：不带原任务 id */
export const publicShowcase = () => SHOWCASE.map(({ source_task_id: _s, ...x }) => x);

/** 回读原任务，拼成给生成器的原题全文（任务书 + 交付物 + 材料 + 评分要点）。原文里的企业名由生成器按规则替换掉 */
export async function baseTaskText(item: ShowcaseItem): Promise<string> {
  const { data: t } = await db.from('work_tasks').select('task, materials, rubric, problem').eq('id', item.source_task_id).maybeSingle();
  if (!t) return `任务：${item.title}\n${item.scenario}\n交付物：${item.deliverables.map(d => `${d.title}（${d.format || ''}，${d.module || ''}）`).join('；')}`;
  const T: any = t.task || {};
  const L: string[] = [];
  L.push(`### 任务书：${T.title || item.title}`, String(T.brief || ''));
  if (t.problem?.statement) L.push(`业务问题：${t.problem.statement}`);
  L.push('### 交付物', ...(T.deliverables || []).map((d: any) => `- ${d.title}（format：${d.format || '—'}；module：${d.module || '—'}）${d.desc ? `：${d.desc}` : ''}`));
  if (T.rules?.length) L.push('### 规则', ...T.rules.map((r: string) => `- ${r}`));
  L.push(`### 操作台：${T.env?.type || item.env || 'doc'}；建议用时 ${T.time_minutes || item.time_minutes || '—'} 分钟`);
  L.push('### 材料（原题的材料，看它们各自的作用和埋的坑）');
  for (const m of (t.materials || []) as any[]) L.push(`#### ${m.title}（${m.kind || ''}）\n${String(m.content || '').slice(0, 1800)}`);
  if (Array.isArray(t.rubric) && t.rubric.length) L.push('### 评分要点', ...t.rubric.map((r: any) => `- ${r.title}（${r.weight ?? ''}%）：${String(r.desc || '').slice(0, 200)}`));
  return L.join('\n').slice(0, 16000);
}
