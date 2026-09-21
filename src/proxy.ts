import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/jwt';

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API：除登录 / 注册外全部需要登录（agent 接口会消耗 Token，数据接口走 service role）
  if (pathname.startsWith('/api/')) {
    if (pathname.startsWith('/api/auth/')) return NextResponse.next();
    const token = req.cookies.get('auth_token')?.value;
    const payload = token ? await verifyToken(token) : null;
    if (!payload) return NextResponse.json({ ok: false, error: '未登录或登录已过期' }, { status: 401 });
    return NextResponse.next();
  }

  // Protect /admin routes
  if (pathname.startsWith('/admin')) {
    const token = req.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.redirect(new URL('/login', req.url));
    }

    const payload = await verifyToken(token);
    if (!payload) {
      // Invalid token, clear it and redirect to login
      const response = NextResponse.redirect(new URL('/login', req.url));
      response.cookies.delete('auth_token');
      return response;
    }

    // Role-based protection: only admin can access /admin/system-users
    if (pathname.startsWith('/admin/system-users') && payload.role !== 'admin') {
      return NextResponse.redirect(new URL('/admin/db-company', req.url));
    }

    return NextResponse.next();
  }

  // Redirect root to the company library (which will be intercepted if not logged in)
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/admin/db-company', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*', '/'],
};
