/**
 * 数据部门 11-09（周赞灵）岗位库两条规则的存量处理：
 *  1) 经验年限统一写法（normExpYears）
 *  2) 中英文字段有值、原文却空的：原文是被清掉的（核对原文没对上），按「宁空不错」把中英文也清掉；活动地址的原文用工作地点补
 *   npx tsx scripts/jobs/rules-1109.mts [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { normExpYears } = await import('@/lib/job-fields');
const { LANG_SOURCE } = await import('@/lib/job-defaults');
const APPLY = process.argv.includes('--apply');
const langCols = Object.keys(LANG_SOURCE).flatMap(k => [`${k}_lang_cn`, `${k}_lang_en`]);
const srcCols = [...new Set(Object.values(LANG_SOURCE))];
const { data } = await selectAll(() => db.from('jobs').select(['id', 'exp_years', 'address', 'location', 'address_lang_cn', 'address_lang_en', ...langCols, ...srcCols].join(', ')).not('if_delete', 'is', true).order('id'));
const patches = new Map<number, Record<string, any>>(), ex: Record<string, number> = {}, lang: Record<string, number> = {};
const put = (id: number, k: string, v: any) => patches.set(id, { ...(patches.get(id) || {}), [k]: v });
for (const j of data as any[]) {
  if (j.exp_years != null) { const n = normExpYears(j.exp_years); if (n !== j.exp_years) { put(j.id, 'exp_years', n); const k = `${j.exp_years} → ${n}`; ex[k] = (ex[k] || 0) + 1; } }
  for (const [k, src] of Object.entries(LANG_SOURCE)) if (!String(j[src] ?? '').trim()) for (const l of ['cn', 'en']) if (j[`${k}_lang_${l}`]) { put(j.id, `${k}_lang_${l}`, null); lang[k] = (lang[k] || 0) + 1; }
  if (!String(j.address ?? '').trim() && (j.address_lang_cn || j.address_lang_en)) { if (j.location) { put(j.id, 'address', j.location); lang['address 用工作地点补'] = (lang['address 用工作地点补'] || 0) + 1; } else { put(j.id, 'address_lang_cn', null); put(j.id, 'address_lang_en', null); lang['address 清空'] = (lang['address 清空'] || 0) + 1; } }
}
console.log('岗位', (data as any[]).length, '要改', patches.size);
console.log('经验年限：', Object.entries(ex).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${k}×${v}`).join(' | '));
console.log('中英文：', lang);
if (APPLY) { let n = 0; for (const [id, p] of patches) { const { error } = await db.from('jobs').update(p).eq('id', id); if (error) console.log('✗', id, error.message); else n++; } console.log('已改', n); }
