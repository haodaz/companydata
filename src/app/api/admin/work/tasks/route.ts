import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser, requireAdminUser } from '@/lib/session';
import { gatherContext, generateTask, WORK_MODEL } from '@/lib/work/generator';
import { withCost } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 真活台 · 题目列表 */
export async function GET(req: NextRequest) {
  if (!(await getSessionUser(req))) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const base = 'id, share_token, status, company_id, company_name, role, task, baseline, model, created_at';
  let r: { data: any[] | null; error: any } = await db.from('work_tasks').select(base + ', owner').order('created_at', { ascending: false }).limit(200);
  if (r.error) r = await db.from('work_tasks').select(base).order('created_at', { ascending: false }).limit(200);   // 迁移 036 没跑：没有 owner 列
  const { data, error } = r;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const ids = (data || []).map(t => t.id);
  const counts: Record<string, { n: number; done: number }> = {};
  if (ids.length) {
    const { data: ss } = await db.from('work_sessions').select('task_id, submitted_at').in('task_id', ids);
    for (const x of ss || []) { const c = counts[x.task_id] ||= { n: 0, done: 0 }; c.n++; if (x.submitted_at) c.done++; }
  }
  return NextResponse.json({ ok: true, tasks: (data || []).map(t => ({ ...t, task: { title: t.task?.title, time_minutes: t.task?.time_minutes, env: t.task?.env }, baseline: t.baseline ? { total: t.baseline.result?.total, model: t.baseline.model } : null, sessions: counts[t.id] || { n: 0, done: 0 } })) });
}

/** 出一道题：{ company, role, focus? }。生成器是核心：先拼材料，再出 问题 → 任务 → 材料包 → rubric；AI 基线另一步跑 */
export async function POST(req: NextRequest) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  const user = await getSessionUser(req);
  try {
    const body = await req.json();
    const company = String(body.company || '').trim(), role = String(body.role || '').trim();
    if (!company || !role) return NextResponse.json({ ok: false, error: '企业和岗位都要填' }, { status: 400 });
    const ctx = await gatherContext(body.company_id ? String(body.company_id) : company, role);
    const { task, model } = await withCost({ tool_name: 'work', task_name: 'Generate · 出题', stage: 'create', actor: user?.email || null }, () => generateTask(ctx, role, { model: body.model || WORK_MODEL, focus: body.focus, env: ['doc', 'code', 'sheet', 'design'].includes(body.env) ? body.env : undefined }));
    const share_token = randomBytes(8).toString('base64url');
    const row = { share_token, status: 'ready', company_id: ctx.company?.id ?? null, company_name: ctx.company?.name || company, role, context: ctx, problem: task.problem, task: { ...task.task, env: task.env }, materials: task.materials, rubric: task.rubric, model, created_by: user?.email || null };
    const { data, error } = await db.from('work_tasks').insert(row).select('id, share_token').single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id, share_token: data.share_token, notes: ctx.notes });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
