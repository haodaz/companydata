/**
 * 给某个人加时 / 让他接着做（11-24 潜历讨论：这是 work sample 不是考试，有人愿意多花时间做好没关系——到点也可以不收，人接着干）。
 * 平台只扩大能做的范围、不替企业定规则：限时、建议时长、到点收不收、给谁加时，都由出任务的企业选。
 *
 * - 还在作答 / 到点了还没收：在他现在的截止时间（已经过了就从现在算）上再加 minutes 分钟。
 * - 已经提交了（到点被收的或自己交的）：重新打开接着做——提交时间、这次的评估和同题对比里的名次清掉，内容和过程都留着；
 *   限时的任务同时从现在起给 minutes 分钟。下次提交重新评估。
 * - 建议时长（不限时）的任务本来就不收卷，加时只对已经提交的有意义（重新打开）。
 * 时间加在 participant.extra_min 上（deadline.ts 的 timing 认它）；过程里记一条 extend 事件，报告的过程时间轴看得到。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { limitSec, extraSec, timing } from '@/lib/work/deadline';

export async function extendSession(task: { id: string; task: any }, sessionId: string, minutes: number): Promise<{ ok: true; reopened: boolean; minutes: number; until_s: number | null } | { ok: false; error: string }> {
  const mins = Math.max(5, Math.min(600, Math.round(Number(minutes) || 0)));
  const { data: s } = await db.from('work_sessions').select('id, participant, started_at, submitted_at, report, score, events').eq('id', sessionId).eq('task_id', task.id).maybeSingle();
  if (!s) return { ok: false, error: '没有这次作答' };
  if (s.participant?.preview) return { ok: false, error: '预览不用加时' };
  const soft = !!task.task?.soft_limit;
  const tm = timing(task.task, s);
  const reopen = !!s.submitted_at;
  if (soft && !reopen) return { ok: false, error: '这个任务只给建议时长、不到点收，他可以一直做，不用加时' };
  // 新的截止 = max(现在, 原截止) + mins；换算成 extra_min
  const deadline = Math.max(tm.elapsed, limitSec(task.task) + extraSec(s)) + mins * 60;
  const extra = soft ? Number(s.participant?.extra_min) || 0 : Math.ceil((deadline - limitSec(task.task)) / 60);
  const t = tm.elapsed;
  const events = [...(s.events || []), { t, type: 'extend', minutes: mins, ...(reopen ? { reopen: true, prev_score: s.score ?? null } : {}) }];
  const patch: any = { participant: { ...(s.participant || {}), extra_min: extra }, events };
  if (reopen) Object.assign(patch, { submitted_at: null, report: null, score: null });
  const { error } = await db.from('work_sessions').update(patch).eq('id', s.id);
  if (error) return { ok: false, error: error.message };
  // 重新打开的：从同题对比的顺序里拿掉，下次提交评完会重新插
  if (reopen) {
    const { data: t2 } = await db.from('work_tasks').select('task').eq('id', task.id).single();
    const order: string[] = Array.isArray((t2 as any)?.task?.peer_order) ? (t2 as any).task.peer_order : [];
    if (order.includes(s.id)) await db.from('work_tasks').update({ task: { ...(t2 as any).task, peer_order: order.filter(x => x !== s.id) } }).eq('id', task.id);
  }
  return { ok: true, reopened: reopen, minutes: mins, until_s: soft ? null : deadline };
}
