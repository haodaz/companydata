/**
 * 补算企业完整度：completeness_score 为空的（这几天新建的展商 / 厂商等），按已有字段 + 子实体打分，不调模型。
 *   npx tsx scripts/refresh-company-completeness.mts [--all]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { refreshCompleteness } = await import('@/lib/company-store');
const ALL = process.argv.includes('--all');
const { data } = await selectAll(() => { let q = db.from('companies').select('id').not('if_delete', 'is', true).order('id'); if (!ALL) q = q.is('completeness_score', null); return q; });
const ids = (data as any[]).map(r => r.id);
console.log(`要算 ${ids.length} 家`);
let n = 0, i = 0;
await Promise.all(Array.from({ length: 3 }, async () => { while (i < ids.length) { const id = ids[i++]; await refreshCompleteness(id).catch(() => {}); if (++n % 200 === 0) process.stdout.write(`\r${n}/${ids.length}`); } }));
console.log(`\n算完 ${n} 家`);
