import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { comparePassword } from '@/lib/auth';
import { signToken } from '@/lib/jwt';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ success: false, error: '请提供邮箱和密码' }, { status: 400 });
    }

    // Find user
    const { data: user, error } = await supabaseAdmin
      .from('system_users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user) {
      return NextResponse.json({ success: false, error: '账号或密码错误' }, { status: 401 });
    }

    // Verify password
    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json({ success: false, error: '账号或密码错误' }, { status: 401 });
    }

    // Generate JWT
    const token = await signToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    // Set cookie
    // must_change_password：管理员建的 / 重置过的账号，登录页据此直接带去改密码（迁移 055；没跑时这一列不存在，当 false）
    const response = NextResponse.json({ success: true, user: { id: user.id, email: user.email, role: user.role, must_change_password: !!user.must_change_password } });
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
