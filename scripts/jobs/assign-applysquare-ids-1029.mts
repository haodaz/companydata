/**
 * 岗位 external_id / applysquare_id 按平方数据给的对接表赋值（数据部门姜贺 10-29 #63）：
 * 我们按规则生成的 o9y 编号可能和平方原始数据的 applysquare_id 撞上、导致错位覆盖，改用对方分配的值；以后新岗位不再由我们生成（迁移 054 去掉触发器）。
 * 新值是 14 位（含大写），和旧的 15 位小写编号不会互撞，可以直接逐条改。
 *   npx tsx scripts/jobs/assign-applysquare-ids-1029.mts --file <对接.xlsx> [--apply]
 */
process.loadEnvFile('.env.local');
const XLSX = (await import('xlsx')).default;
const { supabaseAdmin: db } = await import('@/lib/supabase');
const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes('--apply');
const rows: { id: number; external_id: string; applysquare_id: string }[] = XLSX.utils.sheet_to_json(XLSX.readFile(opt('file')).Sheets.Sheet1);
console.log(`对接表 ${rows.length} 行`);
if (!APPLY) process.exit(0);
// 先拿一条试：迁移 054 没跑的话，012 的触发器会把对方的 14 位编号改回随机 o9y，这里就停
{
  const r = rows[0];
  await db.from('jobs').update({ external_id: String(r.external_id), applysquare_id: String(r.applysquare_id) }).eq('id', r.id);
  const { data } = await db.from('jobs').select('external_id').eq('id', r.id).single();
  if (data?.external_id !== String(r.external_id)) { console.error(`✗ 写进去变成了 ${data?.external_id}——岗位的 o9y 触发器还在，先跑迁移 054`); process.exit(1); }
}
let done = 0, bad = 0;
const queue = [...rows];
async function worker() {
  while (queue.length) {
    const r = queue.shift()!;
    const { error } = await db.from('jobs').update({ external_id: String(r.external_id), applysquare_id: String(r.applysquare_id) }).eq('id', r.id);
    if (error) { bad++; console.log('✗', r.id, error.message); } else if (++done % 2000 === 0) console.log(`已改 ${done}`);
  }
}
await Promise.all([worker(), worker(), worker()]);   // 线上共用库：3 路
const { data: check } = await db.from('jobs').select('id, external_id').in('id', rows.slice(0, 5).map(r => r.id));
console.log(`完成：改 ${done}，失败 ${bad}；抽查`, check);
