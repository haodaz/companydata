import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { labError } from '@/lib/skill-lab-server';
import { loadStudio } from '@/lib/lab-studio-server';
import { checkChapter, checkDay, type StudioChapter } from '@/lib/lab-studio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; cid: string }> };

const KINDS = ['daily', 'incident', 'assessment'];

/**
 * 保存一章。已发布的章节有 error 级问题就不让存（改回草稿可以存）；
 * 别人在这期间改过（updated_at 对不上）就拒绝，免得两个人互相覆盖。
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id, cid } = await params;
    const body = await req.json().catch(() => ({}));
    const { data: cur, error: e0 } = await supabaseAdmin.from('lab_chapters').select('*').eq('id', cid).eq('task_id', id).single();
    if (e0) throw e0;
    if (body.base_updated_at && cur.updated_at && new Date(body.base_updated_at).getTime() !== new Date(cur.updated_at).getTime())
      return NextResponse.json({ ok: false, conflict: true, error: '这一章在你打开之后被别人改过了，刷新后再改' }, { status: 409 });

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if ('title' in body) patch.title = String(body.title || '').slice(0, 120);
    if ('slot' in body) patch.slot = body.slot ? String(body.slot).slice(0, 40) : null;
    if ('kind' in body && KINDS.includes(body.kind)) patch.kind = body.kind;
    if ('brief' in body) patch.brief = body.brief ? String(body.brief).slice(0, 2000) : null;
    if ('status' in body && ['draft', 'published'].includes(body.status)) patch.status = body.status;
    if ('locked' in body) patch.locked = !!body.locked;
    if ('seq' in body && Number.isFinite(+body.seq)) patch.seq = Math.max(1, Math.round(+body.seq));
    if ('sim' in body) {
      const sim = body.sim;
      if (!sim || typeof sim !== 'object' || !Array.isArray(sim.steps)) return NextResponse.json({ ok: false, error: 'sim 格式不对：要有 steps 数组' }, { status: 400 });
      if (JSON.stringify(sim).length > 400_000) return NextResponse.json({ ok: false, error: '这一章太大了，拆成两章' }, { status: 400 });
      patch.sim = sim;
    }
    if ('expert_trace' in body) patch.expert_trace = body.expert_trace && typeof body.expert_trace === 'object' ? body.expert_trace : null;

    const next = { ...cur, ...patch } as StudioChapter;
    if (next.status === 'published') {
      const { data: all } = await supabaseAdmin.from('lab_chapters').select('id, seq, slot, title, kind, brief, sim, status').eq('task_id', id);
      const day = (all || []).map((c: any) => (c.id === cid ? next : c)) as StudioChapter[];
      const errors = [...checkChapter(next), ...checkDay(day)].filter(x => x.level === 'error' && (!x.chapter || x.chapter === cid));
      if (errors.length) return NextResponse.json({ ok: false, issues: errors, error: `还有 ${errors.length} 个问题，不能发布：${errors[0].msg}` }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('lab_chapters').update(patch).eq('id', cid);
    if (error) throw error;
    // seq=1 是老空间迁来的那章：skill_tasks.sim 还被重建工位、刷新美术、首页统计这些老代码读，跟着同步
    if (patch.sim && cur.seq === 1) await supabaseAdmin.from('skill_tasks').update({ sim: patch.sim }).eq('id', id);
    return NextResponse.json({ ok: true, ...(await loadStudio(id)) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}

/** 删一章（作答记录保留，chapter_id 置空）。最后一章不能删：那是删空间，走空间列表 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id, cid } = await params;
    const { data: all } = await supabaseAdmin.from('lab_chapters').select('id, seq').eq('task_id', id);
    if ((all || []).length <= 1) return NextResponse.json({ ok: false, error: '这是最后一章，不能删' }, { status: 400 });
    if ((all || []).find((c: any) => c.id === cid)?.seq === 1) return NextResponse.json({ ok: false, error: '第 1 章连着空间的技能和老数据，不能删；可以改成草稿让体验端看不到' }, { status: 400 });
    const { error } = await supabaseAdmin.from('lab_chapters').delete().eq('id', cid).eq('task_id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true, ...(await loadStudio(id)) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
