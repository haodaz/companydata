/**
 * 链接打不开的岗位默认「不通过」（数据部门 10-23 #33：批量检测 link，失效的默认为不通过）。
 * link_status = dead 的岗位：审核状态改 rejected（原因在 link_issue 里）；已经人工定论（通过 / 不通过 / 隐藏）的不动。链接检测跑完一轮再跑一次。
 *   npx tsx scripts/reject-dead-links-1023.mts [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { FROZEN_REVIEW_STATUSES } = await import('@/lib/review-status');
const APPLY = process.argv.includes('--apply');
const { data } = await selectAll(() => db.from('jobs').select('id, name, human_review_status, link_issue').eq('link_status', 'dead').not('if_delete', 'is', true).order('id'));
const todo = (data as any[]).filter(j => !FROZEN_REVIEW_STATUSES.has(j.human_review_status || ''));
console.log(`链接打不开 ${(data as any[]).length} 个，要改成不通过 ${todo.length} 个（已定论的跳过 ${(data as any[]).length - todo.length}）`);
if (APPLY) for (let i = 0; i < todo.length; i += 200) {
  const { error } = await db.from('jobs').update({ human_review_status: 'rejected' }).in('id', todo.slice(i, i + 200).map(j => j.id));
  if (error) { console.log('✗', error.message); break; }
}
if (APPLY) console.log('已改');
