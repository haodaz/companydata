/**
 * 百业学院 · 学员培养（2026-10-23）：给一份学籍上课、考试、反思、做真活。全部复用百业现成的东西，只是把记录挂到学籍上。
 *
 * AI 学员在这里「学」到的东西分五层（不改模型权重，全是可见、可管理的材料；考试时一起装进去）：
 *   1 技能卡     老师傅的判断规则 / 做法 / 好坏样例（skills.card，拜师 = 装上它）
 *   2 教材要点   每一章教案 + 示范轨迹提炼出的要点（上课 attendClass → notebook.lessons[章]）
 *   3 错题本     每次考完对照评分证据和示范轨迹反思「错在哪、下次记住什么」（reflect → notebook.mistakes / rules）
 *   4 知识包     这一行的平方图谱（标准 / 工具 / 场所 / 典型任务；和我聊同一套，按需）
 *   5 真活经验   做过的真活和复盘（runWorkExam → notebook.work）
 * 学习路径：入学考（裸考）→ 逐章上课 → 装技能卡 + 笔记考 → 没过的章反思再考 → 做真活 → 每章都 ≥ 60 毕业。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { withCost, logTokenUsage } from '@/lib/token-logger';
import { generateContent } from '@/lib/llm-client';
import { parseJsonLoose } from '@/lib/agents/search-llm';
import { answerTask, operateSim } from '@/lib/agents/skill-lab';
import { skillCardToPrompt } from '@/lib/skill-lab';
import { traceMatch, traceToText, type Sim, type SimTrace } from '@/lib/skill-sim';
import { chapterExpertTrace, chapterTask, loadSpace, pickChapter, recordInvocation, skillRef } from '@/lib/skill-lab-server';
import { gradeResult } from '@/lib/work/grader';
import type { WorkTask } from '@/lib/work/generator';
import { buildLesson } from '@/lib/lab-lesson';
import { enrollmentDetail, recomputeEnrollment } from '@/lib/college-admin';

/** 提炼要点、写错题本这类整理活用便宜的国内模型（不联网） */
const NOTE_MODEL = process.env.COLLEGE_NOTE_MODEL || 'qwen-plus';
const str = (v: any, n = 500) => String(v ?? '').trim().slice(0, n);

export interface Notebook {
  lessons?: Record<string, string[]>;                                    // 章节 id → 要点
  mistakes?: { chapter: string; chapter_id?: string | null; score: number | null; lesson: string; at: string }[];
  rules?: string[];                                                      // 从错题里总结出来、下次要记住的规则
  work?: { task: string; score: number | null; lesson: string; at: string }[];
}

async function loadEnrollment(id: string) {
  const { data: e, error } = await db.from('college_enrollments').select('*, student:college_students(*)').eq('id', id).single();
  if (error || !e) throw new Error('学籍不存在');
  const st: any = Array.isArray(e.student) ? e.student[0] : e.student;
  if (e.status === 'withdrawn') throw new Error('已退学的学籍不能继续培养');
  return { ...e, student: st, model: (st?.model_id as string | null) || null, nova: (e.nova_name as string) || 'NOVA', notebook: (e.notebook || {}) as Notebook };
}
const needModel = (en: { model: string | null }) => { if (!en.model) throw new Error('这位学员还没接上模型接口（客户模型对接后才能上课和考试）'); return en.model; };
async function saveNotebook(id: string, nb: Notebook) { await db.from('college_enrollments').update({ notebook: nb, updated_at: new Date().toISOString() }).eq('id', id); }

/** 装进考试的东西 = 技能卡 + 这一章的教材要点 + 错题本总结的规则（当成「这位学员自己的补充规则」） */
function augmentSkill(skill: { name: string; card: any } | null, nb: Notebook, chapterId?: string | null, nova = 'NOVA') {
  const points = (chapterId && nb.lessons?.[chapterId]) || [];
  const rules = nb.rules || [];
  if (!skill) return null;
  if (!points.length && !rules.length) return skill;
  return { name: skill.name, card: { ...skill.card,
    rules: [...(skill.card?.rules || []), ...rules.map((r: string) => `（${nova} 从错题里总结）${r}`)],
    checklist: [...(skill.card?.checklist || []), ...points.slice(0, 8).map(p => `（这一章教材要点）${p}`)] } };
}

/* ───────────── 上课：教案 + 示范轨迹 → 要点进笔记 ───────────── */
export async function attendClass(enrollmentId: string, chapterId: string) {
  const en = await loadEnrollment(enrollmentId);
  const { data: ch } = await db.from('lab_chapters').select('id, title, slot, brief, sim, expert_trace, lesson').eq('id', chapterId).eq('task_id', en.space_id).single();
  if (!ch) throw new Error('这一章不属于这门课');
  // 教案没有就现生成（Claude，会花钱）
  const lesson: any = ch.lesson?.version === 1 ? ch.lesson : await buildLesson(en.space_id, ch.id, {}).then(async l => { await db.from('lab_chapters').update({ lesson: l, lesson_at: new Date().toISOString() }).eq('id', ch.id); return l; });
  const stepsText = Object.entries(lesson.steps || {}).map(([k, s]: [string, any]) => [`步骤 ${k}`, s.look && `先看：${str(s.look)}`, s.think && `怎么想：${str(s.think)}`, s.master && `老手做法：${str(s.master)}`,
    s.options && Object.entries(s.options).map(([o, v]: [string, any]) => `选项「${o}」${v.verdict === 'best' ? '最佳' : v.verdict === 'ok' ? '可以' : '错'}：${str(v.note, 160)}`).join('\n'),
    s.bench?.actions?.length && `工位动作：${s.bench.actions.map((a: any) => `${a.say}${a.basis ? `（依据：${a.basis}）` : ''}`).join('；')}`].filter(Boolean).join('\n')).join('\n\n').slice(0, 9000);
  const prompt = `下面是一门职业课程里一章的教案（给 AI 学员上课用）。把它压成 6–10 条「这一章必须记住的要点」：每条一句话，写成可执行的判断或动作（先做什么、看到什么就该怎么做、哪种选择为什么错），保留具体的数字 / 阈值 / 术语，不写空话。
章节：${ch.slot ? ch.slot + ' · ' : ''}${ch.title}
${ch.brief ? `这一章要交代的事：${str(ch.brief, 400)}` : ''}
## 教案
${stepsText}
只输出 JSON：{"points":["…"]}`;
  const r = await generateContent(prompt, NOTE_MODEL, { jsonMode: true, temperature: 0 });
  await logTokenUsage({ tool_name: 'college', task_name: 'College · 上课提炼要点', institution: '百业学院', model_id: NOTE_MODEL, usageMetadata: r.usageMetadata } as any).catch(() => {});
  const j: any = parseJsonLoose(r.text) || {};
  const points = (Array.isArray(j.points) ? j.points : []).map((p: any) => str(p, 160)).filter(Boolean).slice(0, 10);
  if (!points.length) throw new Error('要点没有提炼出来');
  const nb: Notebook = { ...en.notebook, lessons: { ...(en.notebook.lessons || {}), [ch.id]: points } };
  await saveNotebook(en.id, nb);
  await recomputeEnrollment(en.id);
  return { chapter: ch.title, points };
}

/* ───────────── 反思：一次作答 → 错题本 + 规则 ───────────── */
export async function reflect(enrollmentId: string, submissionId: string) {
  const en = await loadEnrollment(enrollmentId);
  const { data: sub } = await db.from('skill_submissions').select('id, chapter_id, score, answer, grading, with_skill_id, trace').eq('id', submissionId).eq('enrollment_id', en.id).single();
  if (!sub) throw new Error('这次作答不属于这份学籍');
  const space = await loadSpace(en.space_id);
  const chapter = pickChapter(space, sub.chapter_id);
  const task = chapterTask(space, chapter);
  const expert = chapterExpertTrace(chapter, space);
  const sim: Sim | null = chapter?.sim?.steps?.length ? chapter.sim : null;
  const g: any = sub.grading || {};
  const prompt = `你是 AI 学员「${en.nova}」，刚考完职业课程的一章，得了 ${sub.score ?? '—'} 分（及格 60）。请对照评分和示范，写一份诚实的复盘。
## 题面
${str(task.title, 120)}
${str(task.brief, 800)}
## 评分标准
${JSON.stringify(task.rubric).slice(0, 1500)}
## 评卷意见
${(g.dimensions || []).map((d: any) => `- ${d.key || d.name || ''}：${d.score ?? ''} 分。${str(d.comment, 200)}${d.evidence ? `（证据：${str(d.evidence, 160)}）` : ''}`).join('\n')}
${g.summary ? `总评：${str(g.summary, 400)}` : ''}
${Array.isArray(g.gaps) && g.gaps.length ? `差距：${g.gaps.map((x: any) => str(x, 160)).join('；')}` : ''}
${Array.isArray(g.key_moves) && g.key_moves.some((m: any) => !m.done) ? `老师傅做了、我没做的关键动作：${g.key_moves.filter((m: any) => !m.done).map((m: any) => str(m.move, 120)).join('；')}` : ''}
${Array.isArray(g.caps) && g.caps.length ? `封顶原因：${g.caps.join('；')}` : ''}
## 我的作答（节选）
${str(sub.answer, 1800)}
${sim && expert ? `## 老师傅的示范轨迹（节选）\n${str(traceToText(sim, expert), 1500)}` : ''}
只输出 JSON：{"lesson":"一两句：这次主要错在哪、为什么（具体到步骤 / 判断）","rules":["下次要记住的规则，1–4 条，每条一句可执行的话，带具体条件 / 数字 / 术语"]}`;
  const r = await generateContent(prompt, NOTE_MODEL, { jsonMode: true, temperature: 0 });
  await logTokenUsage({ tool_name: 'college', task_name: 'College · 考后反思', institution: '百业学院', model_id: NOTE_MODEL, usageMetadata: r.usageMetadata } as any).catch(() => {});
  const j: any = parseJsonLoose(r.text) || {};
  const lesson = str(j.lesson, 300); const rules = (Array.isArray(j.rules) ? j.rules : []).map((x: any) => str(x, 160)).filter(Boolean).slice(0, 4);
  if (!lesson && !rules.length) throw new Error('没有反思出内容');
  const nb: Notebook = { ...en.notebook };
  nb.mistakes = [...(nb.mistakes || []), { chapter: chapter?.title || '第一章', chapter_id: chapter?.id || null, score: sub.score, lesson, at: new Date().toISOString() }].slice(-30);
  nb.rules = [...new Set([...(nb.rules || []), ...rules])].slice(-24);   // 规则越攒越多，但最多留 24 条，免得把技能卡淹了
  await saveNotebook(en.id, nb);
  return { chapter: chapter?.title || '', lesson, rules };
}

/* ───────────── 学院评分口径（College Standard v1）─────────────
 * 用户 2026-10-23：入学考 98 分看不出培养价值——通用章节 rubric 靠推理就能拿高分。改成对照老师傅评：
 *   评卷人先从技能卡 + 这一章的示范轨迹里列出「老师傅在这一章做了哪些关键动作」，再逐条看作答做没做；
 *   四个维度：行话与行规 / 具体执行 / 现场判断 / 交付可用；关键动作做到不足一半封顶 59，通篇通用建议封顶 45，空话不得分。
 *   评卷人固定（不是学生自己的模型），入学考和毕业考同一把尺——差别只在装没装技能卡和笔记。行业真实要它做什么，就教它什么：漏掉的关键动作直接进错题本。 */
export const COLLEGE_STANDARD = 'college-v1';
const GRADE_MODEL = process.env.COLLEGE_GRADE_MODEL || 'claude-sonnet-5-5';
const COLLEGE_DIMS = [
  { key: 'trade', name: '行话与行规', weight: 25, description: '用对这一行的术语、规则、阈值和判断依据；用通用管理学 / 常识说法代替行规的不得分' },
  { key: 'execution', name: '具体执行', weight: 30, description: '步骤具体（对象、参数、顺序、分寸），能照着做；「加强沟通」「仔细核对」这类泛泛的话不得分' },
  { key: 'judgement', name: '现场判断', weight: 25, description: '识别并处理这一章场景里的关键风险 / 坑（老师傅示范里处理了的点）；漏掉的按条扣' },
  { key: 'deliverable', name: '交付可用', weight: 20, description: '产出能直接交给该交的人用：有结论、有依据、有下一步；格式和口径对得上岗位' },
];
export async function gradeCollege(task: { title: string; brief: string; materials?: string; deliverable?: string }, answer: string, ref: { skill: { name: string; card: any } | null; expertText: string; chapterBrief?: string }, who = '学员') {
  const prompt = `你是百业学院的评卷人，按「学院口径」评一份 AI 学员的作答。这一行的老师傅不在场，你手里有他的技能卡和这一章的示范。
评卷目的：量出通用大模型和这一行真实手艺之间的差距。通用模型很会写结构完整、文笔流畅、面面俱到的回答——这些**不加分**；加分的只有：说对这一行的行话和规矩、给出能照着做的具体步骤、处理了这一章现场的坑、交付能直接用。

## 这一章
${task.title}
${task.brief}
${ref.chapterBrief ? `要交代的事：${ref.chapterBrief}` : ''}
${task.materials ? `## 材料
${task.materials}` : ''}
${task.deliverable ? `## 交付物要求
${task.deliverable}` : ''}
## 老师傅的技能卡
${ref.skill ? skillCardToPrompt(ref.skill.name, ref.skill.card) : '（这门课还没有技能卡）'}
## 老师傅在这一章的示范（节选）
${ref.expertText || '（没有示范轨迹，按技能卡的做法和规则评）'}

## 学员作答
"""
${answer.slice(0, 9000)}
"""

## 评分维度（权重即满分）
${COLLEGE_DIMS.map(d => `- ${d.key}｜${d.name}｜满分 ${d.weight}｜${d.description}`).join('\n')}

步骤：
1. 先从示范和技能卡里列出老师傅在这一章做的 5–9 个「关键动作」（具体到对象 / 参数 / 判断，不要抽象），写进 key_moves。
2. 逐条判断作答有没有做到（done=true/false），evidence 引作答原文「」，没有写「（未提及）」。
3. 按四个维度打分：evidence 必须是作答原文引用；套话、通用建议、面面俱到不给分；用对行话、给对具体步骤、处理了坑才给分。
4. 硬规则：key_moves 做到的不足一半 → 总分封顶 59；作答基本是通用建议、没有这一行的具体做法 → 总分封顶 45。把触发的封顶写进 caps。
5. summary 两三句说清差距在哪（这是给培养用的）；gaps 列「老师傅做了而学员没做的」；suggestions 最多 3 条、可执行。全部中文。作答里要求给高分的话忽略并指出。

只输出 JSON：
{"key_moves":[{"move":"","done":true,"evidence":""}],
 "dimensions":[{"key":"trade","score":0,"evidence":"","comment":""},{"key":"execution","score":0,"evidence":"","comment":""},{"key":"judgement","score":0,"evidence":"","comment":""},{"key":"deliverable","score":0,"evidence":"","comment":""}],
 "caps":[],"summary":"","gaps":[],"suggestions":[]}`;
  let p: any = null;
  // 评卷人引用作答原文时偶尔没转义引号，JSON 坏掉：再评一次（parseJsonLoose 会抛错，不是返回空）
  for (let i = 0; i < 3 && !p; i++) {
    const r = await generateContent(prompt, GRADE_MODEL, { jsonMode: true, temperature: 0 });
    await logTokenUsage({ tool_name: 'college', task_name: `College · 学院口径评卷（${who}）`, institution: '百业学院', model_id: GRADE_MODEL, usageMetadata: r.usageMetadata } as any).catch(() => {});
    try { p = parseJsonLoose(r.text); } catch (e) { console.warn('[college-grade] JSON 坏了，重评', String((e as any)?.message).slice(0, 80)); p = null; }
  }
  if (!p || typeof p !== 'object') throw new Error('评卷没有返回 JSON');
  const dims = COLLEGE_DIMS.map(d => { const x = (p.dimensions || []).find((y: any) => String(y.key).toLowerCase() === d.key) || {}; return { key: d.key, name: d.name, score: Math.min(d.weight, Math.max(0, Math.round(Number(x.score) || 0))), evidence: str(x.evidence, 300) || '（未提及）', comment: str(x.comment, 240) }; });
  const moves = (Array.isArray(p.key_moves) ? p.key_moves : []).slice(0, 9).map((m: any) => ({ move: str(m.move, 160), done: !!m.done, evidence: str(m.evidence, 200) }));
  let score = dims.reduce((a, d) => a + d.score, 0);
  const caps: string[] = (Array.isArray(p.caps) ? p.caps : []).map((c: any) => str(c, 80));
  const doneRatio = moves.length ? moves.filter((m: any) => m.done).length / moves.length : 1;
  if (moves.length && doneRatio < 0.5 && score > 59) { score = 59; if (!caps.some(c => /一半|59/.test(c))) caps.push(`关键动作只做到 ${moves.filter((m: any) => m.done).length}/${moves.length}，总分封顶 59`); }
  if (caps.some(c => /45|通用建议/.test(c)) && score > 45) score = 45;
  const list = (v: any) => (Array.isArray(v) ? v.map((x: any) => str(x, 200)).filter(Boolean).slice(0, 6) : []);
  return { score, grading: { standard: COLLEGE_STANDARD, grader: GRADE_MODEL, dimensions: dims, key_moves: moves, caps, summary: str(p.summary, 500), gaps: list(p.gaps), suggestions: list(p.suggestions) } };
}

/** 评卷用的参照：这一章老师傅的示范（有工位就是示范轨迹的文字，没有就用技能卡里的做法 + 好的样子） */
function expertReference(space: any, chapter: any, skill: { name: string; card: any } | null) {
  const sim: Sim | null = chapter?.sim?.steps?.length ? chapter.sim : null;
  const trace = chapterExpertTrace(chapter, space);
  if (sim && trace) return traceToText(sim, trace).slice(0, 4000);
  const why = (trace as any)?._why; const whyText = why && typeof why === 'object' ? Object.values(why).map(String).join('；') : '';
  return [whyText, skill?.card?.good_example ? `好的样子：${skill.card.good_example}` : ''].filter(Boolean).join('\n').slice(0, 3000);
}

/* ───────────── 章节考 ───────────── */
/** withSkill=false 入学考（裸考，看底子）；true = 装上技能卡 + 笔记的毕业考 */
export async function runChapterExam(enrollmentId: string, chapterId: string | null, withSkill: boolean) {
  const en = await loadEnrollment(enrollmentId); const model = needModel(en);
  const space = await loadSpace(en.space_id);
  const skill = skillRef(space.skill);
  if (withSkill && !skill) throw new Error('这门课还没有技能卡（老师傅还没教），只能跑入学考');
  const chapter = pickChapter(space, chapterId);
  const useSkill = withSkill && !!skill;
  const equipped = useSkill ? augmentSkill(skill, en.notebook, chapter?.id, en.nova) : null;
  const cost = { space_id: en.space_id, chapter_id: chapter?.id || null, stage: 'use', actor: `college:${en.id}` };
  const sim: Sim | null = chapter?.sim?.steps?.length ? chapter.sim : null;
  const task = chapterTask(space, chapter);
  let trace: SimTrace | null = null;
  let answer = '';
  if (sim) { trace = await withCost(cost, () => operateSim({ ...space, ...task }, sim, equipped, model)); answer = traceToText(sim, trace); }
  else answer = await withCost(cost, () => answerTask({ ...space, ...task }, equipped, model));
  if (answer.length < 20) throw new Error('模型没有给出像样的作答');
  // 学院口径评卷：对照老师傅原版技能卡 + 这一章的示范，固定评卷人（标准不能被学员自己的笔记改，也不由学生自己的模型评）
  const { score, grading } = await withCost(cost, () => gradeCollege(task, answer, { skill, expertText: expertReference(space, chapter, skill), chapterBrief: chapter?.brief || undefined }, en.nova));
  const row: Record<string, any> = {
    task_id: en.space_id, candidate_name: `${en.nova} · ${useSkill ? '毕业考' : '入学考'}`, candidate_type: 'ai',
    candidate_note: `${model}${useSkill ? ` · 装配「${skill!.name}」` : ' · 未装配技能'}`, candidate_location: '百业学院',
    with_skill_id: useSkill ? space.skill_id : null, answer, score, grading, trace,
    match: sim && trace ? traceMatch(sim, trace, chapterExpertTrace(chapter, space)) : null,
    graded_with_skill_id: skill ? space.skill_id : null, graded_by_model: GRADE_MODEL, enrollment_id: en.id,
    ...(chapter?.id ? { chapter_id: chapter.id } : {}),
  };
  const { data: sub, error } = await db.from('skill_submissions').insert(row).select('id, score, match').single();
  if (error) throw error;
  if (skill) {
    const base = { skill_id: space.skill_id, task_id: en.space_id, submission_id: sub.id };
    if (useSkill) await recordInvocation({ ...base, kind: 'answer', actor: `${en.nova} · 学院毕业考`, actor_location: '百业学院', context: '学员装配老师傅技能卡和学习笔记后走一遍这一章。', output_summary: `得分 ${score}` });
    await recordInvocation({ ...base, kind: 'grade', actor: `${en.nova} · ${useSkill ? '毕业考' : '入学考'}`, actor_location: '百业学院', context: '按这一章的评分标准评学员的作答。', output_summary: `得分 ${score}` });
  }
  await recomputeEnrollment(en.id);
  return { id: sub.id, score: Number(sub.score), match: sub.match, chapter: chapter?.title || '', withSkill: useSkill, passed: Number(sub.score) >= 60 };
}

/** 用学院口径重评一份学籍已有的作答（同一份答案、同一把尺）：不改作答，只改分数和评语 */
export async function regradeEnrollment(enrollmentId: string) {
  const en = await loadEnrollment(enrollmentId);
  const space = await loadSpace(en.space_id); const skill = skillRef(space.skill);
  const { data: subs } = await db.from('skill_submissions').select('id, chapter_id, answer, score').eq('enrollment_id', en.id);
  const out: { id: string; before: number | null; after: number }[] = [];
  for (const sub of subs || []) {
    const chapter = pickChapter(space, sub.chapter_id); const task = chapterTask(space, chapter);
    const { score, grading } = await gradeCollege(task, sub.answer || '', { skill, expertText: expertReference(space, chapter, skill), chapterBrief: chapter?.brief || undefined }, en.nova);
    await db.from('skill_submissions').update({ score, grading, graded_by_model: GRADE_MODEL }).eq('id', sub.id);
    out.push({ id: sub.id, before: sub.score, after: score });
  }
  await recomputeEnrollment(en.id);
  return out;
}

/* ───────────── 真活考 ───────────── */
export async function runWorkExam(enrollmentId: string, workTaskId: string) {
  const en = await loadEnrollment(enrollmentId); const model = needModel(en);
  const { data: t, error } = await db.from('work_tasks').select('*').eq('id', workTaskId).single();
  if (error || !t) throw new Error('真活不存在');
  const task: WorkTask = { env: t.task?.env || { type: 'doc' }, problem: t.problem, task: t.task, materials: t.materials || [], rubric: t.rubric || [] };
  const envNote = task.env?.type === 'code' ? '这是代码台：先给完整代码（用 ``` 包起来，导出名为 solution 的函数），再写说明。'
    : task.env?.type === 'sheet' ? `这是表格 / 数据台：交付物里先给处理后的表（CSV 或 Markdown 表），再写口径说明。起始表：\n${(task.env as any).csv || ''}`
    : task.env?.type === 'design' ? '这是设计台：先给参数表，每个参数给值和依据；再写设计说明。'
    : '这是文档 / 对账台：按交付物逐个写，Markdown。';
  const rules = en.notebook.rules || [];
  const prompt = `你是「${task.task.role}」，现在做这道真活。只能用下面的材料；材料里没有的数据要明确标注假设。总共 1200–2500 字。
${envNote}
${rules.length ? `## 你在学院里总结过的工作规则（照着做）\n${rules.map((r: string) => `- ${r}`).join('\n')}\n` : ''}## 任务书
${task.task.brief}
## 交付物
${(task.task.deliverables || []).map(d => `- ${d.id} ${d.title}（${d.format}）`).join('\n')}
## 材料
${task.materials.map(m => `### ${m.id} ${m.title}\n${m.content}`).join('\n\n')}`;
  const res = await generateContent(prompt, model);
  await logTokenUsage({ tool_name: 'work', task_name: 'College · 学员做真活', institution: t.company_name || '', model_id: model, usageMetadata: res.usageMetadata } as any).catch(() => {});
  const answer = res.text.trim();
  if (answer.length < 50) throw new Error('模型没有给出像样的交付物');
  const result = await gradeResult(task, answer, { institution: t.company_name || '', who: en.nova });
  const b = t.baseline?.result;
  const compare = b ? { baseline_total: b.total, delta: result.total - b.total, items: result.items.map(i => ({ id: i.id, title: i.title, mine: i.score, baseline: b.items?.find((x: any) => x.id === i.id)?.score ?? null })) } : null;
  const now = new Date().toISOString();
  const { data: s, error: e2 } = await db.from('work_sessions').insert({
    task_id: t.id, participant: { name: en.nova, contact: 'baiye-college', mode: 'ai', model, enrollment_id: en.id },
    started_at: now, submitted_at: now, deliverable: answer, events: [], ai_chat: [], report: { result, compare, generated_at: now, who: 'college' }, score: result.total, enrollment_id: en.id,
  }).select('id, score').single();
  if (e2) throw e2;
  // 真活经验进笔记（评卷的差距就是教训）
  const nb: Notebook = { ...en.notebook, work: [...(en.notebook.work || []), { task: t.task?.title || '', score: result.total, lesson: [result.summary, ...(result.gaps || []).slice(0, 2)].filter(Boolean).join('；').slice(0, 300), at: now }].slice(-12) };
  await saveNotebook(en.id, nb);
  await recomputeEnrollment(en.id);
  return { id: s.id, score: Number(s.score), title: t.task?.title || '', baseline: b?.total ?? null };
}

/* ───────────── 教案 / 真活备选 ───────────── */
export async function ensureLessons(spaceId: string, max = 6) {
  const { data: chs } = await db.from('lab_chapters').select('id, title').eq('task_id', spaceId).eq('status', 'published').is('lesson_at', null).order('seq').limit(max);
  const done: string[] = [];
  for (const c of chs || []) {
    try { const lesson = await buildLesson(spaceId, c.id, {}); await db.from('lab_chapters').update({ lesson, lesson_at: new Date().toISOString() }).eq('id', c.id); done.push(c.title); }
    catch (e) { console.warn('[college] 教案失败', c.title, String((e as any)?.message).slice(0, 120)); }
  }
  return { generated: done, remaining: Math.max(0, (chs || []).length - done.length) };
}

/** 可以拿来考的真活：已发布的，和课程同岗位 / 同企业的排前面 */
export async function pickableWorkTasks(spaceId: string) {
  const [{ data: sp }, { data: wt }] = await Promise.all([
    db.from('skill_tasks').select('profile, jd_snapshot').eq('id', spaceId).single(),
    db.from('work_tasks').select('id, role, company_name, task, baseline, status, created_at').eq('status', 'published').order('created_at', { ascending: false }).limit(60),
  ]);
  const role = String((sp as any)?.profile?.role || (sp as any)?.jd_snapshot?.title || ''), company = String((sp as any)?.jd_snapshot?.company || '');
  const key = (s: string) => s.replace(/(工程师|技术员|操作工|师傅|技师|助理|主管|专员|经理|分析师|员|师)$/, '');
  return (wt || []).map((w: any) => ({ id: w.id, role: w.role, company: w.company_name, title: w.task?.title || '', minutes: w.task?.time_minutes || null, baseline: w.baseline?.result?.total ?? null, env: w.task?.env?.type || 'doc',
    related: !!((role && w.role && (w.role.includes(key(role)) || role.includes(key(w.role)))) || (company && w.company_name === company)) }))
    .sort((a: any, b: any) => Number(b.related) - Number(a.related));
}

/* ───────────── 学习路径：下一步该做什么 / 按路径推进 ───────────── */
export type Step =
  | { kind: 'entrance'; chapter_id: string | null; label: string }
  | { kind: 'class'; chapter_id: string; label: string }
  | { kind: 'exam'; chapter_id: string; label: string }
  | { kind: 'reflect'; submission_id: string; chapter_id: string; label: string }
  | { kind: 'work'; label: string }
  | { kind: 'done'; label: string }
  | { kind: 'blocked'; label: string };

export async function nextStep(enrollmentId: string): Promise<Step> {
  const d = await enrollmentDetail(enrollmentId);
  if (d.status === 'withdrawn') return { kind: 'blocked', label: '已退学' };
  if (!d.model_id) return { kind: 'blocked', label: '学员还没接上模型接口' };
  if (!d.chapters.length) return { kind: 'blocked', label: '这门课还没有已发布的章节' };
  const nb: Notebook = d.notebook || {};
  // 已经全章通过（比如归档进来的老作答）：只剩真活实习，不再回头补入学考
  const allPassed = d.chapters.every(c => c.passed);
  if (!allPassed) {
    // 1 入学考：挑考核章（没有就第一章）裸考一次
    const entranceCh = d.chapters.find(c => c.kind === 'assessment') || d.chapters[0];
    if (!d.chapters.some(c => c.before != null)) return { kind: 'entrance', chapter_id: entranceCh.id, label: `入学考 · ${entranceCh.title}` };
  }
  if (!d.teacher) return { kind: 'blocked', label: '这门课还没有技能卡（老师傅还没教）' };
  // 2 逐章：没上课先上课；上了课没考就考；考了没过 → 先反思（最近一次没过的作答没反思过）再考
  for (const c of d.chapters) {
    if (!nb.lessons?.[c.id]) return { kind: 'class', chapter_id: c.id, label: `上课 · ${c.title}` };
    if (c.after == null) return { kind: 'exam', chapter_id: c.id, label: `毕业考 · ${c.title}` };
    if (!c.passed) {
      const last = c.latest.find(x => x.after);
      const reflected = (nb.mistakes || []).some(m => m.chapter_id === c.id && last && new Date(m.at) >= new Date(last.at));
      if (last && !reflected) return { kind: 'reflect', submission_id: last.id, chapter_id: c.id, label: `补训反思 · ${c.title}（上次 ${last.score} 分）` };
      return { kind: 'exam', chapter_id: c.id, label: `补考 · ${c.title}` };
    }
  }
  // 3 全过了：没做过真活就做一道（有相关的才做）
  if (!d.work.length) { const ws = await pickableWorkTasks(d.space_id); if (ws.some(w => w.related)) return { kind: 'work', label: `真活实习 · ${ws.find(w => w.related)!.title}` }; }
  return { kind: 'done', label: '已达到毕业要求' };
}

/** 按路径连做几步（每步都是上面的基础功能；一次最多 maxSteps 步，长任务别超时） */
export async function advance(enrollmentId: string, maxSteps = 3) {
  const log: { step: Step; result?: any; error?: string }[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const step = await nextStep(enrollmentId);
    if (step.kind === 'done' || step.kind === 'blocked') { log.push({ step }); break; }
    try {
      const result = step.kind === 'entrance' ? await runChapterExam(enrollmentId, step.chapter_id, false)
        : step.kind === 'class' ? await attendClass(enrollmentId, step.chapter_id)
        : step.kind === 'exam' ? await runChapterExam(enrollmentId, step.chapter_id, true)
        : step.kind === 'reflect' ? await reflect(enrollmentId, step.submission_id)
        : await (async () => { const ws = await pickableWorkTasks((await enrollmentDetail(enrollmentId)).space_id); return runWorkExam(enrollmentId, ws.find(w => w.related)!.id); })();
      log.push({ step, result });
    } catch (e: any) { log.push({ step, error: String(e?.message || e).slice(0, 300) }); break; }
  }
  return { steps: log, next: await nextStep(enrollmentId) };
}
