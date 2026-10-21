/**
 * 科研仪器厂商的国家统一成企业库口径（中文国名）：analytica 名单写进来的是英文（Germany / USA / Great Britain…），
 * 早先建档的有些是空（聚光科技 country 为空 → 产品被算成「进口」）。空的按企业编号的国家码 / 中文名 + .cn 官网补「中国」。
 *   npx tsx scripts/normalize-supplier-country.mts [--apply]
 */
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { countryCn } = await import('@/lib/country-cn');
const APPLY = process.argv.includes('--apply');


const { data } = await selectAll(() => db.from('companies').select('id, name, country, external_id, official_website').not('supplier_categories', 'eq', '{}').not('if_delete', 'is', true).order('id'));
const changes: { id: number; name: string; from: any; to: string }[] = [];
const unknown: string[] = [];
for (const c of data as any[]) {
  let to: string | null = null;
  if (c.country) {
    if (/[一-鿿]/.test(c.country)) continue;   // 已经是中文
    to = countryCn(c.country);
    if (!to) { unknown.push(`${c.name}（${c.country}）`); continue; }
  } else if (/^cn\./.test(c.external_id || '') || (/[一-鿿]/.test(c.name) && /\.cn(\/|$)/.test(c.official_website || ''))) to = '中国';
  else { unknown.push(`${c.name}（空）`); continue; }
  changes.push({ id: c.id, name: c.name, from: c.country, to });
}
console.log(`要改 ${changes.length} 家：`, Object.entries(changes.reduce((m: any, c) => ({ ...m, [`${c.from}→${c.to}`]: (m[`${c.from}→${c.to}`] || 0) + 1 }), {})).map(([k, n]) => `${k} ${n}`).join('，'));
if (unknown.length) console.log(`认不出、没动 ${unknown.length} 家：${unknown.slice(0, 30).join('、')}`);
if (APPLY) { for (const c of changes) await db.from('companies').update({ country: c.to }).eq('id', c.id); console.log('已写回'); }
