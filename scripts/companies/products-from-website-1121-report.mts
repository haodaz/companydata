/**
 * 11-21/22 官网核心产品批量的明细表：每家读了几页、抓到 / 入库多少、没抓到的原因；还没产品的企业单列。
 *   npx tsx scripts/companies/products-from-website-1121-report.mts
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
import XLSX from 'xlsx';
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const LOG: Record<string, any> = JSON.parse(fs.readFileSync('reports/1121-官网核心产品批量.json', 'utf8'));
const { data: cs } = await selectAll(() => db.from('companies').select('id, name, external_id, official_website, supplier_categories, human_review_status').not('if_delete', 'is', true).order('id'));
const { data: ps } = await selectAll(() => db.from('company_products').select('company_id, name, category, source_url, created_at').eq('if_delete', false).gte('created_at', '2026-11-21T00:00:00Z').order('id'));
const co = new Map((cs as any[]).map(c => [c.id, c]));
const byCo = new Map<number, any[]>(); for (const p of ps as any[]) byCo.set(p.company_id, [...(byCo.get(p.company_id) || []), p]);
const why = (x: any) => x.error ? (/GoogleGenerativeAI/.test(x.error) ? 'Gemini key 失效（未跑完）' : /5 分钟/.test(x.error) ? '超时跳过（官网太慢 / 页面卡住）' : /官网打不开/.test(x.error) ? '官网打不开' : x.error) : x.found ? '' : '官网上没读到产品（可贴产品页链接再抓）';
const rows = Object.entries(LOG).map(([id, x]) => { const c: any = co.get(Number(id)) || {}; return { 企业ID: Number(id), 企业: c.name || x.name, 企业编号: c.external_id, 科研厂商: (c.supplier_categories || []).length ? '是' : '', 官网: c.official_website, 读了几页: x.pages ?? '', 抓到产品: x.found ?? 0, 入库: x.saved ?? 0, 结果: x.found ? '已入库' : '未抓到', 原因: why(x), 用时秒: x.sec ?? '' }; }).sort((a, b) => b.入库 - a.入库);
const prods = (ps as any[]).filter(p => LOG[p.company_id]).map(p => ({ 企业ID: p.company_id, 企业: co.get(p.company_id)?.name, 产品: p.name, 品类: p.category, 来源页: p.source_url }));
const { data: allP } = await selectAll(() => db.from('company_products').select('company_id').eq('if_delete', false));
const has = new Set((allP as any[]).map(p => p.company_id));
const left = (cs as any[]).filter(c => c.human_review_status !== 'hidden' && !has.has(c.id) && c.official_website).map(c => ({ 企业ID: c.id, 企业: c.name, 科研厂商: (c.supplier_categories || []).length ? '是' : '', 官网: c.official_website, 状态: LOG[c.id] ? why(LOG[c.id]) : '还没轮到（key 失效时停了）' }));
const ok = rows.filter(r => r.抓到产品);
const sum = [['项目', '数量'], ['本次处理的企业', rows.length], ['抓到产品并入库的企业', ok.length], ['入库产品条数', ok.reduce((s, r) => s + r.入库, 0)], ['其中科研厂商', ok.filter(r => r.科研厂商).length],
  ['未抓到：Gemini key 失效', rows.filter(r => /key/.test(r.原因)).length], ['未抓到：超时', rows.filter(r => /超时/.test(r.原因)).length], ['未抓到：官网打不开', rows.filter(r => r.原因 === '官网打不开').length], ['未抓到：官网上没读到产品', rows.filter(r => /没读到/.test(r.原因)).length],
  ['有官网、仍没有核心产品的企业', left.length], ['说明', '模型 gemini-4-neon（黑客松 key）；每家最多读 12 页 + 顺着详情页 8 页；每条产品带来源页；已有的只补空、人工改过 / 删过的不动']];
const wb = XLSX.utils.book_new();
const add = (r: any, n: string, aoa = false) => { const ws = aoa ? XLSX.utils.aoa_to_sheet(r) : XLSX.utils.json_to_sheet(r); ws['!cols'] = (aoa ? r[0] : Object.keys(r[0] || {})).map((k: string) => ({ wch: /官网|来源页|原因|说明|状态/.test(k) ? 44 : /企业|产品|品类/.test(k) ? 28 : 12 })); XLSX.utils.book_append_sheet(wb, ws, n); };
add(sum, '汇总', true); add(rows, '按企业'); add(prods, '入库产品'); add(left, '仍没有产品');
const out = 'reports/官网核心产品批量明细-20261122.xlsx'; XLSX.writeFile(wb, out);
console.log(out, sum.slice(1, 10));
process.exit(0);
