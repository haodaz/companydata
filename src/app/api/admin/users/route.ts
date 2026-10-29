import { NextResponse } from 'next/server';
import { DEFAULT_ROLE, isRole } from '@/lib/roles';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyToken } from '@/lib/jwt';
import { hashPassword } from '@/lib/auth';
import type { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('auth_token')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    const payload = await verifyToken(token);
    if (payload?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('system_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    // 不把密码哈希发给前端
    return NextResponse.json({ success: true, data: (data || []).map(({ password_hash: _p, ...u }: any) => ({ ...u, must_change_password: !!u.must_change_password })) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/** 管理员手动添加账号：{ email, password, role } */
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('auth_token')?.value;
    const payload = token ? await verifyToken(token) : null;
    if (payload?.role !== 'admin') return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const role = isRole(body.role) ? body.role : DEFAULT_ROLE;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ success: false, error: '邮箱格式不正确' }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ success: false, error: '密码至少 6 位' }, { status: 400 });

    const { data: existing } = await supabaseAdmin.from('system_users').select('id').eq('email', email).maybeSingle();
    if (existing) return NextResponse.json({ success: false, error: '该邮箱已存在' }, { status: 409 });

    // 管理员建的账号首次登录要先改密码（迁移 055；没跑迁移时不带这一列）
    const row = { email, password_hash: await hashPassword(password), role };
    let { data, error } = await supabaseAdmin.from('system_users').insert({ ...row, must_change_password: true }).select('id, email, role, created_at').single();
    if (error && /must_change_password/.test(error.message)) ({ data, error } = await supabaseAdmin.from('system_users').insert(row).select('id, email, role, created_at').single());
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
