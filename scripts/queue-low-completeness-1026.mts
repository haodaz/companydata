/**
 * 完整度 < 40 的企业排进一个画像任务（用户 10-26：用千问跑）。每家一条 company_crawl_logs（pending），由 run-profiles.mts 领着跑。
 * 已经在别的未完成任务里排着的不重复排。
 *   npx tsx scripts/queue-low-completeness-1026.mts --model qwen-plus [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = opt('model', 'qwen-plus'), APPLY = process.argv.includes('--apply');
const { data } = await selectAll(() => db.from('companies').select('id, name, completeness_score').not('if_delete', 'is', true).lt('completeness_score', 40).order('completeness_score').order('id'));
const { data: pend } = await selectAll(() => db.from('company_crawl_logs').select('company_id').in('status', ['pending', 'running']).order('id'));
const busy = new Set((pend as any[]).map(p => p.company_id));
const todo = (data as any[]).filter(c => !busy.has(c.id));
console.log(`完整度 < 40：${(data as any[]).length} 家，已在排队 ${(data as any[]).length - todo.length}，这次排 ${todo.length}`);
if (!APPLY) process.exit(0);
const { data: task, error } = await db.from('company_tasks').insert({ name: '补画像 · 完整度 < 40（10-26）', notes: '数据部门 10-26 完整度筛选排序上线后，补算完整度发现 < 40 的企业较多（多为新建的科研仪器厂商 / 展商）；千问跑', model_id: MODEL, topics: [], skip_filled: true, created_by: 'script', status: 'draft' }).select('id').single();
if (error) throw error;
for (let i = 0; i < todo.length; i += 200) {
  const rows = todo.slice(i, i + 200).map(c => ({ task_id: task.id, company_id: c.id, company: c.name, status: 'pending', model_id: MODEL }));
  const { error: e } = await db.from('company_crawl_logs').insert(rows);
  if (e) { console.log('✗', e.message); process.exit(1); }
}
console.log(`任务 ${task.id}：排了 ${todo.length} 家`);
