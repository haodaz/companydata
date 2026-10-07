/**
 * 浏览器端生成的下载（当前页 CSV、打印）补记日志：POST { target, params? }
 * 只有有下载许可的用户才会走到这一步；没有许可直接拒绝，不记。
 */
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { canDownload, logDownload } from '@/lib/download-permission';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  if (!(await canDownload(user))) return NextResponse.json({ ok: false, error: '没有下载许可' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const target = typeof body?.target === 'string' && body.target.trim() ? body.target.trim() : '未命名下载';
  const params = body?.params && typeof body.params === 'object' ? body.params : null;
  await logDownload(user, { target, params, via: 'client', req });
  return NextResponse.json({ ok: true });
}
