import { NextResponse } from 'next/server';
import { reviewSubmission, reviewableSubmissions } from '@/lib/lab-demo-review';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 示范评审：?submission=<作答编号> 出一份报告；?space=<空间编号> 列出可评审的作答（要登录，在 /api/lab/studio/ 下） */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const sid = q.get('submission'), space = q.get('space');
    if (sid) return NextResponse.json({ ok: true, review: await reviewSubmission(sid) });
    if (space) return NextResponse.json({ ok: true, items: await reviewableSubmissions(space) });
    return NextResponse.json({ ok: false, error: '缺 submission 或 space' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
