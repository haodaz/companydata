import { NextRequest, NextResponse } from 'next/server';
import { draw } from '@/lib/game/pool';

export const dynamic = 'force-dynamic';

/** 入行：抽一张卡（卡池不公开）。?not=<上一张的 id> 别连着抽到同一张；?seen=<抽过的 id，逗号隔开> 先抽没抽过的 */
export async function GET(req: NextRequest) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const seen = (req.nextUrl.searchParams.get('seen') || '').split(',').filter(x => /^[a-z0-9-]{2,40}$/.test(x)).slice(0, 400);   // 这个人抽过的卡，先不给
  const { card, peers } = draw(seed, req.nextUrl.searchParams.get('not') || undefined, req.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'zh', seen);
  return NextResponse.json({ ok: true, seed, card, peers });
}
