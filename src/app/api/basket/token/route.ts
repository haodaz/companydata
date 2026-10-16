import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/jwt';
import { issueBasketToken } from '@/lib/basket';

/** 在「数据外采篮」页面上登录后生成篮子口令，粘进插件设置里（30 天有效） */
export async function POST() {
  const token = (await cookies()).get('auth_token')?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ ok: false, error: '请先登录' }, { status: 401 });
  return NextResponse.json({ ok: true, token: await issueBasketToken(user), email: user.email, expiresInDays: 30 });
}
