import { NextResponse } from 'next/server';
import { collegeStaff } from '@/lib/college-admin';

/** 教务接口共用：要登录且不是百业用户；错误统一成 { ok:false, error } */
export async function guard(req: Request) {
  const u = await collegeStaff(req);
  if (!u) return { denied: NextResponse.json({ ok: false, error: '教务只对平方内部开放' }, { status: 403 }), user: null as any };
  return { denied: null, user: u };
}
export const fail = (e: any, status = 500) => NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 500) }, { status });
export const ok = (data: any) => NextResponse.json({ ok: true, ...data });
