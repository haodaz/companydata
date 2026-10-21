import { NextResponse } from 'next/server';
import { graduateDetail, clearCollegeCache } from '@/lib/college';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** AI 大学：一位毕业生的档案。?fresh=1：刚考完试，重算 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (new URL(req.url).searchParams.get('fresh')) clearCollegeCache();
    const g = await graduateDetail(id);
    if (!g) return NextResponse.json({ ok: false, error: '没有这位毕业生' }, { status: 404 });
    return NextResponse.json({ ok: true, data: g });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
