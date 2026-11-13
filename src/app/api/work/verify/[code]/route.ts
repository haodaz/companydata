import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { fingerprint, filesOf, proofCode, sessionByCode } from '@/lib/work/proof';
import { mainScore } from '@/lib/work/scale';
import { getWorkScale } from '@/lib/work/scale-server';

export const runtime = 'nodejs';

/** 作品核验（公开、只读）：核验码 → 平台存的原件。只给姓名，不给手机邮箱；任务给标题、企业、岗位、任务书 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const s: any = await sessionByCode(code);
  if (!s) return NextResponse.json({ ok: false, error: '没有这个核验码对应的作品' }, { status: 404 });
  const { data: t } = await db.from('work_tasks').select('id, company_name, role, task, share_token, status').eq('id', s.task_id).maybeSingle();
  if (!t || t.status === 'deleted') return NextResponse.json({ ok: false, error: '这份作品对应的任务已经不在了' }, { status: 404 });
  const scale = await getWorkScale();
  return NextResponse.json({
    ok: true, code: proofCode(s.id), scale,
    task: { title: t.task?.title, company: t.company_name, role: t.role, lang: t.task?.lang || 'zh', brief: t.task?.brief || '', deliverables: (t.task?.deliverables || []).map((d: any) => ({ id: d.id, title: d.title, format: d.format })) },
    who: s.participant?.name || '', started_at: s.started_at, submitted_at: s.submitted_at,
    score: mainScore(s, scale), result_total: s.report?.result?.total ?? null, ai_use: s.report?.ai_use?.score ?? null,
    deliverable: s.deliverable || '', fingerprint: fingerprint(s.deliverable || ''), files: filesOf(s.events || []),
  });
}
