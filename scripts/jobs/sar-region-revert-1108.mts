/**
 * 数据部门 11-08（周赞灵）：港澳台不变，仍按 10-20 的规则——国家存 344 / 446 / 158，省、市留空。
 * 撤销 11-06 给这些岗位填上的省、市（81 / 810000 等）。
 *   npx tsx scripts/jobs/sar-region-revert-1108.mts [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const APPLY = process.argv.includes('--apply');
const { data } = await selectAll(() => db.from('jobs').select('id, country, province, city').in('country', ['344', '446', '158']).order('id'));
const todo = (data as any[]).filter(j => j.city != null || (j.province || []).length);
const cnt: Record<string, number> = {};
for (const j of todo) { const k = `${j.country}|${JSON.stringify(j.province)}|${j.city}`; cnt[k] = (cnt[k] || 0) + 1; }
console.log('港澳台岗位', (data as any[]).length, '要清省市', todo.length, cnt);
if (APPLY) {
  const ids = todo.map(j => j.id);
  for (let i = 0; i < ids.length; i += 200) { const { error } = await db.from('jobs').update({ province: [], city: null }).in('id', ids.slice(i, i + 200)); if (error) { console.log('✗', error.message); process.exit(1); } }
  console.log('已清');
}
