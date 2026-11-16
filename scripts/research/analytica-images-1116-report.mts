/**
 * 姜贺 11-16 #88 / #89 明细表：补上封面的会刊产品、仍没封面的产品、企业修正逐字段改前改后。
 *   npx tsx scripts/research/analytica-images-1116-report.mts
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
import XLSX from 'xlsx';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const norm = (s: string) => (s || '').toLowerCase().replace(/[\s\-_/·（）()]+/g, '');
const OLD = JSON.parse(fs.readFileSync('reports/analytica-china-2026.bak-1116.json', 'utf8'));
const NEW = JSON.parse(fs.readFileSync('reports/analytica-china-2026.json', 'utf8'));
const names = (J: any, id: string) => new Set((J.details[id]?.exhibits || []).map((x: any) => norm(x.title || x.etitle)));
const VENDOR: any[] = fs.existsSync('reports/1116-官网产品补封面.json') ? JSON.parse(fs.readFileSync('reports/1116-官网产品补封面.json', 'utf8')) : [];
const vWhy = new Map(VENDOR.map(r => [r.id, r.why]));
const pub = (k: string) => db.storage.from('research-images').getPublicUrl(k).data.publicUrl;

const { data: ps } = await selectAll(() => db.from('research_products').select('id, external_id, name, supplier_id, source_url, images').eq('if_delete', false).order('id'));
const { data: cs } = await selectAll(() => db.from('companies').select('id, name, external_id'));
const co = new Map((cs as any[]).map(c => [c.id, c]));
const filled: any[] = [], still: any[] = [];
for (const p of ps as any[]) {
  const cat = String(p.source_url || '').includes('analyticachina'), id = String(p.source_url).match(/company\/(\d+)/)?.[1] || '';
  const c: any = co.get(p.supplier_id) || {}, base = { 产品ID: p.id, 产品编号: p.external_id, 产品名: p.name, 企业ID: p.supplier_id, 企业: c.name, 企业编号: c.external_id };
  if ((p.images || []).length) {
    const k = norm(p.name);
    if (cat && id && NEW.details[id]?.all_pages && names(NEW, id).has(k) && !names(OLD, id).has(k))
      filled.push({ ...base, 图片数: p.images.length, 封面: p.images[0].storage_path ? pub(p.images[0].storage_path) : p.images[0].url, 会刊页: p.source_url });
  } else {
    const inCat = cat && id && names(NEW, id).has(norm(p.name));
    still.push({ ...base, 来源: cat ? '慕尼黑会刊' : '厂商官网等', 原因: cat ? (inCat ? '会刊里这件商品没放图' : '会刊分页里没对上同名商品') : (vWhy.get(p.id) || '官网没找到这件产品的图'), 来源链接: p.source_url });
  }
}

// #89：改前备份 vs 现在库里
const bak: any[] = JSON.parse(fs.readFileSync('reports/1116-企业修正-改前备份.json', 'utf8'));
const red: [number, string, string][] = JSON.parse(fs.readFileSync('scripts/data/jianghe-1116-red.json', 'utf8'));
const keys = [...new Set(red.map(r => ({ applysqure_id: 'external_id', slug: 'external_id' } as any)[r[1]] || r[1]))];
const LABEL: Record<string, string> = { name: '名称', registered_name: '工商名', country: '国家', introduction: '简介', source: '来源', external_id: '企业编号', province: '省', city: '市', county_area: '区县' };
const { data: now } = await db.from('companies').select('*').in('id', bak.map(b => b.id));
const nm = new Map((now || []).map((c: any) => [c.id, c]));
const fix: any[] = [];
for (const b of bak) { const c: any = nm.get(b.id); for (const k of [...keys, 'province', 'city', 'county_area']) if (JSON.stringify(b[k] ?? null) !== JSON.stringify(c?.[k] ?? null)) fix.push({ 企业ID: b.id, 企业: c?.name, 字段: LABEL[k] || k, 改前: b[k] ?? '', 改后: c?.[k] ?? '' }); }

const sum = [
  ['事项', '数量', '说明'],
  ['#88 会刊产品原本没封面', 5363, '会刊参展商品 6 个一页，之前只抓了第一页'],
  ['#88 本次补上封面', filled.length, `共 ${filled.reduce((s, r) => s + r.图片数, 0)} 张，已转存自家图库（明细见第 2 页）`],
  ['#88 科研产品库仍没封面', still.length, `会刊 ${still.filter(r => r.来源 === '慕尼黑会刊').length} 件（会刊里本来没图）+ 官网等 ${still.filter(r => r.来源 !== '慕尼黑会刊').length} 件（明细见第 4 页）`],
  ['#88 官网来源再补', VENDOR.length, `重开官网产品页、千问看图挑「就是这件产品」的图并逐张复核：补上 ${VENDOR.filter(r => r.images).length} 件（${VENDOR.reduce((s, r) => s + r.images, 0)} 张），其余宁空不错留空（明细见第 3 页）`],
  ['#89 修正企业', bak.length, `逐字段 ${fix.length} 处，改过的字段已锁定（明细见第 5 页）`],
];
const wb = XLSX.utils.book_new();
const add = (rows: any, name: string, aoa = false) => { const ws = aoa ? XLSX.utils.aoa_to_sheet(rows) : XLSX.utils.json_to_sheet(rows); ws['!cols'] = (aoa ? rows[0] : Object.keys(rows[0] || {})).map((k: string) => ({ wch: /简介|改前|改后|封面|链接|会刊页|说明/.test(k) ? 50 : 16 })); XLSX.utils.book_append_sheet(wb, ws, name); };
add(sum, '汇总', true); add(filled, '#88 补上封面');
add(VENDOR.map(r => { const c: any = co.get(r.supplier_id) || {}; return { 产品ID: r.id, 产品名: r.name, 企业ID: r.supplier_id, 企业: c.name, 结果: r.images ? `补上 ${r.images} 张` : '留空', 封面: r.cover ? (/^https?:/.test(r.cover) ? r.cover : pub(r.cover)) : '', 说明: r.why, 来源链接: r.url }; }), '#88 官网再补'); add(still, '#88 仍没封面'); add(fix, '#89 企业修正');
const out = 'reports/11-16 数据部门反馈处理明细-20261116.xlsx';
XLSX.writeFile(wb, out);
console.log(out, { filled: filled.length, still: still.length, fixCompanies: bak.length, fixFields: fix.length });
