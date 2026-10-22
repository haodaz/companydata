/**
 * 对比通用模型的研判（2026-10-22）：通用模型只拿一句话出的题 vs 平方出的真活。
 * 两层：正则抓机械问题（年份过时）；AI 拿平方库里核实过的企业资料逐条对照，找编造 / 不符，每条必须引用原文片段（页面上标红）。
 * 另外把两边压成同样几行（场景 / 任务 / 材料 / 评分标准 / 企业事实），同样字数，左右对齐着比。
 */
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import { renderContext, type WorkContext } from '@/lib/work/generator';

export type CompareRow = 'scenario' | 'task' | 'materials' | 'rubric' | 'facts';
export type CompareIssue = { quote: string; type: string; why: string; row: CompareRow; by: 'rule' | 'ai' };
export type CompareReview = {
  verdict: string;
  generic: Record<CompareRow, string>;
  ours: Record<CompareRow, string>;
  issues: CompareIssue[];
  at: string;
};
const ROWS: CompareRow[] = ['scenario', 'task', 'materials', 'rubric', 'facts'];

/** 正则：带季度 / 月份的时间点（「2024 年 Q2」）比今年早两年以上的，当作时间错位；光秃秃的年份多是成立年份等背景，不标 */
function ruleIssues(text: string, now = new Date()): CompareIssue[] {
  const y = now.getFullYear(), out: CompareIssue[] = [], seen = new Set<number>();
  for (const m of text.matchAll(/(20\d{2})\s*年\s*(?:Q[1-4]|[一二三四]季度|\d{1,2}\s*月)/g)) {
    const yr = Number(m[1]);
    if (yr <= y - 2 && !seen.has(yr)) { seen.add(yr); out.push({ quote: m[0], type: '时间错位', why: `写的是 ${yr} 年，现在是 ${y} 年，不是这家公司此刻的问题`, row: 'scenario', by: 'rule' }); }
  }
  return out;
}

export async function reviewGeneric(genericText: string, ctx: WorkContext | null, task: any, company: string): Promise<CompareReview> {
  const facts = ctx ? renderContext(ctx).slice(0, 7000) : '（无）';
  const ours = JSON.stringify({ title: task.task?.title, problem: task.problem, brief: task.task?.brief, deliverables: task.task?.deliverables, materials: (task.materials || []).map((m: any) => ({ id: m.id, title: m.title, source: m.source, head: String(m.content || '').slice(0, 300) })), rubric: (task.rubric || []).map((r: any) => ({ title: r.title, weight: r.weight, basis: r.basis })) }).slice(0, 6000);
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `你是招聘测评专家。同一个需求，两种出题方式：A 是通用模型只拿一句话出的题；B 是平方用企业库资料出的题。今天是 ${today}。
请对照「平方库里核实过的企业资料」研判 A 的问题，并把 A、B 压成同样的几行，方便左右对比。

## 平方库里核实过的企业资料（${company}）
${facts}

## A：通用模型出的题（原文）
${genericText.slice(0, 8000)}

## B：平方出的题（结构）
${ours}

## 要求
1. issues：只列 A 的问题，最多 6 条，按严重程度排。类型只能是：编造事实（资料里没有、也不是常识的公司 / 数字 / 事件，被当成真的写）、与企业不符（和资料里这家企业的真实情况对不上）、时间错位、没有材料（考生拿不到能用的材料，只能凭空写）、评分缺依据（标准主观、没有可观察的锚点）。
   quote 必须是 A 原文里逐字出现的一段连续文字（6–30 字），不要改写、不要加省略号；why 用一句话对照资料说明（≤45 字）；row 填它属于哪一行：scenario / task / materials / rubric / facts。
   没把握的不要列；A 写明了「虚构」「假设」的不算编造；出题人那句话里本来就给的信息（公司名、岗位）不算问题；只挑能对照资料说清楚的，宁少勿凑。
2. generic 和 ours：两边各写同样 5 行，每行 ≤40 字，用同样口吻客观描述，不评价：
   scenario 业务场景 · task 要候选人做什么 · materials 给考生的材料 · rubric 评分标准（几条、怎么评）· facts 用到的企业事实（真实 / 虚构，出自哪里）
3. verdict：一句话总结两种出题方式的差别（≤50 字），说事实，不夸 B。
只输出 JSON：{"verdict":"","generic":{"scenario":"","task":"","materials":"","rubric":"","facts":""},"ours":{同上},"issues":[{"quote":"","type":"","why":"","row":""}]}`;
  let p: any = null, lastErr: any = null;
  for (const m of ['claude-sonnet-5-5', 'qwen-plus']) {
    try {
      const r = await generateContent(prompt, m, { jsonMode: true });
      await logTokenUsage({ tool_name: 'work', task_name: 'Compare · 研判', institution: company, model_id: m, usageMetadata: r.usageMetadata } as any).catch(() => {});
      p = parseJsonLoose(r.text); if (p && typeof p === 'object') break;
    } catch (e) { lastErr = e; }
  }
  if (!p) throw lastErr || new Error('研判失败');
  const pick = (o: any) => Object.fromEntries(ROWS.map(k => [k, String(o?.[k] || '').slice(0, 80)])) as Record<CompareRow, string>;
  // AI 给的引用必须真在原文里（标红要对得上）；对不上的去掉首尾标点再试一次
  const ai: CompareIssue[] = (Array.isArray(p.issues) ? p.issues : []).map((x: any) => {
    let q = String(x?.quote || '').trim();
    if (q && !genericText.includes(q)) q = q.replace(/^[「“"'（(]+|[」”"'）)。，,.]+$/g, '');
    return { quote: q, type: String(x?.type || '问题').slice(0, 8), why: String(x?.why || '').slice(0, 80), row: (ROWS.includes(x?.row) ? x.row : 'facts') as CompareRow, by: 'ai' as const };
  }).filter((x: CompareIssue) => x.quote.length >= 4 && genericText.includes(x.quote)).slice(0, 6);
  const rules = ruleIssues(genericText).filter(r => !ai.some(a => a.quote.includes(r.quote) || r.quote.includes(a.quote)));
  return { verdict: String(p.verdict || '').slice(0, 100), generic: pick(p.generic), ours: pick(p.ours), issues: [...ai, ...rules], at: new Date().toISOString() };
}
