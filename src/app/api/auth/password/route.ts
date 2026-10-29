import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { comparePassword, hashPassword } from '@/lib/auth';
import { getSessionUser, invalidateSessionCache } from '@/lib/session';

/**
 * 改密码（2026-10-29）：{ current, next }。首次登录被要求改密码的账号也走这里（/api/auth/* 不受「先改密码」拦截）。
 * 新密码至少 8 位、不能和原来的一样；改完清掉「要改密码」的标记（迁移 055；没跑时只改密码）。
 */
export async function POST(req: Request) {
  try {
    const me = await getSessionUser(req);
    if (!me) return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    const { current, next } = await req.json().catch(() => ({}));
    const pw = String(next || '');
    if (pw.length < 8) return NextResponse.json({ success: false, error: '新密码至少 8 位' }, { status: 400 });
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return NextResponse.json({ success: false, error: '新密码要同时有字母和数字' }, { status: 400 });
    const { data: u, error } = await supabaseAdmin.from('system_users').select('id, password_hash').eq('id', me.userId).single();
    if (error || !u) return NextResponse.json({ success: false, error: '账号不存在' }, { status: 404 });
    if (!(await comparePassword(String(current || ''), u.password_hash))) return NextResponse.json({ success: false, error: '当前密码不对' }, { status: 400 });
    if (await comparePassword(pw, u.password_hash)) return NextResponse.json({ success: false, error: '新密码不能和原来的一样' }, { status: 400 });
    const password_hash = await hashPassword(pw);
    let { error: e2 } = await supabaseAdmin.from('system_users').update({ password_hash, must_change_password: false }).eq('id', u.id);
    if (e2 && /must_change_password/.test(e2.message)) ({ error: e2 } = await supabaseAdmin.from('system_users').update({ password_hash }).eq('id', u.id));
    if (e2) throw e2;
    invalidateSessionCache(u.id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
