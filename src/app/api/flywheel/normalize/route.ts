import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { normalizeCompanyIndustries, normalizePending } from '@/lib/flywheel/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** 看板上「归一未处理的信号」：{ model? } */
export async function POST(req: Request) {
  if (!(await getSessionUser(req))) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  const { model } = await req.json().catch(() => ({}));
  const m = model || process.env.FLYWHEEL_MODEL || 'gemini-3.8-flash';
  try {
    const aliases = await normalizeCompanyIndustries(m);
    const r = await normalizePending(m, 400);
    return NextResponse.json({ ok: true, aliases, ...r });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
