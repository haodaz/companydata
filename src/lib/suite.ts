/**
 * 一个 JD 生成整套（2026-10-28）：一份 JD → 职业体验空间（一天几章 + 教案）→ 几道真活 → 学院课程（开学籍），
 * 中间由另一个模型交叉审稿：对着 JD 逐条看覆盖、找重复和硬伤，严重的问题打回去改一轮再复审。
 * 各环节都走现成的生成器；这里只管「真活怎么分工」「审稿」「按审稿改真活」「开课」和整套的记录。
 * 记录存在空间的 jd_snapshot.suite 里（不新建表）。整套跑完要 15–25 分钟，所以由页面按步骤调接口，断了能接着跑。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { askJson } from '@/lib/work/generator';
import { createWorkTask } from '@/lib/work/chat-agent';
import { reviseTask } from '@/lib/work/generator';
import { createEnrollment, ensurePlatformStudents } from '@/lib/college-admin';

/** 模型（2026-10-28 用户：优先 Claude，保证千问兜底）：空间 / 章节 / 真活都是 Claude 优先、千问兜底；
 *  审稿用 Claude Sonnet（和出题的 Opus 不是一个模型；千问 Max 审过一次太泛），连不上时 askJson 退到千问 / DeepSeek */
const PLAN_MODEL = 'qwen-plus';
const REVIEW_MODEL = process.env.SUITE_REVIEW_MODEL || 'claude-sonnet-5-5';
/** 开课时先录哪几位学员（平台自己的模型，有就录） */
const FIRST_STUDENTS = ['qwen-plus', 'deepseek-v4-pro', 'gpt-5.6-luna'];

export type SuiteIssue = { target: 'chapter' | 'work' | 'suite'; id?: string; title?: string; severity: 'high' | 'mid' | 'low'; problem: string; fix: string };
export type SuiteReview = { at: string; model: string; score: number; summary: string; coverage: { duty: string; covered_by: string[]; gap?: string }[]; issues: SuiteIssue[] };
export type SuiteState = {
  started_at: string; by: string;
  work: { id: string; token: string; owner_key: string; title: string; focus: string }[];
  plan?: { focus: string; why: string }[];
  reviews: SuiteReview[];
  fixed: { target: string; id: string; fix: string; at: string }[];
  enrollments: { id: string; model: string }[];
  log: { at: string; step: string; note: string }[];
};

async function loadSpace(spaceId: string) {
  const { data, error } = await db.from('skill_tasks').select('id, title, profile, jd_snapshot').eq('id', spaceId).single();
  if (error || !data) throw new Error('没有这个空间');
  return data as any;
}
export async function getSuite(spaceId: string): Promise<SuiteState | null> {
  return ((await loadSpace(spaceId)).jd_snapshot?.suite as SuiteState) || null;
}
/** 读一次再写：别把这段时间里别的环节写进 jd_snapshot 的东西盖掉 */
async function patchSuite(spaceId: string, f: (s: SuiteState) => SuiteState) {
  const sp = await loadSpace(spaceId);
  const cur: SuiteState = sp.jd_snapshot?.suite || { started_at: new Date().toISOString(), by: '', work: [], reviews: [], fixed: [], enrollments: [], log: [] };
  const next = f(cur);
  await db.from('skill_tasks').update({ jd_snapshot: { ...(sp.jd_snapshot || {}), suite: next } }).eq('id', spaceId);
  return next;
}
export const suiteLog = (spaceId: string, step: string, note: string, by?: string) =>
  patchSuite(spaceId, s => ({ ...s, by: s.by || by || '', log: [...s.log, { at: new Date().toISOString(), step, note: note.slice(0, 300) }].slice(-60) }));

const jdText = (jd: any) => `岗位：${jd.title || ''}\n企业：${jd.company || ''}\n职责与要求：\n${String(jd.responsibilities || '').slice(0, 3500)}\n${String(jd.qualifications || '').slice(0, 1200)}`;

/** 真活分工：从 JD 里挑出 2 项最能区分人的职责，各出一道，彼此不重复，也别和体验空间的章节撞题 */
export async function planWork(spaceId: string, n = 2) {
  const sp = await loadSpace(spaceId); const jd = sp.jd_snapshot || {};
  const { data: chs } = await db.from('lab_chapters').select('title').eq('task_id', spaceId);
  const { parsed: p } = await askJson(`下面是一份岗位 JD。要给这个岗位出 ${n} 道「真活」（企业真实业务任务，用来考候选人），每道考一项不同的核心职责。
${jdText(jd)}
这个岗位的体验空间已经有这些章节（新人练手用的，真活别和它们撞题）：${(chs || []).map((c: any) => c.title).join('、') || '（还没有）'}
挑 ${n} 项**最能拉开人与人差距**的职责，每项写一句出题方向（focus：要候选人在什么情境下交出什么），彼此不重复。只返回 JSON：
{ "items": [ { "focus": "出题方向，60–120 字", "why": "为什么这项最能区分人，一句话" } ] }`, PLAN_MODEL, 'Suite · 真活分工', jd.company || '');
  const plan = (Array.isArray(p?.items) ? p.items : []).filter((x: any) => x?.focus).slice(0, n).map((x: any) => ({ focus: String(x.focus).slice(0, 300), why: String(x.why || '').slice(0, 120) }));
  if (!plan.length) throw new Error('没排出真活分工');
  await patchSuite(spaceId, s => ({ ...s, plan }));
  return plan;
}

/** 按一条分工出一道真活（企业 / 岗位取 JD 上的；JD 不当企业介绍用，免得把 JD 当成企业画像建档） */
export async function makeWork(spaceId: string, focus: string, user: { email: string; role: string }) {
  const sp = await loadSpace(spaceId); const jd = sp.jd_snapshot || {};
  const company = String(jd.company || '').trim() || '某企业（虚构）';
  const role = String(jd.title || sp.profile?.role || sp.title || '').trim();
  const duty = String(jd.responsibilities || '').slice(0, 900);
  const r = await createWorkTask(user, { company, role, focus: `${focus}\n（出自这份 JD 的职责：${duty}）`.slice(0, 1400) });
  await patchSuite(spaceId, s => ({ ...s, work: [...s.work.filter(w => w.id !== r.id), { id: r.id, token: r.share_token, owner_key: r.owner_key, title: r.title, focus }] }));
  return r;
}

/** 交叉审稿：另一个模型对着 JD 逐条看——每项职责被哪章 / 哪道真活覆盖了、重复、硬伤（数字对不上、交付物考不出这项能力、难度离谱） */
export async function reviewSuite(spaceId: string): Promise<SuiteReview> {
  const sp = await loadSpace(spaceId); const jd = sp.jd_snapshot || {}; const suite: SuiteState | null = jd.suite || null;
  const { data: chs } = await db.from('lab_chapters').select('id, seq, slot, title, kind, brief, status, sim').eq('task_id', spaceId).order('seq');
  // 用短编号（C1 / W1）给审稿人引用，回来再换成 id——模型抄长 id 常抄错或干脆不填
  const written = (chs || []).filter((c: any) => (c.sim?.steps?.length || 0) > 0), drafts = (chs || []).filter((c: any) => !(c.sim?.steps?.length > 0));
  const label = new Map<string, { target: 'chapter' | 'work'; id: string; title: string }>();
  const chText = written.map((c: any, i: number) => {
    label.set(`C${i + 1}`, { target: 'chapter', id: c.id, title: c.title });
    const steps = (c.sim?.steps || []).map((s: any) => `${s.type}：${String(s.title || s.prompt || s.question || '').slice(0, 60)}`).slice(0, 8).join('；');
    return `- [C${i + 1}] ${c.slot || ''}《${c.title}》（${c.kind}）${c.brief ? `：${String(c.brief).slice(0, 160)}` : ''}\n  步骤：${steps}`;
  }).join('\n');
  const ids = (suite?.work || []).map(w => w.id);
  const { data: ws } = ids.length ? await db.from('work_tasks').select('id, task, problem, rubric, materials').in('id', ids) : { data: [] as any[] };
  const wText = (ws || []).map((t: any, i: number) => { label.set(`W${i + 1}`, { target: 'work', id: t.id, title: t.task?.title }); return `- [W${i + 1}] 《${t.task?.title}》问题：${String(t.problem?.statement || '').slice(0, 200)}\n  交付：${(t.task?.deliverables || []).map((d: any) => d.title).join(' / ')}\n  材料：${(t.materials || []).map((m: any) => m.title).join(' / ')}\n  评分：${(t.rubric || []).map((r: any) => `${r.title}${r.weight ?? ''}%`).join(' / ')}`; }).join('\n');
  const { parsed: p, model } = await askJson(`你是审稿人。另一个 AI 按下面这份 JD 生成了一整套培养 / 考核材料：职业体验空间（新人练手的「一天」，若干章）和几道真活（考候选人的真实任务）。请严格审稿。
## JD
${jdText(jd)}
## 体验空间已写好的章节
${chText || '（没有）'}
（这一天还有 ${drafts.length} 格没写：${drafts.map((c: any) => `《${c.title}》`).join('、') || '无'}——是有意先只写几章，**不要审没写的格子，也不要把「没写完」当问题**；但可以在覆盖里说某项职责只落在没写的格子上）
## 真活
${wText || '（没有）'}

审什么：
1. 覆盖：把 JD 拆成 4–7 项核心职责，每项写被哪些章节 / 真活覆盖（用方括号里的编号，如 C1、W2），真没覆盖的写缺什么。
2. 问题：重复（两处考同一件事）、硬伤（交付物考不出它要考的能力、材料和题面对不上、难度离谱、和 JD 无关）、缺口。每条给 severity：high（必须改）/ mid / low；ref 写编号（C1 / W2），整体缺口 ref 写 SUITE；fix 写成能直接交给生成器的修改意见（一两句，具体）。整体缺口的 fix 写成「再出一道真活：……」的出题方向。
3. 打分 0–100：这一套拿去给新人练、给企业考人，够不够用。
总评要具体（点名哪章 / 哪道好在哪、差在哪），不要客套话；没问题就少写。只返回 JSON：
{ "score": 0, "summary": "两三句总评", "coverage": [ { "duty": "", "covered_by": ["C1", "W2"], "gap": "" } ], "issues": [ { "ref": "C1|W1|SUITE", "severity": "high|mid|low", "problem": "", "fix": "" } ] }`, REVIEW_MODEL, 'Suite · 交叉审稿', jd.company || '');
  const review: SuiteReview = {
    at: new Date().toISOString(), model, score: Math.max(0, Math.min(100, Number(p?.score) || 0)), summary: String(p?.summary || '').slice(0, 600),
    coverage: (Array.isArray(p?.coverage) ? p.coverage : []).slice(0, 10).map((c: any) => ({ duty: String(c.duty || ''), covered_by: (Array.isArray(c.covered_by) ? c.covered_by : []).map((r: any) => String(r).toUpperCase().trim()).filter((r: string) => label.has(r)).map((r: string) => `${r}《${label.get(r)!.title}》`).slice(0, 6), gap: c.gap ? String(c.gap) : undefined })),
    issues: (Array.isArray(p?.issues) ? p.issues : []).slice(0, 14).map((x: any) => {
      const hit = label.get(String(x.ref || '').toUpperCase().trim());
      return { target: hit?.target || 'suite', id: hit?.id, title: hit?.title, severity: ['high', 'mid', 'low'].includes(x.severity) ? x.severity : 'mid', problem: String(x.problem || '').slice(0, 300), fix: String(x.fix || '').slice(0, 400) } as SuiteIssue;
    }),
  };
  await patchSuite(spaceId, s => ({ ...s, reviews: [...s.reviews, review] }));
  return review;
}

/** 按审稿改一道真活（审稿意见原样交给修订器；基线作废，之后再跑） */
export async function fixWork(spaceId: string, taskId: string, fix: string) {
  const { data: t } = await db.from('work_tasks').select('*').eq('id', taskId).single();
  if (!t) throw new Error('没有这道真活');
  const cur = { env: t.task?.env || { type: 'doc' }, problem: t.problem, task: t.task, materials: t.materials, rubric: t.rubric };
  const { task: next, model, changelog } = await reviseTask(cur as any, t.context, `审稿意见：${fix}`);
  const revisions = [...(t.task?.revisions || []), { at: new Date().toISOString(), feedback: `【整套审稿】${fix}`.slice(0, 1200), changelog, model }];
  const { error } = await db.from('work_tasks').update({ problem: next.problem, task: { ...next.task, env: next.env, revisions }, materials: next.materials, rubric: next.rubric, baseline: null, updated_at: new Date().toISOString() }).eq('id', taskId);
  if (error) throw new Error(error.message);
  await patchSuite(spaceId, s => ({ ...s, fixed: [...s.fixed, { target: 'work', id: taskId, fix, at: new Date().toISOString() }] }));
  return { changelog };
}
export const markFixed = (spaceId: string, target: string, id: string, fix: string) =>
  patchSuite(spaceId, s => ({ ...s, fixed: [...s.fixed, { target, id, fix, at: new Date().toISOString() }] }));

/** 开课：空间有已发布章节就是一门课；先给几位平台学员（大模型）开学籍，入学考 / 毕业考到教务里跑 */
export async function openCourse(spaceId: string, by: string) {
  const { count } = await db.from('lab_chapters').select('id', { count: 'exact', head: true }).eq('task_id', spaceId).eq('status', 'published');
  if (!count) throw new Error('还没有发布的章节，开不了课');
  await ensurePlatformStudents();
  const { data: sts } = await db.from('college_students').select('id, model_id').eq('kind', 'platform').in('model_id', FIRST_STUDENTS);
  const out: { id: string; model: string }[] = [];
  for (const s of sts || []) { const e: any = await createEnrollment(s.id, spaceId, by); out.push({ id: e.id, model: s.model_id }); }
  await patchSuite(spaceId, st => ({ ...st, enrollments: out }));
  return out;
}
