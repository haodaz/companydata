/**
 * 把「实测出过岗位」的网址记进信息源库：标成校招职位列表 + 核实通过，写上实测岗位数和日期；库里没有的补一条。
 * 数据部门给的「招聘官网」保留校招官网类型，只标核实通过。以后岗位入库时 job-store 会自动标，这个脚本用来补历史。
 *   npx tsx scripts/mark-real-entries.mts            # 只出报告
 *   npx tsx scripts/mark-real-entries.mts --apply
 * 来源：数据部门 10-16 后发现表层招聘官网和真正的岗位列表页常常不是一个网址（227 家不同）。
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { selectAll } = await import('../src/lib/supabase-all');
const { markRealEntry } = await import('../src/lib/job-store');
const APPLY = process.argv.includes('--apply');
const { data: logs } = await selectAll(() => db.from('job_crawl_logs').select('company_id, company, target_url, jobs_saved, created_at').gt('jobs_saved', 0).not('company_id', 'is', null).order('id'));
const best = new Map<string, any>();
for (const l of logs as any[]) { const k = `${l.company_id}|${l.target_url}`; const b = best.get(k); if (!b || l.jobs_saved >= b.jobs_saved) best.set(k, l); }
const { data: dead } = await selectAll(() => db.from('companies').select('id').eq('if_delete', true).order('id'));
const deadIds = new Set((dead as any[]).map(c => c.id));
const todo = [...best.values()].filter(l => !deadIds.has(l.company_id));
console.log(`实测出过岗位的网址 ${todo.length} 个（已排除已删企业）`);
if (APPLY) { let n = 0; for (const l of todo) { await markRealEntry(l.company_id, l.company, l.target_url, l.jobs_saved); n++; } console.log(`✓ 标好 ${n} 个`); }
