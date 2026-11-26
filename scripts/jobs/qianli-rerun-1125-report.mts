/** 11-25 特色标签重跑明细：汇总 / 50 条回测对照 / 新抽样 50（请核对）/ 按标签增减 / 改动全部 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
import XLSX from 'xlsx';
const { SPECIALTY_TAGS } = await import('@/data/qianli-prompts');
const z1 = new Map(SPECIALTY_TAGS.map(t => [t.l1_value, t.l1])), z2 = new Map(SPECIALTY_TAGS.map(t => [t.l2_value, t.l2]));
const show = (a: any, m: Map<string, string>) => (a || []).map((x: string) => m.get(x) || x).join('；');
const log: any[] = JSON.parse(fs.readFileSync('reports/1125-潜历特色标签重跑.json', 'utf8'));
const total = JSON.parse(fs.readFileSync('reports/1125-潜历特色标签-改前备份.json', 'utf8')).length;
const cnt = (k: 'old_l2' | 'l2') => { const m = new Map<string, number>(); for (const r of log) for (const v of r[k] || []) m.set(v, (m.get(v) || 0) + 1); return m; };
const before = cnt('old_l2'), after = cnt('l2');
const byTag = SPECIALTY_TAGS.map(t => ({ 一级: t.l1, 二级: t.l2, 改前: before.get(t.l2_value) || 0, 改后: after.get(t.l2_value) || 0, 增减: (after.get(t.l2_value) || 0) - (before.get(t.l2_value) || 0) })).filter(r => r.改前 || r.改后).sort((a, b) => Math.abs(b.增减) - Math.abs(a.增减));
const rows = log.map(r => ({ 岗位ID: r.id, 岗位名称: r.name, 公司: r.company, '改前·二级': show(r.old_l2, z2), '改后·一级': show(r.l1, z1), '改后·二级': show(r.l2, z2) }));
const seed = (s: number) => () => (s = (s * 9301 + 49297) % 233280) / 233280; const rnd = seed(1125);
// 抽样避开同名岗位扎堆（上轮 50 条里 27 条是同一种学习教练）：每个岗位名最多 2 条
const pool = [...rows].sort(() => rnd() - 0.5), seen = new Map<string, number>(), sample: any[] = [];
for (const r of pool) { const k = String(r.岗位名称).replace(/[-（(].*$/, ''); if ((seen.get(k) || 0) >= 2) continue; seen.set(k, (seen.get(k) || 0) + 1); sample.push({ ...r, '核对（对 / 错 / 存疑）': '', 备注: '' }); if (sample.length >= 50) break; }
const sum = [
  { 项: '重跑岗位（11-24 那批）', 数: total }, { 项: '标签有变化', 数: log.length },
  { 项: '去掉「培训体系」', 数: log.filter(r => (r.old_l2 || []).includes('training_system') && !(r.l2 || []).includes('training_system')).length },
  { 项: '新打「新人成长期」', 数: log.filter(r => !(r.old_l2 || []).includes('ramp_up') && (r.l2 || []).includes('ramp_up')).length },
  { 项: '新打「不限理工背景」', 数: log.filter(r => !(r.old_l2 || []).includes('non_stem') && (r.l2 || []).includes('non_stem')).length },
  { 项: '原来空、现在有标签', 数: log.filter(r => !(r.old_l2 || []).length && (r.l2 || []).length).length },
  { 项: '原来有、现在清空', 数: log.filter(r => (r.old_l2 || []).length && !(r.l2 || []).length).length },
];
const wb = XLSX.utils.book_new();
const add = (n: string, d: any[], w?: number[]) => { const ws = XLSX.utils.json_to_sheet(d); if (w) ws['!cols'] = w.map(wch => ({ wch })); XLSX.utils.book_append_sheet(wb, ws, n); };
add('汇总', sum, [30, 10]);
const bt = XLSX.readFile('reports/潜历特色标签回测-20261125.xlsx'); XLSX.utils.book_append_sheet(wb, bt.Sheets[bt.SheetNames[0]], '上轮50条回测对照');
add('新抽样 50 条（请核对）', sample, [8, 28, 16, 30, 24, 36, 14, 40]);
add('按标签增减', byTag, [14, 18, 8, 8, 8]);
add('改动全部', rows, [8, 28, 16, 30, 24, 36]);
XLSX.writeFile(wb, 'reports/潜历特色标签重跑明细-20261125.xlsx');
console.log(sum, byTag.slice(0, 10));
