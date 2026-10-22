/**
 * 存量岗位的潜历特色标签过原文证据关（陈彩瑛 10-21，规则见 src/lib/qianli-evidence.ts），不调模型。
 *   npx tsx scripts/qianli-specialty-evidence.mts [--apply]
 * 不加 --apply 只统计：每个二级去掉多少、各一级前后覆盖率；结果存 reports/qianli-specialty-evidence.json
 */
process.loadEnvFile('.env.local');
const { toList } = await import('@/lib/list-field');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { checkSpecialty } = await import('@/lib/qianli-evidence');
const APPLY = process.argv.includes('--apply');

const { data } = await selectAll(() => db.from('jobs').select('id, name, responsibilities, overview, qianli_job_specialty_labels, qianli_specialty_labels_reason')
  .not('if_delete', 'is', true).not('qianli_specialty_labels_reason', 'is', null).order('id'));
const rows = data as any[];
const split = (s: any) => toList(s);   // 10-22 起是数组
const dropBy: Record<string, Record<string, number>> = {}, l1Before: Record<string, number> = {}, l1After: Record<string, number> = {};
const changes: { id: number; l1: string[] | null; l2: string[] | null }[] = [];
const samples: any[] = [];
for (const r of rows) {
  const before = split(r.qianli_specialty_labels_reason);
  for (const v of split(r.qianli_job_specialty_labels)) l1Before[v] = (l1Before[v] || 0) + 1;
  const { l1, l2, dropped } = checkSpecialty(before, r);
  for (const v of l1) l1After[v] = (l1After[v] || 0) + 1;
  for (const [v, why] of Object.entries(dropped)) { (dropBy[v] ||= {})[why] = (dropBy[v][why] || 0) + 1; }
  const nl1 = l1.length ? l1 : null, nl2 = l2.length ? l2 : null;
  if (JSON.stringify(nl1) !== JSON.stringify(split(r.qianli_job_specialty_labels).length ? split(r.qianli_job_specialty_labels) : null) || JSON.stringify(nl2) !== JSON.stringify(before.length ? before : null)) {
    changes.push({ id: r.id, l1: nl1, l2: nl2 });
    if (samples.length < 60 && Object.keys(dropped).length) samples.push({ id: r.id, name: r.name, before, after: l2, dropped });
  }
}
console.log(`有特色标签的岗位 ${rows.length}，要改 ${changes.length}`);
console.log('一级 前→后：', Object.keys({ ...l1Before }).map(k => `${k} ${l1Before[k]}→${l1After[k] || 0}`).join('，'));
console.log('去掉的二级：'); for (const [v, m] of Object.entries(dropBy).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y) - Object.values(a[1]).reduce((x, y) => x + y))) console.log(`  ${v}: ${Object.entries(m).map(([w, n]) => `${w} ${n}`).join('，')}`);
fs.writeFileSync('reports/qianli-specialty-evidence.json', JSON.stringify({ at: new Date().toISOString(), total: rows.length, changes: changes.length, l1Before, l1After, dropBy, samples }, null, 1));
if (APPLY) {
  let done = 0;
  for (let i = 0; i < changes.length; i += 4) {   // 线上共用库：4 路
    await Promise.all(changes.slice(i, i + 4).map(c => db.from('jobs').update({ qianli_job_specialty_labels: c.l1, qianli_specialty_labels_reason: c.l2 }).eq('id', c.id)));
    done += Math.min(4, changes.length - i);
    if (done % 400 < 4) process.stdout.write(`\r写回 ${done}/${changes.length}`);
  }
  console.log(`\n已写回 ${changes.length} 条`);
}
