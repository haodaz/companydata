/**
 * 合并重复企业（数据部门口径：去重认旧记录，--keep 一般是编号小的那条）：把 --drop 名下的一切挪到 --keep，空字段用 --drop 的补上，--drop 软删（if_delete）并在备注里写去向。
 * 子实体按去重键冲突的留 keep 那条、drop 那条软删。
 *   npx tsx scripts/merge-companies.mts --keep 1715 --drop 1619 [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const opt = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : 0; };
const KEEP = opt('keep'), DROP = opt('drop'), APPLY = process.argv.includes('--apply');
if (!KEEP || !DROP || KEEP === DROP) { console.error('need --keep and --drop'); process.exit(1); }

// 所有挂 company_id 的表（按迁移文件梳理，10-27）
const REFS: [string, string][] = [
  ['jobs', 'company_id'], ['url_sources', 'company_id'], ['url_journal', 'company_id'], ['company_crawl_logs', 'company_id'], ['job_crawl_logs', 'company_id'],
  ['company_deep_research', 'company_id'], ['competition_searches', 'company_id'], ['competitions', 'organizer_company_id'], ['demand_signals', 'company_id'],
  ['occupation_signals', 'company_id'], ['work_external_simulations', 'company_id'], ['work_question_bank', 'company_id'], ['work_tasks', 'company_id'],
  ['ws_orgs', 'company_id'], ['research_products', 'supplier_id'],
];
const SUBS = ['company_executives', 'company_financings', 'company_news', 'company_products'];

const { data: k } = await db.from('companies').select('*').eq('id', KEEP).single();
const { data: d } = await db.from('companies').select('*').eq('id', DROP).single();
if (!k || !d) { console.error('企业不存在'); process.exit(1); }
console.log(`保留 #${KEEP} ${k.name}（完整度 ${k.completeness_score}）  ←  合并 #${DROP} ${d.name}（完整度 ${d.completeness_score}）`);

const empty = (v: any) => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
const SKIP = new Set(['id', 'external_id', 'name', 'created_at', 'updated_at', 'if_delete', 'human_review_status', 'human_review_at', 'human_review_by', 'human_review_note', 'human_locked_fields', 'completeness_score']);
const fill: Record<string, any> = {};
for (const [c, v] of Object.entries(d)) if (!SKIP.has(c) && !empty(v) && empty(k[c])) fill[c] = v;
// 别名 / 来源合并
const aliases = [...new Set([...(k.aliases || []), ...(d.aliases || []), d.name, d.brief_name].filter(Boolean))].filter(a => a !== k.name);
fill.aliases = aliases;
if (d.source && k.source && d.source !== k.source) fill.source = [...new Set(`${k.source}；${d.source}`.split('；').filter(Boolean))].join('；');
if (d.profile_source && k.profile_source) fill.profile_source = { ...d.profile_source, ...k.profile_source };
console.log('补字段：', Object.keys(fill).join('、') || '无');

for (const [t, col] of REFS) {
  const { count } = await db.from(t).select('*', { count: 'exact', head: true }).eq(col, DROP);
  if (count) console.log(`  ${t}.${col}：${count} 条挪过去`);
  if (APPLY && count) { const { error } = await db.from(t).update({ [col]: KEEP }).eq(col, DROP); if (error) console.log('   ✗', error.message); }
}
for (const t of SUBS) {
  const { data: rows } = await db.from(t).select('id, dedupe_key').eq('company_id', DROP).eq('if_delete', false);
  if (!rows?.length) continue;
  const { data: mine } = await db.from(t).select('dedupe_key').eq('company_id', KEEP);
  const have = new Set((mine || []).map((r: any) => r.dedupe_key));
  const move = rows.filter((r: any) => !have.has(r.dedupe_key)), dup = rows.filter((r: any) => have.has(r.dedupe_key));
  console.log(`  ${t}：挪 ${move.length}，重复软删 ${dup.length}`);
  if (APPLY) {
    if (dup.length) await db.from(t).update({ if_delete: true }).in('id', dup.map((r: any) => r.id));
    for (const r of move) { const { error } = await db.from(t).update({ company_id: KEEP }).eq('id', r.id); if (error) { await db.from(t).update({ if_delete: true }).eq('id', r.id); } }
  }
}
if (APPLY) {
  const { error: e1 } = await db.from('companies').update({ ...fill, updated_at: new Date().toISOString() }).eq('id', KEEP);
  if (e1) { console.log('✗ 补字段失败', e1.message); process.exit(1); }
  await db.from('companies').update({ if_delete: true, human_review_note: `已合并到 #${KEEP} ${k.name}（${new Date().toISOString().slice(0, 10)}）`, updated_at: new Date().toISOString() }).eq('id', DROP);
  // 岗位 / 信息源上冗余的企业名、岗位的查找名称跟着换成保留那家的
  const { data: kk } = await db.from('companies').select('*').eq('id', KEEP).single();
  const { companySearchNames } = await import('@/lib/job-defaults');
  await db.from('jobs').update({ institute_or_company_name: kk.name, name_to_search: companySearchNames(kk) }).eq('company_id', KEEP);
  await db.from('url_sources').update({ company: kk.name }).eq('company_id', KEEP);
  const { refreshCompleteness } = await import('@/lib/company-store');
  console.log('合并后完整度', await refreshCompleteness(KEEP));
  console.log('已合并');
}
