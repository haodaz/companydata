/** 潜历特色标签第二轮复核明细（11-27 给陈彩瑛）：读 reports/1127-潜历特色标签复核.json，附企业名和岗位链接 */
import XLSX from 'xlsx';
process.loadEnvFile('.env.local');
const { supabaseAdmin: db } = await import('@/lib/supabase');
const { QIANLI_SPECIALTY_L2_NAMES: N } = await import('@/lib/qianli-tags');
const log: any[] = JSON.parse((await import('node:fs')).readFileSync('reports/1127-潜历特色标签复核.json', 'utf8'));
const nm = (k: string) => (N as any)[k] || k;
const info = new Map<number, any>();
for (let i = 0; i < log.length; i += 200) {
  const { data } = await db.from('jobs').select('id,link,companies(name)').in('id', log.slice(i, i + 200).map(x => x.id));
  for (const r of data || []) info.set(r.id, r);
}
const rows = log.map(x => {
  const old = new Set<string>(x.old_l2 || []), now = new Set<string>(x.l2 || []);
  return { 岗位id: x.id, 企业: (info.get(x.id) as any)?.companies?.name || '', 岗位: x.name,
    去掉: [...old].filter(k => !now.has(k)).map(k => `${nm(k)}（${x.dropped?.[k] || ''}）`).join('；'),
    补上: [...now].filter(k => !old.has(k)).map(nm).join('、'),
    改前二级: [...old].map(nm).join('、'), 改后二级: [...now].map(nm).join('、'), 链接: info.get(x.id)?.link || '' };
});
const sum: any[] = [];
for (const k of new Set(log.flatMap(x => [...(x.old_l2 || []), ...(x.l2 || [])]))) {
  const d = log.filter(x => x.old_l2?.includes(k) && !x.l2?.includes(k)).length, a = log.filter(x => !x.old_l2?.includes(k) && x.l2?.includes(k)).length;
  if (d || a) sum.push({ 标签: nm(k), 去掉: d, 补上: a });
}
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows); ws['!cols'] = [8, 24, 30, 40, 24, 30, 30, 50].map(wch => ({ wch }));
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sum.sort((a, b) => b.去掉 + b.补上 - a.去掉 - a.补上)), '汇总');
XLSX.utils.book_append_sheet(wb, ws, `全部变化 ${rows.length}`);
XLSX.writeFile(wb, 'reports/潜历特色标签第二轮复核明细-20261127.xlsx');
console.log(rows.length, sum);
process.exit(0);
