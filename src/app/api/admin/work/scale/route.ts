import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { asScale } from '@/lib/work/scale';
import { getWorkScale, setWorkScale, workScaleReady } from '@/lib/work/scale-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 全站管理 · 评分方式：只给 admin */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (user?.role !== 'admin') return NextResponse.json({ ok: false, error: '只有管理员能看' }, { status: 403 });
  return NextResponse.json({ ok: true, scale: await getWorkScale(), ready: await workScaleReady() });
}
export async function PUT(req: NextRequest) {
  const user = await getSessionUser(req);
  if (user?.role !== 'admin') return NextResponse.json({ ok: false, error: '只有管理员能改' }, { status: 403 });
  try {
    const b = await req.json();
    if (b.scale !== 'full' && b.scale !== 'ai_use') return NextResponse.json({ ok: false, error: '没有这种评分方式' }, { status: 400 });
    await setWorkScale(asScale(b.scale), user.email);
    return NextResponse.json({ ok: true, scale: b.scale });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
