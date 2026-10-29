/**
 * 外采篮补详情链接的企业名单（数据部门 10-29：用外采篮补，岗位数多的企业优先）。
 * 名单 = 「列表页，未找到该岗位详情」的岗位，去掉 hotjob / 北森（那两家走接口查过，查不到基本是下线了，另列）。
 *   npx tsx scripts/jobs/basket-list.mts --out reports/xxx.xlsx
 */
process.loadEnvFile('.env.local');
const XLSX = (await import('xlsx')).default;
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { selectAll } = await import('@/lib/supabase-all');
const opt = (k: string, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const { data } = await selectAll(() => db.from('jobs').select('id, link, company_id, institute_or_company_name, company_slug').not('if_delete', 'is', true).eq('link_issue', '列表页，未找到该岗位详情').order('id'));
const plat = (u: string) => { try { const h = new URL(u).hostname; return /mokahr/.test(h) ? 'Moka' : /feishu/.test(h) ? '飞书' : /bytedance/.test(h) ? '字节' : /qq\.com|tencent/.test(h) ? '腾讯' : /meituan/.test(h) ? '美团' : /baidu/.test(h) ? '百度' : /huawei/.test(h) ? '华为' : h; } catch { return '—'; } };
const all = data as any[];
const offline = all.filter(j => /hotjob|zhiye/.test(j.link || ''));
const t = all.filter(j => !/hotjob|zhiye/.test(j.link || ''));
const by = new Map<number, any>();
for (const j of t) { const e = by.get(j.company_id) || { 企业库id: j.company_id, 企业: j.institute_or_company_name, 企业编号: j.company_slug, 待补岗位数: 0, 招聘平台: new Set<string>(), 现在挂的链接示例: j.link, 岗位库里看这些岗位: `https://www.aidataoffice.com/admin/db-job?companyId=${j.company_id}&link=list_missing` }; e.待补岗位数++; e.招聘平台.add(plat(j.link)); by.set(j.company_id, e); }
const rows = [...by.values()].sort((a, b) => b.待补岗位数 - a.待补岗位数).map((e, i) => ({ 优先级: i + 1, ...e, 招聘平台: [...e.招聘平台].join(' / '), 补完打勾: '' }));
const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(rows); ws['!cols'] = [{ wch: 6 }, { wch: 8 }, { wch: 28 }, { wch: 22 }, { wch: 10 }, { wch: 18 }, { wch: 50 }, { wch: 62 }, { wch: 8 }];
XLSX.utils.book_append_sheet(wb, ws, '外采篮补详情链接');
XLSX.writeFile(wb, opt('out', 'reports/外采篮补详情链接.xlsx'));
console.log(`外采篮待补 ${t.length} 个岗位 / ${rows.length} 家；hotjob · 北森查不到（多半下线）${offline.length} 个`);
console.log(rows.slice(0, 10).map(r => `${r.企业} ${r.待补岗位数}（${r.招聘平台}）`).join('\n'));
