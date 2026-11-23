/**
 * AI 驾驭量表 · 数据集 11-23（给宇宁）：同一批模拟作答（聊天考试台 24 + AI 工作台 10），三种评法对照 + 同题对比名次 + 稳定性。
 *   npx tsx scripts/fluency-export-1123.mts [输出 xlsx]
 */
import { readFileSync, existsSync } from 'fs';
import XLSX from 'xlsx';
import spec from '@/lib/work/fluency/spec-v3.json';

const out = process.argv[2] || 'docs/fluency-dataset-1123/AI驾驭量表-数据集-20261123.xlsx';
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
const B: any = (spec as any).behaviors, BIDS = Object.keys(B).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const ENG = ['v3 原版（11-17）', '评审团（11-20）', '评审团（11-23 最新）'] as const;
const SETS = [
  { name: '聊天考试台', files: ['docs/fluency-dataset-1117/sim/fluency.jsonl', 'docs/fluency-dataset-1120/chat-committee/fluency.jsonl', 'docs/fluency-dataset-1123/chat-full/fluency.jsonl'] },
  { name: 'AI 工作台', files: ['docs/fluency-dataset-1117b/agent/fluency.jsonl', 'docs/fluency-dataset-1120/agent-committee/fluency.jsonl', 'docs/fluency-dataset-1123/agent-full/fluency.jsonl'] },
];
const LV = ['资深', '一般', '新手', '全托管'], ORD: Record<string, number> = { 资深: 3, 一般: 2, 新手: 1, 全托管: 0 };
const total = (r: any) => r.overall ?? r.portrait_overall ?? null;
const key = (r: any) => r.sim_id || r.session_id;
const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
const rank = (xs: number[]) => { const s = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = Array(xs.length).fill(0); let i = 0; while (i < s.length) { let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j++; for (let k = i; k <= j; k++) r[s[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const spear = (a: number[], b: number[]) => { const ra = rank(a), rb = rank(b), ma = ra.reduce((x, y) => x + y, 0) / ra.length, mb = rb.reduce((x, y) => x + y, 0) / rb.length; const n = ra.reduce((s, x, i) => s + (x - ma) * (rb[i] - mb), 0), d = Math.sqrt(ra.reduce((s, x) => s + (x - ma) ** 2, 0) * rb.reduce((s, y) => s + (y - mb) ** 2, 0)); return d ? Math.round((n / d) * 100) / 100 : null; };

const peers: any[] = existsSync('docs/fluency-dataset-1123/peer-ranks.json') ? JSON.parse(readFileSync('docs/fluency-dataset-1123/peer-ranks.json', 'utf8')) : [];
const cmp: any[] = [], sess: any[] = [], beh: any[] = [], ev: any[] = [];
for (const set of SETS) {
  const data = set.files.map(read);
  ENG.forEach((e, k) => {
    const rows = data[k].filter((r: any) => total(r) != null);
    let cap = 0, tot = 0;
    for (const r of rows) for (const b of Object.values<any>(r.behaviors)) { if (b.score == null || b.score === 0) continue; tot++; if (b.capped) cap++; }
    const row: any = { 考试台: set.name, 评法: e, 场数: rows.length };
    for (const l of LV) { const xs = rows.filter((r: any) => r.level === l).map(total); if (xs.length) row[`${l}均分`] = mean(xs); }
    Object.assign(row, { 封顶率: tot ? Math.round((cap / tot) * 100) / 100 : null, '与水平的秩相关': spear(rows.map((r: any) => ORD[r.level] ?? 1), rows.map(total)) });
    cmp.push(row);
  });
  const latest = data[2];
  const pr = peers.filter(p => p.考试台 === set.name);
  const ok = pr.length ? (() => { const byTask = new Map<string, any[]>(); for (const p of pr) byTask.set(p.任务, [...(byTask.get(p.任务) || []), p]); const tasks = [...byTask.values()]; const right = tasks.filter(xs => xs.slice().sort((a, b) => a.同题名次 - b.同题名次).every((x, i, arr) => i === 0 || (ORD[arr[i - 1].水平] ?? 1) >= (ORD[x.水平] ?? 1))).length; return `${right}/${tasks.length}`; })() : null;
  cmp.push({ 考试台: set.name, 评法: '同题对比（两两比较排名次）', 场数: pr.length, 说明: `同一道题内按水平排对的题：${ok}` });
  for (const r of latest) {
    const id = key(r); const row: any = { 考试台: set.name, 作答: id, 岗位: r.role, 水平: r.level, 任务: r.task_title };
    ENG.forEach((e, k) => { const x = data[k].find((y: any) => key(y) === id); row[`${e} 总分`] = x ? total(x) : null; row[`${e} 段位`] = x?.tier ?? null; });
    const p = pr.find(x => x.作答 === id); row['同题名次'] = p ? `${p.同题名次}/${p.共几人}` : null;
    sess.push(row);
    for (const bid of BIDS) {
      const x = r.behaviors?.[bid] || {};
      beh.push({ 考试台: set.name, 作答: id, 水平: r.level, 行为: bid, 名称: B[bid].cn, 维度: B[bid].dim, 分: x.score ?? null, 最高档: x.q_max ?? null, 单点封顶: x.capped ? '是' : '', k: x.k ?? null, b: x.b ?? null, '出现处数（诊断）': x.occ ?? null, 成立证据: (x.evidence || []).length, 未观测原因: x.na || '' });
      for (const e of x.evidence || []) ev.push({ 考试台: set.name, 作答: id, 水平: r.level, 行为: bid, 名称: B[bid].cn, 评委: String(e.rule || '').replace(/^评委(\d+).*/, '维度 $1'), 消息: e.i >= 0 ? e.i + 1 : '平台记录', 任务块: (e.block ?? 0) + 1, 档位: e.q, 原话: e.quote, 理由: e.why, '据 AI 回复': /^据\s*AI\s*回复/.test(String(e.why || '')) ? '是' : '' });
    }
  }
}
const stab: any = existsSync('docs/fluency-dataset-1123/稳定性-20261123.json') ? JSON.parse(readFileSync('docs/fluency-dataset-1123/稳定性-20261123.json', 'utf8')) : {};
const stabRows = Object.entries<any>(stab).flatMap(([k, v]) => v.明细.map((m: any) => ({ 考试台: k, ...m, 一次有一次没有的行为: (m.一次有一次没有的行为 || []).join(' ') })));
const stabSum = Object.entries<any>(stab).map(([k, v]) => ({ 考试台: k, ...Object.fromEntries(Object.entries(v).filter(([x]) => x !== '明细')) }));

const doc = [
  ['这是什么', '同一批模拟作答（聊天考试台 24 场 + AI 工作台 10 场），不重新作答，只换评法评。只在海外平台测试，国内不动。'],
  ['v3 原版（11-17）', '正则 + 生效窗口取候选 → 一个模型判 25 项 → 模型补扫 → 互斥仲裁。'],
  ['评审团（11-20）', '切块 → 7 个维度评委各评自己的行为（逐块读整段对话、引原话、按锚点定档）→ 代码核对引文、取最高档、一次 vs 多次封顶 → 总评。'],
  ['评审团（11-23 最新）', '在 11-20 基础上：评委看得到交付物；去重只在两项引的是同一段话时才做（同一条消息不同的话都算）；AI 回复里复述了用户要改的算用户的迭代 / 纠错（理由开头「据 AI 回复」）；「AI 参与说明」是自述，只作 B21 / B22 证据；改写量带占交付物比例；单点封顶「两条不同消息就算多次」。'],
  ['同题对比', '同一道题的候选人两两比较（谁更会带着 AI 把事做好），每次正反各比一遍去掉位置偏差，排出名次。平台已上线：交卷后插进这道题的排名，企业端候选人表一列「同题第几 / 共几」。'],
  ['稳定性', '14 场同一份作答独立评两次（11-23 前一版评审团），总分差、段位、行为分一致率、一次有一次没有的行为。'],
  ['出现处数（诊断）', '成立证据出现在几段不相邻的消息上，不进分。'],
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['项', '说明'], ...doc]), '说明');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cmp), '评法对照');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sess), '作答');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(peers), '同题对比');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(beh), '行为（11-23）');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ev), '证据（11-23）');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stabSum), '稳定性汇总');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stabRows), '稳定性明细');
XLSX.writeFile(wb, out);
console.log('写好了', out, `对照 ${cmp.length} · 作答 ${sess.length} · 同题 ${peers.length} · 行为 ${beh.length} · 证据 ${ev.length}`);
