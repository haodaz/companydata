import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { hashPassword } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password || password.length < 6) {
      return NextResponse.json({ success: false, error: '请提供有效的邮箱和至少6位密码' }, { status: 400 });
    }

    // Check if user exists
    const { data: existingUser } = await supabaseAdmin
      .from('system_users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return NextResponse.json({ success: false, error: '该邮箱已被注册' }, { status: 400 });
    }

    // 库里还没有任何账号时，首个注册者为管理员
    const { count } = await supabaseAdmin.from('system_users').select('id', { count: 'exact', head: true });
    const isFirstUser = (count ?? 0) === 0;

    // Hash password and insert
    const password_hash = await hashPassword(password);
    const { data: newUser, error } = await supabaseAdmin
      .from('system_users')
      .insert({
        email,
        password_hash,
        role: isFirstUser ? 'admin' : 'user', // 第一个注册的账号自动成为管理员
      })
      .select('id, email, role')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, user: newUser });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
