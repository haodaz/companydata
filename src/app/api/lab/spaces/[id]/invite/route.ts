import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { labError, loadSpace } from '@/lib/skill-lab-server';
import { INVITE_DAYS, signInvite } from '@/lib/lab-invite';

export const runtime = 'nodejs';

/** 生成「请一位老师傅来教」的链接（要登录：邀请是一种授权，得知道是谁发的） */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const me = await verifyToken(req.cookies.get('auth_token')?.value || '');
    if (!me) return NextResponse.json({ ok: false, error: '未登录或登录已过期' }, { status: 401 });
    await loadSpace(id); // 空间不存在就别发票
    // 票面是能被解开看的（只是改不了），链接又会被转发——所以只放用户 id，不放邮箱
    const { token, expiresAt } = await signInvite(id, String(me.id || ''));
    const url = `${req.nextUrl.origin}/lab/${id}?invite=${encodeURIComponent(token)}`;
    return NextResponse.json({ ok: true, url, expiresAt, days: INVITE_DAYS });
  } catch (e: any) {
    return NextResponse.json({ ok: false, ...labError(e) }, { status: 500 });
  }
}
