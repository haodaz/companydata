/**
 * 人才护照 · 加一条（仅管理员）：
 *  source = self：本人自述（经历 / 作品 / 证书），盖在「本人填写」页，最多 8 条；
 *  source = demo：从演示签章库盖 / 贴一条（只认库里有的 key，同一个只能加一次）。
 * claim 编号由前端生成（乐观更新要用同一个编号），这里核对格式，撞了就 409。
 */
import { supabaseAdmin as db } from '@/lib/supabase';
import { MAX_DEMO_ITEMS, MAX_SELF_ITEMS, clean, fail, itemDTO, passportOwner, type ItemRow } from '@/lib/passport';
import { CLAIM_NO_RE, demoOption } from '@/app/passport/demo-lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const own = await passportOwner(req);
  if (own instanceof Response) return own;
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const claimNo = String(b.claimNo || '');
  if (!CLAIM_NO_RE.test(claimNo)) return fail('条目编号不对');
  const pid = own.passport.id;
  let row: Record<string, unknown>;
  if (b.source === 'demo') {
    const opt = demoOption(String(b.demoKey || ''));
    if (!opt || !claimNo.startsWith('TP-CL-D')) return fail('演示签章库里没有这一条');
    const { count } = await db.from('passport_items').select('id', { count: 'exact', head: true }).eq('passport_id', pid).eq('source', 'demo');
    if ((count || 0) >= MAX_DEMO_ITEMS) return fail(`演示签章最多加 ${MAX_DEMO_ITEMS} 条`);
    row = { passport_id: pid, claim_no: claimNo, source: 'demo', page: opt.page, demo_key: opt.key, title: opt.label };
  } else {
    const kind = String(b.kind || '');
    if (!['exp', 'work', 'cert'].includes(kind) || !claimNo.startsWith('TP-CL-U')) return fail('是什么没选对');
    const title = clean(b.title, 16);
    if (!title) return fail('名字不能空');
    const { count } = await db.from('passport_items').select('id', { count: 'exact', head: true }).eq('passport_id', pid).eq('source', 'self');
    if ((count || 0) >= MAX_SELF_ITEMS) return fail(`本人填写最多 ${MAX_SELF_ITEMS} 条`);
    const link = clean(b.link, 120);
    const verify = b.verify === true;
    row = {
      passport_id: pid, claim_no: claimNo, source: 'self', page: 'self', kind, title, org: clean(b.org, 30), date_text: clean(b.date, 12),
      link: /^https?:\/\//i.test(link) ? link : (link ? `https://${link}` : null),
      status: verify ? 'review' : 'self', verify_requested_at: verify ? new Date().toISOString() : null,
    };
  }
  const { data, error } = await db.from('passport_items').insert(row).select('*').single();
  if (error) return fail(error.code === '23505' ? (b.source === 'demo' ? '这一条已经在护照里了' : '编号撞了，请再加一次') : error.message, error.code === '23505' ? 409 : 500);
  return Response.json({ ok: true, item: itemDTO(data as ItemRow) });
}
