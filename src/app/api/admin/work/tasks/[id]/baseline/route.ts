import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser, requireAdminUser } from '@/lib/session';
import { runBaseline, WORK_MODEL } from '@/lib/work/generator';
import { withCost } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** AI 基线：最强模型先把这道题做一遍，再用同一套 rubric 评它；候选人的报告拿它来比 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminUser(req); if (denied) return denied;
  const user = await getSessionUser(req);
  const { id } = await params;
  const { data: t } = await db.from('work_tasks').select('*').eq('id', id).maybeSingle();
  if (!t) return NextResponse.json({ ok: false, error: '没有这道题' }, { status: 404 });
  try {
    const body = await req.json().catch(() => ({}));
    const baseline = await withCost({ tool_name: 'work', task_name: 'Baseline · AI 先做一遍', stage: 'create', actor: user?.email || null }, () =>
      runBaseline({ env: t.task?.env || { type: 'doc' }, problem: t.problem, task: t.task, materials: t.materials, rubric: t.rubric }, { model: body.model || WORK_MODEL, institution: t.company_name }));
    const { error } = await db.from('work_tasks').update({ baseline, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, baseline: { model: baseline.model, total: baseline.result.total } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
