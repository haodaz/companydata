import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { buildReport } from '@/lib/work/grader';
import { withCost } from '@/lib/token-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 交卷：{ deliverable, events? } → 结果（rubric 逐条）+ 过程（事件流）+ 和 AI 基线比 → 报告 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string; sid: string }> }) {
  const { token, sid } = await params;
  const { data: t } = await db.from('work_tasks').select('*').eq('share_token', token).maybeSingle();
  if (!t) return NextResponse.json({ ok: false, error: '链接不可用' }, { status: 404 });
  const { data: s } = await db.from('work_sessions').select('*').eq('id', sid).eq('task_id', t.id).maybeSingle();
  if (!s) return NextResponse.json({ ok: false, error: '没有这次作答' }, { status: 404 });
  if (s.submitted_at && s.report) return NextResponse.json({ ok: true, report: s.report, score: s.score });
  const body = await req.json().catch(() => ({}));
  const deliverable = String(body.deliverable ?? s.deliverable ?? '').slice(0, 60000);
  if (deliverable.trim().length < 50) return NextResponse.json({ ok: false, error: '交付物太短了，至少写点东西' }, { status: 400 });
  const tsec = Math.round((Date.now() - new Date(s.started_at).getTime()) / 1000);
  const events = [...(s.events || []), ...((Array.isArray(body.events) ? body.events : []).slice(0, 500)), { t: tsec, type: 'submit', chars: deliverable.length }];
  await db.from('work_sessions').update({ deliverable, events, submitted_at: new Date().toISOString() }).eq('id', sid);
  try {
    const report = await withCost({ tool_name: 'work', task_name: 'Grade · 报告', stage: 'use' }, () =>
      buildReport({ env: t.task?.env || { type: 'doc' }, problem: t.problem, task: t.task, materials: t.materials, rubric: t.rubric }, t.baseline, deliverable, events, s.ai_chat || [], t.company_name));
    await db.from('work_sessions').update({ report, score: report.result.total }).eq('id', sid);
    return NextResponse.json({ ok: true, report, score: report.result.total });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
