import { NextRequest, NextResponse } from 'next/server';
import { buildLesson } from '@/lib/lab-lesson';
import { labError } from '@/lib/skill-lab-server';
import { labModel } from '@/lib/lab-guest';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** 跟我学 · 这一章的教案：?chapter=<章节编号>（空 = 老空间的主流程）；&force=1 重新生成。游客也能看（模型锁默认） */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const q = req.nextUrl.searchParams;
    const lesson = await buildLesson(id, q.get('chapter') || null, { model: labModel(req, q.get('model')), force: q.get('force') === '1' });
    return NextResponse.json({ ok: true, lesson });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
