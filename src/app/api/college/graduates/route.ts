import { NextResponse } from 'next/server';
import { listGraduates, clearCollegeCache } from '@/lib/college';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** AI 大学：全部毕业生（数字职人）——学了什么、考得怎样、能去哪些公司。?fresh=1 不用缓存 */
export async function GET(req: Request) {
  try {
    if (new URL(req.url).searchParams.get('fresh')) clearCollegeCache();
    return NextResponse.json({ ok: true, data: await listGraduates() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
