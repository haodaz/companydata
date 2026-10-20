import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase';
import { wsCtx, fail } from '../../_ctx';
import { ownProject, projectDetail, STAGES } from '@/lib/ws/projects';

export const runtime = 'nodejs';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await wsCtx(req); if ('err' in c) return c.err;
  try { return NextResponse.json({ ok: true, stages: STAGES, ...(await projectDetail(c.org, (await params).id)) }); } catch (e) { return fail(e, 404); }
}
/** 改项目：{ title?, headcount?, status?, jd? }（jd 是用户在右侧改过的 JD） */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await wsCtx(req); if ('err' in c) return c.err;
  try {
    const p = await ownProject(c.org, (await params).id); const b = await req.json();
    const up: Record<string, any> = { updated_at: new Date().toISOString() };
    if (b.title) up.title = String(b.title).slice(0, 80);
    if (b.headcount) up.headcount = Math.max(1, Number(b.headcount) || 1);
    if (['open', 'paused', 'closed'].includes(b.status)) up.status = b.status;
    if (b.jd && typeof b.jd === 'object') up.brief = { ...(p.brief || {}), jd: { ...(p.brief?.jd || {}), ...b.jd, edited_at: new Date().toISOString() } };
    await db.from('ws_projects').update(up).eq('id', p.id);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
