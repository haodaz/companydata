/**
 * 同题对比 · 交卷后插入排名（11-23）：每交一份卷，用二分插入把它放进这道题已有的顺序里（比较 log₂n 次，每次正反各比一次），
 * 顺序只存一份：work_tasks.task.peer_order（不改任何报告，免得和评卷同时写互相覆盖）；名次在列表接口里按顺序现算（peerRanks）。只排真实候选人（预览、模拟不排）。
 * 两人同时交卷：保存前再读一遍顺序，变了就重插（最多 3 次）。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { comparePair, type PeerItem } from '@/lib/work/fluency/peer';

const isReal = (s: any) => !!s.submitted_at && !s.participant?.preview && s.report && !s.report.auditing;
const itemOf = (s: any): PeerItem => ({ id: s.id, chat: (s.ai_chat || []).map((c: any) => ({ q: c.q, a: c.a })), events: s.events || [], deliverable: s.deliverable || '' });

export async function insertPeer(taskId: string, sessionId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: t } = await db.from('work_tasks').select('id, task, company_name').eq('id', taskId).single();
    if (!t) return;
    const order0: string[] = Array.isArray((t as any).task?.peer_order) ? (t as any).task.peer_order : [];
    if (order0.includes(sessionId)) return;
    const { data: ss } = await db.from('work_sessions').select('id, participant, submitted_at, report, ai_chat, events, deliverable').eq('task_id', taskId);
    const live = new Map((ss || []).filter(isReal).map((s: any) => [s.id, s]));
    const me = live.get(sessionId); if (!me) return;
    const order = order0.filter(id => live.has(id));   // 删掉已删 / 重做的
    const title = (t as any).task?.title || '';
    let lo = 0, hi = order.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const v = await comparePair(title, itemOf(me), itemOf(live.get(order[mid])), (t as any).company_name || '');
      if (v > 0) hi = mid; else lo = mid + 1;   // 比中间那位强 → 往前；打平或弱 → 往后
    }
    const next = [...order.slice(0, lo), sessionId, ...order.slice(lo)];
    // 保存前再读：别人同时插过就重来
    const { data: t2 } = await db.from('work_tasks').select('task').eq('id', taskId).single();
    const cur: string[] = Array.isArray((t2 as any)?.task?.peer_order) ? (t2 as any).task.peer_order : [];
    if (cur.join(',') !== order0.join(',')) continue;
    await db.from('work_tasks').update({ task: { ...(t2 as any).task, peer_order: next } }).eq('id', taskId);
    return next;
  }
}

/** 交卷收尾时调：请求里用 after() 放后台，不拖慢交卷 */
export async function insertPeerLater(taskId: string, sessionId: string) {
  const run = () => insertPeer(taskId, sessionId).catch(e => console.warn('[work] 同题对比失败', String(e?.message).slice(0, 120)));
  try { const { after } = await import('next/server'); after(run); } catch { void run(); }
}

/** 列表接口用：按 peer_order 给每份作答名次（顺序里没有的不给） */
export function peerRanks(task: any, sessionIds: string[]): Map<string, { rank: number; of: number }> {
  const order: string[] = (Array.isArray(task?.peer_order) ? task.peer_order : []).filter((id: string) => sessionIds.includes(id));
  return new Map(order.map((id, i) => [id, { rank: i + 1, of: order.length }]));
}
