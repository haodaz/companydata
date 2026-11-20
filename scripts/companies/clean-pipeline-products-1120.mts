/**
 * 11-20：深度尽调把非医药公司的「已上线 / 开发中」也写成了核心产品（品类「临床管线 · …」），软删这批。
 * 保留：阶段是临床 / 注册 / 获批的（药、医疗器械管线）；人工审核通过或改过字段的也不动（列出来）。原行备份到 reports/。
 *   npx tsx scripts/companies/clean-pipeline-products-1120.mts [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { CLINICAL_STAGE } = await import('@/lib/agents/company-deep-research');
const { refreshCompleteness } = await import('@/lib/company-store');
const APPLY = process.argv.includes('--apply');
const { data } = await selectAll(() => db.from('company_products').select('*').like('category', '临床管线%').eq('if_delete', false).order('id'));
const rows = data as any[];
const drop = rows.filter(r => !CLINICAL_STAGE.test(r.category.replace('临床管线 · ', '')));
const human = drop.filter(r => r.human_review_status === 'complete' || (r.human_locked_fields || []).length);
const del = drop.filter(r => !human.includes(r));
console.log(`管线行 ${rows.length}，非临床阶段 ${drop.length}：软删 ${del.length}，人工审过 / 改过的留着 ${human.length}（${human.map(r => `#${r.id} ${r.name}`).join('、')}）`);
if (APPLY) {
  fs.writeFileSync('reports/1120-非医药管线产品-软删前备份.json', JSON.stringify(del, null, 1));
  for (let i = 0; i < del.length; i += 100) await db.from('company_products').update({ if_delete: true, updated_at: new Date().toISOString() }).in('id', del.slice(i, i + 100).map(r => r.id));
  for (const c of new Set(del.map(r => r.company_id))) await refreshCompleteness(c);
  console.log('已软删');
}
process.exit(0);
