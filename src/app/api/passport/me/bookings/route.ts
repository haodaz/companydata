/** 人才护照 · 去认证的预约（仅管理员）：记一笔预约，回预约号。演示：不会真的跳外站、不扣费 */
import { bookingRow, clean, fail, passportOwner } from '@/lib/passport';
import { DESTINATIONS } from '@/app/passport/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const own = await passportOwner(req);
  if (own instanceof Response) return own;
  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const d = DESTINATIONS.find(x => x.id === b.dest);
  const slot = clean(b.slot, 60);
  if (!d || !d.slots.includes(slot)) return fail('没有这个去处或时间');
  try { return Response.json({ ok: true, booking: await bookingRow(own.passport.id, d.id, slot) }); } catch (e) { return fail((e as Error).message, 500); }
}
