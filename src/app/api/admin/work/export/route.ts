import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { readme, trainingRecords } from '@/lib/work/export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** 训练数据导出（只给 admin）：?task= 某道题（不传 = 全部）· all=1 连没交卷的 · noai=1 不要 AI 学员 · noshots=1 不列截图 · readme=1 只要说明 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (user?.role !== 'admin') return NextResponse.json({ ok: false, error: '只有管理员能导出' }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  if (sp.get('readme')) return new NextResponse(readme(), { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
  try {
    const rows = await trainingRecords({ task: sp.get('task'), submittedOnly: !sp.get('all'), withAi: !sp.get('noai'), shots: !sp.get('noshots') });
    return new NextResponse(rows.map(r => JSON.stringify(r)).join('\n') + '\n', { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Rows': String(rows.length) } });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
