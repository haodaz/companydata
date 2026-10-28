/**
 * 对比通用模型的研判（2026-10-22；同日改成「同一把尺子 + 事实核对」）：通用模型只拿一句话出的题 vs 平方出的真活。
 * 1. 同一把尺子：7 项固定清单，两边都打 是 / 部分 / 否，各附一句理由（A 引原文）——判的是题目本身，不靠谁知道得多
 * 2. 企业事实核对：A 当真事写的、关于这家企业（含品牌 / 关联主体）的说法逐条摘出，先对照库里最新资料（本体 + 关联企业 + 深度画像），
 *    库里没有的再联网查；状态只有 证实 / 有出入 / 未核实。「库里没有」不等于编造，未核实不判错
 * 3. 正则：带季度 / 月份、早两年以上的时间点
 * 两边再压成同样五行（场景 / 任务 / 材料 / 评分 / 事实）左右对齐。结果存在题里，不点「重新问一次」不变。
 */
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import { supabaseAdmin as db } from '@/lib/supabase';
import { gatherContext, renderContext } from '@/lib/work/generator';

export type CompareRow = 'scenario' | 'task' | 'materials' | 'rubric' | 'facts';
export type Mark = 'yes' | 'partial' | 'no';
export type CheckItem = { key: string; label: string; a: { v: Mark; note: string; quote?: string }; b: { v: Mark; note: string } };
export type FactCheck = { quote: string; claim: string; status: '证实' | '有出入' | '未核实'; evidence: string; source: string };
/** 原文标注：tone good 绿（证实）/ bad 红（有出入、时间错位）/ warn 橙（清单没做到的引用） */
export type CompareIssue = { quote: string; type: string; why: string; row: CompareRow; by: 'rule' | 'ai' | 'fact'; tone?: 'good' | 'bad' | 'warn' };
export type CompareReview = {
  verdict: string;
  checklist: CheckItem[];
  facts: FactCheck[];
  generic: Record<CompareRow, string>;
  ours: Record<CompareRow, string>;
  issues: CompareIssue[];
  at: string;
  v: 2;
};
const ROWS: CompareRow[] = ['scenario', 'task', 'materials', 'rubric', 'facts'];
export const CHECKLIST: { key: string; label: string; rule: string }[] = [
  { key: 'c1', label: '场景是这家企业近期的真事', rule: '题目场景是这家企业（含其品牌 / 关联主体）近 12 个月内真实发生的事；虚构公司或两年前的旧事算否' },
  { key: 'c2', label: '考生拿到能直接用的材料', rule: '给了成型的材料（文档 / 表格 / 数据），考生不用自己去找就能做；只有一段背景描述算部分' },
  { key: 'c3', label: '材料里埋了要识别的坑', rule: '材料里有需要识别的矛盾、缺口或口径不一致，并且评分会看有没有发现' },
  { key: 'c4', label: '评分有可观察的分级', rule: '每条标准写了分级的、能从交付物里观察到的行为或产出；只写「逻辑清晰」「有深度」算否' },
  { key: 'c5', label: '每条评分说明了依据', rule: '每条标准说明依据来自哪里（材料、企业事实、岗位要求、行业规范）' },
  { key: 'c6', label: '建议用时内做得完', rule: '交付物的量和建议用时匹配' },
  { key: 'c7', label: '允许用 AI 并评怎么用', rule: '明确允许用 AI，并且评分或规则里看他怎么用 AI' },
];

/** 正则：带季度 / 月份的时间点（「2024 年 Q2」）比今年早两年以上的；光秃秃的年份多是成立年份等背景，不标 */
function ruleIssues(text: string, now = new Date()): CompareIssue[] {
  const y = now.getFullYear(), out: CompareIssue[] = [], seen = new Set<number>();
  for (const m of text.matchAll(/(20\d{2})\s*年\s*(?:Q[1-4]|[一二三四]季度|\d{1,2}\s*月)/g)) {
    const yr = Number(m[1]);
    if (yr <= y - 2 && !seen.has(yr)) { seen.add(yr); out.push({ quote: m[0], type: '时间错位', why: `写的是 ${yr} 年，现在是 ${y} 年，不是这家企业此刻的问题`, row: 'scenario', by: 'rule', tone: 'bad' }); }
  }
  return out;
}

/** 库里这家企业最新的资料（不用出题时的快照）：本体 + 别名 + 关联主体（gatherContext 按共同高管 ≥2 位读） */
async function loadFacts(companyId: number | null, companyName: string, role: string): Promise<string> {
  const ctx = await gatherContext(companyId ? String(companyId) : companyName, role).catch(() => null);
  const L: string[] = [];
  if (ctx?.company) {
    const { data: c } = await db.from('companies').select('aliases').eq('id', ctx.company.id).maybeSingle();
    if (c?.aliases?.length) L.push(`## 别名 / 品牌 / 主体（同一家）\n${c.aliases.join('、')}`);
    L.push(renderContext(ctx).replace(/## 材料缺口[\s\S]*$/, '').slice(0, 14000));
    // 关联主体（共同高管 ≥2 位）已由 gatherContext 读进来，renderContext 里带着
  }
  return L.join('\n\n').slice(0, 16000) || '（库里没有这家企业的资料）';
}

const MARKS: Mark[] = ['yes', 'partial', 'no'];
const mk = (v: any): Mark => (MARKS.includes(v) ? v : 'no');

export async function reviewGeneric(genericText: string, _ctx: unknown, task: any, company: string): Promise<CompareReview> {
  const facts = await loadFacts(task.company_id ?? null, company, task.role || '');
  const ours = JSON.stringify({ title: task.task?.title, problem: task.problem, brief: task.task?.brief, deliverables: task.task?.deliverables, rules: task.task?.rules, time_minutes: task.task?.time_minutes, materials: (task.materials || []).map((m: any) => ({ id: m.id, title: m.title, source: m.source, basis: m.basis, content: String(m.content || '').slice(0, 500) })), rubric: (task.rubric || []).map((r: any) => ({ title: r.title, weight: r.weight, basis: r.basis, levels: r.levels })) }).slice(0, 9000);
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `你是招聘测评方法专家，做一份可复核的对比研判。同一个需求，两种出题方式：A 是通用模型只拿一句话出的题；B 是平方用企业库资料出的题。今天是 ${today}。

## 库里关于这家企业的最新资料（${company}；别名、品牌、关联主体都算同一个体系）
${facts}

## A：通用模型出的题（原文）
${genericText.slice(0, 9000)}

## B：平方出的题（结构）
${ours}

## 一、同一把尺子：对 A 和 B 逐项判断 yes / partial / no
${CHECKLIST.map(c => `${c.key} ${c.label}：${c.rule}`).join('\n')}
每项给 a、b 两边：v（yes/partial/no）+ note（≤36 字，说依据，客观）。A 判 partial 或 no 时，给 quote：A 原文里逐字出现、能说明问题的一段（6–30 字）；找不到合适原文就留空。

## 二、企业事实核对（只核 A）
摘出 A 当作真事写的、关于「${company}」这个体系（含品牌、关联主体、合伙人、被投企业、投资策略）的具体说法，最多 8 条。
不摘：A 自己标了虚构 / 假设 / 示例的内容；出题人那句话里本来就给的公司名和岗位；纯行业常识。
每条：quote（A 原文逐字、6–40 字）、claim（这条说法是什么，≤30 字）、status：
- 证实：资料里有支持（evidence 写资料原话或要点，source 写出自哪一段）
- 有出入：资料里有明确相反的信息（evidence 写资料里怎么说）
- 未覆盖：资料里没提到——这不等于错，后面会联网核实
不要因为资料没提到就判有出入。

## 三、五行速览（两边各写，≤40 字，同样口吻，不评价）
scenario 业务场景 · task 要候选人做什么 · materials 给考生的材料 · rubric 评分标准（几条、怎么评）· facts 用到的企业事实（真实 / 虚构，出自哪里）

## 四、verdict：一句话（≤60 字），只说清单上客观的差别，不夸 B。

只输出 JSON：
{"checklist":[{"key":"c1","a":{"v":"","note":"","quote":""},"b":{"v":"","note":""}}],"facts":[{"quote":"","claim":"","status":"","evidence":"","source":""}],"generic":{"scenario":"","task":"","materials":"","rubric":"","facts":""},"ours":{同上},"verdict":""}`;
  let p: any = null, lastErr: any = null;
  for (const m of ['claude-sonnet-5-5', 'qwen-plus', 'deepseek-v4-pro']) {   // 优先 Claude，千问兜底
    try {
      const r = await generateContent(prompt, m, { jsonMode: true, temperature: 0 });
      await logTokenUsage({ tool_name: 'work', task_name: 'Compare · 研判', institution: company, model_id: m, usageMetadata: r.usageMetadata } as any).catch(() => {});
      p = parseJsonLoose(r.text); if (p && typeof p === 'object' && Array.isArray(p.checklist)) break; p = null;
    } catch (e) { lastErr = e; }
  }
  if (!p) throw lastErr || new Error('研判失败');

  // 引用要真在原文里（标注才对得上）；对不上的去掉首尾标点再试一次，还不行就丢
  const fixQuote = (q: any) => { let s = String(q || '').trim(); if (s && !genericText.includes(s)) s = s.replace(/^[「“"'（(]+|[」”"'）)。，,.]+$/g, ''); return s.length >= 4 && genericText.includes(s) ? s : ''; };
  const checklist: CheckItem[] = CHECKLIST.map(c => {
    const x = (p.checklist || []).find((y: any) => y?.key === c.key) || {};
    return { key: c.key, label: c.label, a: { v: mk(x.a?.v), note: String(x.a?.note || '').slice(0, 80), quote: fixQuote(x.a?.quote) || undefined }, b: { v: mk(x.b?.v), note: String(x.b?.note || '').slice(0, 80) } };
  });
  let factList: FactCheck[] = (Array.isArray(p.facts) ? p.facts : []).map((f: any) => ({ quote: fixQuote(f?.quote), claim: String(f?.claim || '').slice(0, 60), status: f?.status === '证实' ? '证实' : f?.status === '有出入' ? '有出入' : '未核实', evidence: String(f?.evidence || '').slice(0, 120), source: String(f?.source || '').slice(0, 60), _uncovered: f?.status !== '证实' && f?.status !== '有出入' } as any)).filter((f: any) => f.quote).slice(0, 8);

  // 库里没覆盖的：联网核实一次（千问 + 阿里云搜索）。查不到就保持「未核实」，不判错
  const pending = factList.filter((f: any) => f._uncovered);
  if (pending.length) {
    const q = `请联网核实下面关于「${company}」（含其品牌、关联主体，如别名里的机构）的说法，逐条判断：证实（公开信息支持，给出处网址）/ 有出入（公开信息明确相反，给出处）/ 未核实（查不到可靠信息）。不要凭印象，没有出处的一律未核实。
${pending.map((f, i) => `${i + 1}. ${f.claim}（原文：${f.quote}）`).join('\n')}
只输出 JSON：{"items":[{"i":1,"status":"","evidence":"≤60字","source":"网址或来源名"}]}`;
    try {
      const r = await generateContent(q, 'qwen-plus', { jsonMode: true, webSearch: true, temperature: 0 });
      await logTokenUsage({ tool_name: 'work', task_name: 'Compare · 联网核实', institution: company, model_id: 'qwen-plus', usageMetadata: r.usageMetadata, search_calls: 1 } as any).catch(() => {});
      const j = parseJsonLoose(r.text.replace(/## 搜索来源[\s\S]*$/, ''));
      for (const it of (j?.items || [])) {
        const f = pending[Number(it?.i) - 1]; if (!f) continue;
        const st = it?.status === '证实' ? '证实' : it?.status === '有出入' ? '有出入' : '未核实';
        // 有出处才算数
        if (st !== '未核实' && !String(it?.source || '').trim()) continue;
        f.status = st; f.evidence = String(it?.evidence || '').slice(0, 120); f.source = st === '未核实' ? '' : `联网 · ${String(it.source).slice(0, 80)}`;
      }
    } catch (e) { console.warn('[work-compare] 联网核实失败：', String((e as any)?.message).slice(0, 120)); }
  }
  factList = factList.map(({ _uncovered, ...f }: any) => f);

  const issues: CompareIssue[] = [
    ...factList.filter(f => f.status === '有出入').map(f => ({ quote: f.quote, type: '与事实有出入', why: f.evidence, row: 'facts' as CompareRow, by: 'fact' as const, tone: 'bad' as const })),
    ...factList.filter(f => f.status === '证实').map(f => ({ quote: f.quote, type: '事实证实', why: f.evidence, row: 'facts' as CompareRow, by: 'fact' as const, tone: 'good' as const })),
    ...checklist.filter(c => c.a.v !== 'yes' && c.a.quote).map(c => ({ quote: c.a.quote!, type: c.label, why: c.a.note, row: (c.key === 'c1' ? 'scenario' : c.key === 'c2' || c.key === 'c3' ? 'materials' : c.key === 'c4' || c.key === 'c5' ? 'rubric' : 'task') as CompareRow, by: 'ai' as const, tone: 'warn' as const })),
  ];
  const rules = ruleIssues(genericText).filter(r => !issues.some(a => a.quote.includes(r.quote) || r.quote.includes(a.quote)));
  const pick = (o: any) => Object.fromEntries(ROWS.map(k => [k, String(o?.[k] || '').slice(0, 80)])) as Record<CompareRow, string>;
  return { verdict: String(p.verdict || '').slice(0, 120), checklist, facts: factList, generic: pick(p.generic), ours: pick(p.ours), issues: [...issues, ...rules], at: new Date().toISOString(), v: 2 };
}
