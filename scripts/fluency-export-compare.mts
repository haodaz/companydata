/**
 * AI 驾驭量表 · 三种评法对照数据集（11-20，给宇宁）：v3 原版 / v3 照标准修（切块 · 窗口按块 · 同块同行为 1 条 · k/b 照 02 页）/ 评审团。
 *   npx tsx scripts/fluency-export-compare.mts [输出 xlsx]
 * 表：说明 / 三种评法对照 / 作答对比 / 行为对比 / 评审团证据
 */
import { readFileSync, existsSync } from 'fs';
import XLSX from 'xlsx';
import spec from '@/lib/work/fluency/spec-v3.json';

const out = process.argv[2] || 'docs/fluency-dataset-1120/AI驾驭量表-三种评法对照-20261120.xlsx';
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
const B: any = (spec as any).behaviors, BIDS = Object.keys(B).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
const SETS = [
  { name: '聊天考试台（工具 + AI 助理）', files: { 'v3 原版': 'docs/fluency-dataset-1117/sim/fluency.jsonl', 'v3 照标准修': 'docs/fluency-dataset-1120/chat/fluency.jsonl', '评审团': 'docs/fluency-dataset-1120/chat-committee/fluency.jsonl' } },
  { name: 'AI 工作台', files: { 'v3 原版': 'docs/fluency-dataset-1117b/agent/fluency.jsonl', 'v3 照标准修': 'docs/fluency-dataset-1120/agent-v3/fluency.jsonl', '评审团': 'docs/fluency-dataset-1120/agent-committee/fluency.jsonl' } },
] as const;
const ENG = ['v3 原版', 'v3 照标准修', '评审团'] as const;
const LV = ['资深', '一般', '新手', '全托管'];
const ORD: Record<string, number> = { 资深: 3, 一般: 2, 新手: 1, 全托管: 0 };
const total = (r: any) => r.overall ?? r.portrait_overall ?? null;
const name = (r: any) => r.sim_id || r.session_id;
const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
const rank = (xs: number[]) => { const s = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = Array(xs.length).fill(0); let i = 0; while (i < s.length) { let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j++; for (let k = i; k <= j; k++) r[s[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const spear = (a: number[], b: number[]) => { const ra = rank(a), rb = rank(b), ma = ra.reduce((x, y) => x + y, 0) / ra.length, mb = rb.reduce((x, y) => x + y, 0) / rb.length; const n = ra.reduce((s, x, i) => s + (x - ma) * (rb[i] - mb), 0), d = Math.sqrt(ra.reduce((s, x) => s + (x - ma) ** 2, 0) * rb.reduce((s, y) => s + (y - mb) ** 2, 0)); return d ? Math.round((n / d) * 100) / 100 : null; };

const cmp: any[] = [], sess: any[] = [], beh: any[] = [], ev: any[] = [];
for (const set of SETS) {
  const data = Object.fromEntries(ENG.map(e => [e, read(set.files[e])])) as Record<string, any[]>;
  for (const e of ENG) {
    const rows = data[e].filter(r => total(r) != null);
    let cap = 0, tot = 0; const vals = new Set<number>();
    for (const r of rows) for (const b of Object.values<any>(r.behaviors)) { if (b.score == null || b.score === 0) continue; tot++; vals.add(b.score); if (b.capped) cap++; }
    const row: any = { 考试台: set.name, 评法: e, 场数: rows.length };
    for (const l of LV) { const xs = rows.filter(r => r.level === l).map(total); if (xs.length) row[`${l}均分`] = mean(xs); }
    Object.assign(row, { 有分行为数: tot, 单点封顶数: cap, 封顶率: tot ? Math.round((cap / tot) * 100) / 100 : null, 行为分用到几个值: vals.size, '与水平的秩相关（资深>一般>新手>全托管）': spear(rows.map(r => ORD[r.level] ?? 1), rows.map(total)) });
    cmp.push(row);
  }
  const ids = [...new Set(data['v3 原版'].map(name))];
  for (const id of ids) {
    const by = Object.fromEntries(ENG.map(e => [e, data[e].find(r => name(r) === id)])) as Record<string, any>;
    const base = by['v3 原版'];
    const row: any = { 考试台: set.name, 作答: id, 岗位: base.role, 水平: base.level, 任务: base.task_title };
    for (const e of ENG) { const r = by[e]; row[`${e} 总分`] = r ? total(r) : null; row[`${e} 段位`] = r?.tier ?? null; row[`${e} 封顶项数`] = r ? Object.values<any>(r.behaviors).filter(b => b.capped).length : null; }
    row['任务块数'] = Number(((by['v3 照标准修']?.logs || []).find((x: string) => x.startsWith('任务块')) || '').match(/(\d+) 块/)?.[1] || 1);
    sess.push(row);
    for (const bid of BIDS) {
      const r: any = { 考试台: set.name, 作答: id, 水平: base.level, 行为: bid, 名称: B[bid].cn, 维度: B[bid].dim };
      for (const e of ENG) { const x = by[e]?.behaviors?.[bid]; r[`${e} 分`] = x?.score ?? null; r[`${e} 封顶`] = x?.capped ? '是' : ''; r[`${e} 成立证据`] = x?.evidence?.length ?? 0; }
      const fix = by['v3 照标准修']?.behaviors?.[bid]; r['照标准修 k'] = fix?.k ?? null; r['照标准修 b'] = fix?.b ?? null; r['照标准修 occ（不进分）'] = fix?.occ ?? null;
      r['未观测原因（评审团）'] = by['评审团']?.behaviors?.[bid]?.na || '';
      beh.push(r);
    }
    for (const [bid, x] of Object.entries<any>(by['评审团']?.behaviors || {})) for (const e of x.evidence || []) ev.push({ 考试台: set.name, 作答: id, 水平: base.level, 行为: bid, 名称: B[bid]?.cn, 评委: String(e.rule || '').replace(/^评委(\d+).*/, '维度 $1'), 消息: e.i >= 0 ? e.i + 1 : '平台记录', 任务块: (e.block ?? 0) + 1, 档位: e.q, 原话: e.quote, 理由: e.why });
  }
}

const doc = [
  ['这是什么', '同一批模拟作答（聊天考试台 24 场 + AI 工作台 10 场），不重新作答，只换评法，评三遍对照。'],
  ['v3 原版', '11-17 的平台引擎：正则 + 生效窗口取候选 → 一个模型判 25 项 → 模型补扫 → 互斥仲裁；k 按「不相邻的几段」数（同块内不相邻也算两条）。'],
  ['v3 照标准修', '11-20：按潜历复盘 4.1 对齐标准——先切任务块（平台事件：推进式第几步 × 在做哪份交付物；外部 AI 按工具）；B1/B11/B14/B10 窗口按块；单块 < 4 条时 B10/B15/B16/B17 N/A；同块同行为只算 1 条，k = 支撑最高档的证据数、b = 落在几个块，k = b = 1 单点封顶。和宇宁 ai_fluency_v3 同口径。'],
  ['评审团', '11-20：切块 → 7 个维度评委各评自己的 3–4 个行为（逐块读整段对话、引原话、按锚点定档，评委之间不抢指标，不再做互斥 / 超级 Prompt 仲裁）→ 代码核对引文（对不上原话的作废）、取最高档；封顶看「一次 vs 多次」：成立证据出现在 ≥ 2 处（不同块，或同块内不相邻两段）就不封顶 → 总评（原解读）。'],
  ['occ', '诊断数，不进分：成立证据出现在几段不相邻的消息上（同块内也数）。用来看「块内多次出现」能不能区分一贯的人。'],
  ['任务块数', '这批模拟作答都是单交付物、无分步的题，全部只切出 1 块——所以「照标准修」= 同块只算 1 条 → 全部单点封顶。'],
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['项', '说明'], ...doc]), '说明');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cmp), '三种评法对照');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sess), '作答对比');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(beh), '行为对比');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ev), '评审团证据');
XLSX.writeFile(wb, out);
console.log('写好了', out, `对照 ${cmp.length} 行 · 作答 ${sess.length} · 行为 ${beh.length} · 证据 ${ev.length}`);
