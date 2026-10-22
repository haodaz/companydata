import { supabaseAdmin as db } from '@/lib/supabase';

/**
 * 真活权限（2026-10-23）：普通用户 = 出题、管自己出的题；管理员 = 看 / 管全部。
 * 示范题（owner.contact = demo）所有账号都能看，但只有管理员能改。
 */
export async function canEditWorkTask(user: { email: string; role: string }, id: string) {
  if (user.role === 'admin') return true;
  const { data } = await db.from('work_tasks').select('created_by').eq('id', id).maybeSingle();
  return !!data && data.created_by === user.email;
}
