/** AI 百业 · 生成任务（lab_jobs，迁移 015）：进度落库，多副本 / 重启都不丢；前端按任务轮询 */
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export type JobKind = 'build_day' | 'build_chapter';

/** 建一条任务，真正的活放到响应之后跑（after），立刻把任务编号还给前端 */
export async function startJob(taskId: string, chapterId: string | null, kind: JobKind, work: (progress: (phase: string, detail?: string) => Promise<void>) => Promise<string>) {
  // 同一章 / 同一个空间的骨架，已经有在跑的就别再起一个
  let q = supabaseAdmin.from('lab_jobs').select('id').eq('task_id', taskId).eq('kind', kind).eq('status', 'running').gte('updated_at', new Date(Date.now() - 15 * 60_000).toISOString());
  q = chapterId ? q.eq('chapter_id', chapterId) : q;
  const { data: busy } = await q;
  if (busy?.length) return { id: busy[0].id as string, already: true };
  const { data, error } = await supabaseAdmin.from('lab_jobs').insert({ task_id: taskId, chapter_id: chapterId, kind, status: 'running', phase: '排队' }).select('id').single();
  if (error) throw error;
  const id = data.id as string;
  const progress = async (phase: string, detail?: string) => { await supabaseAdmin.from('lab_jobs').update({ phase, detail: detail || null, updated_at: new Date().toISOString() }).eq('id', id); };
  after(async () => {
    try {
      const detail = await work(progress);
      await supabaseAdmin.from('lab_jobs').update({ status: 'done', phase: '完成', detail, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
    } catch (e: any) {
      console.error('[lab-jobs]', kind, e);
      await supabaseAdmin.from('lab_jobs').update({ status: 'failed', error: String(e?.message || e).slice(0, 500), finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
    }
  });
  return { id, already: false };
}
