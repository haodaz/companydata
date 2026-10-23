/**
 * 科研产品 type / kind / 编号前缀改成方略严选平台的 5 个选项（数据部门 10-23 #39 #41）：
 *   软件、科研算力硬件（computing 类目的仪器）→ 软硬件系统 software_and_hardware_systems（ky_system_）
 *   服务 → 培训类的进实训培训 practical_training（sxpx_），其余智库咨询服务 consulting_services（zkzx_）
 *   编号前缀跟着换（前缀 + 16 位随机码；这批还没导出过，换号不影响下游）
 *   npx tsx scripts/remap-product-types-1023.mts [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { kindOf, productExternalId } = await import('@/lib/research-products');
const APPLY = process.argv.includes('--apply');
const TRAINING = /培训|实训|课程|学院|academy|training|course|workshop|e-?learning/i;

const { data } = await selectAll(() => db.from('research_products').select('id, name, description, kind, type, category, external_id').not('if_delete', 'is', true).order('id'));
const changes: any[] = [];
for (const p of data as any[]) {
  let kind = kindOf(p.kind)?.key || 'instrument';
  if (kind === 'instrument' && p.category === 'computing') kind = 'system';
  if (kind === "service" && TRAINING.test(p.name)) kind = "training";   // 只看产品名：描述里顺带提「培训」的不算
  const k = kindOf(kind)!;
  if (p.kind === kind && p.type === k.type && String(p.external_id || '').startsWith(k.prefix)) continue;
  changes.push({ id: p.id, name: p.name, from: `${p.kind}/${p.type}`, kind, type: k.type, external_id: String(p.external_id || '').startsWith(k.prefix) ? p.external_id : productExternalId(kind as any) });
}
const by: Record<string, number> = {}; for (const c of changes) by[`${c.from} → ${c.kind}/${c.type}`] = (by[`${c.from} → ${c.kind}/${c.type}`] || 0) + 1;
console.log(`要改 ${changes.length} 个：`, by);
console.log(changes.filter(c => c.kind === 'training').map(c => c.name).slice(0, 10));
if (APPLY) { for (const c of changes) await db.from('research_products').update({ kind: c.kind, type: c.type, external_id: c.external_id }).eq('id', c.id); console.log('已写回'); }
