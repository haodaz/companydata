/**
 * 题目资产库（迁移 049，2026-10-25）：每道出过的真活沉淀一条「题骨架 + 出题参数 + 质量信号」，归数据工厂（数据资产）。
 * 出题时和训练样本库一起当参照：同企业的高分题带步骤问法，同行业的只借结构。对外不讲。
 */
import { supabaseAdmin as db } from '@/lib/supabase';

export type BankRow = { id: string; task_id: string; company_id: number | null; company_name: string; industry: string | null; role: string; job_function: string | null; title: string; skeleton: any; params: any; signals: any; rating: number | null; use_as_ref: boolean; note: string | null; created_by: string | null; created_at: string; updated_at: string };

const FUNCS: [RegExp, string][] = [[/投后|portfolio|被投/i, '投后'], [/募资|IR|LP|投资者关系/i, 'IR / 募资'], [/研究员|研究|行业图谱|梳理/, '研究'], [/并购|控股|收购/, '并购'], [/二级|公开市场|持仓|基本面/, '二级市场'], [/投资|VC|早期|跟投/, '投资'], [/财务|会计|审计/, '财务'], [/运营|门店|供应链/, '运营'], [/工程|研发|算法|代码|架构/, '工程'], [/销售|市场|营销/, '销售 / 市场'], [/人力|HR|招聘/, '人力']];
export const jobFunctionOf = (role: string, title = '') => { const t = `${role} ${title}`; for (const [re, f] of FUNCS) if (re.test(t)) return f; return null; };

/** 从 work_tasks 一行抽骨架（不含企业事实的部分尽量抽象：步骤类型 / 交付形态 / 评分依赖） */
function skeletonOf(t: any) {
  const task = t.task || {}; const stages = Array.isArray(task.stages) ? task.stages : [];
  return {
    problem_type: String(t.problem?.statement || '').slice(0, 200),
    why_now: String(t.problem?.why_now || '').slice(0, 200),
    brief_outline: String(task.brief || '').slice(0, 600),
    stages: stages.map((s: any) => ({ id: s.id, type: s.type, question: String(s.question || '').slice(0, 200) })),
    deliverables: (task.deliverables || []).map((d: any) => ({ title: d.title, format: d.format })),
    materials: (t.materials || []).map((m: any) => ({ kind: m.kind, title: m.title, source: m.source })),
    rubric: (t.rubric || []).map((r: any) => ({ id: r.id, title: r.title, weight: r.weight, depends_on: r.depends_on || [] })),
    rules: task.rules || [],
  };
}

export async function computeSignals(taskId: string, t?: any) {
  const row = t || (await db.from('work_tasks').select('baseline, task').eq('id', taskId).single()).data;
  const { data: ss } = await db.from('work_sessions').select('score, participant, submitted_at').eq('task_id', taskId).not('score', 'is', null);
  const human = (ss || []).filter(s => s.participant?.mode !== 'ai').map(s => Number(s.score)); const ai = (ss || []).filter(s => s.participant?.mode === 'ai').map(s => Number(s.score));
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  const spread = (a: number[]) => (a.length >= 2 ? Math.max(...a) - Math.min(...a) : null);
  return { baseline_total: row?.baseline?.result?.total ?? null, baseline_model: row?.baseline?.model ?? null, sessions: human.length, ai_sessions: ai.length, score_avg: avg(human), score_spread: spread(human), ai_score_avg: avg(ai), revisions: (row?.task?.revisions || []).length, last_scored_at: (ss || []).map(s => s.submitted_at).filter(Boolean).sort().pop() || null };
}

/** 出题 / 修订 / 基线 / 评卷之后调：没有就建，有就更新骨架和信号（人工打的星级、备注、是否参照不动） */
export async function bankTask(taskId: string) {
  const { data: t } = await db.from('work_tasks').select('*').eq('id', taskId).maybeSingle();
  if (!t) return null;
  let industry: string | null = t.context?.company?.industry || null;
  if (!industry && t.company_id) industry = (await db.from('companies').select('industry').eq('id', t.company_id).maybeSingle()).data?.industry || null;
  const ctx = t.context || {};
  const row = {
    task_id: t.id, company_id: t.company_id ?? null, company_name: t.company_name || '', industry, role: t.role || '', job_function: jobFunctionOf(t.role || '', t.task?.title || ''), title: t.task?.title || '（无题）',
    skeleton: skeletonOf(t),
    params: { env: t.task?.env?.type || 'doc', minutes: t.task?.time_minutes ?? null, steps: (t.task?.stages || []).length || null, focus: ctx.focus || null, sample: ctx.sample || null, model: t.model || null, verbatim: !!ctx.verbatim, attachments: (ctx.attachments || []).length },
    signals: await computeSignals(t.id, t),
    created_by: t.created_by || null, updated_at: new Date().toISOString(),
  };
  const { data: ex } = await db.from('work_question_bank').select('id').eq('task_id', t.id).maybeSingle();
  if (ex) { await db.from('work_question_bank').update(row).eq('id', ex.id); return ex.id as string; }
  const { data: ins, error } = await db.from('work_question_bank').insert(row).select('id').single();
  if (error) { console.warn('[question-bank] 入库失败', error.message); return null; }
  return ins.id as string;
}
export async function refreshSignals(taskId: string) { try { await bankTask(taskId); } catch (e) { console.warn('[question-bank] 信号刷新失败', String((e as any)?.message).slice(0, 120)); } }

/** 出题参照：同企业优先（带步骤问法），其次同行业（只借结构）。按人工星级 → 区分度 → 基线分排，最多 2 条 */
export async function pickBankRefs(q: { company_id?: number | null; industry?: string | null; role?: string; exclude_task?: string | null }) {
  const or: string[] = []; if (q.company_id) or.push(`company_id.eq.${q.company_id}`); if (q.industry) or.push(`industry.eq.${q.industry.replace(/,/g, '')}`);
  if (!or.length) return [];
  const { data } = await db.from('work_question_bank').select('*').eq('use_as_ref', true).or(or.join(',')).limit(60);
  const fn = jobFunctionOf(q.role || '');
  const rows = (data || []).filter(r => r.task_id !== q.exclude_task && (r.rating == null || r.rating >= 3));
  const score = (r: BankRow) => (r.company_id && r.company_id === q.company_id ? 100 : 0) + (fn && r.job_function === fn ? 30 : 0) + (r.rating ? r.rating * 10 : 0) + Math.min(20, (r.signals?.score_spread || 0)) + Math.min(10, (r.signals?.sessions || 0) * 2) + (r.signals?.baseline_total ? Math.min(10, r.signals.baseline_total / 10) : 0);
  return rows.map(r => ({ r, s: score(r) })).sort((a, b) => b.s - a.s).slice(0, 2).map(x => x.r as BankRow);
}

export function renderBankRefs(refs: BankRow[], companyId?: number | null) {
  if (!refs.length) return '';
  return refs.map((r, i) => {
    const same = !!companyId && r.company_id === companyId; const k = r.skeleton || {};
    const lines = [`### 过往题 ${i + 1}：${r.title}（${same ? '本企业' : '同行业'}；要找的人：${r.role}${r.rating ? `；人工评 ${r.rating} 星` : ''}${r.signals?.sessions ? `；${r.signals.sessions} 人做过，分差 ${r.signals.score_spread ?? '–'}` : ''}）`];
    if (same) lines.push(`业务问题：${k.problem_type}`);
    if (k.stages?.length) lines.push(`推进：${k.stages.map((s: any) => same ? `${s.type}·${s.question}` : s.type).join(' → ')}`);
    if (k.deliverables?.length) lines.push(`交付形态：${k.deliverables.map((d: any) => `${d.title}（${d.format}）`).join('；')}`);
    if (k.rubric?.length) lines.push(`评分结构：${k.rubric.map((x: any) => `${x.title} ${x.weight}${x.depends_on?.length ? `←${x.depends_on.join(',')}` : ''}`).join('；')}`);
    return lines.join('\n');
  }).join('\n\n');
}
