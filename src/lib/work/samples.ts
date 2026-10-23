/**
 * 真活 · 深度样本（2026-10-23，老王亲自下场出题后定的）：出题人把一份「真实的好题」交给平台（商学院案例、面试案例、公司内部的考题……，
 * PDF / Word / 粘贴都行），AI 先把它解析成**骨架**（问题类型、推进步骤、每步给什么信息、参考答案、要算的数），出题时拿骨架当参照：
 * 照样本的推进结构、题型顺序、难度和数字密度出题，内容换成这家企业此刻真实的问题。样本进库，所有出题人都能选。
 *
 * 样本的两种典型（老王给的）：
 *   · 思辨 / 情景推演（McBurger 增长战略）：Structuring → Judgement → Numeracy → Numeracy → Creativity → Synthesis，每步面试官给一张表 / 图，要算出数
 *   · 市场进入（Space Explorer）：五问 + 分阶段才给的数据表 + 面试官操作提示
 */
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage } from '@/lib/token-logger';
import { supabaseAdmin as db } from '@/lib/supabase';

export type StageType = 'structuring' | 'judgement' | 'numeracy' | 'creativity' | 'synthesis' | 'other';
export const STAGE_LABEL: Record<StageType, string> = { structuring: '搭框架', judgement: '判断与洞察', numeracy: '测算', creativity: '出主意', synthesis: '综合建议', other: '其它' };

export interface Calc { label: string; expr: string; value: number | string; verified?: boolean }
export interface SampleStage { id: string; type: StageType; question: string; reveal: string; expected: string; calc?: Calc[] }
export interface SampleSkeleton {
  title: string; summary: string; problem_type: string; industry: string; difficulty: string; format: string;
  stages: SampleStage[]; exhibits: { title: string; desc: string }[]; style_notes: string[];
}
export interface WorkSample { id: string; title: string; industry: string; problem_type: string; difficulty: string; skeleton: SampleSkeleton; source_name: string; created_by: string; created_at: string; shared: boolean }
const COLS = 'id, title, industry, problem_type, difficulty, skeleton, source_name, created_by, created_at, shared';

const s = (v: any, n: number) => String(v ?? '').trim().slice(0, n);
const TYPES: StageType[] = ['structuring', 'judgement', 'numeracy', 'creativity', 'synthesis', 'other'];

/** 只允许数字和四则运算的算式（模型给的测算要在代码里真算一遍，防止「答案」和「数据」对不上） */
export function safeEval(expr: string): number | null {
  const e = String(expr || '').replace(/，/g, ',').replace(/×/g, '*').replace(/÷/g, '/').replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)').replace(/[$,¥￥\s]/g, '');
  if (!e || !/^[\d.+\-*/()]+$/.test(e) || /[+\-*/]{2,}/.test(e.replace(/\(\-/g, '('))) return null;
  try { const v = Function(`"use strict"; return (${e});`)(); return typeof v === 'number' && Number.isFinite(v) ? v : null; } catch { return null; }
}
/** 把模型给的 calc 逐条真算：算得出就用算出来的值（保留 4 位），算不出保留原值并标 verified=false */
export function verifyCalcs(stages: SampleStage[]): { stages: SampleStage[]; fixed: number; failed: number } {
  let fixed = 0, failed = 0;
  for (const st of stages) for (const c of st.calc || []) {
    const v = safeEval(c.expr);
    if (v === null) { c.verified = false; failed++; continue; }
    const r = Math.round(v * 10000) / 10000; const claimed = Number(c.value);
    if (!Number.isFinite(claimed) || Math.abs(claimed - r) > Math.max(1e-6, Math.abs(r) * 0.005)) { c.value = r; fixed++; }
    c.verified = true;
  }
  return { stages, fixed, failed };
}

/** 模型有时不照抄英文 type，写成中文或别的说法：按关键词对回去 */
export function stageType(v: any): StageType {
  const t = String(v || '').toLowerCase();
  if (TYPES.includes(t as StageType)) return t as StageType;
  if (/struct|框架|结构|拆解/.test(t)) return 'structuring';
  if (/judg|insight|判断|洞察|结论|解读|图表/.test(t)) return 'judgement';
  if (/numer|calc|quant|测算|计算|估算|数/.test(t)) return 'numeracy';
  if (/creat|idea|brainstorm|主意|点子|创意|举措/.test(t)) return 'creativity';
  if (/synth|summary|recommend|综合|总结|汇报|建议/.test(t)) return 'synthesis';
  return 'other';
}
export function normalizeStages(raw: any): SampleStage[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 8).map((x: any, i: number) => ({
    id: s(x.id, 8) || `q${i + 1}`,
    type: stageType(x.type),
    question: s(x.question, 600), reveal: s(x.reveal, 4000), expected: s(x.expected, 2500),
    calc: (Array.isArray(x.calc) ? x.calc : []).slice(0, 8).map((c: any) => ({ label: s(c.label, 80), expr: s(c.expr, 200), value: typeof c.value === 'number' ? c.value : s(c.value, 40) })).filter((c: any) => c.expr),
  })).filter(x => x.question);
}

/** 文件 → 文字：PDF（unpdf，纯 JS）、Word（.docx 直接读 document.xml）、文本 */
export async function extractText(buf: Buffer, filename: string): Promise<string> {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') {
    const { extractText: ex, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await ex(pdf, { mergePages: true });
    return String(text || '').replace(/Private copy of .*\n?/g, '').replace(/Copy and Sharing Prohibited\.?\n?/g, '').trim();
  }
  if (ext === 'docx') {
    let xml = '';
    {
      // 用 Node 自带的 zlib 手工解：docx 是普通 zip，document.xml 用 deflate（不另装 zip 库）
      const { inflateRawSync } = await import('node:zlib');
      const name = Buffer.from('word/document.xml'); let p = 0;
      while ((p = buf.indexOf(Buffer.from('PK\x03\x04'), p)) >= 0) {
        const method = buf.readUInt16LE(p + 8), csize = buf.readUInt32LE(p + 18), nlen = buf.readUInt16LE(p + 26), elen = buf.readUInt16LE(p + 28);
        const fname = buf.subarray(p + 30, p + 30 + nlen); const start = p + 30 + nlen + elen;
        if (fname.equals(name)) { const raw = buf.subarray(start, start + csize); xml = (method === 8 ? inflateRawSync(raw) : raw).toString('utf8'); break; }
        p = start + csize;
      }
    }
    return xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).trim();
  }
  return buf.toString('utf8');
}

/** 一份样本原文 → 骨架（固定用强模型；样本只解析一次，进库复用） */
/** kind = 'practical'（2026-10-24）：职业技能等级认定的实操考核（试卷 + 评分记录表 + 考场准备单）——没有「面试官一步步问」，骨架是工序 / 考核项目 + 评分标准 / 扣分点 */
export async function parseSample(raw: string, opts: { title?: string; model?: string; actor?: string; kind?: 'case' | 'practical' | 'takehome' } = {}): Promise<SampleSkeleton> {
  const model = opts.model || process.env.WORK_SAMPLE_MODEL || 'claude-opus-5-5';
  const takehome = opts.kind === 'takehome' ? `
这份是**工程 / 数据类岗位的 take-home 作业题**（候选人自己花几小时做完交一个仓库 / 文件）。按下面的对应关系解析：
- stages = 题目要求的工作步骤或交付物（按做的顺序：取数 / 建模 / 加载 / 产出 / 文档 / 测试……，4–7 步）。type：搭方案 structuring、实现 other、分析与产出 judgement、取舍说明 synthesis；question = 这一步要做什么；reveal = 这一步给的输入（数据源、接口、文件、约束、时限）；expected = 评审看什么（原文的 evaluation / rubric / what we look for，没有就写「原文未给」）；calc 为空。
- exhibits = 数据集 / 接口 / 示例文件（title + 它是什么）。
- style_notes = 这类作业「好」在哪：限定时长、要可运行、README 说明取舍、边界情况、不追求完美但要诚实标注……3–6 条。
- format 写「take-home」；problem_type 写岗位类型（数据工程 / 数据分析 / 后端开发……）；industry 写行业或「科技」；difficulty 按时长判断。
` : '';
  const practical = opts.kind === 'practical' ? `
这份是**职业技能等级认定的实操考核文件**（技能考核试卷 / 样题、评分记录表、考场与考生准备通知单）。按下面的对应关系解析：
- stages = 考核的工序或考核项目（按考核顺序；评分记录表里的「试题」「项目」各成一步，合并同类的细项）。type 一律用 other；question = 这一步要做什么（加工 / 操作 / 检测 / 文明生产……）；reveal = 这一步给考生的条件（图纸要求、材料、设备、时间）；expected = 评分标准原文要点：配分、怎么扣分、否定项（原样保留数字和公差）；calc 为空。
- exhibits = 图纸 / 材料清单 / 设备清单（title + 它规定什么）。
- style_notes = 这套考核「怎么评」的手法：配分扣完为止、超差不得分、否定项一票否决、文明生产扣分、自检与实测对比……3–6 条。
- format 写「practical」；problem_type 写「实操考核」；industry 写行业；difficulty 按等级（三级 / 四级 / 五级）。
` : '';
  const prompt = `下面是出题人交来的一份「好题」样本（商学院 / 咨询面试案例、公司内部考题、作业题都可能）。把它解析成**骨架**，之后平台会照这个骨架、换成别的企业的真实问题重新出题。${practical}${takehome}
要求：
- 不改写、不评价样本，只提取结构。原文有的数字原样保留；没有的不要编。
- stages：按样本的推进顺序，每一步一条。type ∈ structuring（搭框架）/ judgement（看图表下判断）/ numeracy（测算）/ creativity（出主意）/ synthesis（综合建议）/ other。
  question = 这一步问候选人什么；reveal = 这一步才给候选人的信息（背景、数据表、图表——图表用 Markdown 表把数据抄下来，原文的 Exhibit 也归到对应的步骤）；expected = 原文的参考答案 / 关键结论；
  calc = 这一步要算的数：label（算什么）、expr（只含数字和 + - * / ( ) 的算式，百分数写成 0.1 这种）、value（结果）。没有测算就 []。
- exhibits：样本里每张图表一条（title、desc：它展示什么、怎么用）。
- style_notes：3–6 条，这份样本「好」在哪、出题时要保留的手法（例：每一步只给当步需要的数据；数据之间有坑要候选人自己发现；测算答案要能复核；最后一步要综合前面所有步骤……）。
- format：interviewer-led（面试官一步步推进）/ take-home（整份给候选人自己做）/ 其它。difficulty：按原文或判断（低 / 中 / 高）。
${opts.title ? `样本标题：${opts.title}\n` : ''}
## 样本原文
${raw.slice(0, 28000)}

只返回 JSON：
{ "title": "", "summary": "两三句：这题考什么、怎么推进", "problem_type": "如 增长战略 / 市场进入 / 定价 / 盈利改善 / 投资判断", "industry": "", "difficulty": "高", "format": "interviewer-led",
  "stages": [ { "id": "q1", "type": "structuring", "question": "", "reveal": "", "expected": "", "calc": [ { "label": "", "expr": "", "value": 0 } ] } ],
  "exhibits": [ { "title": "", "desc": "" } ], "style_notes": [""] }`;
  let last: any = null;
  for (let i = 0; i < 2; i++) {
    const res = await generateContent(prompt, model, { jsonMode: true });
    await logTokenUsage({ tool_name: 'work', task_name: 'Sample · 解析深度样本', institution: opts.title || '', model_id: model, usageMetadata: res.usageMetadata, actor: opts.actor } as any).catch(() => {});
    try { last = parseJsonLoose(res.text); break; } catch (e) { if (i) throw e; }
  }
  const p = last || {};
  const stages = verifyCalcs(normalizeStages(p.stages)).stages;
  return {
    title: s(p.title, 80) || opts.title || '未命名样本', summary: s(p.summary, 600), problem_type: s(p.problem_type, 40), industry: s(p.industry, 40), difficulty: s(p.difficulty, 10) || '中', format: s(p.format, 30) || 'interviewer-led',
    stages, exhibits: (Array.isArray(p.exhibits) ? p.exhibits : []).slice(0, 10).map((x: any) => ({ title: s(x.title, 80), desc: s(x.desc, 300) })).filter((x: any) => x.title),
    style_notes: (Array.isArray(p.style_notes) ? p.style_notes : []).slice(0, 8).map((x: any) => s(x, 200)).filter(Boolean),
  };
}

/** 给出题提示词用：骨架渲染成文字 */
export function renderSkeleton(k: SampleSkeleton): string {
  const L = [`标题：${k.title} · 类型：${k.problem_type || '—'} · 行业：${k.industry || '—'} · 难度：${k.difficulty} · 形式：${k.format}`, k.summary ? `概要：${k.summary}` : ''];
  if (k.style_notes.length) L.push('好在哪（出题时要保留的手法）：\n' + k.style_notes.map(x => `- ${x}`).join('\n'));
  L.push('推进结构：');
  for (const st of k.stages) L.push(`- ${st.id}【${STAGE_LABEL[st.type]}】问：${st.question}${st.reveal ? `\n  这一步给的信息（节选）：${st.reveal.slice(0, 500).replace(/\n/g, ' ')}` : ''}${st.calc?.length ? `\n  要算：${st.calc.map(c => `${c.label} = ${c.expr} = ${c.value}`).join('；')}` : ''}${st.expected ? `\n  参考答案（节选）：${st.expected.slice(0, 300).replace(/\n/g, ' ')}` : ''}`);
  if (k.exhibits.length) L.push('图表：' + k.exhibits.map(e => `${e.title}（${e.desc}）`).join('；'));
  return L.filter(Boolean).join('\n');
}

/** 内部训练素材（shared）+ 这个人自己交的参考资料 */
export async function listSamples(opts: { email?: string; sharedOnly?: boolean } = {}): Promise<WorkSample[]> {
  let q = db.from('work_samples').select(COLS).order('created_at', { ascending: false }).limit(200);
  q = opts.sharedOnly ? q.eq('shared', true) : opts.email ? q.or(`shared.eq.true,created_by.eq.${opts.email}`) : q;
  const { data, error } = await q;
  if (error) { if (/work_samples/.test(error.message)) return []; throw error; }   // 迁移 047 没跑
  return (data || []) as WorkSample[];
}
export async function getSample(id: string): Promise<WorkSample | null> {
  const { data } = await db.from('work_samples').select(COLS).eq('id', id).maybeSingle();
  return (data as WorkSample) || null;
}
export async function removeSample(id: string) { const { error } = await db.from('work_samples').delete().eq('id', id); if (error) throw new Error(error.message); }
export async function saveSample(k: SampleSkeleton, raw: string, meta: { source_name: string; created_by: string; shared: boolean }): Promise<WorkSample> {
  // .doc 抽出来的文字里可能带 \u0000，Postgres 的 jsonb / text 不收（「unsupported Unicode escape sequence」）
  const strip = (v: any): any => typeof v === 'string' ? v.replace(/\u0000/g, '') : Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, strip(b)])) : v;
  k = strip(k); raw = strip(raw);
  const { data, error } = await db.from('work_samples').insert({ title: k.title, industry: k.industry, problem_type: k.problem_type, difficulty: k.difficulty, skeleton: k, raw: raw.slice(0, 60000), source_name: meta.source_name, created_by: meta.created_by, shared: meta.shared }).select(COLS).single();
  if (error) throw new Error(/work_samples/.test(error.message) ? '样本库还没建（迁移 047 待跑）' : error.message);
  return data as WorkSample;
}

/**
 * 出题时在后台自动挑参照（用户看不见）：按企业行业、岗位 / 要找的人、题型，从内部训练素材里挑最像的 0–2 份。
 * 便宜模型做一次判断；库是空的或都不相干就不挑（这时和以前一样出开放题）。
 */
export async function autoPickSamples(input: { company?: string; industry?: string; role: string; focus?: string }, library: WorkSample[], opts: { actor?: string } = {}): Promise<WorkSample[]> {
  const lib = library.filter(x => x.shared && x.skeleton?.stages?.length);
  if (!lib.length) return [];
  const prompt = `平台要给「${input.company || '一家企业'}${input.industry ? `（${input.industry}）` : ''}」的「${input.role}」出一道真实的业务题${input.focus ? `，出题人要求：${input.focus.slice(0, 300)}` : ''}。
下面是题库里的参照题（每条：编号 · 标题 · 行业 · 类型 · 难度 · 概要）。挑出**题型和推进方式最适合拿来当模板**的 0–2 条：看的是「这个岗位真实工作里会不会遇到这种推进方式的问题」（比如战略 / 投资 / 市场类岗位适合分步推演 + 测算的案例），不是看行业名字像不像。都不合适就返回空。
${lib.map((x, i) => `${i + 1}. ${x.title} · ${x.industry || '—'} · ${x.problem_type || '—'} · ${x.difficulty || '—'} · ${(x.skeleton.summary || '').slice(0, 120)}`).join('\n')}
只返回 JSON：{ "picks": [1], "why": "一句" }`;
  try {
    const res = await generateContent(prompt, process.env.WORK_PICK_MODEL || 'qwen-plus', { jsonMode: true });
    await logTokenUsage({ tool_name: 'work', task_name: 'Sample · 自动挑参照', institution: input.company || '', model_id: process.env.WORK_PICK_MODEL || 'qwen-plus', usageMetadata: res.usageMetadata, actor: opts.actor } as any).catch(() => {});
    const p = parseJsonLoose(res.text);
    const picks = (Array.isArray(p.picks) ? p.picks : []).map((n: any) => lib[Number(n) - 1]).filter(Boolean).slice(0, 2);
    return picks;
  } catch (e) { console.warn('[work] 自动挑参照失败：', (e as Error)?.message); return []; }
}
