/**
 * 数据部门 11-09（周赞灵）：企业库 country / province / city / county_area 从中文名换成选项集 value（可重复跑）。
 * 先把原值存一份到 reports/1109-企业地区-换编码前备份.json；认不出的留空，人工锁定的字段认不出时保留原值。
 *   npx tsx scripts/companies/region-codes-1109.mts [--apply]
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const { resolveCompanyRegion, resolveRegion, regionName, COMPANY_REGION_KEYS: KEYS } = await import('@/lib/region-codes');
const APPLY = process.argv.includes('--apply');
const { data } = await selectAll(() => db.from('companies').select('id, name, country, province, city, county_area, human_locked_fields').order('id'));
const R = data as any[];
const groups = new Map<string, number[]>(), lost: any[] = [], conflict: any[] = [];
const st: Record<string, any> = {}; for (const k of KEYS) st[k] = { 原有值: 0, 换成编码: 0, 已是编码: 0, 认不出: 0 };
const NAMEOF = (k: string, v: any) => regionName(k === 'county_area' ? 'county' : k as any, v);
for (const c of R) {
  const r: any = resolveCompanyRegion(c);
  const patch: any = {};
  const sar = ['344', '446', '158'].includes(String(r.country));
  for (const k of KEYS) {
    const old = c[k]; const blank = old == null || old === '';
    if (blank) { if (r[k] && k !== 'county_area' && !sar) { patch[k] = r[k]; st[k].上下级补上 = (st[k].上下级补上 || 0) + 1; } if (blank && k === 'county_area' && r[k]) { patch[k] = r[k]; st[k].上下级补上 = (st[k].上下级补上 || 0) + 1; } continue; }
    st[k].原有值++;
    if (r[k]) {
      if (String(old) === r[k]) st[k].已是编码++; else { st[k].换成编码++; patch[k] = r[k]; }
      const nm = NAMEOF(k, r[k]).replace(/(省|市|区|县)$/, ''), o0 = String(old).replace(/(省|市|区|县)$/, '');
      const sameCountry = k === 'country' && resolveRegion({ country: old }).country === r[k];
      if (!/^(\d+|city_|state_)/.test(String(old)) && !nm.includes(o0) && !o0.includes(nm) && !sameCountry && !/^[A-Za-z]/.test(String(old))) conflict.push({ id: c.id, 企业: c.name, 字段: k, 原值: old, 换成: NAMEOF(k, r[k]), 同行: `${c.country}/${c.province}/${c.city}/${c.county_area}` });
    } else if (sar) { st[k].港澳台只留国家 = (st[k].港澳台只留国家 || 0) + 1; patch[k] = null; }
    else {
      st[k].认不出++;
      const locked = (c.human_locked_fields || []).includes(k);
      lost.push({ id: c.id, 企业: c.name, 字段: k, 原值: old, 国家: c.country, 省: c.province, 城市: c.city, 处理: locked ? '人工锁定，保留原值' : '清空' });
      if (!locked) patch[k] = null;
    }
  }
  if (Object.keys(patch).length) { const key = JSON.stringify(patch); groups.set(key, [...(groups.get(key) || []), c.id]); }
}
console.log('企业', R.length, '要改', [...groups.values()].reduce((s, a) => s + a.length, 0), '组', groups.size); console.log(st);
const top = (f: string) => { const c: any = {}; for (const l of lost.filter(x => x.字段 === f)) c[l.原值] = (c[l.原值] || 0) + 1; return Object.entries(c).sort((a: any, b: any) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `${k}×${n}`).join(' '); };
for (const k of KEYS) console.log(k, '认不出 TOP：', top(k));
console.log('值变了样（要人看）', conflict.length, conflict.slice(0, 40).map(x => `${x.字段}:${x.原值}→${x.换成}`).join(' | '));
fs.writeFileSync('reports/1109-企业地区-认不出.json', JSON.stringify({ lost, conflict }, null, 1));
if (!APPLY) process.exit(0);
const bak = 'reports/1109-企业地区-换编码前备份.json';
if (!fs.existsSync(bak)) fs.writeFileSync(bak, JSON.stringify(R.map(c => ({ id: c.id, country: c.country, province: c.province, city: c.city, county_area: c.county_area }))));
let done = 0;
for (const [key, ids] of groups) for (let i = 0; i < ids.length; i += 200) {
  const { error } = await db.from('companies').update(JSON.parse(key)).in('id', ids.slice(i, i + 200));
  if (error) { console.log('✗', error.message); process.exit(1); }
  done += Math.min(200, ids.length - i);
}
console.log('已改', done);
