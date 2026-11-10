import { refreshSignals } from '@/lib/work/question-bank';
import { NextRequest, NextResponse, after } from 'next/server';
import { AUTO_FROM, timing, withAutoSubmit } from '@/lib/work/deadline';
import { releaseContact } from '@/lib/work/contact';
import { supabaseAdmin as db } from '@/lib/supabase';
import { attachmentsToMaterials, mergeAttachmentDupes, reviseTask, runBaseline, sourcesOf, withMinutes, withRole } from '@/lib/work/generator';
import { withCost, logTokenUsage } from '@/lib/token-logger';
import { generateContent } from '@/lib/llm-client';
import { reviewGeneric } from '@/lib/work/compare';
import { analyzeAiUse, ensureAiPolicy } from '@/lib/work/grader';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function auth(token: string, req: NextRequest) {
  const k = req.nextUrl.searchParams.get('k') || '';
  if (!k) return null;
  const { data: t } = await db.from('work_tasks').select('*').eq('share_token', token).eq('owner_key', k).maybeSingle();
  return t || null;
}

/** 出题人的管理视图（凭 owner_key，不用登录）：题的全部 + 所有作答与报告 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await auth(token, req);
  if (!t) return NextResponse.json({ ok: false, error: '管理链接不对' }, { status: 404 });
  const { data: sessions } = await db.from('work_sessions').select('id, participant, started_at, submitted_at, score, report, deliverable').eq('task_id', t.id).order('created_at', { ascending: false });
  // 到点后人没回来的作答：出任务的人打开管理页时代为收卷（一次最多 3 份，评完下次刷新能看到）
  const left = (sessions || []).filter(s => !s.submitted_at && new Date(s.started_at).getTime() >= AUTO_FROM && timing(t.task, s).closed).slice(0, 3);
  if (left.length) after(() => Promise.all(left.map(s => fetch(`${req.nextUrl.origin}/api/work/${token}/sessions/${s.id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto: true, sync: true }) }).catch(e => console.warn('[work] 代收卷失败', e)))));
  const { owner_key: _k, context: ctx, ...task } = t;
  return NextResponse.json({ ok: true, task: { ...task, notes: ctx?.notes || [], sources: ctx ? sourcesOf(ctx) : null }, sessions: sessions || [] });
}

/** 发布 / 下架 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await auth(token, req);
  if (!t) return NextResponse.json({ ok: false, error: '管理链接不对' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  // 允许重做：这个人再用同一条链接进来就是新的一次
  if (body.allow_retake) {
    const { data: s } = await db.from('work_sessions').select('id, participant, submitted_at, started_at').eq('id', String(body.allow_retake)).eq('task_id', t.id).maybeSingle();
    if (!s) return NextResponse.json({ ok: false, error: '没有这次作答' }, { status: 404 });
    if (!s.submitted_at && !timing(t.task, s).closed) return NextResponse.json({ ok: false, error: '这个人还在作答' }, { status: 400 });
    const { error } = await db.from('work_sessions').update({ participant: releaseContact(s.participant) }).eq('id', s.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  // 到点自动交卷的开关
  if (typeof body.auto_submit === 'boolean') {
    const { error } = await db.from('work_tasks').update({ task: withAutoSubmit(t.task, body.auto_submit), updated_at: new Date().toISOString() }).eq('id', t.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, auto_submit: body.auto_submit });
  }
  // 改限时（20–240 分钟，题面里写的时长一起换）
  if (body.time_minutes != null) {
    const r = withMinutes(t.task, body.time_minutes);
    await db.from('work_tasks').update({ task: r.task, updated_at: new Date().toISOString() }).eq('id', t.id);
    return NextResponse.json({ ok: true, time_minutes: r.mins });
  }
  // 补素材（11-05 潜历：出好后想再传文件）：{ add_attachments: [{ url, name, mime, text, image }] }，传完按出任务时一样处理（去重合并）
  if (Array.isArray(body.add_attachments) && body.add_attachments.length) {
    const atts = body.add_attachments.filter((a: any) => a?.url && a?.name).slice(0, 10).map((a: any) => ({ url: String(a.url), name: String(a.name).slice(0, 80), mime: a.mime, text: a.text ? String(a.text).slice(0, 20000) : '', image: !!a.image || /^image\//.test(String(a.mime || '')) }));
    const fresh = atts.filter((a: any) => !(t.materials || []).some((m: any) => m.url === a.url));
    const merged = mergeAttachmentDupes({ task: t.task, problem: t.problem, rubric: t.rubric, materials: [...(t.materials || []), ...attachmentsToMaterials(fresh, (t.materials || []).length + 1)] });
    await db.from('work_tasks').update({ materials: merged.materials, task: merged.task, problem: merged.problem, rubric: merged.rubric, context: { ...(t.context || {}), attachments: [...(t.context?.attachments || []), ...fresh.map((a: any) => ({ name: a.name, url: a.url }))] }, updated_at: new Date().toISOString() }).eq('id', t.id);
    return NextResponse.json({ ok: true, materials: merged.materials });
  }
  // 删素材：只删上传的文件（AI 写的材料按意见修订去改）
  if (body.remove_material) {
    const m = (t.materials || []).find((x: any) => x.id === body.remove_material);
    if (!m || m.kind !== 'file') return NextResponse.json({ ok: false, error: '只能删上传的文件；AI 写的材料用「按意见修订」改' }, { status: 400 });
    const materials = (t.materials || []).filter((x: any) => x.id !== m.id);
    await db.from('work_tasks').update({ materials, context: { ...(t.context || {}), attachments: (t.context?.attachments || []).filter((a: any) => a.url !== m.url) }, updated_at: new Date().toISOString() }).eq('id', t.id);
    return NextResponse.json({ ok: true, materials });
  }
  // 改标题（11-10 潜历：标题改不了，要像岗位名一样直接改）
  if (body.title != null) {
    const title = String(body.title).trim().slice(0, 100);
    if (title.length < 2) return NextResponse.json({ ok: false, error: '标题至少 2 个字' }, { status: 400 });
    await db.from('work_tasks').update({ task: { ...t.task, title }, updated_at: new Date().toISOString() }).eq('id', t.id);
    return NextResponse.json({ ok: true, title });
  }
  // 改岗位名 / 要找的人（页头那个；题面里的旧名字一起换）
  if (body.role != null) {
    try { const r = withRole(t, body.role); await db.from('work_tasks').update({ role: r.role, task: r.task, problem: r.problem, updated_at: new Date().toISOString() }).eq('id', t.id); return NextResponse.json({ ok: true, role: r.role }); }
    catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 400 }); }
  }
  // deleted（11-10 潜历：只能下架、删不掉）：从列表里拿掉、参与链接失效；作答和报告留在库里不物理删
  if (!['published', 'archived', 'deleted'].includes(body.status)) return NextResponse.json({ ok: false, error: '状态不对' }, { status: 400 });
  await db.from('work_tasks').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', t.id);
  return NextResponse.json({ ok: true });
}

/** 重跑 AI 基线；或 { feedback } 按意见修订（保留没提到的部分，留修订记录；改完基线作废要重跑） */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await auth(token, req);
  if (!t) return NextResponse.json({ ok: false, error: '管理链接不对' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  // 这道任务的 AI 使用标准（2026-10-30）：{ ai_policy: true } 读（没有就生成），{ ai_policy: true, force: true } 重新生成
  if (body.ai_policy) {
    try {
      if (body.force) { const { ai_policy: _old, ...rest } = t.task || {}; t.task = rest; }
      const policy = await withCost({ tool_name: 'work', task_name: 'Grade · AI 使用标准', stage: 'use' }, () => ensureAiPolicy(t));
      return policy ? NextResponse.json({ ok: true, policy }) : NextResponse.json({ ok: false, error: '没生成出来，稍后再试' }, { status: 500 });
    } catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 }); }
  }
  // 补算 AI 使用能力（2026-10-30）：给这道任务下已经出了报告、还没有这一项的作答补上；一次最多 4 份（2 路并发），前端循环到 remaining = 0
  if (body.ai_use) {
    const { data: ss } = await db.from('work_sessions').select('id, report, events, ai_chat, deliverable').eq('task_id', t.id).not('report', 'is', null);
    const todo = (ss || []).filter((x: any) => x.report?.result && !x.report?.auditing && (body.force || !('ai_use' in x.report)));
    const batch = todo.slice(0, 4);
    const task = { env: t.task?.env || { type: 'doc' }, problem: t.problem, task: t.task, materials: t.materials, rubric: t.rubric };
    const policy = await ensureAiPolicy(t);
    let done = 0;
    for (let i = 0; i < batch.length; i += 2) await Promise.all(batch.slice(i, i + 2).map(async (x: any) => {
      try {
        const ai_use = await withCost({ tool_name: 'work', task_name: 'Grade · AI 使用（补算）', stage: 'use' }, () => analyzeAiUse(task as any, x.events || [], x.ai_chat || [], String(x.deliverable || ''), { institution: t.company_name, policy }));
        await db.from('work_sessions').update({ report: { ...x.report, ai_use } }).eq('id', x.id); done++;
      } catch (e) { console.warn('[work] 补算 AI 使用失败', x.id, String((e as any)?.message).slice(0, 120)); }
    }));
    return NextResponse.json({ ok: true, done, remaining: Math.max(0, todo.length - batch.length) });
  }
  // 对比演示（2026-10-22 老板：垂直 vs 通用）：通用模型（千问，国内用户能直接用的），只给一句大白话让它出题，和平方出的并排看。存在题里，第二次秒开；{ force } 重问
  if (body.compare) {
    const prompt = `我们公司是${t.company_name}，要招人：${t.role}。请你出一道题给应聘者做，并给出评分标准。`;
    try {
      let compare = t.task?.compare;
      if (!compare?.text || body.force) compare = await withCost({ tool_name: 'work', task_name: 'Compare · 通用大模型直接出题', stage: 'use' }, async () => {
        for (const m of ['qwen-plus', 'deepseek-v4-pro']) {
          try { const r = await generateContent(prompt, m); await logTokenUsage({ tool_name: 'work', task_name: 'Compare · 通用大模型直接出题', institution: t.company_name || '', model_id: m, usageMetadata: r.usageMetadata } as any).catch(() => {}); if (r.text?.trim()) return { prompt, text: r.text.trim(), model: m, at: new Date().toISOString() }; } catch (e) { console.warn(`[work-compare] ${m} 失败：${String((e as any)?.message).slice(0, 100)}`); }
        }
        throw new Error('通用大模型没有回答');
      });
      // 研判：对照库里核实过的企业资料标出通用模型的问题 + 两边压成同样几行（失败不挡对比本身）
      if (!compare.review || compare.review.v !== 2 || body.force || body.review) {
        try { compare = { ...compare, review: await withCost({ tool_name: 'work', task_name: 'Compare · 研判', stage: 'use' }, () => reviewGeneric(compare.text, t.context, t, t.company_name)) }; }
        catch (e) { console.warn('[work-compare] 研判失败：', String((e as any)?.message).slice(0, 120)); }
      }
      // 并发保护：慢请求跑完时库里已经有更新的一份（另一次「重新问」），就不拿旧结果覆盖
      const { data: now } = await db.from('work_tasks').select('task').eq('id', t.id).single();
      const cur = now?.task?.compare;
      if (cur?.at && cur.at > compare.at) return NextResponse.json({ ok: true, compare: cur });
      await db.from('work_tasks').update({ task: { ...(now?.task || t.task), compare } }).eq('id', t.id);
      return NextResponse.json({ ok: true, compare });
    } catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 }); }
  }
  if (typeof body.feedback === 'string' && body.feedback.trim()) {
    try {
      const cur = { env: t.task?.env || { type: 'doc' }, problem: t.problem, task: t.task, materials: t.materials, rubric: t.rubric };
      const { task: next, model, changelog } = await withCost({ tool_name: 'work', task_name: 'Revise · 按意见修订', stage: 'create', actor: t.created_by }, () => reviseTask(cur, t.context, body.feedback.trim()));
      const revisions = [...(t.task?.revisions || []), { at: new Date().toISOString(), feedback: body.feedback.trim().slice(0, 1200), changelog, model }];
      const { error } = await db.from('work_tasks').update({ problem: next.problem, task: { ...next.task, env: next.env, revisions }, materials: next.materials, rubric: next.rubric, baseline: null, updated_at: new Date().toISOString() }).eq('id', t.id);
      if (error) throw new Error(error.message);
      refreshSignals(t.id);
      return NextResponse.json({ ok: true, changelog });
    } catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 }); }
  }
  try {
    const baseline = await withCost({ tool_name: 'work', task_name: 'Baseline · AI 先做一遍', stage: 'create', actor: t.created_by }, () =>
      runBaseline({ env: t.task?.env || { type: 'doc' }, problem: t.problem, task: t.task, materials: t.materials, rubric: t.rubric }, { institution: t.company_name }));
    await db.from('work_tasks').update({ baseline, updated_at: new Date().toISOString() }).eq('id', t.id);
    return NextResponse.json({ ok: true, total: baseline.result.total });
  } catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 }); }
}
