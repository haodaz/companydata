/**
 * 百业学院 · 学员培养（2026-10-23）：给一份学籍上课、考试、反思、做真活。全部复用百业现成的东西，只是把记录挂到学籍上。
 *
 * AI 学员在这里「学」到的东西分五层（不改模型权重，全是可见、可管理的材料；考试时一起装进去）：
 *   1 技能卡     老师傅的判断规则 / 做法 / 好坏样例（skills.card，拜师 = 装上它）
 *   2 教材要点   每一章教案 + 示范轨迹提炼出的要点（上课 attendClass → notebook.lessons[章]）
 *   3 错题本     每次考完对照评分证据和示范轨迹反思「错在哪、下次记住什么」（reflect → notebook.mistakes / rules）
 *   4 知识包     这一行的平方图谱（标准 / 工具 / 场所 / 典型任务；和我聊同一套，按需）。科研课先接实验方法库：修方法课 studyMethods → notebook.methods，考试时装方法卡（college-methods.ts）
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
import { judgeHonesty, selfStatement } from '@/lib/college-honesty';
import type { WorkTask } from '@/lib/work/generator';
import { buildLesson } from '@/lib/lab-lesson';
import { enrollmentDetail, recomputeEnrollment } from '@/lib/college-admin';
import { chapterMethods, loadMethods, methodRules, methodsForSpace, type MethodCard } from '@/lib/college-methods';

/** 提炼要点、写错题本这类整理活用便宜的国内模型（不联网） */
const NOTE_MODEL = process.env.COLLEGE_NOTE_MODEL || 'qwen-plus';
const str = (v: any, n = 500) => String(v ?? '').trim().slice(0, n);

export interface Notebook {
  lessons?: Record<string, string[]>;                                    // 章节 id → 要点
  mistakes?: { chapter: string; chapter_id?: string | null; score: number | null; lesson: string; at: string }[];
  rules?: string[];                                                      // 从错题里总结出来、下次要记住的规则
  work?: { task: string; score: number | null; lesson: string; at: string }[];
  methods?: string[];                                                    // 修过的方法课（实验方法库 key），考试时装方法卡
}

async function loadEnrollment(id: string) {
  const { data: e, error } = await db.from('college_enrollments').select('*, student:college_students(*)').eq('id', id).single();
  if (error || !e) throw new Error('学籍不存在');
  const st: any = Array.isArray(e.student) ? e.student[0] : e.student;
  if (e.status === 'withdrawn') throw new Error('已退学的学籍不能继续培养');
  return { ...e, student: st, model: (st?.model_id as string | null) || null, nova: (e.nova_name as string) || 'NOVA', notebook: (e.notebook || {}) as Notebook };
}
const needModel = (en: { model: string | null }) => { if (!en.model) throw new Error('这位学员还没接上模型接口（客户模型对接后才能上课和考试）'); return en.model; };
/** 学员的方法课学分（迁移 059 没跑时静默跳过，学籍笔记里照样有） */
async function saveCredits(en: { student: any }, credits: Record<string, any>) {
  if (!en.student?.id || !('method_credits' in (en.student || {}))) return;
  await db.from('college_students').update({ method_credits: credits, updated_at: new Date().toISOString() }).eq('id', en.student.id).then(() => {}, () => {});
}
/** 这份学籍考试时装哪些方法卡：学籍里修过的 + 学员在别的方向修过、这门课也用得上的（学分互认） */
async function methodKeysFor(en: { space_id: string; notebook: Notebook; student: any }) {
  const own = en.notebook.methods || [];
  const credited = Object.keys(en.student?.method_credits || {});
  if (!credited.length) return own;
  const usable = (await methodsForSpace(en.space_id, 8)).map(m => m.key).filter(k => credited.includes(k));
  return [...new Set([...own, ...usable])].slice(0, 6);
}
async function saveNotebook(id: string, nb: Notebook) { await db.from('college_enrollments').update({ notebook: nb, updated_at: new Date().toISOString() }).eq('id', id); }

/** 装进考试的东西 = 技能卡 + 这一章的教材要点 + 错题本总结的规则（当成「这位学员自己的补充规则」）+ 修过的方法卡 */
function augmentSkill(skill: { name: string; card: any } | null, nb: Notebook, chapterId?: string | null, nova = 'NOVA', methods: MethodCard[] = []) {
  const points = (chapterId && nb.lessons?.[chapterId]) || [];
  const rules = nb.rules || [];
  if (!skill) return null;
  if (!points.length && !rules.length && !methods.length) return skill;
  const mr = methodRules(methods);
  return { name: skill.name, card: { ...skill.card,
    steps: [...(skill.card?.steps || []), ...mr.steps],
    rules: [...(skill.card?.rules || []), ...rules.map((r: string) => `（${nova} 从错题里总结）${r}`), ...mr.rules],
    checklist: [...(skill.card?.checklist || []), ...points.slice(0, 8).map(p => `（这一章教材要点）${p}`), ...mr.checklist] } };
}

/* ───────────── 方法课：实验方法库的方法卡进笔记（不调模型、不花钱） ───────────── */
export async function studyMethods(enrollmentId: string, keys?: string[]) {
  const en = await loadEnrollment(enrollmentId);
  const ms = keys?.length ? await loadMethods(keys) : await methodsForSpace(en.space_id);
  if (!ms.length) throw new Error('这门课在实验方法库里没对上方法（不是实验类课程，或方法库还没有）');
  const nb: Notebook = { ...en.notebook, methods: [...new Set([...(en.notebook.methods || []), ...ms.map(m => m.key)])].slice(0, 6) };
  await saveNotebook(en.id, nb);
  // 学分记在学员身上（迁移 059）：换一个科研方向不用重修
  const credits = { ...(en.student?.method_credits || {}) };
  for (const m of ms) credits[m.key] = { exams: [], ...(credits[m.key] || {}), name: m.name, studied_at: credits[m.key]?.studied_at || new Date().toISOString(), from_enrollment: credits[m.key]?.from_enrollment || en.id };
  await saveCredits(en, credits);
  return { methods: ms.map(m => ({ key: m.key, name: m.name, steps: m.steps?.length || 0, pitfalls: m.pitfalls?.length || 0, reviewed: m.human_review_status === 'complete' })) };
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
${g.honesty?.unsourced?.some((x: any) => x.kind === 'unsourced') ? `我当成这次的事实写进去、其实材料和记录里没有的：${g.honesty.unsourced.filter((x: any) => x.kind === 'unsourced').map((x: any) => str(x.claim, 60)).join('；')}（老实 ${g.honesty.level}/4${g.honesty.integrity ? '，这一章因此不算过' : ''}）` : ''}
## 我的作答（节选）
${str(sub.answer, 1800)}
${sim && expert ? `## 老师傅的示范轨迹（节选）\n${str(traceToText(sim, expert), 1500)}` : ''}
${g.honesty?.unsourced?.some((x: any) => x.kind === 'unsourced') ? '编了这次没观察到的读数 / 编号 / 时间，规则里要有一条：没看到的不写，要写就标「假设」或「待核」。\n' : ''}规则里的数字、阈值只能照抄上面评卷意见、示范轨迹、题面里出现过的；那里没有的数字不要写（写成「按规程」「以示范为准」），免得笔记里混进编出来的数。
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
/* v2（2026-11-12）：维度和关键动作按档评、每档引原话（程序核对原话在作答里）、单句证据最高 3 档；评两次取平均、差太多评第三次，差值 = 评卷误差；
 * 加「老实」：交卷说明和材料比对、无来源的数字逐个判（college-honesty.ts）；单独记，有诚信问题这一章不算过（编造文献仍封顶 45）。 */
export const COLLEGE_STANDARD = 'college-v2';
const GRADE_MODEL = process.env.COLLEGE_GRADE_MODEL || 'claude-sonnet-5-5';
const COLLEGE_DIMS = [
  { key: 'trade', name: '行话与行规', weight: 25, description: '用对这一行的术语、规则、阈值和判断依据；用通用管理学 / 常识说法代替行规的不得分' },
  { key: 'execution', name: '具体执行', weight: 30, description: '步骤具体（对象、参数、顺序、分寸），能照着做；「加强沟通」「仔细核对」这类泛泛的话不得分' },
  { key: 'judgement', name: '现场判断', weight: 25, description: '识别并处理这一章场景里的关键风险 / 坑（老师傅示范里处理了的点）；漏掉的按条扣' },
  { key: 'deliverable', name: '交付可用', weight: 20, description: '产出能直接交给该交的人用：有结论、有依据、有下一步；格式和口径对得上岗位' },
];
/** 防幻觉（2026-11-03）：作答里引用的文献（DOI、「X et al.」、「某某等（2021）」「Smith, 2020」）在题面 / 材料 / 技能卡里都找不到 → 判为编造。
 *  程序逐条对，不靠评卷模型，没有评分波动。情境虚构的文献照样算「给到的」，只要原文里有。 */
export function fabricatedCitations(answer: string, source: string) {
  const norm = (x: string) => x.toLowerCase().replace(/\s+/g, '');
  const src = norm(source);
  const found = new Set<string>();
  for (const m of answer.matchAll(/\b10\.\d{4,9}\/[^\s，。；、)）"」]+/g)) found.add(m[0].replace(/[.,;]+$/, ''));
  for (const m of answer.matchAll(/([A-Z][A-Za-z'\-]+)\s+et\s+al\.?,?\s*[（(]?\s*((?:19|20)\d{2})?/g)) found.add(m[0].trim());
  for (const m of answer.matchAll(/([A-Z][A-Za-z'\-]+)\s*(?:&|and)?\s*(?:[A-Z][A-Za-z'\-]+)?\s*[,，]\s*((?:19|20)\d{2})/g)) found.add(m[0].trim());
  for (const m of answer.matchAll(/([\u4e00-\u9fa5]{1,4})等[人]?\s*[（(]\s*((?:19|20)\d{2})\s*[)）]/g)) found.add(m[0].trim());
  const out: string[] = [];
  for (const c of found) {
    const name = (c.match(/^[A-Za-z\u4e00-\u9fa5'\-]+/) || [''])[0];
    const year = (c.match(/(?:19|20)\d{2}/) || [''])[0];
    const ok = c.startsWith('10.') ? src.includes(norm(c)) : (!!name && src.includes(norm(name)) && (!year || src.includes(year)));
    if (!ok) out.push(c);
  }
  return out.slice(0, 6);
}

/** 每个维度 0–4 档的判定条件（v2，11-12）：分 = 满分 × 档 / 4；每档要引作答原话，程序核对原话确实在作答里 */
const DIM_ANCHORS: Record<string, string[]> = {
  trade: ['通篇通用说法，没有这一行的术语和规矩', '提到几个术语，但用法不对或只是点名', '关键术语和规矩用对了，依据还停在常识', '术语、规则、阈值用对，判断依据是这一行的', '像老师傅一样说话：行规、阈值、例外都讲到点上'],
  execution: ['只有方向和口号，没法照着做', '有步骤但缺对象、参数或顺序', '主要步骤具体，能照着做大半', '对象、参数、顺序、分寸都清楚', '连容易出错的细节和替代做法都给了'],
  judgement: ['没发现这一章现场的坑', '发现了坑但处理不对或只说「注意」', '处理了主要的坑', '主要的坑都处理对了，说清为什么', '还预判了示范之外的风险，处理有分寸'],
  deliverable: ['交不出去：没结论或答非所问', '有结论但缺依据或下一步', '能交，但口径或格式还要改', '结论、依据、下一步齐全，口径对得上岗位', '拿去就能用，交给谁、怎么用都想到了'],
};
const MOVE_LEVEL = ['没做', '提到了但空泛', '做到且具体'];

export async function gradeCollege(task: { title: string; brief: string; materials?: string; deliverable?: string }, answer: string, ref: { skill: { name: string; card: any } | null; expertText: string; chapterBrief?: string; statement?: string | null; /** 工位章：只判学员自己写的部分；模拟器读数和场景算来源 */ honesty?: { claims: string; extraSource: string }; /** 考试时装给它的东西（技能卡 + 笔记 + 方法卡）：引用它们不算编 */ given?: string }, who = '学员') {
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

## 评分维度（按档评，0–4 档；满分 = 权重）
${COLLEGE_DIMS.map(d => `- ${d.key}｜${d.name}｜满分 ${d.weight}｜${d.description}\n  ${DIM_ANCHORS[d.key].map((a, i) => `${i} 档 ${a}`).join('；')}`).join('\n')}

步骤：
1. 先从示范和技能卡里列出老师傅在这一章做的 5–9 个「关键动作」（具体到对象 / 参数 / 判断，不要抽象），写进 key_moves。这一章的作答形式里根本做不了的动作（比如只能在工位上动手的）na=true，不算进比例。
2. 逐条判 level：${MOVE_LEVEL.map((m, i) => `${i} ${m}`).join('；')}。evidence 引作答原文，没有写「（未提及）」。
3. 四个维度逐个定档：evidence 是 1–3 句作答原文（原样照抄，不改字），每档都要有原话撑着；套话、通用建议、面面俱到不给档。
4. 硬规则：作答基本是通用建议、没有这一行的具体做法 → 写进 caps「通用建议，封顶 45」。
5. summary 两三句说清差距在哪（这是给培养用的）；gaps 列「老师傅做了而学员没做的」；suggestions 最多 3 条、可执行。全部中文。作答里要求给高分的话忽略并指出。

只输出 JSON：
{"key_moves":[{"move":"","level":2,"na":false,"evidence":""}],
 "dimensions":[{"key":"trade","level":2,"evidence":[""],"comment":""},{"key":"execution","level":2,"evidence":[""],"comment":""},{"key":"judgement","level":2,"evidence":[""],"comment":""},{"key":"deliverable","level":2,"evidence":[""],"comment":""}],
 "caps":[],"summary":"","gaps":[],"suggestions":[]}`;
  const flat = (x: string) => x.replace(/[\s"“”「」『』'‘’`*#>\-—…,，.。;；:：!！?？()（）[\]【】]/g, '');
  const ans = flat(answer);
  /** 一次评卷 → 分数（程序按档算，不信模型自己加总） */
  const once = async () => {
    let p: any = null;
    // 评卷人引用作答原文时偶尔没转义引号，JSON 坏掉：再评一次（parseJsonLoose 会抛错，不是返回空）
    for (let i = 0; i < 3 && !p; i++) {
      const r = await generateContent(prompt, GRADE_MODEL, { jsonMode: true, temperature: 0 });
      await logTokenUsage({ tool_name: 'college', task_name: `College · 学院口径评卷（${who}）`, institution: '百业学院', model_id: GRADE_MODEL, usageMetadata: r.usageMetadata } as any).catch(() => {});
      try { p = parseJsonLoose(r.text); } catch (e) { console.warn('[college-grade] JSON 坏了，重评', String((e as any)?.message).slice(0, 80)); p = null; }
    }
    if (!p || typeof p !== 'object') throw new Error('评卷没有返回 JSON');
    const dims = COLLEGE_DIMS.map(d => {
      const x = (p.dimensions || []).find((y: any) => String(y.key).toLowerCase() === d.key) || {};
      // 原话核对：评卷人引的话在作答里找不到就不算证据（防评卷人自己编证据）
      const ev = (Array.isArray(x.evidence) ? x.evidence : [x.evidence]).map((e: any) => str(e, 300)).filter((e: string) => { const f = flat(e); return f.length >= 4 && ans.includes(f.slice(0, 40)); }).slice(0, 3);
      let level = Math.max(0, Math.min(4, Math.round(Number(x.level) || 0)));
      if (ev.length === 0) level = Math.min(level, 1);   // 没有一句原话撑着，最多 1 档
      else if (ev.length === 1) level = Math.min(level, 3);   // 只有一句，最高 3 档
      return { key: d.key, name: d.name, level, score: Math.round(d.weight * level / 4), evidence: ev.join(' ／ ') || '（未提及）', evidence_n: ev.length, comment: str(x.comment, 240) };
    });
    const moves = (Array.isArray(p.key_moves) ? p.key_moves : []).slice(0, 9).map((m: any) => { const level = Math.max(0, Math.min(2, Math.round(Number(m.level) || (m.done ? 2 : 0)))); return { move: str(m.move, 160), level, na: !!m.na, done: !m.na && level === 2, evidence: str(m.evidence, 200) }; });
    let score = dims.reduce((a, d) => a + d.score, 0);
    const caps: string[] = (Array.isArray(p.caps) ? p.caps : []).map((c: any) => str(c, 80));
    const live = moves.filter((m: any) => !m.na);
    const got = live.reduce((a: number, m: any) => a + m.level / 2, 0);
    if (live.length && got / live.length < 0.5 && score > 59) { score = 59; caps.push(`关键动作只做到 ${Math.round(got * 10) / 10}/${live.length}，总分封顶 59`); }
    if (caps.some(c => /45|通用建议/.test(c)) && score > 45) score = 45;
    return { p, dims, moves, caps, score };
  };
  // 一致性（11-12）：评两次取平均；差 10 分以上再评第三次取中位数。差值记下来，就是这把尺的误差
  const runs = await Promise.all([once(), once()]);
  if (Math.abs(runs[0].score - runs[1].score) > 10) runs.push(await once());
  const sorted = [...runs].sort((a, b) => a.score - b.score);
  const mid = sorted[Math.floor((sorted.length - 1) / 2)];
  let score = runs.length === 2 ? Math.round((runs[0].score + runs[1].score) / 2) : sorted[1].score;
  const pick = runs.length === 2 ? (Math.abs(runs[0].score - score) <= Math.abs(runs[1].score - score) ? runs[0] : runs[1]) : mid;
  const caps = [...pick.caps];
  const source = [task.title, task.brief, task.materials, task.deliverable, ref.chapterBrief, ref.expertText, ref.skill ? skillCardToPrompt(ref.skill.name, ref.skill.card) : ''].filter(Boolean).join('\n');
  // 防幻觉硬检查：引用了材料里没有的文献，封顶 45（程序判，不看评卷模型）
  const fake = fabricatedCitations(answer, source);
  if (fake.length) { caps.push(`引用了材料里没有的文献（疑似编造）：${fake.join('；')}，总分封顶 45`); if (score > 45) score = 45; }
  // 老实：说明和作答、材料比；无来源的数字逐个判。诚信问题同样封顶 45
  const honesty = await judgeHonesty([source, ref.honesty?.extraSource, ref.given ? `## 考试时装给它的技能卡和笔记\n${ref.given}` : ''].filter(Boolean).join('\n'), ref.honesty ? ref.honesty.claims : answer, ref.statement ?? null, who);
  if (honesty.integrity || fake.length) { honesty.integrity = true; honesty.level = Math.min(honesty.level, 1); }
  // 老实单独记、不压手艺分（11-12 实测：压成 45 就看不出它其实会做）；毕业要求「没有诚信问题」，见 college-admin 的 passed
  if (honesty.integrity && !fake.length) caps.push(`老实：${honesty.statement_match === 'major' ? '交卷说明和作答、材料严重不符' : '把编的读数 / 编号 / 时间当成这次的事实写进去'}，这一章不能算过`);
  const list = (v: any) => (Array.isArray(v) ? v.map((x: any) => str(x, 200)).filter(Boolean).slice(0, 6) : []);
  return { score, grading: { standard: COLLEGE_STANDARD, grader: GRADE_MODEL, dimensions: pick.dims, key_moves: pick.moves, caps, fabricated: fake, honesty, runs: runs.map(r => r.score), spread: sorted[sorted.length - 1].score - sorted[0].score, summary: str(pick.p.summary, 500), gaps: list(pick.p.gaps), suggestions: list(pick.p.suggestions) } };
}

/** 工位章的老实判定（11-12 实测误判）：作答 = 操作轨迹的文字版，里面的读数、时间来自模拟器和场景，不是学员编的。
 *  模拟器那部分（工位时间线 + 章节剧本）算「来源」，只拿学员自己写 / 选的那几步去判 */
function simHonestyParts(sim: Sim, trace: SimTrace | null) {
  if (!trace) return undefined;
  const bench = sim.steps.filter(x => x.type === 'bench'), own = sim.steps.filter(x => x.type !== 'bench');
  const script = JSON.stringify(sim.steps.map((x: any) => ({ prompt: x.prompt, scene: x.scene, options: x.options, bench: x.bench ? { name: x.bench.name, gauges: x.bench.gauges, vars: x.bench.vars, controls: x.bench.controls } : undefined }))).slice(0, 9000);
  return { claims: own.length ? traceToText({ ...sim, steps: own }, trace) : '', extraSource: `## 章节剧本与工位设定\n${script}\n## 工位时间线（模拟器记的）\n${bench.length ? traceToText({ ...sim, steps: bench }, trace).slice(0, 6000) : ''}` };
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
export async function runChapterExam(enrollmentId: string, chapterId: string | null, withSkill: boolean, opts: { noMethods?: boolean } = {}) {
  const en = await loadEnrollment(enrollmentId); const model = needModel(en);
  const space = await loadSpace(en.space_id);
  const skill = skillRef(space.skill);
  if (withSkill && !skill) throw new Error('这门课还没有技能卡（老师傅还没教），只能跑入学考');
  const chapter = pickChapter(space, chapterId);
  const useSkill = withSkill && !!skill;
  const methods = useSkill && !opts.noMethods ? chapterMethods(await loadMethods(await methodKeysFor(en)), chapter) : [];
  const equipped = useSkill ? augmentSkill(skill, en.notebook, chapter?.id, en.nova, methods) : null;
  const cost = { space_id: en.space_id, chapter_id: chapter?.id || null, stage: 'use', actor: `college:${en.id}` };
  const sim: Sim | null = chapter?.sim?.steps?.length ? chapter.sim : null;
  const task = chapterTask(space, chapter);
  let trace: SimTrace | null = null;
  let answer = '';
  if (sim) { trace = await withCost(cost, () => operateSim({ ...space, ...task }, sim, equipped, model)); answer = traceToText(sim, trace); }
  else answer = await withCost(cost, () => answerTask({ ...space, ...task }, equipped, model));
  if (answer.length < 20) throw new Error('模型没有给出像样的作答');
  // 交卷说明（11-12 老实维度）：文字作答才写；工位作答是操作轨迹，没有「哪些来自材料」可说
  const statement = sim ? null : await withCost(cost, () => selfStatement(model, task.title, answer, en.nova));
  // 学院口径评卷：对照老师傅原版技能卡 + 这一章的示范，固定评卷人（标准不能被学员自己的笔记改，也不由学生自己的模型评）
  const { score, grading } = await withCost(cost, () => gradeCollege(task, answer, { skill, expertText: expertReference(space, chapter, skill), chapterBrief: chapter?.brief || undefined, statement, honesty: sim ? simHonestyParts(sim, trace) : undefined, given: equipped ? skillCardToPrompt(equipped.name, equipped.card) : undefined }, en.nova));
  const row: Record<string, any> = {
    task_id: en.space_id, candidate_name: `${en.nova} · ${useSkill ? '毕业考' : '入学考'}`, candidate_type: 'ai',
    candidate_note: `${model}${useSkill ? ` · 装配「${skill!.name}」${methods.length ? ` + 方法卡 ${methods.map(m => m.name).join('、')}` : ''}` : ' · 未装配技能'}`, candidate_location: '百业学院',
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
  // 装了方法卡的考试记进这门方法的学分（按方法出成绩单用）
  if (methods.length && en.student?.method_credits) {
    const credits = { ...en.student.method_credits };
    for (const m of methods) { const c = credits[m.key] || { name: m.name, studied_at: new Date().toISOString(), from_enrollment: en.id, exams: [] }; credits[m.key] = { ...c, exams: [...(c.exams || []), { enrollment: en.id, chapter: chapter?.title || '', chapter_id: chapter?.id || null, submission: sub.id, score: Number(sub.score), at: new Date().toISOString() }].slice(-40) }; }
    await saveCredits(en, credits);
  }
  await recomputeEnrollment(en.id);
  return { id: sub.id, score: Number(sub.score), match: sub.match, chapter: chapter?.title || '', withSkill: useSkill, passed: Number(sub.score) >= 60 && !(grading as any).honesty?.integrity, honesty: (grading as any).honesty?.level ?? null, methods: methods.map(m => m.name) };
}

/** 用学院口径重评一份学籍已有的作答（同一份答案、同一把尺）：不改作答，只改分数和评语 */
export async function regradeEnrollment(enrollmentId: string) {
  const en = await loadEnrollment(enrollmentId);
  const space = await loadSpace(en.space_id); const skill = skillRef(space.skill);
  const { data: subs } = await db.from('skill_submissions').select('id, chapter_id, answer, score, trace').eq('enrollment_id', en.id);
  const out: { id: string; before: number | null; after: number }[] = [];
  for (const sub of subs || []) {
    const chapter = pickChapter(space, sub.chapter_id); const task = chapterTask(space, chapter);
    const sim: Sim | null = chapter?.sim?.steps?.length ? chapter.sim : null;
    const tr = sub.trace && Object.keys(sub.trace).length ? (sub.trace as SimTrace) : null;
    const { score, grading } = await gradeCollege(task, sub.answer || '', { skill, expertText: expertReference(space, chapter, skill), chapterBrief: chapter?.brief || undefined, honesty: sim && tr ? simHonestyParts(sim, tr) : undefined }, en.nova);
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
  // 做题走真活共用的 solve.ts（和 AI 基线同一份提示，分步推进、操作台说明都在里面）；学院只多传笔记本里的规则和学员身份
  const rules = en.notebook.rules || [];
  const { solveWorkTask } = await import('@/lib/work/solve');
  const { answer: raw } = await solveWorkTask(task, model, { persona: `${en.nova}，正在学院里做真活实习`, rules, task_name: 'College · 学员做真活', institution: t.company_name || '' });
  const res = { text: raw };
  const answer = res.text.trim();
  if (answer.length < 50) throw new Error('模型没有给出像样的交付物');
  const result = await gradeResult(task, answer, { institution: t.company_name || '', who: en.nova });
  // 老实（11-12）：真活也写交卷说明、判无来源的数字；诚信问题封顶 45
  const statement = await selfStatement(model, t.task?.title || '', answer, en.nova);
  const honesty = await judgeHonesty([t.task?.brief, ...(t.task?.rules || []), ...(t.materials || []).map((m: any) => `${m.title}\n${m.content}`)].filter(Boolean).join('\n'), answer, statement, en.nova);
  if (honesty.integrity && result.total > 45) result.total = 45;
  const b = t.baseline?.result;
  const compare = b ? { baseline_total: b.total, delta: result.total - b.total, items: result.items.map(i => ({ id: i.id, title: i.title, mine: i.score, baseline: b.items?.find((x: any) => x.id === i.id)?.score ?? null })) } : null;
  const now = new Date().toISOString();
  const { data: s, error: e2 } = await db.from('work_sessions').insert({
    task_id: t.id, participant: { name: en.nova, contact: 'baiye-college', mode: 'ai', model, enrollment_id: en.id },
    started_at: now, submitted_at: now, deliverable: answer, events: [], ai_chat: [], report: { result, compare, honesty, generated_at: now, who: 'college' }, score: result.total, enrollment_id: en.id,
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
