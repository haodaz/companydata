import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { orgFor } from '@/lib/ws/org';

/** 工作台接口的公共前置：登录 + 本企业 */
export async function wsCtx(req: NextRequest) {
  const user = await getSessionUser(req); if (!user) return { err: NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 }) } as const;
  const org = await orgFor(req, user).catch(() => null);
  if (!org) return { err: NextResponse.json({ ok: false, error: '没有企业' }, { status: 404 }) } as const;
  return { user, org } as const;
}
export const fail = (e: any, status = 500) => NextResponse.json({ ok: false, error: String(e?.message || e) }, { status });
