/**
 * 数据部门 11-26（Oracle 例）：跨公司关键词搜索页当成了企业的岗位来源 → 别家的岗位挂到这家名下。
 *   信息源：这类网址标「核实未通过」并写原因；岗位：从这类网址抓来的、还没人工判过不通过的，审核改「不通过」并在备注写原因（不删，可恢复）
 *   npx tsx scripts/companies/cross-search-cleanup-1126.mts [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { isCrossCompanySearch } = await import('@/lib/job-store');
const APPLY = process.argv.includes('--apply');
const now = new Date().toISOString();
const { data: us } = await selectAll(() => db.from('url_sources').select('id,company_id,company,url,verification_status').order('id'));
const bad = (us as any[]).filter(u => isCrossCompanySearch(u.url));
console.log(`跨公司搜索页信源 ${bad.length} 条`);
const jobs: any[] = [];
for (const u of bad) { const { data } = await db.from('jobs').select('id,name,company_id,institute_or_company_name,human_review_status,human_review_note,if_delete,source_url').eq('source_url', u.url); jobs.push(...(data || [])); }
const todo = jobs.filter(j => !j.if_delete && !['complete', 'rejected', 'hidden'].includes(j.human_review_status));   // 人工定论过的不动
console.log(`这些网址抓来的岗位 ${jobs.length} 个，要改「不通过」的 ${todo.length} 个`);
for (const [k, n] of Object.entries(todo.reduce((m: any, j) => (m[j.institute_or_company_name] = (m[j.institute_or_company_name] || 0) + 1, m), {}))) console.log(' ', k, n);
(await import('node:fs')).writeFileSync('reports/1126-跨公司搜索页清理.json', JSON.stringify({ sources: bad, jobs }, null, 1));
if (APPLY) {
  for (const u of bad) await db.from('url_sources').update({ verification_status: 'failed', url_health: { reason: '跨公司关键词搜索结果页，结果是各家公司的岗位，不能当这家的来源（11-26）', by: 'cross-search-cleanup' }, last_checked_at: now }).eq('id', u.id);
  for (const j of todo) await db.from('jobs').update({ human_review_status: 'rejected', human_review_at: now, human_review_note: ['来源是牛客等平台的关键词搜索页，岗位多半不是这家公司的（11-26 自动判不通过）', j.human_review_note].filter(Boolean).join('\n') }).eq('id', j.id);
  console.log('已处理');
}
process.exit(0);
