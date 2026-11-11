/**
 * 真活工作台 /work/ws 的助理（2026-11-05，用户：「把 agentic ai 当成 home 发起的主要交互……现在的 AI 只停留在聊出活，
 * 还没有像一个 workspace 里的 agentic ai 一样什么都能调度（分析某个活的参与者、分析某个报告、各种讨论）」）。
 * 出任务那一套工具原样沿用（chat-agent.ts），这里加「管」和「看」：我的真活、谁做了、读报告、并排比、整道题的作答情况、上下架、在右边打开。
 * 照学院秘书的路数：每个工具背后都是工作台里人工也能点的那件事（总览 / 我的真活 / 候选人），AI 只是把它们串起来。
 * 只看自己出的题（admin 也默认只看自己的，说「全部」才看全站）。
 */
import type Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin as db } from '@/lib/supabase';
import type { AgentKit } from '@/lib/ws/agent';
import { WORK_CHAT_TOOLS, loadMine, runWorkChatTool, ui as taskUi, workChatSystemPrompt } from '@/lib/work/chat-agent';
import { kbLookup, kbSave } from '@/lib/work/kb';
import { getWorkScale } from '@/lib/work/scale-server';
import { publicShowcase } from '@/lib/work/showcase';

type User = { email: string; role: string };
type Ui = { kind: 'work_task'; token: string; owner_key: string; title: string; task_id: string } | { kind: 'work_report'; token: string; sid: string; title: string; name: string; task_id: string } | { kind: 'app'; url: string; title: string } | { kind: 'companies'; list: { name: string; name_en?: string; industry?: string; city?: string; website?: string; intro?: string }[] };
const s = (v: any, n = 300) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v)).slice(0, n);
const nameOf = (x: any) => x?.participant?.name || '匿名';
const durOf = (x: any) => x.report?.process?.duration_s ?? (x.submitted_at ? Math.round((+new Date(x.submitted_at) - +new Date(x.started_at)) / 1000) : null);
const mins = (sec: number | null | undefined) => (sec == null ? null : Math.round(sec / 60));

export const WORK_HOME_TOOLS: Anthropic.Tool[] = [
  ...WORK_CHAT_TOOLS,
  { name: 'my_tasks', description: '列出用户出过的真活：标题、企业、岗位、状态（待发布 / 已发布 / 已下架）、参与和交卷人数、平均分、最高分、AI 基线、最近一次交卷时间。用户问「我的题」「哪道题有人做了」「最近怎么样」先调它。query 按标题 / 企业 / 岗位筛。', input_schema: { type: 'object', properties: { query: { type: 'string' }, scope: { type: 'string', enum: ['mine', 'all'], description: '默认 mine；只有管理员说「全部 / 全站」才用 all' } } } },
  { name: 'task_people', description: '一道真活谁做了：每个人的名字、作答方式、开始 / 交卷时间、用时、总分、AI 使用分、一句话总结、最强和最弱的一条。按分数排。预览（出任务的人自己试做的）单独标出，不算候选人。', input_schema: { type: 'object', properties: { task_id: { type: 'string', description: '任务 id 或参与链接里的编号' } }, required: ['task_id'] } },
  { name: 'read_report', description: '读一个人的完整报告：逐条评分（等级、得分、证据）、做得好的 / 差的、过程（阶段、高光、风险、怎么用 AI）、AI 使用评价、和 AI 基线差多少、交付物原文摘录、问 AI 的前几个问题、最后一问写了什么。分析某个人、回答「他为什么分低」时用。会在右边打开这份报告。', input_schema: { type: 'object', properties: { session_id: { type: 'string' } }, required: ['session_id'] } },
  { name: 'compare_people', description: '把一道题里的几个人逐条并排比（每条评分标准各人得分 + AI 基线），加上各自的强项弱项。不给 session_ids 就取交卷的前 4 名。', input_schema: { type: 'object', properties: { task_id: { type: 'string' }, session_ids: { type: 'array', items: { type: 'string' } } }, required: ['task_id'] } },
  { name: 'task_insights', description: '一道题整体的作答情况：交卷率、用时分布（对比限时）、作答方式分布、每条评分标准的平均 / 最低 / 最高和 L1 人数（哪条普遍做不到）、AI 使用分、反复出现的短板、和 AI 基线的差距。用户问「这道题出得怎么样」「大家卡在哪」「题是不是太难」时用。', input_schema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] } },
  { name: 'set_task_status', description: '上架 / 下架 / 删除一道题：published = 发布（参与链接可用），archived = 下架（链接停用，已有作答保留，可以再发布），deleted = 删除（从列表里拿掉、链接失效；作答和报告不会丢）。下架、删除前都用 ask_user 确认。', input_schema: { type: 'object', properties: { task_id: { type: 'string' }, status: { type: 'string', enum: ['published', 'archived', 'deleted'] } }, required: ['task_id', 'status'] } },
  { name: 'search_library', description: '在平台任务库里找现成的任务（去了企业名的好题，可以原题直出换成用户的公司，或只做参考）。按关键词（行业、方向、岗位、要考的本事，如「数据分析」「投研」「品牌设计」）找，返回编号、标题、行业 · 方向、岗位、场景摘要、要交什么、建议用时。不给关键词就返回各行业有多少道。用户说「从任务库挑」「有没有现成的题」时用；会在右边打开任务库。', input_schema: { type: 'object', properties: { query: { type: 'string', description: '关键词，空格分开' }, industry: { type: 'string' } } } },
  { name: 'kb_lookup', description: '查用户知识库里存过的企业资料和岗位（要找什么样的人、看重什么）。出任务前先查：存过就直接用，复述时说「按你知识库里的 X」，不再让用户重说。', input_schema: { type: 'object', properties: { company: { type: 'string' }, role: { type: 'string' } } } },
  { name: 'kb_save', description: '把企业资料或岗位存进用户的知识库，下次出任务直接用。用户在对话里讲清了一家企业（做什么、多大、在推进什么、为什么招人）或一个岗位（要找什么样的人、看重什么、经验段、常用时长），出完任务后整理成一段存进去，存完说一句「已存进知识库，可以在知识库里改」。kind=company 时 title 是企业名、body 是介绍；kind=role 时 title 是岗位名、company 是企业名、body 是要找什么样的人和看重什么。', input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['company', 'role'] }, title: { type: 'string' }, body: { type: 'string' }, company: { type: 'string' }, company_id: { type: 'number' }, data: { type: 'object', description: '岗位可放 years（经验段）、minutes（常用时长）' } }, required: ['kind', 'title', 'body'] } },
  { name: 'open_panel', description: '在右边打开一道题的空间（kind=task）或一个人的报告（kind=report，要 session_id）给用户看，不做别的。用户说「打开 / 给我看看」时用。', input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['task', 'report'] }, task_id: { type: 'string' }, session_id: { type: 'string' } }, required: ['kind'] } },
];

/** 自己的任务列表 + 每道题的作答汇总；工作台的「我的真活」「总览」页也用 */
export async function myTasks(user: User, opts: { query?: string; all?: boolean } = {}) {
  let q = db.from('work_tasks').select('id, share_token, owner_key, status, company_name, role, task, baseline, created_at, updated_at, created_by').neq('status', 'deleted').order('created_at', { ascending: false }).limit(200);
  if (!(opts.all && user.role === 'admin')) q = q.eq('created_by', user.email);
  const { data } = await q;
  let tasks = (data || []).filter(t => t.status !== 'draft');
  const kw = String(opts.query || '').trim();
  if (kw) tasks = tasks.filter(t => [t.task?.title, t.company_name, t.role].some(v => String(v || '').includes(kw)));
  const ids = tasks.map(t => t.id); const aiOnly = (await getWorkScale()) === 'ai_use';
  const agg: Record<string, { n: number; done: number; preview: number; scores: number[]; last: string | null }> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const { data: ss } = await db.from('work_sessions').select('task_id, submitted_at, score, participant').in('task_id', ids.slice(i, i + 100));
    for (const x of ss || []) {
      const a = agg[x.task_id] ||= { n: 0, done: 0, preview: 0, scores: [], last: null };
      if (x.participant?.preview) { a.preview++; continue; }
      a.n++;
      if (x.submitted_at) { a.done++; if (x.score != null) a.scores.push(Number(x.score)); if (!a.last || x.submitted_at > a.last) a.last = x.submitted_at; }
    }
  }
  return tasks.map(t => {
    const a = agg[t.id] || { n: 0, done: 0, preview: 0, scores: [], last: null };
    return {
      task_id: t.id, token: t.share_token, owner_key: t.owner_key, title: t.task?.title || '', company: t.company_name, role: t.role, created_by: t.created_by,
      status: t.status, time_minutes: t.task?.time_minutes, created_at: t.created_at,
      started: a.n, submitted: a.done, preview: a.preview,
      avg: a.scores.length ? Math.round(a.scores.reduce((x, y) => x + y, 0) / a.scores.length) : null,
      best: a.scores.length && !aiOnly ? Math.max(...a.scores) : null, baseline: aiOnly ? null : t.baseline?.result?.total ?? null, last_submit: a.last,
    };
  });
}

/** 一道题的作答人（不含事件流）；工作台的「候选人」页也用 */
const AI_ONLY_NOTE = '平台现在只按 AI 使用与交互评分：只谈 AI 使用，不提总分、逐条得分和 AI 基线';

export async function taskPeople(taskId: string) {
  const { data } = await db.from('work_sessions').select('id, participant, started_at, submitted_at, score, report').eq('task_id', taskId).order('started_at', { ascending: false }).limit(300);
  const aiOnly = (await getWorkScale()) === 'ai_use';   // 平台选了「AI 使用与交互」：score 给 AI 使用分，一句话也换成 AI 使用的结论
  return (data || []).map(x => {
    const r = x.report || {}; const items = r.result?.items || [];
    const sorted = [...items].sort((a: any, b: any) => a.score - b.score);
    return {
      session_id: x.id, name: nameOf(x), contact: x.participant?.contact || '', mode: x.participant?.mode || r.mode || 'bench', preview: !!x.participant?.preview,
      started_at: x.started_at, submitted_at: x.submitted_at, minutes: mins(durOf(x)),
      score: aiOnly ? r.ai_use?.score ?? null : x.score == null ? null : Number(x.score), ai_use: r.ai_use?.score ?? null,
      summary: s(aiOnly ? r.ai_use?.verdict : r.result?.summary, 160), strongest: aiOnly ? '' : sorted.length ? `${sorted[sorted.length - 1].title} ${sorted[sorted.length - 1].score}` : '', weakest: aiOnly ? '' : sorted.length ? `${sorted[0].title} ${sorted[0].score}` : '',
      graded: !!r.result,
    };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

async function sessionOf(user: User, sid: string) {
  const { data: x } = await db.from('work_sessions').select('*').eq('id', String(sid || '').trim()).maybeSingle();
  if (!x) throw new Error('没有这份作答');
  const t = await loadMine(user, x.task_id);
  return { x, t };
}
const reportUi = (t: any, x: any): Ui => ({ kind: 'work_report', token: t.share_token, sid: x.id, title: t.task?.title || '', name: nameOf(x), task_id: t.id });

async function run(name: string, input: any, user: User): Promise<{ result: any; ui?: Ui; label: string }> {
  switch (name) {
    case 'my_tasks': {
      const list = await myTasks(user, { query: input.query, all: input.scope === 'all' });
      const busy = list.filter(t => t.submitted).length;
      return { result: list.slice(0, 60).map(({ owner_key, ...t }) => t), label: list.length ? `你出过 ${list.length} 道题，${busy} 道有人交卷` : '还没出过题' };
    }
    case 'task_people': {
      const t = await loadMine(user, String(input.task_id));
      const ps = await taskPeople(t.id);
      const real = ps.filter(p => !p.preview);
      return { result: { title: t.task?.title, time_minutes: t.task?.time_minutes, baseline: t.baseline?.result?.total ?? null, people: ps.slice(0, 80) }, ui: taskUi(t), label: `「${t.task?.title}」：${real.length} 人做，${real.filter(p => p.submitted_at).length} 人交卷` };
    }
    case 'read_report': {
      const { x, t } = await sessionOf(user, String(input.session_id));
      const r = x.report || {};
      if (!r.result) return { result: { name: nameOf(x), submitted: !!x.submitted_at, note: x.submitted_at ? '报告还在生成' : '还没交卷' }, ui: reportUi(t, x), label: `${nameOf(x)}：${x.submitted_at ? '报告还在生成' : '还没交卷'}` };
      const p = r.process || {}; const u = r.ai_use || {};
      const chat = (x.ai_chat || []) as any[];
      if ((await getWorkScale()) === 'ai_use') return { result: { scale_note: AI_ONLY_NOTE, name: nameOf(x), mode: x.participant?.mode, minutes: mins(durOf(x)), time_minutes: t.task?.time_minutes, ai_use: u.score == null ? s(u.verdict, 200) || '没用 AI' : { score: u.score, verdict: u.verdict, items: (u.items || []).map((i: any) => i.score == null ? `${i.title} 未观测（${s(i.why_na, 60)}）` : `${i.title} ${i.score}：${s(i.note, 100)}`), disclosure: u.disclosure ? `${u.disclosure.match}：${s(u.disclosure.note, 100)}` : undefined }, asks: chat.length, first_asks: chat.slice(0, 6).map((c: any) => s(c.q, 120)) }, ui: reportUi(t, x), label: `读了 ${nameOf(x)} 的报告` };
      const result = {
        name: nameOf(x), mode: x.participant?.mode, minutes: mins(durOf(x)), time_minutes: t.task?.time_minutes, total: r.result.total,
        summary: r.result.summary, strengths: r.result.strengths, gaps: r.result.gaps,
        items: (r.result.items || []).map((i: any) => ({ title: i.title, weight: i.weight, level: i.level, score: i.score, baseline: r.compare?.items?.find((c: any) => c.id === i.id)?.baseline, evidence: s(i.evidence, 200), note: s(i.note, 160), blocked_by: i.blocked_by })),
        baseline_total: r.compare?.baseline_total, vs_baseline: r.compare?.delta,
        process: { phases: (p.phases || []).map((q: any) => `${mins(q.from)}–${mins(q.to)} 分 ${q.label}`), highlights: (p.highlights || []).map((h: any) => `${mins(h.t)} 分 ${h.behavior}`), risks: (p.risks || []).map((h: any) => `${mins(h.t)} 分 ${h.behavior}`), delegation: s(p.delegation, 300) },
        ai_use: u.score == null ? s(u.verdict, 200) || '没用 AI' : { score: u.score, verdict: u.verdict, items: (u.items || []).map((i: any) => i.score == null ? `${i.title} 未观测（${s(i.why_na, 60)}）` : `${i.title} ${i.score}：${s(i.note, 100)}`), disclosure: u.disclosure ? `${u.disclosure.match}：${s(u.disclosure.note, 100)}` : undefined },
        asks: chat.length, first_asks: chat.slice(0, 6).map((c: any) => s(c.q, 120)),
        next_step: s(r.next_step, 600),
        deliverable_excerpt: s(x.deliverable, 3000),
      };
      return { result, ui: reportUi(t, x), label: `读了 ${nameOf(x)} 的报告（${r.result.total} 分）` };
    }
    case 'compare_people': {
      const t = await loadMine(user, String(input.task_id));
      const want: string[] = Array.isArray(input.session_ids) ? input.session_ids.map(String) : [];
      const { data } = await db.from('work_sessions').select('id, participant, score, report, started_at, submitted_at').eq('task_id', t.id).not('report', 'is', null);
      let rows = (data || []).filter(x => x.report?.result && !x.participant?.preview);
      const aiOnly = (await getWorkScale()) === 'ai_use', rank = (x: any) => Number(aiOnly ? x.report.ai_use?.score : x.score) || 0;
      rows = want.length ? rows.filter(x => want.includes(x.id)) : rows.sort((a, b) => rank(b) - rank(a)).slice(0, 4);
      if (!rows.length) return { result: { error: '这道题还没有评好分的作答' }, ui: taskUi(t), label: '还没有可比的' };
      if (aiOnly) return { result: { scale_note: AI_ONLY_NOTE, title: t.task?.title, people: rows.map(x => ({ session_id: x.id, name: nameOf(x), minutes: mins(durOf(x)), ai_use: x.report.ai_use?.score ?? null, verdict: s(x.report.ai_use?.verdict, 200), items: (x.report.ai_use?.items || []).map((i: any) => `${i.title} ${i.score ?? '未观测'}`) })) }, ui: taskUi(t), label: `并排比了 ${rows.length} 个人` };
      const rubric = (t.rubric || []) as any[];
      const base = t.baseline?.result?.items || [];
      const table = rubric.map(rb => ({ item: rb.title, weight: rb.weight, baseline: base.find((b: any) => b.id === rb.id)?.score ?? null, scores: Object.fromEntries(rows.map(x => [nameOf(x), x.report.result.items?.find((i: any) => i.id === rb.id)?.score ?? null])) }));
      const people = rows.map(x => ({ session_id: x.id, name: nameOf(x), total: x.report.result.total, minutes: mins(durOf(x)), ai_use: x.report.ai_use?.score ?? null, strengths: x.report.result.strengths, gaps: x.report.result.gaps }));
      return { result: { title: t.task?.title, baseline_total: t.baseline?.result?.total ?? null, table, people }, ui: taskUi(t), label: `并排比了 ${rows.length} 个人` };
    }
    case 'task_insights': {
      const t = await loadMine(user, String(input.task_id));
      const { data } = await db.from('work_sessions').select('id, participant, score, report, started_at, submitted_at').eq('task_id', t.id);
      const all = (data || []).filter(x => !x.participant?.preview);
      const done = all.filter(x => x.submitted_at); const graded = done.filter(x => x.report?.result);
      const rubric = (t.rubric || []) as any[];
      const base = t.baseline?.result?.items || [];
      const byItem = rubric.map(rb => {
        const sc = graded.map(x => x.report.result.items?.find((i: any) => i.id === rb.id)).filter(Boolean) as any[];
        const v = sc.map(i => Number(i.score) || 0);
        return { item: rb.title, weight: rb.weight, n: v.length, avg: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null, min: v.length ? Math.min(...v) : null, max: v.length ? Math.max(...v) : null, l1: sc.filter(i => i.level === 'L1').length, baseline: base.find((b: any) => b.id === rb.id)?.score ?? null };
      });
      const durs = graded.map(x => mins(durOf(x))).filter((v): v is number => v != null).sort((a, b) => a - b);
      const modes: Record<string, number> = {}; for (const x of all) { const m = x.participant?.mode || 'bench'; modes[m] = (modes[m] || 0) + 1; }
      const ai = graded.map(x => x.report.ai_use?.score).filter((v: any) => v != null) as number[];
      if ((await getWorkScale()) === 'ai_use') return { result: { scale_note: AI_ONLY_NOTE, title: t.task?.title, status: t.status, time_minutes: t.task?.time_minutes, started: all.length, submitted: done.length, graded: graded.length, modes, ai_use_avg: ai.length ? Math.round(ai.reduce((a, b) => a + b, 0) / ai.length) : null, ai_use_min: ai.length ? Math.min(...ai) : null, ai_use_max: ai.length ? Math.max(...ai) : null, no_ai: graded.filter(x => x.report.ai_use && x.report.ai_use.score == null).length }, ui: taskUi(t), label: '看了这道题的 AI 使用情况' };
      const totals = graded.map(x => Number(x.score) || 0);
      const result = {
        title: t.task?.title, status: t.status, time_minutes: t.task?.time_minutes, started: all.length, submitted: done.length, graded: graded.length,
        abandoned: all.filter(x => !x.submitted_at && Date.now() - +new Date(x.started_at) > ((t.task?.time_minutes || 60) + 60) * 60000).length,
        total: { avg: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null, min: totals.length ? Math.min(...totals) : null, max: totals.length ? Math.max(...totals) : null, baseline: t.baseline?.result?.total ?? null },
        minutes: durs.length ? { min: durs[0], median: durs[Math.floor(durs.length / 2)], max: durs[durs.length - 1] } : null,
        modes, ai_use_avg: ai.length ? Math.round(ai.reduce((a, b) => a + b, 0) / ai.length) : null, no_ai: graded.filter(x => x.report.ai_use && x.report.ai_use.score == null).length,
        by_item: byItem,
        gaps: graded.flatMap(x => (x.report.result.gaps || []).map((g: any) => s(g, 120))).slice(0, 40),
      };
      return { result, ui: taskUi(t), label: graded.length ? `看了「${t.task?.title}」${graded.length} 份评好的作答` : `「${t.task?.title}」还没有评好的作答` };
    }
    case 'set_task_status': {
      const t = await loadMine(user, String(input.task_id));
      const st = input.status === 'archived' || input.status === 'deleted' ? input.status : 'published';
      await db.from('work_tasks').update({ status: st, updated_at: new Date().toISOString() }).eq('id', t.id);
      return { result: { status: st }, ui: taskUi({ ...t, status: st }), label: st === 'deleted' ? `「${t.task?.title}」已删除` : st === 'archived' ? `「${t.task?.title}」已下架` : `「${t.task?.title}」已发布` };
    }
    case 'search_library': {
      const all = await publicShowcase();
      const kws = String(input.query || '').split(/[\s,，、/]+/).map(x => x.trim()).filter(Boolean);
      const ind = String(input.industry || '').trim();
      const text = (x: any) => [x.title, x.industry, x.direction, x.role, x.scenario, ...(x.deliverables || []).map((d: any) => d.title)].join(' ');
      let rows = all.filter(x => !ind || String(x.industry).includes(ind));
      const q = encodeURIComponent([ind, ...kws].join(' ').trim());
      const app: Ui = { kind: 'app', url: `/work/ws/library${q ? `?q=${q}` : ''}`, title: '任务库' };
      if (!kws.length && !ind) {
        const by: Record<string, number> = {}; for (const x of all) by[x.industry] = (by[x.industry] || 0) + 1;
        return { result: { total: all.length, industries: by }, ui: app, label: `任务库里有 ${all.length} 道` };
      }
      const scored = rows.map(x => { const t = text(x); return { x, n: kws.reduce((a, k) => a + (t.includes(k) ? (String(x.title).includes(k) || String(x.direction).includes(k) ? 2 : 1) : 0), 0) }; }).filter(r => !kws.length || r.n > 0).sort((a, b) => b.n - a.n).slice(0, 8);
      return { result: scored.map(({ x }) => ({ id: x.id, title: x.title, industry: x.industry, direction: x.direction, role: x.role, scenario: s(x.scenario, 200), deliverables: (x.deliverables || []).map((d: any) => d.title), time_minutes: x.time_minutes })), ui: app, label: scored.length ? `任务库里找到 ${scored.length} 道` : '任务库里没找到合适的' };
    }
    case 'kb_lookup': { const r = await kbLookup(user, { company: input.company, role: input.role }); return { result: r, label: r.companies.length + r.roles.length ? `知识库里有 ${r.companies.length} 条企业资料、${r.roles.length} 个岗位` : '知识库里还没存这些' }; }
    case 'kb_save': { const r = await kbSave(user, { kind: input.kind, title: input.title, body: input.body, company: input.company, company_id: input.company_id, data: input.data, source: 'ai' }); return { result: { saved: true, id: r.id }, label: `存进知识库：${r.kind === 'company' ? '企业' : '岗位'}「${r.title}」` }; }
    case 'open_panel': {
      if (input.kind === 'report') { const { x, t } = await sessionOf(user, String(input.session_id)); return { result: { opened: true }, ui: reportUi(t, x), label: `打开 ${nameOf(x)} 的报告` }; }
      const t = await loadMine(user, String(input.task_id)); return { result: { opened: true }, ui: taskUi(t), label: `打开「${t.task?.title}」` };
    }
    default: return runWorkChatTool(name, input, user) as any;
  }
}

/** focus：用户右边正开着的东西（题 / 报告），「这道题」「他」指的就是它 */
export function workHomeKit(user: User, focus?: { task_id?: string; session_id?: string; title?: string; name?: string } | null): AgentKit {
  const where = focus?.session_id ? `用户右边正开着「${focus.title || ''}」里 ${focus.name || '某人'} 的报告（task_id ${focus.task_id}，session_id ${focus.session_id}）：他说「这份报告」「他 / 她」指的就是这个。`
    : focus?.task_id ? `用户右边正开着「${focus.title || ''}」这道题的空间（task_id ${focus.task_id}）：他说「这道题」指的就是它。` : '';
  const system = `${workChatSystemPrompt(user.email).replace('你是「百业AI｜真活」的出任务助理，在帮出任务的人', '你是「百业AI｜真活」工作台的助理，在帮出任务的人')}

工作台（2026-11-05 起）：你不只出任务，出任务的人在真活里要干的事都能做——
- 管：看他出过哪些题（my_tasks）、上架、下架、删除（set_task_status，下架和删除先 ask_user 确认）、改限时 / 到点交卷 / 岗位名 / 素材、允许某人重做（update_task_settings）、改题目内容（revise_task）。
- 看：一道题谁做了（task_people）、一个人的报告（read_report）、几个人并排比（compare_people）、整道题的作答情况（task_insights）。
- 任务库：用户说「从任务库挑」「有没有现成的题」，search_library 按他要考的本事 / 行业找，挑最合适的 2–3 道用 ask_user 让他选（选项写标题，问题里一句话说清各自考什么）；选定后照「用任务库里的某任务」的流程走：问企业、问原题直出还是只做参考，create_task 传 showcase_id 和 showcase_use。没找到合适的就直说，建议按他的话从头出。
- 知识库：用户存的企业资料、岗位（kb_lookup / kb_save），任务样本（my_references / read_reference），出过的题里的素材。出任务前先 kb_lookup 这家企业和岗位，存过就用、只问缺的；对话里新讲清的企业或岗位，出完任务用 kb_save 整理存进去（AI 先出初稿，用户在知识库里校正）。
- 想打开给他看的，用 open_panel 在右边打开；工作台左边也有「管理真活 / 任务报告 / 知识库」可以自己点。
怎么回答：
- 先给结论，再给依据。分析一个人：总分和基线差多少 → 强在哪、弱在哪（引证据里的原话或时间点）→ 用 AI 的方式 → 面试时值得追问的两三个问题。并排比：先说推荐谁、为什么，再说各自短板；分数接近时说清楚差在哪条。整道题：交卷率、用时是否合理、哪条标准普遍做不到（是候选人弱还是题 / 标准有问题），给一两条改题建议，问他要不要照改。
- 报告里的事实只引工具结果；分数是 AI 评的，你可以指出看起来评得不对的地方，但别自己改分。
- 用户说「这道题」「刚才那个人」时先看上下文和右边开着的东西；实在不知道是哪道，my_tasks 列出来用 ask_user 让他点。
- 说人用名字，说题用标题；session_id、task_id 这些编号不说给用户。
${where}`;
  return { system, tools: WORK_HOME_TOOLS, run: (n, i) => run(n, i, user) as any, org: '真活台', task: '真活 · 工作台' };
}
