/**
 * 服务端读取当前登录用户
 *
 * cookie `auth_token`（HS256 JWT，见 lib/jwt.ts）只用来认人：拿到 id 后回 system_users 重读 email / role，
 * 这样改角色、删账号能即时生效（内存缓存 60 秒）。
 *   const user = await getSessionUser(req);           // { userId, email, role } | null
 *   const denied = await requireAdminUser(req); if (denied) return denied;
 */
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/jwt';
import { supabaseAdmin } from '@/lib/supabase';

export interface SessionUser {
  userId: string;
  email: string;
  role: string;   // 'admin' | 'user'
}

const cache = new Map<string, { user: SessionUser | null; exp: number }>();
const TTL = 60 * 1000;

export function invalidateSessionCache(userId?: string) {
  if (!userId) cache.clear(); else cache.delete(userId);
}

async function readToken(req?: Request): Promise<string | null> {
  if (req) {
    const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)auth_token=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  try {
    return (await cookies()).get('auth_token')?.value || null;
  } catch {
    return null;
  }
}

export async function getSessionUser(req?: Request): Promise<SessionUser | null> {
  const token = await readToken(req);
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload?.id) return null;

  const hit = cache.get(payload.id);
  if (hit && hit.exp > Date.now()) return hit.user;

  const { data, error } = await supabaseAdmin
    .from('system_users').select('id, email, role').eq('id', payload.id).maybeSingle();
  if (error) {
    // 查库失败（网络抖动）不把人锁在外面：退回令牌里的身份，不缓存
    console.error('[session]', error.message);
    return { userId: payload.id, email: payload.email || '', role: payload.role || 'user' };
  }
  const user: SessionUser | null = data ? { userId: data.id, email: data.email || '', role: data.role || 'user' } : null;
  cache.set(payload.id, { user, exp: Date.now() + TTL });
  return user;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** 管理员接口用：没登录 401，不是 admin 403，是 admin 返回 null */
export async function requireAdminUser(req?: Request): Promise<Response | null> {
  const user = await getSessionUser(req);
  if (!user) return json({ ok: false, error: '需要登录' }, 401);
  if (user.role !== 'admin') return json({ ok: false, error: '仅管理员可操作' }, 403);
  return null;
}
