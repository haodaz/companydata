import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { INVITED, INVITED_BY, readInvite } from '@/lib/lab-invite';

/** 受邀专家能碰的接口：这一位数字职人的空间本身（只读），以及向上学习的三步 */
const INVITE_API = /^\/api\/lab\/spaces\/([^/]+)(?:\/(interview|submit|distill))?$/;
const INVITE_PAGE = /^\/lab\/([^/]+)$/;

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API：除登录 / 注册外全部需要登录（agent 接口会消耗 Token，数据接口走 service role）
  if (pathname.startsWith('/api/')) {
    if (pathname.startsWith('/api/auth/')) return NextResponse.next();
    // 首页（/lab）是公开的宣传页，它只问这一个接口
    if (pathname === '/api/lab/landing' && req.method === 'GET') return NextResponse.next();
    // 飞轮信号接入：以后的 ToC 带 FLYWHEEL_INGEST_KEY，没有登录态；放进去由路由自己验密钥
    if (pathname === '/api/flywheel/signal' && req.method === 'POST' && req.headers.get('x-flywheel-key')) return NextResponse.next();
    // 「受邀」标记只能由这里打：客户端自己带来的一律先剥掉
    const headers = new Headers(req.headers);
    headers.delete(INVITED); headers.delete(INVITED_BY);
    const token = req.cookies.get('auth_token')?.value;
    const payload = token ? await verifyToken(token) : null;
    if (payload) return NextResponse.next({ request: { headers } });

    // 没登录：拿着邀请票的老师傅，只能碰票上那一位数字职人的几条学习接口
    const m = pathname.match(INVITE_API);
    if (m) {
      const inv = await readInvite(req.headers.get('x-lab-invite'));
      const methodOk = m[2] ? req.method === 'POST' : req.method === 'GET';
      if (inv && inv.spaceId === m[1] && methodOk) {
        headers.set(INVITED, m[1]); headers.set(INVITED_BY, encodeURIComponent(inv.by));
        return NextResponse.next({ request: { headers } });
      }
    }
    return NextResponse.json({ ok: false, error: '未登录或登录已过期' }, { status: 401 });
  }

  // public/lab/ 下的图和视频跟登录墙后的页面共用 /lab/ 前缀，别被当成页面拦去登录：
  // 公开首页要用，图片优化器从服务端去取时也不带 cookie
  if (/^\/lab\/[^/]+\.(png|jpe?g|webp|gif|svg|mp4|webm)$/i.test(pathname)) return NextResponse.next();

  // AI 百业首页公开：谁都能看见理念和这些人，点进任何一个空间才要求登录
  if (pathname === '/lab') return NextResponse.next();

  // 邀请链接 /lab/<id>?invite=…：票对得上这个空间，就不用登录
  const pm = pathname.match(INVITE_PAGE);
  if (pm && pm[1] !== 'spaces') {
    const inv = await readInvite(req.nextUrl.searchParams.get('invite'));
    if (inv && inv.spaceId === pm[1]) return NextResponse.next();
  }

  // Protect /admin and /office (虚拟工厂) routes
  if (pathname.startsWith('/admin') || pathname.startsWith('/office') || pathname.startsWith('/lab')) {
    const token = req.cookies.get('auth_token')?.value;

    if (!token) {
      // 从公开首页点进来的，登录完要回到他想去的地方，而不是落到虚拟工厂
      const login = new URL('/login', req.url);
      if (pathname.startsWith('/lab')) login.searchParams.set('next', pathname + req.nextUrl.search);
      return NextResponse.redirect(login);
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

  // 首页落在虚拟工厂（未登录会被上面的规则拦到 /login）
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/office', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/office/:path*', '/office', '/lab/:path*', '/lab', '/api/:path*', '/'],
};
