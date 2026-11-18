/** 人才护照 · 撤回一次授权（仅管理员，只能撤自己护照的）：写 revoked_at，对方再打开就是「本人已撤回」 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { fail, grantDTO, passportOwner, type GrantRow } from '@/lib/passport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const own = await passportOwner(req);
  if (own instanceof Response) return own;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail('授权编号不对');
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (b.revoke !== true) return fail('没有要改的');
  const { data, error } = await db.from('passport_grants').update({ revoked_at: new Date().toISOString() })
    .eq('id', id).eq('passport_id', own.passport.id).is('revoked_at', null).select('*').maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('这次授权不存在或已经撤回了', 404);
  return Response.json({ ok: true, grant: grantDTO(data as GrantRow) });
}
