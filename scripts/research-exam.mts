/**
 * 科研能力测评 · 论文三题（2026-11-03，百业学院科研训练路径的第一版；先做 AI 研发 · 模型训练方向，跑通再扩学科）：
 *   用户：「人只做 correction，不做 initial work」——挑论文、定答案、埋错全由「AI 代导师」先出完整初稿（status: ai_draft），
 *   再由另一个模型对照原文交叉核对；以后真人导师进来只改（corrections 留痕）。
 * 每篇论文出三题，全部有客观答案：
 *   A 读懂：给方法 / 实验设置原文，还原研究设计（问题、自变量、因变量、对照 / 基线、数据、规模与重复、指标）——对照导师的答案逐项判
 *   B 盲测：只给不含结果的研究简介（AI 改写成「预注册」口吻，核对过不泄露结果）+ 6 条论断（真的、反过来的各半），学员给每条为真的概率——程序算准确率和 Brier（校准）
 *   D 复算（11-03 加）：论文表格里的原始数字 → 算出正文写的结论数字（比如「峰值显存降低 19%」），程序按误差判；答案是论文自己的，不用下载数据
 *   C 埋错审稿：给一段方法 + 结果原文，悄悄埋 3 处错（数字前后不一致、结论超出证据、编一条参考文献）——看找到几处、误报几处
 * 论文只用 arXiv 上 CC BY 授权的、最近发表的（被考模型没见过，盲测才算数）。
 * 分层（用户 11-03）：公共课 = 平台用公开论文 / 数据先建好（scope: public）；私域课 = 实验室拿未发表数据、组内 SOP 来联合培养，只给这一家用（scope: private + org）。流水线一样，只是材料来源和归属不同。
 *   npx tsx --env-file=.env.local scripts/research-exam.mts build <arXiv id>...      出题（AI 代导师 + 交叉核对）→ scripts/data/research-exams/<id>.json
 *   npx tsx --env-file=.env.local scripts/research-exam.mts run <模型>... [--papers=id,id]   考 → docs/科研能力测评/<日期>.json + 汇总表（优先用库里导师校正过的版本）
 *   sync：把 JSON 里的题写进库（迁移 060）；导师校正入口 /college/review/<token>，教务处「科研测评题」发链接
 */
import fs from 'node:fs';
import { generateContent } from '../src/lib/llm-client';
import { parseJsonLoose } from '../src/lib/agents/search-llm';
import { logTokenUsage } from '../src/lib/token-logger';
import { fabricatedCitations } from '../src/lib/college-train';
import { upsertExam } from '../src/lib/college-exams';
import { supabaseAdmin as db } from '../src/lib/supabase';
/** 写 JSON 备份 + 写库（迁移 060；没跑时只留 JSON） */
const saveExam = async (f: string, ex: any) => { fs.writeFileSync(f, JSON.stringify(ex, null, 1)); await upsertExam(ex).catch(e => console.warn('  （没写进库：', String(e?.message).slice(0, 80), '）')); };

const MENTOR = 'claude-opus-5-5';          // AI 代导师：出题、定答案、埋错
const CHECKER = 'qwen3.7-plus';            // 交叉核对（和出题的不是一家；GPT 额度 11-03 用完）
const JUDGE = 'claude-opus-5-5';           // A / C 两题对照答案判（学员里有 Sonnet，评卷用 Opus）
const DIR = 'scripts/data/research-exams'; fs.mkdirSync(DIR, { recursive: true });
const S = (v: any, n = 600) => String(v ?? '').trim().slice(0, n);
const [cmd, ...rest] = process.argv.slice(2);
const flag = (k: string) => (rest.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1] || '';
const args = rest.filter(a => !a.startsWith('--'));

async function ask(prompt: string, model: string, task: string, tries = 3): Promise<any> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await generateContent(prompt, model, { jsonMode: true, temperature: 0 });
      await logTokenUsage({ tool_name: 'college', task_name: `科研测评 · ${task}`, institution: '百业学院', model_id: model, usageMetadata: r.usageMetadata } as any).catch(() => {});
      const p = parseJsonLoose(r.text); if (p && typeof p === 'object') return p;
    } catch (e) { last = e; console.warn(`  ${task} 第 ${i + 1} 次失败：${String((e as any)?.message).slice(0, 100)}`); }
  }
  throw last || new Error(`${task} 没返回 JSON`);
}

/** arXiv HTML（LaTeXML）→ 按章节的纯文本：公式用 alttext，表格按行 */
function htmlToSections(html: string) {
  let h = html.replace(/<(script|style|nav|header|footer)[\s\S]*?<\/\1>/g, '')
    .replace(/<math[^>]*alttext="([^"]*)"[\s\S]*?<\/math>/g, (_, a) => ` ${a} `)
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g, (_, __, t) => `\n@@H ${t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}\n`)
    .replace(/<\/(p|div|li|tr|figcaption|caption)>/g, '\n').replace(/<\/t[dh]>/g, ' | ').replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x?([0-9a-f]+);/gi, (_, n) => { try { return String.fromCodePoint(parseInt(n, /[a-f]/i.test(n) ? 16 : 10)); } catch { return ''; } });
  const out: { title: string; text: string }[] = []; let cur = { title: '（开头）', text: '' };
  for (const line of h.split('\n')) {
    if (line.startsWith('@@H ')) { if (cur.text.trim()) out.push(cur); cur = { title: line.slice(4), text: '' }; }
    else if (line.trim()) cur.text += line.replace(/\s+/g, ' ').trim() + '\n';
  }
  if (cur.text.trim()) out.push(cur);
  return out;
}

async function crossCheck(full: string, props: any[], brief: string, planted: any[]) {
  const c = await ask(`你在对照一篇论文的原文，核对几条说法。只看原文，不用你自己的知识。只返回 JSON。
## 论文原文（全文）
${full}
## 1. 下面每条说法，原文是支持、相反，还是没提？
${props.map((p: any) => `${p.i}. ${p.statement}`).join('\n')}
## 2. 这段研究简介有没有透露任何结果（方向、数字、谁更好）？
${brief}
## 3. 下面每处改动，改后的说法是不是和原文矛盾、或者原文里找不到依据（是 = 改出来的错是真的错）？
${planted.map((p: any, i: number) => `${i + 1}. [${p.kind}] 改后：「${p.changed}」`).join('\n')}
返回：{ "props": [ { "i": 1, "verdict": "supported|contradicted|not_in_text", "quote": "原文依据（一字不改，没有就空）" } ], "brief_leaks": ["泄露结果的句子，没有就空"], "planted": [ { "i": 1, "is_error": true, "note": "" } ] }`, CHECKER, '交叉核对');
  const vs = (c.props || []).map((x: any) => { const p = props.find((y: any) => y.i === Number(x.i)); const v = String(x.verdict || ''); return { i: Number(x.i), verdict: v, quote: S(x.quote, 300), label_ok: p ? (p.truth ? v === 'supported' : v === 'contradicted') : false }; });
  // 泄露句必须真在简介里（核对模型有时把论文原文的结论当成「泄露句」交回来）
  const nz = (x: string) => String(x).replace(/\s+/g, '');
  return { props: vs, brief_leaks: (c.brief_leaks || []).map(String).filter((x: string) => x.length >= 6 && nz(brief).includes(nz(x).slice(0, 20))), planted_ok: (c.planted || []).map((x: any) => ({ i: Number(x.i), ok: !!x.is_error, note: S(x.note, 200) })) };
}
/** D 复算：AI 代导师从表格里挑能复算的结论数字；千问不看答案独立算一遍，对不上的标疑问 */
async function addRecompute(ex: any, full: string) {
  const d = await ask(`你是这一方向的导师。从下面论文里挑 2–3 个「正文报告的结论数字，能用论文表格里的原始数字算出来」的地方（比如降低了百分之几、平均值、比值、差值），出复算题。只用原文，表格照原样抄成 Markdown，不要改数字。
## 论文：${ex.title}
${full}
只返回 JSON：{ "items": [ { "table": "原文表格（Markdown，只保留算这一题需要的行和列）", "question": "要算什么（写清口径，不透露答案）", "answer": 0, "unit": "%|x|…", "tolerance": 0.5, "formula": "怎么算", "quote": "原文报告这个数的句子（一字不改）" } ] }`, MENTOR, '出题 · D 复算');
  const items = (d.items || []).slice(0, 3).map((x: any, i: number) => ({ i: i + 1, table: S(x.table, 3000), question: S(x.question, 400), answer: Number(x.answer), unit: S(x.unit, 10), tolerance: Math.max(0.01, Number(x.tolerance) || 0.5), formula: S(x.formula, 300), quote: S(x.quote, 400) })).filter((x: any) => x.table && x.question && Number.isFinite(x.answer));
  const c = await ask(`按下面的表格和问题算出数值，只返回 JSON：{ "answers": [ { "i": 1, "value": 0 } ] }
${items.map((x: any) => `### 题 ${x.i}\n${x.table}\n问题：${x.question}`).join('\n\n')}`, CHECKER, '交叉核对 · D 复算');
  ex.recompute = items;
  ex.check = { ...(ex.check || {}), recompute: items.map((x: any) => { const v = Number((c.answers || []).find((y: any) => Number(y.i) === x.i)?.value); return { i: x.i, value: v, ok: Number.isFinite(v) && Math.abs(v - x.answer) <= x.tolerance }; }) };
  return ex;
}
async function fullText(id: string) {
  const html = await (await fetch(`https://arxiv.org/html/${id}v1`)).text();
  return htmlToSections(html).map(s => `## ${s.title}\n${s.text}`).join('\n').slice(0, 160000);
}

async function build(id: string) {
  const html = await (await fetch(`https://arxiv.org/html/${id}v1`)).text();
  const abs = await (await fetch(`https://arxiv.org/abs/${id}`)).text();
  if (!/creativecommons\.org\/licenses\/by\//.test(abs)) throw new Error(`${id} 不是 CC BY 授权，不用`);
  const title = (abs.match(/<meta name="citation_title" content="([^"]+)"/) || [])[1] || id;
  const secs = htmlToSections(html);
  const full = secs.map(s => `## ${s.title}\n${s.text}`).join('\n').slice(0, 160000);
  console.log(`\n== ${id} ${title}（${secs.length} 节，${full.length} 字）`);
  // 1. AI 代导师出完整初稿
  const draft = await ask(`你是这一方向（AI 研发 · 模型训练）的博士生导师，要用下面这篇刚发表的论文给 AI 学员出一份科研能力测评。所有内容必须能在原文里找到依据，引原文时一字不改。全部中文（原文引文保留英文）。
## 论文：${title}（arXiv:${id}，CC BY 4.0）
${full}

出三题，只返回 JSON：
{
 "design_key": { "question": "研究问题一句话", "independent": ["自变量 / 被比较的条件"], "dependent": ["因变量 / 主要指标"], "baselines": ["对照 / 基线"], "data": ["数据集 / 任务"], "scale": "模型规模、训练量、重复次数 / 随机种子（原文没写重复就写「原文未报告重复次数」）", "evidence": ["每项的原文依据（短引文）"] },
 "method_excerpt": "给学员读的方法 / 实验设置原文（从原文摘，1500–3000 字符，不含任何结果）",
 "blind_brief": "给学员的盲测简介（中文，300–500 字）：研究问题、为什么值得做、实验怎么设计的——像预注册，绝不能透露任何结果、方向或数字",
 "findings": [ { "true_statement": "原文支持的一条具体发现（带方向，最好带量级）", "false_statement": "把它反过来或改错量级的版本（看起来同样合理）", "quote": "原文依据（一字不改）" } ]   // 6 条，覆盖主结论、消融、反直觉的发现；别出靠常识就能猜对的
 ,"review_excerpt": "从原文摘一段方法 + 结果（2000–3500 字符，含具体数字和至少一处引用），之后会在这里埋错——先给原文",
 "planted": [ { "kind": "number|overclaim|fake_reference", "original": "被改的原文片段", "changed": "改成什么", "why_wrong": "为什么是错的、读者靠什么能发现" } ]   // 3 处：一处数字前后矛盾（改后和同段别处 / 表格对不上），一处结论超出证据（加一句原文没有的夸大结论），一处编一条参考文献（作者 + 年份 + 标题，在正文里引用它）
}`, MENTOR, '出题（AI 代导师）');
  // 埋错：在原文摘录上按导师给的改法替换
  let review = String(draft.review_excerpt || '');
  const planted = (draft.planted || []).slice(0, 3).map((p: any) => ({ kind: S(p.kind, 20), original: S(p.original, 400), changed: S(p.changed, 600), why_wrong: S(p.why_wrong, 300) }));
  for (const p of planted) {
    if (p.kind === 'fake_reference' || !p.original || !review.includes(p.original)) review += p.kind === 'fake_reference' ? `\n${p.changed}` : (review.includes(p.original) ? '' : `\n${p.changed}`);
    else review = review.replace(p.original, p.changed);
  }
  // 盲测：每条随机出真的或反的，记下答案
  const props = (draft.findings || []).slice(0, 6).map((f: any, i: number) => { const t = Math.random() < 0.5; return { i: i + 1, statement: S(t ? f.true_statement : f.false_statement, 300), truth: t, quote: S(f.quote, 400), true_statement: S(f.true_statement, 300) }; });
  // 2. 交叉核对（另一家模型、给全文）：只问「原文支持 / 相反 / 没提」，对不对答案由程序比——以前问「标得对不对」，核对模型把故意写反的论断也记成有疑问
  const check = await crossCheck(full, props, String(draft.blind_brief || ''), planted);
  const exam = {
    id, title, url: `https://arxiv.org/abs/${id}`, license: 'CC BY 4.0', field: 'AI 研发 · 模型训练', scope: 'public', org: null,
    status: 'ai_draft', mentor: `AI 代导师（${MENTOR}）`, checker: CHECKER, built_at: new Date().toISOString(),
    corrections: [] as { by: string; at: string; what: string }[],   // 真人导师的校正记录
    design_key: draft.design_key, method_excerpt: S(draft.method_excerpt, 4000), blind_brief: S(draft.blind_brief, 1200),
    propositions: props, review_excerpt: review.slice(0, 5000), planted, check,
  };
  await saveExam(`${DIR}/${id}.json`, exam);
  const bad = check.props.filter((x: any) => !x.label_ok).length, leaks = check.brief_leaks.length, pbad = check.planted_ok.filter((x: any) => !x.ok).length;
  console.log(`  出好：论断 ${props.length}（核对有疑问 ${bad}）· 简介泄露 ${leaks} 处 · 埋错 ${planted.length}（有疑问 ${pbad}）`);
  return exam;
}

/** 学员作答：三题分开问（同一个学员模型） */
async function sit(exam: any, model: string) {
  if (exam._onlyD) return { A: null, B: null, C: null, D: (exam.recompute || []).length ? await askD(exam, model) : null };
  const A = await ask(`你在做一份科研能力测评。读下面这篇论文的方法 / 实验设置原文，还原它的研究设计。只根据原文，原文没写的就写「原文未报告」，不要补充原文没有的信息。
## ${exam.title}
${exam.method_excerpt}
只返回 JSON：{ "question": "", "independent": [], "dependent": [], "baselines": [], "data": [], "scale": "" }`, model, `学员作答 A（${model}）`);
  const B = await ask(`你在做一份科研能力测评（盲测预测）。下面是一项研究的设计（结果还没告诉你）。对每条论断，给出它为真的概率（0–1），并用一句话说理由。拿不准就给接近 0.5 的概率——我们会按校准打分，过度自信会扣分。
## 研究简介
${exam.blind_brief}
## 论断
${exam.propositions.map((p: any) => `${p.i}. ${p.statement}`).join('\n')}
只返回 JSON：{ "answers": [ { "i": 1, "p_true": 0.5, "why": "" } ] }`, model, `学员作答 B（${model}）`);
  const C = await ask(`你在替导师初审一篇投稿。下面是稿件的一段（方法 + 结果）。找出其中的问题：数字前后不一致、结论超出证据、引用可疑等。每条写出原文片段（一字不改）和问题。没有把握的不要硬凑。
## 稿件节选
${exam.review_excerpt}
只返回 JSON：{ "issues": [ { "quote": "", "problem": "" } ] }`, model, `学员作答 C（${model}）`);
  const D = (exam.recompute || []).length ? await askD(exam, model) : null;
  return { A, B, C, D };
}
async function askD(exam: any, model: string) {
  return ask(`你在做一份科研能力测评（复算）。用每题给的表格算出数值，只用表格里的数字；表格不够就在 note 里说明，不要编数字。
${exam.recompute.map((x: any) => `### 题 ${x.i}\n${x.table}\n问题：${x.question}`).join('\n\n')}
只返回 JSON：{ "answers": [ { "i": 1, "value": 0, "how": "一句话怎么算", "note": "" } ] }`, model, `学员作答 D（${model}）`);
}
/** D 程序判：和论文报告的数在误差内算对 */
function gradeD(exam: any, D: any) {
  if (!(exam.recompute || []).length || !D) return null;
  const det = exam.recompute.map((x: any) => { const v = Number((D.answers || []).find((y: any) => Number(y.i) === x.i)?.value); return { i: x.i, value: Number.isFinite(v) ? v : null, answer: x.answer, ok: Number.isFinite(v) && Math.abs(v - x.answer) <= x.tolerance }; });
  return { right: det.filter((x: any) => x.ok).length, of: det.length, detail: det };
}

async function grade(exam: any, ans: any) {
  // B：程序算
  const bs = exam.propositions.map((p: any) => { const a = (ans.B.answers || []).find((x: any) => Number(x.i) === p.i); const q = Math.min(1, Math.max(0, Number(a?.p_true ?? 0.5))); return { i: p.i, p: q, truth: p.truth, correct: (q > 0.5) === p.truth && q !== 0.5, brier: (q - (p.truth ? 1 : 0)) ** 2 }; });
  const acc = bs.filter((x: any) => x.correct).length / bs.length, brier = bs.reduce((n: number, x: any) => n + x.brier, 0) / bs.length;
  // A / C：评卷对照答案判
  const g = await ask(`你是科研测评的评卷人，对照标准答案判学员作答，只返回 JSON。
## A 研究设计（标准答案）
${JSON.stringify(exam.design_key)}
## A 学员作答
${JSON.stringify(ans.A)}
## C 审稿：埋下的错（标准答案）
${exam.planted.map((p: any, i: number) => `${i + 1}. [${p.kind}] 改后：「${p.changed}」——${p.why_wrong}`).join('\n')}
## C 学员找出的问题
${JSON.stringify(ans.C.issues || [])}
A：按 question / independent / dependent / baselines / data / scale 六项，每项 0–2 分（2 = 和答案一致，1 = 部分对，0 = 错或缺；学员写了原文没有的内容按错算）。
C：每处埋的错有没有被找到（找到 = 指出了那个片段且说对了问题）；学员其余的问题里，哪些是在原文没问题的地方误报。
{ "A": { "items": { "question": 0, "independent": 0, "dependent": 0, "baselines": 0, "data": 0, "scale": 0 }, "note": "" }, "C": { "found": [true, false, true], "false_alarms": 0, "note": "" } }`, JUDGE, '评卷');
  const aScore = Math.round(Object.values(g.A?.items || {}).reduce((n: number, v: any) => n + (Number(v) || 0), 0) / 12 * 100);
  const found = (g.C?.found || []).filter(Boolean).length;
  // 防幻觉：作答里引了材料没有的文献
  const fake = fabricatedCitations(JSON.stringify(ans), [exam.method_excerpt, exam.blind_brief, exam.review_excerpt].join('\n'));
  return { D: gradeD(exam, ans.D), A: aScore, B: { accuracy: Math.round(acc * 100), brier: Math.round(brier * 1000) / 1000, detail: bs }, C: { found, of: exam.planted.length, false_alarms: Number(g.C?.false_alarms) || 0, note: S(g.C?.note, 300) }, fabricated: fake, judge_note: S(g.A?.note, 300) };
}

if (cmd === 'addcalc') {
  for (const id of args) { const f = `${DIR}/${id}.json`; const ex = JSON.parse(fs.readFileSync(f, 'utf8')); await addRecompute(ex, await fullText(id)); await saveExam(f, ex);
    console.log(`${id}：复算 ${ex.recompute.length} 题，核对对上 ${ex.check.recompute.filter((x: any) => x.ok).length}/${ex.recompute.length}`); }
} else if (cmd === 'sync') {
  // 把 JSON 里的题写进库（迁移 060 跑完后一次）
  for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.json'))) { const ex = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8')); await upsertExam(ex); console.log('写库', ex.id, ex.title); }
} else if (cmd === 'rekey') {
  // A 题答案只按给学员的方法摘录定（以前按全文定，学员拿不到的细节也算缺）；然后用已交的作答重评 A
  const RES = `docs/科研能力测评/${flag('date') || new Date().toISOString().slice(0, 10)}.json`;
  const res = fs.existsSync(RES) ? JSON.parse(fs.readFileSync(RES, 'utf8')) : [];
  for (const id of args) {
    const f = `${DIR}/${id}.json`; const ex = JSON.parse(fs.readFileSync(f, 'utf8'));
    const k = await ask(`下面是给学员读的论文方法摘录。只根据这段摘录，写出研究设计的标准答案；摘录里没写的项一律写「摘录未给出」，不要用你对这篇论文的其他了解补充。只返回 JSON。
## ${ex.title}
${ex.method_excerpt}
{ "question": "", "independent": [], "dependent": [], "baselines": [], "data": [], "scale": "" }`, MENTOR, '出题 · A 答案按摘录定');
    ex.design_key_full = ex.design_key_full || ex.design_key; ex.design_key = k; await saveExam(f, ex);
    for (const r of res.filter((x: any) => x.paper === id)) {
      const g = await ask(`你是科研测评的评卷人，对照标准答案判学员还原的研究设计，只返回 JSON。标准答案只来自学员看到的那段摘录；答案写「摘录未给出」的项，学员写「原文未报告」或类似说法算全对，学员自己编出具体内容算错。
## 标准答案
${JSON.stringify(k)}
## 学员作答
${JSON.stringify(r.answers.A)}
六项每项 0–2 分（2 = 一致，1 = 部分对，0 = 错或缺；写了摘录里没有的具体内容按错）。
{ "items": { "question": 0, "independent": 0, "dependent": 0, "baselines": 0, "data": 0, "scale": 0 }, "note": "" }`, JUDGE, '评卷 · A 重评');
      r.A_full = r.A_full ?? r.A; r.A = Math.round(Object.values(g.items || {}).reduce((n: number, v: any) => n + (Number(v) || 0), 0) / 12 * 100); r.judge_note = S(g.note, 300);
      console.log(`${r.model} × ${id}：A ${r.A_full} → ${r.A}`);
    }
    fs.writeFileSync(RES, JSON.stringify(res, null, 1));
  }
} else if (cmd === 'recheck') {
  // 只重跑交叉核对（题不变）
  for (const id of args) { const f = `${DIR}/${id}.json`; const ex = JSON.parse(fs.readFileSync(f, 'utf8')); ex.check = await crossCheck(await fullText(id), ex.propositions, ex.blind_brief, ex.planted); ex.checker = CHECKER; await saveExam(f, ex);
    console.log(`${id}：论断有疑问 ${ex.check.props.filter((x: any) => !x.label_ok).map((x: any) => `${x.i}(${x.verdict})`).join(' ') || '无'} · 简介泄露 ${ex.check.brief_leaks.length} · 埋错有疑问 ${ex.check.planted_ok.filter((x: any) => !x.ok).map((x: any) => x.i).join(' ') || '无'}`); }
} else if (cmd === 'build') {
  for (const id of args) { try { await build(id); } catch (e: any) { console.log(`  ✗ ${id}：${String(e?.message).slice(0, 120)}`); } }
} else if (cmd === 'run') {
  const papers = (flag('papers') ? flag('papers').split(',') : fs.readdirSync(DIR).map(f => f.replace(/\.json$/, '')));
  // 优先用库里的版本（导师校正过的），跳过导师作废的论断 / 埋错
  const exams = await Promise.all(papers.map(async p => {
    const { data: row } = await db.from('college_research_exams').select('*').eq('id', p).maybeSingle();
    const ex = row ? { id: row.id, title: row.title, status: row.status, ...row.exam } : JSON.parse(fs.readFileSync(`${DIR}/${p}.json`, 'utf8'));
    return { ...ex, propositions: (ex.propositions || []).filter((x: any) => !x.discard), planted: (ex.planted || []).filter((x: any) => !x.discard) };
  }));
  const OUT = `docs/科研能力测评`; fs.mkdirSync(OUT, { recursive: true });
  const file = `${OUT}/${new Date().toISOString().slice(0, 10)}.json`;
  const res: any[] = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  for (const model of args) for (const ex of exams) {
    const had = res.find(r => r.model === model && r.paper === ex.id);
    if (had) {
      // 老成绩没有 D 复算：只补考 D
      if (!had.D && (ex.recompute || []).length) { try { const D = (await sit({ ...ex, _onlyD: true }, model)).D; had.answers.D = D; had.D = gradeD(ex, D); console.log(`${model} × ${ex.id}：补 D 复算 ${had.D?.right}/${had.D?.of}`); fs.writeFileSync(file, JSON.stringify(res, null, 1)); } catch (e: any) { console.log(`✗ ${model} × ${ex.id} D：${String(e?.message).slice(0, 100)}`); } }
      continue;
    }
    try { const ans = await sit(ex, model); const g = await grade(ex, ans); res.push({ model, paper: ex.id, title: ex.title, ...g, answers: ans }); console.log(`${model} × ${ex.id}：A 读懂 ${g.A} · B 盲测 准确 ${g.B.accuracy}% Brier ${g.B.brier} · C 审稿 找到 ${g.C.found}/${g.C.of} 误报 ${g.C.false_alarms}${g.fabricated.length ? ` · 编造引用 ${g.fabricated.length}` : ''}`); }
    catch (e: any) { console.log(`✗ ${model} × ${ex.id}：${String(e?.message).slice(0, 120)}`); }
    fs.writeFileSync(file, JSON.stringify(res, null, 1));
  }
  console.log('\n模型 | D 复算 | A 读懂 | B 盲测准确 | B Brier（越低越好，0.25 = 全猜 0.5） | C 找到埋错 | C 误报');
  for (const model of args) { const rs = res.filter(r => r.model === model); if (!rs.length) continue; const av = (f: (r: any) => number) => Math.round(rs.reduce((n, r) => n + f(r), 0) / rs.length * 100) / 100;
    console.log(`${model} | ${rs.reduce((n, r) => n + (r.D?.right || 0), 0)}/${rs.reduce((n, r) => n + (r.D?.of || 0), 0)} | ${av(r => r.A)} | ${av(r => r.B.accuracy)}% | ${av(r => r.B.brier)} | ${rs.reduce((n, r) => n + r.C.found, 0)}/${rs.reduce((n, r) => n + r.C.of, 0)} | ${rs.reduce((n, r) => n + r.C.false_alarms, 0)}`); }
}
