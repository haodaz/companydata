import { NextResponse } from 'next/server';
import { readBasketToken, basketQueue } from '@/lib/basket';

/** 待采清单：AI 自己啃不动的企业，等数据同事挎着篮子去采 */
export async function GET(req: Request) {
  const user = await readBasketToken(req);
  if (!user) return NextResponse.json({ ok: false, error: '请先登录' }, { status: 401 });
  return NextResponse.json({ ok: true, data: await basketQueue(80) });
}
