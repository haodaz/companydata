/**
 * AI 驾驭量表 · 数据集 11-27（给宇宁）：按她《评价体系-数据源与字段设计》补的采集，落到数据上是什么样。
 *   ① 真实作答的统一记录覆盖（docs/fluency-dataset-1127/records：只读库、不调模型）
 *   ② 模拟作答补「交付后两问」后，同一批 24 场评两遍：A = 新引擎不带两问（只多了交付差异）· B = 带两问；对照 11-23
 *   npx tsx scripts/fluency-export-1127.mts [输出 xlsx]
 */
import { readFileSync, existsSync } from 'fs';
import XLSX from 'xlsx';

const D = 'docs/fluency-dataset-1127';
const out = process.argv[2] || `${D}/AI驾驭量表-数据集-20261127.xlsx`;
const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
const total = (r: any) => r?.overall ?? r?.portrait_overall ?? null;
const mean = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => typeof x === 'number'); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null; };
const LV = ['资深', '一般', '新手'], ORD: Record<string, number> = { 资深: 3, 一般: 2, 新手: 1 };
const rank = (xs: number[]) => { const s = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = Array(xs.length).fill(0); let i = 0; while (i < s.length) { let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j++; for (let k = i; k <= j; k++) r[s[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const spear = (a: number[], b: number[]) => { const ra = rank(a), rb = rank(b), ma = ra.reduce((x, y) => x + y, 0) / ra.length, mb = rb.reduce((x, y) => x + y, 0) / rb.length; const n = ra.reduce((s, x, i) => s + (x - ma) * (rb[i] - mb), 0), d = Math.sqrt(ra.reduce((s, x) => s + (x - ma) ** 2, 0) * rb.reduce((s, y) => s + (y - mb) ** 2, 0)); return d ? Math.round((n / d) * 100) / 100 : null; };

const old = new Map(read('docs/fluency-dataset-1123/chat-full/fluency.jsonl').map(r => [r.session_id, r]));
const A = new Map(read(`${D}/chat-A/fluency.jsonl`).map(r => [r.session_id, r]));
const B = new Map(read(`${D}/chat-B/fluency.jsonl`).map(r => [r.session_id, r]));
const B0 = new Map(read(`${D}/chat-B0/fluency.jsonl`).map(r => [r.session_id, r]));   // 带两问的第一遍（「有没有提过」还是字面比对），当稳定性参照
const src = read(`${D}/chat-src/sessions.jsonl`);
const NEW = ['B22', 'B23', 'B24'];
const FIX: Record<string, string> = { edit: '自己动手改了', reask: '指出问题让 AI 重做', rewrite: '弃用、自己重写', keep: '没处理 / 保留了' };

// ── 对照汇总
const cmp: any[] = [];
for (const [name, M] of [['11-23 评审团（基线）', old], ['11-27 A：新引擎，不带两问', A], ['11-27 B：新引擎，带两问', B], ['11-27 B 第一遍（同一份再评一次，看波动）', B0]] as const) {
  const rows = src.map(s => ({ s, r: M.get(s.session_id) })).filter(x => total(x.r) != null);
  const row: any = { 评法: name, 场数: rows.length };
  for (const l of LV) row[`${l}均分`] = mean(rows.filter(x => x.s.level === l).map(x => total(x.r)));
  row['与水平的秩相关'] = rows.length > 3 ? spear(rows.map(x => ORD[x.s.level]), rows.map(x => total(x.r))) : null;
  for (const b of NEW) for (const l of LV) { const xs = rows.filter(x => x.s.level === l).map(x => x.r.behaviors?.[b]?.score); row[`${b} ${l}`] = mean(xs); row[`${b} ${l} 可计分`] = xs.filter(v => v != null).length; }
  cmp.push(row);
}

// ── 每场
const sess = src.map(s => {
  const d = [...s.events].reverse().find((e: any) => e.type === 'ai_disclosure') || {};
  const b = B.get(s.session_id), a = A.get(s.session_id), o = old.get(s.session_id);
  const diff = b?.collected?.diff?.overall;
  return {
    场次: s.session_id, 岗位: s.role, 水平: s.level,
    '总分 11-23': total(o), '总分 A 不带两问': total(a), '总分 B 带两问': total(b), '总分 B 第一遍': total(B0.get(s.session_id)),
    交付物字数: diff?.chars ?? null, '照搬 AI 占比': diff?.ai_verbatim_ratio ?? null, '自己写/改占比': diff?.changed_ratio ?? null,
    '自报 AI 贡献度%': d.share ?? null, 最满意: d.best || '', 最不满意: d.worst || '', 怎么处理: FIX[d.fix] || '',
    交叉校验标记: (b?.collected?.flags || []).map((f: any) => f.note).join('；'),
    ...Object.fromEntries(NEW.flatMap(k => [[`${k} 11-23`, o?.behaviors?.[k]?.score ?? null], [`${k} A`, a?.behaviors?.[k]?.score ?? null], [`${k} B`, b?.behaviors?.[k]?.score ?? null]])),
  };
});

// ── 新来源的证据（B 那一遍里，评委对这几条怎么判）
const ev: any[] = [];
for (const s of src) {
  const b = B.get(s.session_id); if (!b) continue;
  for (const k of ['B9', 'B14', ...NEW]) for (const e of [...(b.behaviors?.[k]?.evidence || []), ...(b.behaviors?.[k]?.rejected || [])]) {
    if (!/交付物与AI输出差异|交付后单题|自报vs记录|主动给AI文件/.test(e.rule || '')) continue;
    ev.push({ 场次: s.session_id, 水平: s.level, 行为: k, 来源: e.rule, 成立: e.valid ? '是' : '否', 档: e.q, 引文: e.quote, 评委理由: e.why });
  }
}

// ── 真实作答覆盖
const cov = existsSync(`${D}/records/coverage.json`) ? JSON.parse(readFileSync(`${D}/records/coverage.json`, 'utf8')) : {};
const covRows = [
  ['交过的作答', cov.total, '—'],
  ['其中 文档台 / AI 工作台 / 自己电脑录屏 / 插件', `${cov.by_mode?.bench} / ${cov.by_mode?.agent} / ${cov.by_mode?.open} / ${cov.by_mode?.plugin}`, '—'],
  ['有任何 AI 对话记录', cov.with_any_ai_dialog, 'messages[]'],
  ['站内 AI 助手对话', cov.platform_chat, 'source = platform'],
  ['AI 工作台（带工具调用）', cov.agent_turns, 'source = platform · tool_calls'],
  ['插件读到外部 AI 网页', cov.external_pages, 'source = external_tool'],
  ['能算交付物与 AI 输出差异（B23）', cov.has_diff, 'deliverables[].diff_from_ai_output'],
  ['交付物照搬 AI 占比（中位数）', cov.verbatim_ratio_median, '—'],
  ['写了 AI 参与说明', cov.has_disclosure_text, 'answers.disclosure'],
  ['答了交付后两问（B24，11-27 新上线）', cov.has_answers, 'answers'],
  ['逐轮记了实际模型', cov.per_turn_model, 'messages[].model（站内助手 11-27 起才记）'],
  ['有换模型 / 换工具记录（B4）', cov.mode_switches, 'platform_meta.mode_switches'],
  ['有上传文件（交付附件 / 工作台新建 / 发给 AI）', cov.files, 'files[]（uploaded_at = 时点）'],
  ['有整段粘贴任务书的提问', cov.quoted_prompts, 'messages[].quoted'],
].map(([项, 场数, 字段]) => ({ 项, 场数, 对应字段: 字段 }));

const wb = XLSX.utils.book_new();
const add = (name: string, rows: any[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 说明: '（无）' }]), name);
add('说明', [
  { 内容: '对应你的《评价体系-数据源与字段设计》：平台按那份文档补了采集，这里是落到数据上的样子。说明文字见同目录的「给宇宁-数据源与字段落地-20261127.md」。' },
  { 内容: '真实覆盖：海外平台上全部交过的作答，按统一记录（records/records.jsonl，一场一条）统计每个关键字段有多少场拿得到。只读库、不调模型。' },
  { 内容: '模拟对照：11-23 那批聊天考试台 24 场（8 岗位 × 资深 / 一般 / 新手），对话不重聊；让同一个人设看着自己的对话和交付物答「交付后两问」，再用新引擎评两遍：A 不带两问（只多了交付差异），B 带两问。' },
  { 内容: '新证据都只是交给评委的候选，成不成立、几档仍由评委按锚点判；量表规则本身没改（仍是 v3 26b，等你们 v9 的代码）。' },
]);
add('真实覆盖', covRows);
add('模拟对照', cmp);
add('模拟每场', sess);
add('新来源证据', ev);
XLSX.writeFile(wb, out);
console.log('写好了', out, `对照 ${cmp.length} 行 · 每场 ${sess.length} · 证据 ${ev.length}`);
