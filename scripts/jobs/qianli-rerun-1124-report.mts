/**
 * 潜历标签重跑（11-24）的明细表：补上的全部、按标签统计、随机抽 50 条给数据部门核对。
 *   npx tsx scripts/jobs/qianli-rerun-1124-report.mts
 */
process.loadEnvFile('.env.local');
import fs from 'node:fs';
import XLSX from 'xlsx';
const { QIANLI_FUNCTION_NAMES: FN, QIANLI_SPECIALTY_L1_NAMES: L1, QIANLI_SPECIALTY_L2_NAMES: L2 } = await import('@/lib/qianli-tags');
const log: any[] = JSON.parse(fs.readFileSync('reports/1124-潜历标签重跑.json', 'utf8'));
const cn = (a: string[] | null, m: Record<string, string>) => (a || []).map(v => m[v] || v).join('；');
const rows = log.filter(r => r.written).map(r => ({ 岗位ID: r.id, 岗位名称: r.name, 公司: r.company, '潜历特色标签（一级）': cn(r.specialty_l1, L1), '潜历特色标签（二级）': cn(r.specialty_l2, L2), 潜历职能标签: r.function ? FN[r.function] || r.function : '', 职能判断理由: r.function_reason || '' }));
const stat: Record<string, number> = {}; for (const r of log) for (const v of r.specialty_l2 || []) stat[L2[v] || v] = (stat[L2[v] || v] || 0) + 1;
const sample = [...rows].sort(() => Math.random() - 0.5).slice(0, 50).map(r => ({ ...r, '核对（对 / 错 / 存疑）': '', 备注: '' }));
const sum = [['项目', '数量'], ['重跑的岗位（审核已完成、标签为空）', log.length], ['特色标签补上', log.filter(r => r.specialty_l2?.length).length], ['职能标签补上', log.filter(r => r.function).length], ['仍为空（原文没有对应信号，宁空不错）', log.filter(r => !r.written).length], ['说明', '模型 qwen3.7-plus；原文证据关照旧（原文找不到字眼的标签去掉）；只补空的，已有标签和人工锁定的不动']];
const wb = XLSX.utils.book_new();
const add = (r: any, n: string, aoa = false) => { const ws = aoa ? XLSX.utils.aoa_to_sheet(r) : XLSX.utils.json_to_sheet(r); ws['!cols'] = (aoa ? r[0] : Object.keys(r[0] || {})).map((k: string) => ({ wch: /理由|说明|标签|岗位名称|重跑/.test(k) ? 36 : 14 })); XLSX.utils.book_append_sheet(wb, ws, n); };
add(sum, '汇总', true); add(sample, '抽样 50 条（请核对）'); add(Object.entries(stat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ 二级标签: k, 岗位数: v })), '按标签统计'); add(rows, '补上的全部');
const out = 'reports/潜历标签重跑明细-20261124.xlsx'; XLSX.writeFile(wb, out);
console.log(out, sum.slice(1, 5), Object.entries(stat).sort((a, b) => b[1] - a[1]).slice(0, 8));
