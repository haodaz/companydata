/**
 * 补画像任务拆出海外企业（用户 10-26：海外用 Claude 试试）：企业编号国家码不是 cn 的 pending 条目挪到新任务，由 run-profiles.mts --model claude-… 跑。
 *   npx tsx scripts/split-overseas-profiles-1026.mts --from <taskId> --model claude-sonnet-5-5 [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const FROM = opt('from'), MODEL = opt('model', 'claude-sonnet-5-5'), APPLY = process.argv.includes('--apply');
const { data: logs } = await selectAll(() => db.from('company_crawl_logs').select('id, company_id').eq('task_id', FROM).in('status', ['pending', 'running']).order('id'));
const ids = (logs as any[]).map(l => l.company_id);
const slug = new Map<number, string>();
for (let i = 0; i < ids.length; i += 200) {
  const { data } = await db.from('companies').select('id, external_id').in('id', ids.slice(i, i + 200));
  for (const c of data || []) slug.set(c.id, String(c.external_id || '').split('.')[0]);
}
const overseas = (logs as any[]).filter(l => { const s = slug.get(l.company_id); return s && s !== 'cn'; });
console.log(`待跑 ${(logs as any[]).length} 家，海外 ${overseas.length} 家`);
if (!APPLY) process.exit(0);
const { data: task, error } = await db.from('company_tasks').insert({ name: '补画像 · 完整度 < 40 · 海外（10-26）', notes: '从「补画像 · 完整度 < 40（10-26）」拆出的海外企业，用 Claude 联网检索跑（用户 10-26）', model_id: MODEL, topics: [], skip_filled: true, created_by: 'script', status: 'draft' }).select('id').single();
if (error) throw error;
for (let i = 0; i < overseas.length; i += 200) {
  const { error: e } = await db.from('company_crawl_logs').update({ task_id: task.id, status: 'pending', model_id: MODEL }).in('id', overseas.slice(i, i + 200).map(l => l.id));
  if (e) { console.log('✗', e.message); process.exit(1); }
}
console.log(`海外任务 ${task.id}：挪了 ${overseas.length} 家`);
