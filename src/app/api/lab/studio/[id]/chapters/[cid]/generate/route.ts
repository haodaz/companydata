import { NextRequest, NextResponse } from 'next/server';
import { labError } from '@/lib/skill-lab-server';
import { startJob } from '@/lib/lab-jobs';
import { buildChapter } from '@/lib/agents/lab-chapters';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; cid: string }> };

/** 生成 / 重写一格（后台跑，返回任务编号）。锁定的章节不动 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id, cid } = await params;
    const b = await req.json().catch(() => ({}));
    const model = String(b.model || process.env.NEXT_PUBLIC_LAB_GEN_MODEL || 'gpt-5.6-luna');
    const job = await startJob(id, cid, 'build_chapter', async progress => {
      const r = await buildChapter(id, cid, model, String(b.hint || '').slice(0, 800), { art: b.art !== false }, progress);
      return `${r.steps} 步 · 新角色 ${r.newCast}（复用素材 ${r.reused}）· 新画 ${r.drawn} 张`;
    });
    return NextResponse.json({ ok: true, job });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
