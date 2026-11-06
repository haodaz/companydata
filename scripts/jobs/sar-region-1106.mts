/**
 * 数据部门《全球城市1106》：港澳台的岗位，国家之外把省、市也填上（中国香港 344 → 81 / 810000 等；10-20 时省市留空）。
 *   npx tsx scripts/jobs/sar-region-1106.mts [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const APPLY = process.argv.includes('--apply');
const FULL: Record<string, { province: string[]; city: string }> = { '344': { province: ['81'], city: '810000' }, '446': { province: ['82'], city: '820000' }, '158': { province: ['71'], city: '710000' } };
const { data } = await selectAll(() => db.from('jobs').select('id, country, province, city').in('country', Object.keys(FULL)).order('id'));
const todo = (data as any[]).filter(j => j.city !== FULL[j.country].city || JSON.stringify(j.province || []) !== JSON.stringify(FULL[j.country].province));
console.log('港澳台岗位', (data as any[]).length, '要补', todo.length, Object.fromEntries(Object.keys(FULL).map(k => [k, todo.filter(j => j.country === k).length])));
if (APPLY) for (const k of Object.keys(FULL)) {
  const ids = todo.filter(j => j.country === k).map(j => j.id);
  for (let i = 0; i < ids.length; i += 200) { const { error } = await db.from('jobs').update(FULL[k]).in('id', ids.slice(i, i + 200)); if (error) { console.log('✗', error.message); process.exit(1); } }
}
if (APPLY) console.log('已补');
