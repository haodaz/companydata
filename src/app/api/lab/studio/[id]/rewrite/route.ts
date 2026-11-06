import { NextRequest, NextResponse } from 'next/server';
import { denyUnlessLabOwner } from '@/lib/lab-owner';
import { supabaseAdmin } from '@/lib/supabase';
import { labError } from '@/lib/skill-lab-server';
import { startJob } from '@/lib/lab-jobs';
import { buildChapter } from '@/lib/agents/lab-chapters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * 改了生成要求后整体重调（B，11-06）：按新要求把没锁定的章节一章一章重写（一个后台任务里顺序跑，别同时压库）。
 * { include_published?: false, hint?, model? }：默认只重写草稿章；勾了才连已发布的一起（重写后变草稿，看过再发布）。锁定的永远不动。
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const denied = await denyUnlessLabOwner(req, id); if (denied) return denied;
    const b = await req.json().catch(() => ({}));
    const model = String(b.model || process.env.NEXT_PUBLIC_LAB_GEN_MODEL || 'gpt-5.6-luna');
    const { data: chs, error } = await supabaseAdmin.from('lab_chapters').select('id, title, status, locked, seq').eq('task_id', id).order('seq');
    if (error) throw error;
    const todo = (chs || []).filter((c: any) => !c.locked && (b.include_published || c.status !== 'published'));
    if (!todo.length) return NextResponse.json({ ok: false, error: b.include_published ? '所有章节都锁定了' : '没有没锁定的草稿章；要连已发布的一起重写，勾上那一项' }, { status: 400 });
    const job = await startJob(id, null, 'rewrite_all', async progress => {
      let done = 0;
      for (const c of todo) {
        await progress(`按新要求重写 ${done + 1} / ${todo.length}`, c.title);
        if (c.status === 'published') await supabaseAdmin.from('lab_chapters').update({ status: 'draft' }).eq('id', c.id);
        await buildChapter(id, c.id, model, String(b.hint || '').slice(0, 500), { art: true }, () => {});
        done++;
      }
      return `重写了 ${done} 章${todo.some((c: any) => c.status === 'published') ? '（原来已发布的变成草稿，看过再发布）' : ''}`;
    });
    return NextResponse.json({ ok: true, job, count: todo.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
