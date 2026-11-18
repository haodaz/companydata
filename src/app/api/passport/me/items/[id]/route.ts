/** 人才护照 · 一条条目（仅管理员，只能动自己护照里的）：PATCH 申请平方核验；DELETE 删掉。[id] 是 claim 编号 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { fail, itemDTO, passportOwner, type ItemRow } from '@/lib/passport';
import { CLAIM_NO_RE } from '@/app/passport/demo-lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const own = await passportOwner(req);
  if (own instanceof Response) return own;
  const { id } = await params;
  if (!CLAIM_NO_RE.test(id)) return fail('条目编号不对');
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (b.verify !== true) return fail('没有要改的');
  const now = new Date().toISOString();
  const { data, error } = await db.from('passport_items').update({ status: 'review', verify_requested_at: now, updated_at: now })
    .eq('passport_id', own.passport.id).eq('claim_no', id).eq('source', 'self').select('*').maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('护照里没有这一条', 404);
  return Response.json({ ok: true, item: itemDTO(data as ItemRow) });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const own = await passportOwner(req);
  if (own instanceof Response) return own;
  const { id } = await params;
  if (!CLAIM_NO_RE.test(id)) return fail('条目编号不对');
  const { data, error } = await db.from('passport_items').delete().eq('passport_id', own.passport.id).eq('claim_no', id).select('id');
  if (error) return fail(error.message, 500);
  if (!data?.length) return fail('护照里没有这一条', 404);
  return Response.json({ ok: true });
}
