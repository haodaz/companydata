/**
 * 数据部门 2026-10-16 反馈（查企业、岗位反馈-1016.docx）：
 *   lang-map  岗位的中英文字段按对照表放：原文是中文放 (Cn)、英文放 (En)，网址两边都放；不调模型。
 *             对照表和 10-14 不同的两处（description ← 岗位摘要（中文）、process ← 报名/申请链接）按新对照覆盖旧值，其余只补空。
 *   npx tsx scripts/fix-1016.mts                # 只出报告
 *   npx tsx scripts/fix-1016.mts --apply        # 写库
 */
import fs from 'node:fs';
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('../src/lib/supabase');
const { selectAll } = await import('../src/lib/supabase-all');
const { LANG_SOURCE, applyLangFields } = await import('../src/lib/job-defaults');
const { FROZEN_REVIEW_STATUSES } = await import('../src/lib/review-status');

const APPLY = process.argv.includes('--apply');
const CHANGED = ['description', 'process'];   // 对照改了的：按新对照覆盖
const cols = ['id', 'human_review_status', 'human_locked_fields', ...new Set(Object.values(LANG_SOURCE)), ...Object.keys(LANG_SOURCE).flatMap(k => [`${k}_lang_cn`, `${k}_lang_en`])];
const { data: jobs, error } = await selectAll(() => db.from('jobs').select(cols.join(', ')).not('if_delete', 'is', true).order('id'));
if (error) throw error;

const todo: { id: number; patch: Record<string, any> }[] = [];
const by: Record<string, number> = {};
let frozen = 0;
for (const j of jobs as any[]) {
  if (FROZEN_REVIEW_STATUSES.has(j.human_review_status || '')) { frozen++; continue; }
  const locked = new Set<string>(j.human_locked_fields || []);
  const before = { ...j };
  // 对照改了的：旧值按旧对照放的，先清掉再按新对照放（新原文为空就留空）
  for (const k of CHANGED) for (const l of ['cn', 'en']) if (!locked.has(`${k}_lang_${l}`)) j[`${k}_lang_${l}`] = null;
  applyLangFields(j);
  const patch: Record<string, any> = {};
  for (const k of Object.keys(LANG_SOURCE)) for (const l of ['cn', 'en']) {
    const key = `${k}_lang_${l}`;
    if (locked.has(key)) continue;
    if ((before[key] ?? null) !== (j[key] ?? null)) { patch[key] = j[key] ?? null; by[key] = (by[key] || 0) + 1; }
  }
  if (Object.keys(patch).length) todo.push({ id: j.id, patch });
}
console.log(`岗位 ${jobs!.length} 条（已定论跳过 ${frozen}），要改的 ${todo.length} 条`);
console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('；'));
fs.mkdirSync('reports/1016', { recursive: true });
fs.writeFileSync('reports/1016/中英文字段-样例.json', JSON.stringify(todo.slice(0, 20), null, 1));

if (APPLY) {
  let done = 0;
  for (let i = 0; i < todo.length; i += 20) {
    await Promise.all(todo.slice(i, i + 20).map(t => db.from('jobs').update(t.patch).eq('id', t.id).then(({ error }) => { if (!error) done++; else console.log('✗', t.id, error.message); })));
  }
  console.log(`✓ 写了 ${done} 条`);
}
