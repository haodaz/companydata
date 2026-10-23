import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { INVITED, INVITED_BY, readInvite } from '@/lib/lab-invite';
import { LAB_GUEST } from '@/lib/lab-guest';

/** 受邀专家能碰的接口：这一位数字职人的空间本身（只读），以及向上学习的三步 */
const INVITE_API = /^\/api\/lab\/spaces\/([^/]+)(?:\/(interview|submit|distill))?$/;
const INVITE_PAGE = /^\/lab\/([^/]+)$/;

/**
 * 整个 /lab 免登录（海外这套用来给投资人 / CEO 融资演示，不能让人注册登录）。环境变量 LAB_PUBLIC=1 打开。
 * 公司部署不开：/lab 照常要登录（他们有自己的统一认证）。只放 /lab 页面和 /api/lab/*，数据工厂的接口不受影响。
 */
const LAB_PUBLIC = () => process.env.LAB_PUBLIC === '1';
const LAB_FACTORY_PAGE = (p: string) => /^\/lab\/(spaces|studio|assets|logic|admin)(\/|$)/.test(p);
/** 放开时仍要登录的「工厂」操作：生成新空间 / 预置示范、删除空间、发邀请链接、蒸馏专家技能（花钱或改内容） */
const LAB_PROTECTED = (pathname: string, method: string) =>
  pathname.startsWith('/api/lab/studio/') ||   // 百业工厂：看草稿、改章节
  pathname.startsWith('/api/lab/assets') ||    // 百业工厂：素材库
  (method === 'POST' && (pathname === '/api/lab/spaces' || pathname === '/api/lab/seed')) ||
  (method === 'DELETE' && /^\/api\/lab\/spaces\/[^/]+$/.test(pathname)) ||
  (method === 'POST' && /^\/api\/lab\/spaces\/[^/]+\/(invite|distill)$/.test(pathname));

// ── 体验用户（trial）：一个账号只放行一个指定空间 ─────────────────────────────
/** trial_space cookie 与空间 id 的合法格式（uuid 一类的字母数字短横线串） */
const TRIAL_SID = /^[\w-]{8,64}$/;
/** 入口链接 /lab/<id>?trial=1：把空间写进 trial_space 并 302 回跳（去 trial 参数）；不是入口链接返回 null */
const trialEntryRedirect = (req: NextRequest, pathname: string): NextResponse | null => {
  const m = pathname.match(/^\/lab\/([\w-]{8,64})$/);
  if (!m || req.nextUrl.searchParams.get('trial') !== '1') return null;
  const res = NextResponse.redirect(new URL(`/lab/${m[1]}`, req.url));
  res.cookies.set('trial_space', m[1], { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' });
  return res;
};
/** trial 页面重定向决策：无合法 trial_space → 登录提示页；命中自己空间页 / 其「和我聊」独立页 / 我的证书与证书页 → null（放行）；其余 → 踢回自己的空间 */
const trialPageRedirect = (pathname: string, sid: string | undefined, base: string): NextResponse | null => {
  if (!sid || !TRIAL_SID.test(sid)) return NextResponse.redirect(new URL('/lab/login?notice=trial', base));
  if (pathname === `/lab/${sid}` || pathname === `/lab/${sid}/chat` || pathname === '/lab/me' || pathname.startsWith('/lab/cert/')) return null;
  return NextResponse.redirect(new URL(`/lab/${sid}`, base));
};
/** trial 的 API 白名单：自己空间详情（仅 GET）+ 五条学习接口及其更深层子路径（GET/POST）+ 个人昵称（GET/PUT）+ 我的证书数据（GET /api/lab/me；证书接口 /api/lab/cert/* 本就公开）；trial_space 不合法一律 false */
const trialApiAllowed = (method: string, pathname: string, sid: string | undefined) => {
  if (!sid || !TRIAL_SID.test(sid)) return false;
  if (method === 'GET' && pathname === `/api/lab/spaces/${sid}`) return true;
  if ((method === 'GET' || method === 'POST') && new RegExp(`^/api/lab/spaces/${sid}/(?:chat|solve|interview|submit|lesson)(?:/.*)?$`).test(pathname)) return true;
  if (method === 'GET' && pathname === '/api/lab/me') return true;
  return pathname === '/api/lab/nicknames' && (method === 'GET' || method === 'PUT');
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API：除登录 / 注册外全部需要登录（agent 接口会消耗 Token，数据接口走 service role）
  if (pathname.startsWith('/api/')) {
    if (pathname.startsWith('/api/auth/')) return NextResponse.next();
    // 激活码自动登录接口，自身校验 code
    if (pathname.startsWith('/api/third-party/')) return NextResponse.next();
    // 首页（/lab）是公开的宣传页，它只问这一个接口
    if (pathname === '/api/lab/landing' && req.method === 'GET') return NextResponse.next();
    // 证书公开：链接本身就是验证方式，分享出去的人不该被拦去登录（改名字由路由自己核对访客编号）
    if (pathname.startsWith('/api/lab/cert/')) return NextResponse.next();
    // 真活台公开：参与链接 / 出题人管理链接都靠 token 与 owner_key 自己核对，不走登录（/api/admin/work 仍要登录）
    // 例外：/api/work/companies 是企业库搜索（出题时挑企业用），属于数据资产，要登录
    if (pathname.startsWith('/api/work/') && !pathname.startsWith('/api/work/companies')) return NextResponse.next();
    // 「受邀」标记只能由这里打：客户端自己带来的一律先剥掉
    const headers = new Headers(req.headers);
    headers.delete(INVITED); headers.delete(INVITED_BY); headers.delete(LAB_GUEST);
    const token = req.cookies.get('auth_token')?.value;
    const payload = token ? await verifyToken(token) : null;
    if (payload) {
      // 体验用户（trial）：白名单外一律 403（trial_space 不合法同样全拒）；admin/user 与游客的既有行为不变
      if (payload.role === 'trial') {
        if (trialApiAllowed(req.method, pathname, req.cookies.get('trial_space')?.value)) return NextResponse.next({ request: { headers } });
        return NextResponse.json({ ok: false, error: '体验用户仅可访问指定空间' }, { status: 403 });
      }
      return NextResponse.next({ request: { headers } });
    }
    // 没登录的游客 / 受邀老师傅：打上游客标记，接口里模型锁在主力模型（不让游客挑贵的模型）
    headers.set(LAB_GUEST, '1');
    if (LAB_PUBLIC() && pathname.startsWith('/api/lab/') && !LAB_PROTECTED(pathname, req.method)) return NextResponse.next({ request: { headers } });

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
  if (/^\/lab\/(?:[^/]+\/)*[^/]+\.(png|jpe?g|webp|gif|svg|mp4|webm)$/i.test(pathname)) return NextResponse.next();

  // 体验用户（trial）：统一放在所有提前放行（证书 / 登录页 / LAB_PUBLIC / 邀请票）之前，不给这些口子留绕行空间；非 trial 用户不受影响
  const pageToken = req.cookies.get('auth_token')?.value;
  if (pageToken) {
    const pagePayload = await verifyToken(pageToken);
    if (pagePayload?.role === 'trial') {
      // 登录页例外放行：要看 notice=trial 提示，也要能重新登录换绑空间；/lab/trial-login 允许体验用户拿新激活码换登
      if (pathname === '/lab/login' || pathname === '/work/login' || pathname === '/lab/trial-login') return NextResponse.next();
      // 入口链接 /lab/<id>?trial=1：先写 trial_space 再回跳，务必排在强制重定向前（管理员换空间重发链接即可覆盖旧 cookie）
      const entry = trialEntryRedirect(req, pathname);
      if (entry) return entry;
      // 强制重定向：无合法 cookie → /lab/login?notice=trial；命中自己空间页放行；其余任何页面一律踢回自己的空间
      const kicked = trialPageRedirect(pathname, req.cookies.get('trial_space')?.value, req.url);
      if (kicked) return kicked;
      return NextResponse.next();
    }
  }

  // AI 百业首页公开：谁都能看见理念和这些人，点进任何一个空间才要求登录（LAB_PUBLIC=1 时整个 /lab 都公开）
  // 百业工厂（列表 /lab/spaces、工作室 /lab/studio/*、素材库 /lab/assets、设计文档 /lab/logic、百业后台 /lab/admin）例外：放开时也要登录。
  // 没登录的人只有首页和「体验百业」（/lab/gallery、各空间页、我的进度、证书、3D beta）。
  // /lab/trial-login：第三方激活码自动登录入口，匿名可进（激活码校验由接口自己做）
  if (pathname.startsWith('/lab/cert/') || pathname === '/lab/login' || pathname === '/work/login' || pathname === '/lab/trial-login') return NextResponse.next();
  if (pathname === '/lab' || (LAB_PUBLIC() && pathname.startsWith('/lab/') && !LAB_FACTORY_PAGE(pathname))) return NextResponse.next();

  // 邀请链接 /lab/<id>?invite=…：票对得上这个空间，就不用登录
  const pm = pathname.match(INVITE_PAGE);
  if (pm && pm[1] !== 'spaces') {
    const inv = await readInvite(req.nextUrl.searchParams.get('invite'));
    if (inv && inv.spaceId === pm[1]) return NextResponse.next();
  }

  // Protect /admin (后台) and /lab (数字技能空间) routes；真活台：出题 / 管理页要登录（/work/mine、/work/new、/work/admin），做题页 /work/<token> 公开
  // 企业版 / 科研版工作台（/workspace、/research）要登录；它们的介绍页 /workspace/welcome、/research/welcome 公开
  const isWs = pathname === '/workspace' || pathname === '/research';
  if (pathname.startsWith('/admin') || pathname.startsWith('/lab') || pathname === '/work/mine' || pathname === '/work/new' || pathname.startsWith('/work/admin') || isWs) {
    const token = req.cookies.get('auth_token')?.value;

    if (!token) {
      // 百业企业版 / 科研版：没登录先看介绍页（介绍页上有登录按钮）
      if (isWs) return NextResponse.redirect(new URL(`${pathname}/welcome`, req.url));
      // 从公开首页点进来的，登录完要回到他想去的地方，而不是落到虚拟工厂
      // 百业 / 真活用各自的蒙版式登录页（账号同一套），别让人看见后台的登录页
      const login = new URL(pathname.startsWith('/lab') || isWs ? '/lab/login' : pathname.startsWith('/work') ? '/work/login' : '/login', req.url);
      if (pathname.startsWith('/lab') || pathname.startsWith('/work') || isWs) login.searchParams.set('next', pathname + req.nextUrl.search);
      return NextResponse.redirect(login);
    }

    const payload = await verifyToken(token);
    if (!payload) {
      // Invalid token, clear it and redirect to login
      const response = NextResponse.redirect(new URL('/login', req.url));
      response.cookies.delete('auth_token');
      return response;
    }

    // 入口链接 /lab/<id>?trial=1：已登录用户（含 admin/user 点体验链接）写 cookie 并 302 回跳；trial 角色在上面已提前处理
    const entry = trialEntryRedirect(req, pathname);
    if (entry) return entry;

    // Role-based protection: only admin can access /admin/system-users
    if (pathname.startsWith('/admin/system-users') && payload.role !== 'admin') {
      return NextResponse.redirect(new URL('/admin/token-usage', req.url));
    }

    return NextResponse.next();
  }

  // 首页落在数字技能空间（未登录会被上面的规则拦到 /login）
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/lab', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/lab/:path*', '/lab', '/work/mine', '/work/new', '/work/admin', '/workspace', '/research', '/api/:path*', '/'],
};
