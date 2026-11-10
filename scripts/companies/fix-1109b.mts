/**
 * 数据部门 11-09（姜贺）第二轮：
 *  1) 2895 安徽万仪科技：编号改 cn.ahwykjgfyxgs2、统一社会信用代码 91340303MA8NEE6EXC；3896 常州天瑞仪器编号不变。两家之前被灌进了皖仪 / 江苏天瑞的资料，
 *     先把画像字段清空、错挂的子实体软删（原值备份到 reports/），再按正确的名字和信用代码重跑画像（千问）。
 *  2) 已并入保留企业的科研产品按名称去重（同名留保留企业原有的那条），去重键改成保留企业的。
 *  3) 4 家补国家：ECOM 捷克、Weinert 德国、Bionics 韩国、Eptes 瑞士，编号按老规则生成。
 *   npx tsx scripts/companies/fix-1109b.mts [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { COMPANY_EDIT_FIELDS } = await import('@/lib/company-fields');
const { ensureCompanyFloraId } = await import('@/lib/company-flora-id');
const APPLY = process.argv.includes('--apply');
const KEEP_FIELDS = new Set(['name', 'country', 'source', 'supplier_categories', 'supplier_exhibitions', 'subscription_platform', 'entity_level', 'parent_company_id', 'segment']);
const FIX: Record<number, Record<string, any>> = {
  2895: { external_id: 'cn.ahwykjgfyxgs2', flora_id_locked: true, unified_social_credit_code: '91340303MA8NEE6EXC', registered_name: '安徽万仪科技有限公司' },
  3896: { registered_name: '常州天瑞仪器有限公司', unified_social_credit_code: null },
};
const bak: any = {};
for (const [id, set] of Object.entries(FIX)) {
  const { data: c } = await db.from('companies').select('*').eq('id', id).single(); bak[id] = c;
  const clear = Object.fromEntries(COMPANY_EDIT_FIELDS.map(f => f.key).filter(k => !KEEP_FIELDS.has(k) && !(k in set) && c[k] != null && c[k] !== '' && !(Array.isArray(c[k]) && !c[k].length)).map(k => [k, Array.isArray(c[k]) ? [] : null]));
  console.log(`#${id} ${c.name}：清空 ${Object.keys(clear).length} 个画像字段（${Object.keys(clear).join('、')}），改 ${JSON.stringify(set)}`);
  const sub: any = {};
  for (const t of ['company_executives', 'company_products', 'company_news', 'company_financings']) { const { data } = await db.from(t).select('*').eq('company_id', id).not('if_delete', 'is', true); sub[t] = data; console.log(`  ${t} 软删 ${data?.length || 0}`); }
  bak[`${id}_sub`] = sub;
  if (APPLY) {
    const { error } = await db.from('companies').update({ ...clear, ...set, profile_source: null, completeness_score: null, human_locked_fields: [], human_review_status: 'review', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    for (const t of Object.keys(sub)) if (sub[t]?.length) await db.from(t).update({ if_delete: true }).in('id', sub[t].map((x: any) => x.id));
  }
}
const norm = (s: string) => (s || '').toLowerCase().replace(/[\s\-_/·（）()]+/g, '');
for (const keep of [3841, 3485, 3192]) {
  const { data: ps } = await db.from('research_products').select('id, name, dedupe_key').eq('supplier_id', keep).eq('if_delete', false).order('id');
  const seen = new Map<string, any>(), del: number[] = [], rekey: { id: number; key: string }[] = [];
  const own = (p: any) => String(p.dedupe_key || '').startsWith(`${keep}|`);
  for (const p of [...(ps || [])].sort((a, b) => Number(own(b)) - Number(own(a)) || a.id - b.id)) { const k = norm(p.name); if (seen.has(k)) del.push(p.id); else { seen.set(k, p); if (!own(p)) rekey.push({ id: p.id, key: `${keep}|${k}|` }); } }
  console.log(`保留 #${keep}：产品 ${ps?.length}，同名重复软删 ${del.length}，改去重键 ${rekey.length}`);
  if (APPLY) { if (del.length) await db.from('research_products').update({ if_delete: true }).in('id', del); for (const r of rekey) { const { error } = await db.from('research_products').update({ dedupe_key: r.key }).eq('id', r.id); if (error) console.log('  ✗', r.id, error.message); } }
}
const COUNTRY: Record<number, string> = { 4114: '203', 4250: '276', 4282: '410', 4306: '756' };
for (const [id, c] of Object.entries(COUNTRY)) {
  if (!APPLY) { console.log(`#${id} 国家 → ${c}`); continue; }
  await db.from('companies').update({ country: c, updated_at: new Date().toISOString() }).eq('id', id);
  const v = await ensureCompanyFloraId(Number(id)).catch(() => null);
  const { data } = await db.from('companies').select('name, external_id').eq('id', id).single(); console.log(`#${id} ${data?.name} → ${data?.external_id || v}`);
}
if (APPLY) fs.writeFileSync('reports/1109-姜贺第二轮-改前备份.json', JSON.stringify(bak, null, 1));
