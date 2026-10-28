import { NextRequest, NextResponse } from 'next/server';
import { buildDisciplineMap } from '@/lib/lab-discipline';
import { labError } from '@/lib/skill-lab-server';

export const runtime = 'nodejs';
export const maxDuration = 180;

/** 研究岗空间的学科地图：第一次打开时生成并存进空间，之后直接读；&force=1（登录后）重新生成 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const map = await buildDisciplineMap(id, { force: req.nextUrl.searchParams.get('force') === '1' && !!req.cookies.get('auth_token') });
    return NextResponse.json({ ok: true, map });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
