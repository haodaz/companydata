import { NextRequest, NextResponse } from 'next/server';
import { denyUnlessLabOwner } from '@/lib/lab-owner';
import { getSessionUser } from '@/lib/session';
import { withCost } from '@/lib/token-logger';
import { labError } from '@/lib/skill-lab-server';
import { startJob } from '@/lib/lab-jobs';
import { fixByReview, latestReview, reviewSpace, type Todo } from '@/lib/lab-followup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/**
 * AI 全程跟进（C）：GET 最近一次评审；POST { action: 'review' } 现评一遍（约半分钟）；
 * POST { action: 'fix', todos } 一键按评审改（后台任务：有问题、没锁定的章按建议重写成草稿，改完再评）
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const denied = await denyUnlessLabOwner(req, id); if (denied) return denied;
  return NextResponse.json({ ok: true, review: await latestReview(id) });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const denied = await denyUnlessLabOwner(req, id); if (denied) return denied;
    const me = await getSessionUser(req).catch(() => null);
    const b = await req.json().catch(() => ({}));
    if (b.action === 'review') {
      const review = await withCost({ space_id: id, stage: 'review', actor: me?.email || null }, () => reviewSpace(id));
      return NextResponse.json({ ok: true, review });
    }
    if (b.action === 'fix') {
      const todos: Todo[] = Array.isArray(b.todos) ? b.todos.slice(0, 12) : [];
      if (!todos.length) return NextResponse.json({ ok: false, error: '没有要改的' }, { status: 400 });
      const model = String(b.model || process.env.NEXT_PUBLIC_LAB_GEN_MODEL || 'gpt-5.6-luna');
      const job = await startJob(id, null, 'fix_review', progress => withCost({ space_id: id, stage: 'edit', actor: me?.email || null }, () => fixByReview(id, todos, model, progress)));
      return NextResponse.json({ ok: true, job });
    }
    return NextResponse.json({ ok: false, error: 'action?' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
