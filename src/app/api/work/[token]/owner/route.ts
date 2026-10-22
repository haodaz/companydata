import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { reviseTask, runBaseline, sourcesOf } from '@/lib/work/generator';
import { withCost, logTokenUsage } from '@/lib/token-logger';
import { generateContent } from '@/lib/llm-client';

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
  const { data: sessions } = await db.from('work_sessions').select('id, participant, started_at, submitted_at, score, report').eq('task_id', t.id).order('created_at', { ascending: false });
  const { owner_key: _k, context: ctx, ...task } = t;
  return NextResponse.json({ ok: true, task: { ...task, notes: ctx?.notes || [], sources: ctx ? sourcesOf(ctx) : null }, sessions: sessions || [] });
}

/** 发布 / 下架 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await auth(token, req);
  if (!t) return NextResponse.json({ ok: false, error: '管理链接不对' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (!['published', 'archived'].includes(body.status)) return NextResponse.json({ ok: false, error: '状态不对' }, { status: 400 });
  await db.from('work_tasks').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', t.id);
  return NextResponse.json({ ok: true });
}

/** 重跑 AI 基线；或 { feedback } 按意见修订（保留没提到的部分，留修订记录；改完基线作废要重跑） */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await auth(token, req);
  if (!t) return NextResponse.json({ ok: false, error: '管理链接不对' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  // 对比演示（2026-10-22 老板：垂直 vs 通用）：通用模型（千问，国内用户能直接用的），只给一句大白话让它出题，和平方出的并排看。存在题里，第二次秒开；{ force } 重问
  if (body.compare) {
    if (t.task?.compare?.text && !body.force) return NextResponse.json({ ok: true, compare: t.task.compare });
    const prompt = `我们公司是${t.company_name}，要招人：${t.role}。请你出一道题给应聘者做，并给出评分标准。`;
    try {
      const compare = await withCost({ tool_name: 'work', task_name: 'Compare · 通用大模型直接出题', stage: 'use' }, async () => {
        for (const m of ['qwen-plus', 'deepseek-v4-pro']) {
          try { const r = await generateContent(prompt, m); await logTokenUsage({ tool_name: 'work', task_name: 'Compare · 通用大模型直接出题', institution: t.company_name || '', model_id: m, usageMetadata: r.usageMetadata } as any).catch(() => {}); if (r.text?.trim()) return { prompt, text: r.text.trim(), model: m, at: new Date().toISOString() }; } catch (e) { console.warn(`[work-compare] ${m} 失败：${String((e as any)?.message).slice(0, 100)}`); }
        }
        throw new Error('通用大模型没有回答');
      });
      await db.from('work_tasks').update({ task: { ...t.task, compare } }).eq('id', t.id);
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
