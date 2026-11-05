import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, invalidateSessionCache } from '@/lib/session';
import { supabaseAdmin as db } from '@/lib/supabase';
import { hashPassword } from '@/lib/auth';
import { BAIYE_ROLES, canManageBaiye } from '@/lib/roles';

export const runtime = 'nodejs';

/**
 * 真活工作台 · 用户管理（2026-11-05）：只管百业账号（baiye_user / baiye_admin）。
 * 全平台管理员和百业管理员都能用；同事和管理员的账号这里一律看不到、动不了（全平台的在 /admin/system-users）。
 * 百业管理员：开百业用户、重置密码、删百业用户；不能改角色、不能动别的百业管理员。管理员：还能在两种百业角色之间切。
 * 开账号 / 重置密码都要求对方第一次登录先改密码（迁移 055）。
 */
type Me = { userId: string; email: string; role: string };
async function me(req: NextRequest): Promise<Me | NextResponse> {
  const u = await getSessionUser(req);
  if (!u) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  if (!canManageBaiye(u.role)) return NextResponse.json({ ok: false, error: '只有管理员和百业管理员能管账号' }, { status: 403 });
  return u;
}
const isBaiyeRole = (r: unknown) => (BAIYE_ROLES as readonly string[]).includes(String(r));
/** 这个人能不能动这个账号：管理员动所有百业账号；百业管理员只动百业用户（和他自己无关的） */
const canTouch = (m: Me, target: { id: string; role: string }) => isBaiyeRole(target.role) && target.id !== m.userId && (m.role === 'admin' || target.role === 'baiye_user');
async function target(id: string) {
  const { data } = await db.from('system_users').select('id, email, role').eq('id', id).maybeSingle();
  return data as { id: string; email: string; role: string } | null;
}

export async function GET(req: NextRequest) {
  const m = await me(req); if (m instanceof NextResponse) return m;
  let { data, error } = await db.from('system_users').select('id, email, role, created_at, must_change_password').in('role', [...BAIYE_ROLES]).order('created_at', { ascending: false });
  if (error && /must_change_password/.test(error.message)) ({ data, error } = await db.from('system_users').select('id, email, role, created_at').in('role', [...BAIYE_ROLES]).order('created_at', { ascending: false }) as any);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, me: { id: m.userId, role: m.role }, users: (data || []).map((u: any) => ({ ...u, must_change_password: !!u.must_change_password, editable: canTouch(m, u) })) });
}

/** 开账号：{ email, password, role? }（role 只有管理员能给 baiye_admin） */
export async function POST(req: NextRequest) {
  const m = await me(req); if (m instanceof NextResponse) return m;
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase(), password = String(b.password || '');
  const role = m.role === 'admin' && b.role === 'baiye_admin' ? 'baiye_admin' : 'baiye_user';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ ok: false, error: '邮箱格式不对' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ ok: false, error: '临时密码至少 8 位' }, { status: 400 });
  const { data: ex } = await db.from('system_users').select('id').eq('email', email).maybeSingle();
  if (ex) return NextResponse.json({ ok: false, error: '这个邮箱已经有账号了' }, { status: 409 });
  const row = { email, password_hash: await hashPassword(password), role };
  let { data, error } = await db.from('system_users').insert({ ...row, must_change_password: true }).select('id, email, role, created_at').single();
  if (error && /must_change_password/.test(error.message)) ({ data, error } = await db.from('system_users').insert(row).select('id, email, role, created_at').single());
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  console.log('[work/users] 开账号', email, role, 'by', m.email);
  return NextResponse.json({ ok: true, user: data });
}

/** { id, password } 重置密码；{ id, role } 改角色（只有管理员，且只在两种百业角色之间） */
export async function PATCH(req: NextRequest) {
  const m = await me(req); if (m instanceof NextResponse) return m;
  const b = await req.json().catch(() => ({}));
  const t = await target(String(b.id || ''));
  if (!t || !canTouch(m, t)) return NextResponse.json({ ok: false, error: '这个账号你动不了' }, { status: 403 });
  if (typeof b.password === 'string') {
    if (b.password.length < 8) return NextResponse.json({ ok: false, error: '临时密码至少 8 位' }, { status: 400 });
    let { error } = await db.from('system_users').update({ password_hash: await hashPassword(b.password), must_change_password: true }).eq('id', t.id);
    if (error && /must_change_password/.test(error.message)) ({ error } = await db.from('system_users').update({ password_hash: await hashPassword(b.password) }).eq('id', t.id));
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    invalidateSessionCache(t.id);
    console.log('[work/users] 重置密码', t.email, 'by', m.email);
    return NextResponse.json({ ok: true });
  }
  if (b.role !== undefined) {
    if (m.role !== 'admin') return NextResponse.json({ ok: false, error: '只有管理员能改角色' }, { status: 403 });
    if (!isBaiyeRole(b.role)) return NextResponse.json({ ok: false, error: '这里只能在百业用户 / 百业管理员之间切' }, { status: 400 });
    const { error } = await db.from('system_users').update({ role: b.role }).eq('id', t.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    invalidateSessionCache(t.id);
    console.log('[work/users] 改角色', t.email, b.role, 'by', m.email);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: '要改什么？' }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const m = await me(req); if (m instanceof NextResponse) return m;
  const t = await target(new URL(req.url).searchParams.get('id') || '');
  if (!t || !canTouch(m, t)) return NextResponse.json({ ok: false, error: '这个账号你动不了' }, { status: 403 });
  const { error } = await db.from('system_users').delete().eq('id', t.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  invalidateSessionCache(t.id);
  console.log('[work/users] 删账号', t.email, 'by', m.email);
  return NextResponse.json({ ok: true });
}
