import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { wsCtx, fail } from '../../_ctx';
import { checkVerify, fitCandidate, ownCandidate, setStage, verifyCandidate } from '@/lib/ws/projects';
import { zhichachaReady } from '@/lib/ws/zhichacha';

export const runtime = 'nodejs';
export const maxDuration = 200;
/** 候选人详情；人才检测在跑时顺手查一次进度 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await wsCtx(req); if ('err' in c) return c.err;
  try {
    let cand = await ownCandidate(c.org, (await params).id);
    if (cand.audit?.status === 'running' && zhichachaReady()) { await checkVerify(c.org, cand.id).catch(() => {}); cand = await ownCandidate(c.org, cand.id); }
    let work: any = null;
    if (cand.work_session_id) { const { data: s } = await db.from('work_sessions').select('id, task_id, report, score, submitted_at').eq('id', cand.work_session_id).maybeSingle(); if (s) { const { data: t } = await db.from('work_tasks').select('share_token, owner_key, task').eq('id', s.task_id).maybeSingle(); work = { score: s.score, submitted: !!s.submitted_at, report: s.report, token: t?.share_token, owner_key: t?.owner_key, title: t?.task?.title }; } }
    return NextResponse.json({ ok: true, candidate: cand, work, zhichacha: zhichachaReady() });
  } catch (e) { return fail(e, 404); }
}
/** { stage, note? } 改阶段；{ notes } 改备注 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await wsCtx(req); if ('err' in c) return c.err;
  try {
    const id = (await params).id; const b = await req.json();
    if (b.stage) return NextResponse.json({ ok: true, ...(await setStage(c.org, id, b.stage, b.note)) });
    if (typeof b.notes === 'string') { await ownCandidate(c.org, id); await db.from('ws_candidates').update({ notes: b.notes.slice(0, 4000), updated_at: new Date().toISOString() }).eq('id', id); return NextResponse.json({ ok: true }); }
    throw new Error('没有要改的');
  } catch (e) { return fail(e); }
}
/** { action: 'fit' | 'verify' } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await wsCtx(req); if ('err' in c) return c.err;
  try {
    const id = (await params).id; const b = await req.json();
    if (b.action === 'fit') return NextResponse.json({ ok: true, fit: await fitCandidate(c.org, id) });
    if (b.action === 'verify') return NextResponse.json({ ok: true, ...(await verifyCandidate(c.org, id)) });
    throw new Error('不认识的操作');
  } catch (e) { return fail(e); }
}
