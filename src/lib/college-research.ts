/**
 * 百业学院 · 科研能力测评进学籍（11-22）：论文三题（A 读懂 / B 盲测 / C 埋错审稿 / D 复算）以前只在 scripts/research-exam.mts 线下跑，
 * 成绩写在 docs 的 JSON 里，进不了学籍和成绩单。这里把「作答 + 评卷」搬进来，学院秘书 / 教务处能直接让学员考，成绩记进学籍笔记 notebook.research。
 *   私域题（scope private）只给那家机构培养的学员考，考时带上这家的私域资料（出题那份内部文献排除，不然等于给答案）；公开题裸考。
 * 题目用库里 college_research_exams 的版本（导师校正过的改动直接在 exam 里）。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { logTokenUsage, withCost } from '@/lib/token-logger';
import { fabricatedCitations, type Notebook } from '@/lib/college-train';
import { orgOfEnrollment, privatePack } from '@/lib/college-private';

const JUDGE = 'claude-opus-5-5';   // A / C 对照答案判（和线下脚本同一个评卷模型）
const S = (v: any, n = 600) => String(v ?? '').trim().slice(0, n);

async function ask(prompt: string, model: string, task: string, tries = 3): Promise<any> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await generateContent(prompt, model, { jsonMode: true, temperature: 0 });
      await logTokenUsage({ tool_name: 'college', task_name: `科研测评 · ${task}`, institution: '百业学院', model_id: model, usageMetadata: r.usageMetadata } as any).catch(() => {});
      const p = parseJsonLoose(r.text); if (p && typeof p === 'object') return p;
    } catch (e) { last = e; }
  }
  throw last || new Error(`${task} 没返回 JSON`);
}

async function sit(exam: any, model: string, pack: string) {
  const pre = pack ? `${pack}\n\n---\n以上是培养你的实验室的私域资料，作答时可以用。\n\n` : '';
  const A = await ask(`${pre}你在做一份科研能力测评。读下面这篇论文的方法 / 实验设置原文，还原它的研究设计。只根据原文，原文没写的就写「原文未报告」，不要补充原文没有的信息。
## ${exam.title}
${exam.method_excerpt}
只返回 JSON：{ "question": "", "independent": [], "dependent": [], "baselines": [], "data": [], "scale": "" }`, model, '学员作答 A');
  const B = await ask(`${pre}你在做一份科研能力测评（盲测预测）。下面是一项研究的设计（结果还没告诉你）。对每条论断，给出它为真的概率（0–1），并用一句话说理由。拿不准就给接近 0.5 的概率——我们会按校准打分，过度自信会扣分。
## 研究简介
${exam.blind_brief}
## 论断
${(exam.propositions || []).map((p: any) => `${p.i}. ${p.statement}`).join('\n')}
只返回 JSON：{ "answers": [ { "i": 1, "p_true": 0.5, "why": "" } ] }`, model, '学员作答 B');
  const C = await ask(`${pre}你在替导师初审一篇投稿。下面是稿件的一段（方法 + 结果）。找出其中的问题：数字前后不一致、结论超出证据、引用可疑等。每条写出原文片段（一字不改）和问题。没有把握的不要硬凑。
## 稿件节选
${exam.review_excerpt}
只返回 JSON：{ "issues": [ { "quote": "", "problem": "" } ] }`, model, '学员作答 C');
  const D = (exam.recompute || []).length ? await ask(`${pre}你在做一份科研能力测评（复算）。用每题给的表格算出数值，只用表格里的数字；表格不够就在 note 里说明，不要编数字。
${exam.recompute.map((x: any) => `### 题 ${x.i}\n${x.table}\n问题：${x.question}`).join('\n\n')}
只返回 JSON：{ "answers": [ { "i": 1, "value": 0, "how": "一句话怎么算", "note": "" } ] }`, model, '学员作答 D') : null;
  return { A, B, C, D };
}

async function grade(exam: any, ans: any) {
  const props = (exam.propositions || []).filter((p: any) => !p.discard);
  const bs = props.map((p: any) => { const a = (ans.B?.answers || []).find((x: any) => Number(x.i) === p.i); const q = Math.min(1, Math.max(0, Number(a?.p_true ?? 0.5))); return { i: p.i, p: q, truth: p.truth, correct: (q > 0.5) === p.truth && q !== 0.5, brier: (q - (p.truth ? 1 : 0)) ** 2 }; });
  const acc = bs.length ? bs.filter((x: any) => x.correct).length / bs.length : 0, brier = bs.length ? bs.reduce((n: number, x: any) => n + x.brier, 0) / bs.length : 0.25;
  const planted = (exam.planted || []).filter((p: any) => !p.discard);
  const g = await ask(`你是科研测评的评卷人，对照标准答案判学员作答，只返回 JSON。
## A 研究设计（标准答案）
${JSON.stringify(exam.design_key)}
## A 学员作答
${JSON.stringify(ans.A)}
## C 审稿：埋下的错（标准答案）
${planted.map((p: any, i: number) => `${i + 1}. [${p.kind}] 改后：「${p.changed}」——${p.why_wrong}`).join('\n')}
## C 学员找出的问题
${JSON.stringify(ans.C?.issues || [])}
A：按 question / independent / dependent / baselines / data / scale 六项，每项 0–2 分（2 = 和答案一致，1 = 部分对，0 = 错或缺；学员写了原文没有的内容按错算）。
C：每处埋的错有没有被找到（找到 = 指出了那个片段且说对了问题）；学员其余的问题里，哪些是在原文没问题的地方误报。
{ "A": { "items": { "question": 0, "independent": 0, "dependent": 0, "baselines": 0, "data": 0, "scale": 0 }, "note": "" }, "C": { "found": [true, false, true], "false_alarms": 0, "note": "" } }`, JUDGE, '评卷');
  const A = Math.round(Object.values(g.A?.items || {}).reduce((n: number, v: any) => n + (Number(v) || 0), 0) / 12 * 100);
  const found = (g.C?.found || []).filter(Boolean).length, fa = Number(g.C?.false_alarms) || 0;
  const rec = (exam.recompute || []).filter((x: any) => !x.discard);
  const D = rec.length && ans.D ? (() => { const det = rec.map((x: any) => { const v = Number((ans.D.answers || []).find((y: any) => Number(y.i) === x.i)?.value); return { i: x.i, value: Number.isFinite(v) ? v : null, answer: x.answer, ok: Number.isFinite(v) && Math.abs(v - x.answer) <= x.tolerance }; }); return { right: det.filter((x: any) => x.ok).length, of: det.length, detail: det }; })() : null;
  const fabricated = fabricatedCitations(JSON.stringify(ans), [exam.method_excerpt, exam.blind_brief, exam.review_excerpt].join('\n'));
  // 总分（0–100，给成绩单用）：A 读懂、B 盲测准确率、C 找到的埋错（误报半个抵一个）、D 复算各占一份，有几题算几题；编造文献封顶 45
  const parts = [A, Math.round(acc * 100), planted.length ? Math.round(Math.max(0, found - fa * 0.5) / planted.length * 100) : null, D ? Math.round(D.right / D.of * 100) : null].filter((x): x is number => x != null);
  let total = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0;
  if (fabricated.length && total > 45) total = 45;
  return { total, A, B: { accuracy: Math.round(acc * 100), brier: Math.round(brier * 1000) / 1000 }, C: { found, of: planted.length, false_alarms: fa, note: S(g.C?.note, 300) }, D: D ? { right: D.right, of: D.of } : null, fabricated, judge_note: S(g.A?.note, 300) };
}

async function loadEn(id: string) {
  const { data: e } = await db.from('college_enrollments').select('id, space_id, demand_id, notebook, status, nova_name, student:college_students(model_id)').eq('id', id).single();
  if (!e) throw new Error('学籍不存在');
  if (e.status === 'withdrawn') throw new Error('已退学的学籍不能继续培养');
  const st: any = Array.isArray(e.student) ? e.student[0] : e.student;
  if (!st?.model_id) throw new Error('这位学员还没接上模型接口');
  return { ...e, model: st.model_id as string, notebook: (e.notebook || {}) as Notebook & { research?: ResearchRun[] } };
}
export type ResearchRun = { exam_id: string; title: string; scope: 'public' | 'private'; field: string | null; pack: boolean; total: number; A: number; B: { accuracy: number; brier: number }; C: { found: number; of: number; false_alarms: number }; D: { right: number; of: number } | null; fabricated: string[]; at: string };

/** 这份学籍能考的科研测评题：私域题只列培养它的那家机构的，排在最前；其余是公开题 */
export async function listResearchExams(enrollmentId: string) {
  const en = await loadEn(enrollmentId);
  const org = await orgOfEnrollment(en);
  const { data } = await db.from('college_research_exams').select('id, title, field, scope, org, status');
  const done = new Map((en.notebook.research || []).map(r => [r.exam_id, r.total]));
  return (data || []).filter((x: any) => x.scope === 'public' || (org && x.org === org.org_id))
    .map((x: any) => ({ id: x.id, title: x.title, field: x.field, scope: x.scope, status: x.status, private_of: x.scope === 'private' ? org?.org_name : null, last_total: done.get(x.id) ?? null }))
    .sort((a: any, b: any) => (a.scope === 'private' ? 0 : 1) - (b.scope === 'private' ? 0 : 1));
}

/** 考一道科研测评题，成绩记进学籍笔记 notebook.research（同一道题、同样带不带资料，只留最新一次） */
export async function runResearchExam(enrollmentId: string, examId: string): Promise<ResearchRun> {
  const en = await loadEn(enrollmentId);
  const { data: row } = await db.from('college_research_exams').select('id, title, field, scope, org, exam').eq('id', examId).single();
  if (!row) throw new Error('这道科研测评题不存在');
  const org = await orgOfEnrollment(en);
  if (row.scope === 'private' && row.org !== org?.org_id) throw new Error('这是别家实验室的私域题，只给那家机构培养的学员考');
  const exam: any = row.exam || {};
  const pack = row.scope === 'private' && org ? await privatePack(org.org_id, { exclude: exam.pack_exclude || [], max: 12000 }) : '';
  const cost = { space_id: en.space_id, stage: 'use', actor: `college:${en.id}` };
  const ans = await withCost(cost, () => sit({ ...exam, title: row.title }, en.model, pack));
  const g = await withCost(cost, () => grade(exam, ans));
  const run: ResearchRun = { exam_id: row.id, title: row.title, scope: row.scope, field: row.field, pack: !!pack, total: g.total, A: g.A, B: g.B, C: { found: g.C.found, of: g.C.of, false_alarms: g.C.false_alarms }, D: g.D, fabricated: g.fabricated, at: new Date().toISOString() };
  const research = [...(en.notebook.research || []).filter(r => !(r.exam_id === run.exam_id && r.pack === run.pack)), run].slice(-30);
  await db.from('college_enrollments').update({ notebook: { ...en.notebook, research }, updated_at: run.at }).eq('id', en.id);
  return run;
}
