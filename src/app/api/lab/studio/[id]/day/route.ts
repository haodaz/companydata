import { NextRequest, NextResponse } from 'next/server';
import { labError } from '@/lib/skill-lab-server';
import { startJob } from '@/lib/lab-jobs';
import { buildDay } from '@/lib/agents/lab-chapters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** 排一天骨架（后台跑，返回任务编号） */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const b = await req.json().catch(() => ({}));
    const model = String(b.model || 'gpt-5.6-luna');
    const job = await startJob(id, null, 'build_day', async progress => {
      const r = await buildDay(id, model, String(b.hint || '').slice(0, 500), progress);
      return `新增 ${r.added} 格 · 角色表新增 ${r.cast} 项`;
    });
    return NextResponse.json({ ok: true, job });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
