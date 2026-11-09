import { NextRequest, NextResponse } from 'next/server';
import { companies, company, investor, overview } from '@/lib/invest/data';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** /invest 大屏的数据（登录后可用，proxy 统一拦）：view = overview | companies | investor | company */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams, view = u.get('view') || 'overview', chain = u.get('chain') || 'all';
  try {
    if (view === 'overview') return NextResponse.json({ success: true, data: await overview(chain) });
    if (view === 'companies') return NextResponse.json({ success: true, data: await companies({ chain, node: u.get('node') || undefined, place: u.get('place') || undefined, investor: u.get('investor') || undefined, tab: u.get('tab') || undefined, q: u.get('q') || undefined, sort: u.get('sort') || undefined, page: Math.max(1, Number(u.get('page') || 1)) }) });
    if (view === 'investor') return NextResponse.json({ success: true, data: await investor(u.get('name') || '') });
    if (view === 'company') { const d = await company(Number(u.get('id'))); return d ? NextResponse.json({ success: true, data: d }) : NextResponse.json({ success: false, error: '没有这家企业' }, { status: 404 }); }
    return NextResponse.json({ success: false, error: '未知视图' }, { status: 400 });
  } catch (e: any) {
    console.error('[invest]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
