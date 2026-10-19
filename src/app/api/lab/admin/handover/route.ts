import { NextRequest, NextResponse } from 'next/server';
import { buildKnowledgePack, buildLessonPack, buildSpacePack, buildWorkPack, packCounts } from '@/lib/lab-pack';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** 交接包：?pack=spaces|lessons|knowledge|work（可带 ids=a,b）→ 下载 JSON；不带 pack → 各表计数。登录即可（/api/lab 在登录墙后） */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams; const pack = sp.get('pack'); const ids = (sp.get('ids') || '').split(',').map(s => s.trim()).filter(Boolean);
  try {
    if (!pack) return NextResponse.json({ ok: true, counts: await packCounts() });
    const data = pack === 'spaces' ? await buildSpacePack(ids) : pack === 'lessons' ? await buildLessonPack() : pack === 'knowledge' ? await buildKnowledgePack() : pack === 'work' ? await buildWorkPack(ids) : null;
    if (!data) return NextResponse.json({ ok: false, error: '不认识的包' }, { status: 400 });
    const name = `ai100-${pack}-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` } });
  } catch (e: any) { return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 }); }
}
