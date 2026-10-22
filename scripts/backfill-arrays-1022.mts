/**
 * 045 第二步：岗位上「|」文本 → 数组新列（*_arr），每批 500 行；企业「查找名称」一起填（数据部门 10-22 #22 #24）。
 * 不重写整表——10-22 直接 ALTER TYPE 把硬盘写满过。每批之间停一下，给线上留余地。
 *   npx tsx scripts/backfill-arrays-1022.mts [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { toList } = await import('@/lib/list-field');
const { companySearchNames } = await import('@/lib/job-defaults');
const APPLY = process.argv.includes('--apply');
const COLS = ['fos_ids', 'related_career_ids', 'qianli_job_specialty_labels', 'qianli_specialty_labels_reason', 'name_to_search'];
const arr = (v: unknown) => { const a = toList(v); return a.length ? a : null; };
const pause = () => new Promise(r => setTimeout(r, 300));

const { data: jobs } = await selectAll(() => db.from('jobs').select(['id', ...COLS, ...COLS.map(c => `${c}_arr`)].join(', ')).order('id'));
const todo = (jobs as any[]).filter(j => COLS.some(c => arr(j[c]) && !j[`${c}_arr`]));
console.log(`岗位 ${(jobs as any[]).length}，要搬 ${todo.length}${APPLY ? '' : '（试跑）'}`);
let n = 0;
if (APPLY) for (const j of todo) {
  const patch = Object.fromEntries(COLS.filter(c => arr(j[c]) && !j[`${c}_arr`]).map(c => [`${c}_arr`, arr(j[c])]));
  const { error } = await db.from('jobs').update(patch).eq('id', j.id);
  if (error) { console.log(`✗ #${j.id} ${error.message}`); break; }
  if (++n % 500 === 0) { process.stdout.write(`\r岗位 ${n}/${todo.length}`); await pause(); }
}
const { data: cos } = await selectAll(() => db.from('companies').select('id, name, brief_name, registered_name, name_en, historical_name, aliases, name_to_search').order('id'));
const ctodo = (cos as any[]).filter(c => !c.name_to_search);
console.log(`\n企业 ${(cos as any[]).length}，查找名称要填 ${ctodo.length}`);
let m = 0;
if (APPLY) for (const c of ctodo) {
  const v = companySearchNames({ ...c, aliases: [...(c.aliases || []), ...(c.historical_name ? [c.historical_name] : [])] });
  if (!v) continue;
  const { error } = await db.from('companies').update({ name_to_search: v }).eq('id', c.id);
  if (error) { console.log(`✗ 企业 #${c.id} ${error.message}`); break; }
  if (++m % 500 === 0) { process.stdout.write(`\r企业 ${m}/${ctodo.length}`); await pause(); }
}
console.log(`\n${APPLY ? `已搬岗位 ${n}、填企业 ${m}` : '加 --apply 写库'}`);
process.exit(0);
