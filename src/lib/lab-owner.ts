import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionUser } from '@/lib/session';

/**
 * 百业工厂权限（2026-10-23）：普通用户只能管自己生成的空间（工作室改草稿 / 章节 / 角色 / 画图、删空间、发邀请链接）；
 * 管理员管全部。看所有空间走「体验百业」（只读，不受这里限制）。生成者 = skill_tasks.created_by（登录邮箱）。
 * 返回 null = 放行；否则直接把这个响应 return 出去。
 */
export async function denyUnlessLabOwner(req: Request, spaceId: string): Promise<NextResponse | null> {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: '需要登录' }, { status: 401 });
  if (user.role === 'admin') return null;
  const { data } = await supabaseAdmin.from('skill_tasks').select('created_by').eq('id', spaceId).maybeSingle();
  if (data && data.created_by === user.email) return null;
  return NextResponse.json({ ok: false, error: '只能管理自己生成的空间（看所有空间请去「体验百业」）' }, { status: 403 });
}
