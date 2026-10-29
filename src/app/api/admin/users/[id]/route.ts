import { NextResponse } from 'next/server';
import { isRole } from '@/lib/roles';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyToken } from '@/lib/jwt';
import { hashPassword } from '@/lib/auth';
import type { NextRequest } from 'next/server';

async function checkAdmin(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  if (!token) return false;
  const payload = await verifyToken(token);
  return payload?.role === 'admin';
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
  try {
    const { id } = await params;
    const body = await req.json();
    // 重置密码（2026-10-29）：{ password } → 设成管理员给的临时密码，并要求下次登录先改
    if (typeof body.password === 'string') {
      if (body.password.length < 6) return NextResponse.json({ success: false, error: '密码至少 6 位' }, { status: 400 });
      const { error } = await supabaseAdmin.from('system_users').update({ password_hash: await hashPassword(body.password), must_change_password: true }).eq('id', id);
      if (error) return NextResponse.json({ success: false, error: /must_change_password/.test(error.message) ? '「首次登录改密码」的迁移 055 还没跑' : error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }
    // 要求 / 取消「下次登录先改密码」：{ must_change_password: boolean }
    if (typeof body.must_change_password === 'boolean') {
      const { error } = await supabaseAdmin.from('system_users').update({ must_change_password: body.must_change_password }).eq('id', id);
      if (error) return NextResponse.json({ success: false, error: /must_change_password/.test(error.message) ? '「首次登录改密码」的迁移 055 还没跑' : error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }
    const { role } = body;
    if (!isRole(role)) return NextResponse.json({ success: false, error: '未知角色' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('system_users')
      .update({ role })
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
  try {
    const { id } = await params;
    const { error } = await supabaseAdmin
      .from('system_users')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
