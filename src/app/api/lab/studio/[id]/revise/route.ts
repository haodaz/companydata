import { NextRequest, NextResponse, after } from 'next/server';
import { denyUnlessLabOwner } from '@/lib/lab-owner';
import { supabaseAdmin as db } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';
import { withCost } from '@/lib/token-logger';
import { labError } from '@/lib/skill-lab-server';
import { applyRevision, logRevision, rebuildChapterBench, reviseOpening, reviseStep } from '@/lib/lab-revise';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };
const MODEL = () => process.env.NEXT_PUBLIC_LAB_GEN_MODEL || 'gpt-5.6-luna';

/**
 * 局部改（lib/lab-revise.ts）：POST { chapter_id, target: 'step' | 'opening' | 'bench', step_id?, instruction, model?, live? }
 *   step / opening 同步返回 { revision_id, before, after, note }，前端给人看对比、采纳了才写进这一章（再保存，走原来的留痕）
 *   bench 后台跑，立刻返回 { revision_id, running: true }，前端 GET ?revision= 轮询
 * GET ?revision=<id> 读一条；GET ?chapter=<id> 这一章还没处理的提案
 * PATCH { id, status: 'adopted' | 'discarded' } 记下人的决定
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const denied = await denyUnlessLabOwner(req, id); if (denied) return denied;
    const me = await getSessionUser(req).catch(() => null);
    const b = await req.json().catch(() => ({}));
    const chapterId = String(b.chapter_id || ''), instruction = String(b.instruction || '').trim().slice(0, 600), model = String(b.model || MODEL());
    if (!chapterId || instruction.length < 2) return NextResponse.json({ ok: false, error: '说一句要怎么改' }, { status: 400 });
    const cost = { space_id: id, chapter_id: chapterId, stage: 'edit' as const, actor: me?.email || null };

    if (b.target === 'step') {
      const r = await withCost(cost, () => reviseStep(id, chapterId, String(b.step_id || ''), instruction, model, b.live));
      const rid = await logRevision({ task_id: id, chapter_id: chapterId, target: `step:${b.step_id}`, instruction, before: r.before, after: r.after, note: r.note, created_by: me?.email || null });
      return NextResponse.json({ ok: true, revision_id: rid, ...r });
    }
    if (b.target === 'opening') {
      const r = await withCost(cost, () => reviseOpening(id, chapterId, instruction, model, b.live));
      const rid = await logRevision({ task_id: id, chapter_id: chapterId, target: 'opening', instruction, before: r.before, after: r.after, note: r.note, created_by: me?.email || null });
      return NextResponse.json({ ok: true, revision_id: rid, ...r });
    }
    if (b.target === 'bench') {
      const rid = await logRevision({ task_id: id, chapter_id: chapterId, target: `bench:${b.step_id || ''}`, instruction, status: 'running', created_by: me?.email || null });
      if (!rid) return NextResponse.json({ ok: false, error: '重新设计工位要先开通修改记录（迁移 066 待跑）' }, { status: 400 });
      after(async () => {
        try { await withCost(cost, () => rebuildChapterBench(id, chapterId, instruction, model, rid)); }
        catch (e: any) { console.error('[lab/revise] bench', e); await db.from('lab_revisions').update({ status: 'failed', error: String(e?.message || e).slice(0, 400) }).eq('id', rid); }
      });
      return NextResponse.json({ ok: true, revision_id: rid, running: true });
    }
    return NextResponse.json({ ok: false, error: 'target?' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const denied = await denyUnlessLabOwner(req, id); if (denied) return denied;
  const sp = new URL(req.url).searchParams;
  const rid = sp.get('revision'), ch = sp.get('chapter');
  if (rid) {
    const { data, error } = await db.from('lab_revisions').select('*').eq('id', rid).eq('task_id', id).maybeSingle();
    if (error || !data) return NextResponse.json({ ok: false, error: error?.message || '找不到' }, { status: 404 });
    return NextResponse.json({ ok: true, revision: data });
  }
  let q = db.from('lab_revisions').select('id, chapter_id, target, instruction, note, status, error, created_at').eq('task_id', id).order('created_at', { ascending: false }).limit(50);
  if (ch) q = q.eq('chapter_id', ch);
  const { data, error } = await q;
  return NextResponse.json({ ok: true, revisions: error ? [] : data });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const denied = await denyUnlessLabOwner(req, id); if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  if (!['adopted', 'discarded'].includes(b.status)) return NextResponse.json({ ok: false, error: 'status?' }, { status: 400 });
  // 对话里采纳：直接写进章节（apply = { chapter_id, target, step_id?, after }）
  if (b.status === 'adopted' && b.apply) {
    try { await applyRevision(id, b.apply, (await getSessionUser(req).catch(() => null))?.email || null); }
    catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 400 }); }
  }
  if (b.id) await db.from('lab_revisions').update({ status: b.status, decided_at: new Date().toISOString() }).eq('id', String(b.id || '')).eq('task_id', id);
  return NextResponse.json({ ok: true });
}
