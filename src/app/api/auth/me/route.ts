import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { getSessionUser } from '@/lib/session';

export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(/auth_token=([^;]+)/);
    if (!match) {
      return NextResponse.json({ success: false, user: null }, { status: 401 });
    }

    const token = match[1];
    const payload = await verifyToken(token);

    if (!payload) {
      return NextResponse.json({ success: false, user: null }, { status: 401 });
    }

    // 角色以库里为准：令牌是登录时签的，之后被提成管理员（或降级）令牌里还是旧角色——
    // 后端接口早就回库重读了，前端菜单（系统账号管理、下载审批）也要跟着走
    const fresh = await getSessionUser(req);
    if (!fresh) return NextResponse.json({ success: false, user: null }, { status: 401 });
    return NextResponse.json({ success: true, user: { ...payload, email: fresh.email || payload.email, role: fresh.role } });
  } catch (error) {
    return NextResponse.json({ success: false, user: null }, { status: 500 });
  }
}
