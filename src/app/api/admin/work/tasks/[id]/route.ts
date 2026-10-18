import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser, requireAdminUser } from '@/lib/session';

export const runtime = 'nodejs';

/** 一道题的全部：问题 / 任务 / 材料 / rubric / 基线 / 出题材料 + 所有作答 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser(req))) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const { id } = await params;
  const { data: task, error } = await db.from('work_tasks').select('*').eq('id', id).maybeSingle();
  if (error || !task) return NextResponse.json({ ok: false, error: error?.message || '没有这道题' }, { status: 404 });
  const { data: sessions } = await db.from('work_sessions').select('id, participant, started_at, submitted_at, score, report').eq('task_id', id).order('created_at', { ascending: false });
  return NextResponse.json({ ok: true, task, sessions: sessions || [] });
}

/** 改状态：{ status: 'published' | 'ready' | 'archived' }，或改标题 / 时限 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  const { id } = await params;
  const body = await req.json();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (['ready', 'published', 'archived'].includes(body.status)) patch.status = body.status;
  if (body.task && typeof body.task === 'object') patch.task = body.task;
  if (body.rubric && Array.isArray(body.rubric)) patch.rubric = body.rubric;
  const { error } = await db.from('work_tasks').update(patch).eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  const { id } = await params;
  const { error } = await db.from('work_tasks').delete().eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
