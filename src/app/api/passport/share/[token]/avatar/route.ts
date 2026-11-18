/** 人才护照 · 分享页的证件照（公开只读，凭 token；授权过期 / 撤回就 404；不记查看次数） */
import { supabaseAdmin as db } from '@/lib/supabase';
import { avatarResponse, grantState } from '@/lib/passport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  try {
    const st = await grantState(token);
    if (!st.ok) return new Response('链接无效或已过期', { status: 404 });
    const { data } = await db.from('passports').select('avatar_path').eq('id', st.grant.passport_id).maybeSingle();
    return avatarResponse({ avatar_path: data?.avatar_path ?? null }, 'private, max-age=600');
  } catch {
    return new Response('头像读不出来', { status: 404 });
  }
}
