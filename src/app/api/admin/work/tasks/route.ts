import { NextRequest, NextResponse } from 'next/server';
import { isKnownModel } from '@/lib/model-options';
import { randomBytes } from 'node:crypto';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { gatherContext, generateTask, WORK_MODEL } from '@/lib/work/generator';
import { withCost } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 真活台 · 题目列表：登录即可。普通用户 = 自己出的 + 示范题（owner.contact = demo）；管理员 = 全部。带 owner_key 给真活空间链接 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const base = 'id, share_token, owner_key, status, company_id, company_name, role, task, baseline, model, created_at, created_by, owner';
  let r: { data: any[] | null; error: any } = await db.from('work_tasks').select(base).order('created_at', { ascending: false }).limit(300);
  if (r.error) r = await db.from('work_tasks').select(base.replace(', owner_key', '').replace(', owner', '')).order('created_at', { ascending: false }).limit(300);   // 迁移 036 没跑
  const { data, error } = r;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const isDemo = (t: any) => t.owner?.contact === 'demo';
  const mine = (data || []).filter(t => user.role === 'admin' || t.created_by === user.email || isDemo(t));
  const ids = mine.map(t => t.id);
  const counts: Record<string, { n: number; done: number }> = {};
  if (ids.length) {
    const { data: ss } = await db.from('work_sessions').select('task_id, submitted_at').in('task_id', ids);
    for (const x of ss || []) { const c = counts[x.task_id] ||= { n: 0, done: 0 }; c.n++; if (x.submitted_at) c.done++; }
  }
  return NextResponse.json({ ok: true, role: user.role, tasks: mine.map(t => ({ ...t, demo: isDemo(t), task: { title: t.task?.title, time_minutes: t.task?.time_minutes, env: t.task?.env }, baseline: t.baseline ? { total: t.baseline.result?.total, model: t.baseline.model } : null, sessions: counts[t.id] || { n: 0, done: 0 } })) });
}

/** 出一道题：{ company, company_id?, role, env?, focus? }。登录即可（用户 10-18：出题走登录，做题免登录）。生成器是核心：先拼材料，再出 问题 → 任务 → 材料包 → rubric；AI 基线另一步跑 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  try {
    const body = await req.json();
    const company = String(body.company || '').trim(), role = String(body.role || '').trim();
    if (!company || !role) return NextResponse.json({ ok: false, error: '企业和岗位都要填' }, { status: 400 });
    const ctx = await gatherContext(body.company_id ? String(body.company_id) : company, role);
    const { task, model } = await withCost({ tool_name: 'work', task_name: 'Generate · 出题', stage: 'create', actor: user?.email || null }, () => generateTask(ctx, role, { model: isKnownModel(String(body.model || '')) ? String(body.model) : WORK_MODEL, focus: body.focus, env: ['doc', 'code', 'sheet', 'design', 'open'].includes(body.env) ? body.env : undefined }));
    const share_token = randomBytes(8).toString('base64url'), owner_key = randomBytes(12).toString('base64url');
    const row = { share_token, owner_key, owner: { name: user?.email, contact: user?.email }, status: 'published', company_id: ctx.company?.id ?? null, company_name: ctx.company?.name || company, role, context: ctx, problem: task.problem, task: { ...task.task, env: task.env }, materials: task.materials, rubric: task.rubric, model, created_by: user?.email || null };
    const { data, error } = await db.from('work_tasks').insert(row).select('id, share_token').single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, id: data.id, share_token: data.share_token, owner_key, title: task.task.title, env: task.env.type, notes: ctx.notes });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
