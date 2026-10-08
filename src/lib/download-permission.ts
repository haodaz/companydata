/**
 * 数据下载许可（服务端）
 *
 * admin 随时可以下载（不查表）；普通用户要向 admin 申请，批准后才能下载（表 download_permissions）。
 * 服务端导出接口一行接入：const denied = await requireDownload(req); if (denied) return denied;
 * 浏览器端直接生成文件的导出（当前页 CSV、打印）由前端 ensureDownloadAllowed 拦截并补记日志。
 */
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser, type SessionUser } from '@/lib/session';
import { logDemand } from '@/lib/flywheel/signals';

export type DownloadStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'revoked';

const cache = new Map<string, { ok: boolean; exp: number }>();
const TTL = 60 * 1000;   // 批准 / 收回 1 分钟内生效

export function invalidateDownloadCache(userId?: string) {
  if (!userId) cache.clear(); else cache.delete(userId);
}

/** 该用户最近一条申请的状态 */
export async function downloadStatusOf(userId: string): Promise<{ status: DownloadStatus; requested_at?: string; decided_at?: string; note?: string }> {
  const { data } = await supabaseAdmin.from('download_permissions')
    .select('status, requested_at, decided_at, note')
    .eq('user_id', userId).order('requested_at', { ascending: false }).limit(1).maybeSingle();
  return data ? (data as any) : { status: 'none' };
}

export async function canDownload(user: SessionUser | null): Promise<boolean> {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const hit = cache.get(user.userId);
  if (hit && hit.exp > Date.now()) return hit.ok;
  const { status } = await downloadStatusOf(user.userId);
  const ok = status === 'approved';
  cache.set(user.userId, { ok, exp: Date.now() + TTL });
  return ok;
}

/** 记一条下载日志（失败不影响下载） */
export async function logDownload(user: SessionUser, entry: { target: string; params?: Record<string, unknown> | null; via: 'server' | 'client'; req?: Request }) {
  const h = entry.req?.headers;
  try {
    const { error } = await supabaseAdmin.from('download_logs').insert({
      user_id: /^[0-9a-f-]{36}$/i.test(user.userId) ? user.userId : null,
      email: user.email || null,
      role: user.role,
      target: entry.target.slice(0, 300),
      params: entry.params && Object.keys(entry.params).length ? entry.params : null,
      via: entry.via,
      ip: h?.get('x-forwarded-for')?.split(',')[0]?.trim() || h?.get('x-real-ip') || null,
      user_agent: h?.get('user-agent')?.slice(0, 300) || null,
    });
    if (error) console.error('[download-log]', error.message);
    // 飞轮：导出 = 很强的需求（带筛选条件的导出才说明在意哪一块）
    const p = (entry.params || {}) as Record<string, any>;
    const q = [p.search, p.industry, p.jobType && `岗位类型 ${p.jobType}`].filter(Boolean).join(' ');
    if (q || p.companyId) await logDemand({ source: 'download', actor: user.email || null, query: q, company_id: Number(p.companyId) || null, meta: { target: entry.target.slice(0, 200) } });
  } catch (e: any) {
    console.error('[download-log]', e?.message || e);
  }
}

/** 导出路由用：没登录 401；没许可 403（前端据此弹出申请框）；放行时记下载日志 */
export async function requireDownload(req?: Request, target?: string): Promise<Response | null> {
  const user = await getSessionUser(req);
  if (!user) return json({ ok: false, error: '需要登录' }, 401);
  if (!(await canDownload(user))) return json({ ok: false, error: '下载数据需要管理员许可', code: 'DOWNLOAD_PERMISSION_REQUIRED' }, 403);
  if (req) {
    const u = new URL(req.url);
    await logDownload(user, { target: target || u.pathname, params: Object.fromEntries(u.searchParams), via: 'server', req });
  }
  return null;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
